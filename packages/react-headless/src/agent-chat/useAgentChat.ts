import { useChat } from '@ai-sdk/react';
import {
  genUuid,
  mergeSendContext,
  resolveConfigContext,
  type AgentChatSendResult,
  type SendMessageInput,
  type WidgetAiMessage,
  type WidgetConfig,
  type WidgetCtx,
  type WidgetMessageU,
  type WidgetUserMessage,
} from '@opencx/widget-core';
import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentChatQueue } from './agent-chat-queue';
import {
  mapUiMessageToItems,
  type StreamingTurnItem,
} from './agent-chat-stream';
import { buildAgentChatTransport } from './agent-chat-transport';
import {
  LIVE_TURN_FALLBACK_KEY,
  mergeTurnSources,
  parseTurnSettledPart,
  type TurnRenderSource,
} from './agent-turn-sources';
import { stopAgentChatTurn } from './stop-agent-chat-turn';

/** Internal safety bound; a full backlog rejects the newest send. */
const MAX_QUEUED_SENDS = 20;

const HIGHLIGHT_ELEMENT_TOOL_NAME = 'highlight_element';

/** A normalized browser effect for a styled renderer to perform on its host. */
export type AgentChatPageEffect = {
  key: string;
  type: 'highlight-element';
  input: unknown;
};

type QueuedSend = {
  sessionId: string;
  userMessage: WidgetUserMessage;
  input: SendMessageInput;
  /** Persistent greetings that ride the fresh conversation's first turn. */
  initialMessages?: WidgetAiMessage[];
  /**
   * Wire uuid override for RETRIES: the bubble keeps its identity (no
   * duplicate render) while the server sees a fresh message uuid — resending
   * the original uuid would hit the ledger's dedupe (the failed turn already
   * claimed it) and produce silence.
   */
  wireUuid?: string;
};

/**
 * The agent-chat engine, powered by the AI SDK `useChat`.
 *
 * - **Streaming** is driven by `status` ('submitted' | 'streaming' | 'ready').
 * - **Resume** is native (`resume: true` reconnects to a live turn on mount).
 * - **Multi-send queues**: a message sent mid-turn is held in a queue pill
 *   above the composer (Cursor-style) and enters the transcript when its own
 *   turn starts — when the current one finishes, errors, or is stopped.
 * - **Stop cancels the RESPONSE, not the conversation**: it aborts the client
 *   stream and POSTs `/stop` so the server cancels generation, then the next
 *   queued message (if any) is sent to the API immediately. The queue is
 *   never discarded.
 *
 * The completed transcript stays owned by the shared persisted `messages`
 * (history + polling — so human-agent handoff replies still appear); on finish
 * we poll the canonical rows and the live overlay hands off to them.
 */
export function useAgentChat({
  widgetCtx,
  config,
  sessionId,
  persistedMessages,
}: {
  widgetCtx: WidgetCtx;
  config: WidgetConfig;
  sessionId: string | null;
  persistedMessages: WidgetMessageU[];
}) {
  const { api, messageCtx } = widgetCtx;

  // The transport belongs to the API connection, not to one render's config
  // object. Read request-scoped config at send time so a fresh object from an
  // embedder neither replaces the transport nor leaves its request body stale.
  const configRef = useRef(config);
  configRef.current = config;

  // Per-send fields (uuid / session_id / content / attachments / custom_data)
  // ride the send options `body`; the transport merges them over the config
  // defaults. Reconnect + auth headers come from the api layer.
  const transport = useMemo(
    () =>
      buildAgentChatTransport({
        options: {
          ...api.getStreamTransportOptions(),
          // The contact JWT can be minted AFTER this memo runs (lazy contact
          // creation) — a snapshot here would send every stream request
          // without Authorization (401). Re-read the api layer per request.
          headers: () => api.getStreamTransportOptions().headers,
        },
        buildBody: ({ body }) => {
          const currentConfig = configRef.current;
          return {
            bot_token: currentConfig.token,
            headers: currentConfig.headers,
            query_params: currentConfig.queryParams,
            body_properties: currentConfig.bodyProperties,
            // Resolved per request — function-form context tracks the SPA's
            // current page instead of the init-time snapshot.
            clientContext: resolveConfigContext(currentConfig),
            language: currentConfig.language,
            ...body,
          };
        },
      }),
    [api],
  );

  const {
    status,
    messages,
    sendMessage,
    stop,
    error,
    clearError,
    resumeStream,
  } = useChat({
    id: sessionId ?? undefined,
    // Reattach to a still-live turn (reload, tab switch) — but only once a
    // session actually exists. A fresh visitor has nothing to resume, and the
    // engine mounts with the shell, so probing unconditionally would fire a
    // spurious reconnect request on every page load.
    resume: sessionId !== null,
    transport,
    // Batch token updates: without it every streamed token re-renders the
    // whole chat surface (transcript + composer), which stutters on long
    // replies inside customer pages.
    throttle: 50,
    onError: (error) => console.error('agent chat stream error:', error),
  });

  // The turn-boundary effect is triggered by status/queue ownership changes,
  // not by every streamed token. It still needs the newest message snapshot
  // when one of those boundaries fires; trailing message ticks have their own
  // focused retention effect below.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const queueRef = useRef(new AgentChatQueue<QueuedSend>(MAX_QUEUED_SENDS));
  // True from the moment we hand a send to useChat until the turn's boundary —
  // guards the drain so a burst of ready-state sends can't overlap.
  const inFlightRef = useRef(false);
  // True while a user stop is in flight (client abort + server cancel). The
  // drain is held until the server has ACKed the cancel — draining on the
  // abort's own ready-flip could start the next turn before the cancel lands,
  // and the session-scoped cancel would then kill the NEW turn too.
  const stoppingRef = useRef(false);
  // True while the finished turn's canonical rows are being ingested. The
  // drain is held until then: the polling merge appends new rows to the END
  // of the transcript, so appending the next queued user bubble before the
  // finished reply lands would render the bubble ABOVE that reply.
  const reconcilingRef = useRef(false);
  // Preparation is serialized separately from streaming: on a fresh chat the
  // first send may be creating the session. Followers must wait for that id and
  // enqueue behind the first send, rather than being dropped or overtaking it.
  const sendPreparationTailRef = useRef<Promise<void>>(Promise.resolve());
  const sendGenerationRef = useRef(0);
  // Bumped on every enqueue / stop-completion so the drain effect re-evaluates
  // (the queue itself is a ref, so mutating it wouldn't trigger a render).
  const [queueVersion, setQueueVersion] = useState(0);
  // The live overlay must outlive the stream. `useChat` reports 'ready' the
  // moment the stream closes, but the canonical rows that replace the overlay
  // are still a fetch away, so tearing it down at 'ready' leaves the reply
  // missing for that whole window — it blanks out and flashes back in. This
  // stays true across the gap and is cleared only once a replacement exists.
  // Raised while streaming (never at the boundary) so the hold is already up on
  // the frame the stream ends, and so a RESUMED turn is covered too.
  const [settling, setSettling] = useState(false);
  // Per-turn render sources: finished turns whose transcript rows render
  // through the streaming renderer instead of their plain bubbles. Retained
  // live turns (the streamed message STAYS the render source — no swap, no
  // flash) and server-fetched historical turns (`ui_parts` — reload fidelity)
  // live in the same list; `mergeTurnSources` owns the precedence.
  const [turnSources, setTurnSources] = useState<TurnRenderSource[]>([]);
  // The live turn's React key. Set when its send drains (or when a resumed
  // stream is detected) and handed to the retained source at release — SAME
  // key before and after the promotion, so the turn's node never remounts.
  const [liveTurnKey, setLiveTurnKey] = useState<string | null>(null);
  const liveTurnKeyRef = useRef<string | null>(null);
  // Turn epoch: bumped when a turn becomes active. The retention fetch below
  // is async — a NEXT turn can start while it is in flight, and its release
  // must then be discarded (it belongs to the finished epoch, and releasing
  // would tear down the new turn's overlay hold).
  // The node key of the turn whose overlay-release is pending (its rows have
  // not landed in the polled transcript yet). The release effect clears the
  // live key only when it still matches — a queued next send may have
  // installed ITS key by then.
  const pendingReleaseKeyRef = useRef<string | null>(null);
  // The most recently drained send — the retry source for a failed turn.
  const lastDrainedRef = useRef<QueuedSend | null>(null);
  const prevStatusRef = useRef(status);
  const previousSessionIdRef = useRef(sessionId);
  const ignoredStatusAfterSessionResetRef = useRef<typeof status | null>(null);
  const historicalFetchSessionRef = useRef<string | null>(null);
  // `useChat` creates a new Chat object as soon as a non-null id changes. Keep
  // the prior object's stop function so a direct session switch can abort the
  // stream it just detached from, rather than calling stop on the new chat.
  const clientStopRef = useRef(stop);
  // Latest status, readable synchronously from the `send` callback (which needs
  // to decide current-turn vs queued before the next render).
  const statusRef = useRef(status);
  statusRef.current = status;

  // Retain a finished streamed message as its rows' render source, keyed by
  // the turn identity carried on its terminal `data-turn-settled` part.
  // Idempotent per turn id — safe to call from both the boundary and the
  // trailing-tick effect below.
  const retainFromMessage = useCallback((message: UIMessage, key: string) => {
    const settled = parseTurnSettledPart(message.parts);
    if (!settled || settled.rowIds.length === 0) return;
    const items = mapUiMessageToItems(message);
    if (items.length === 0) return;
    setTurnSources((existing) =>
      existing.some((source) => source.turnId === settled.turnId)
        ? existing
        : [
            ...existing,
            { key, turnId: settled.turnId, rowIds: settled.rowIds, items },
          ],
    );
  }, []);

  const bodyFor = useCallback(
    (next: QueuedSend) => ({
      uuid: next.wireUuid ?? next.userMessage.id,
      session_id: next.sessionId,
      content: next.userMessage.content,
      attachments: next.input.attachments,
      exit_mode_prompt: next.input.exitModePrompt,
      initial_messages:
        next.initialMessages && next.initialMessages.length > 0
          ? next.initialMessages.map((message) => ({
              uuid: message.id,
              content: message.data.message,
            }))
          : undefined,
      // Shared engine rule (mergeSendContext): per-send AI-visible context and
      // custom data merged over the config-level values.
      ...mergeSendContext(config, next.input),
    }),
    [config],
  );

  // A null → id transition is the first send creating its session; clearing
  // there would delete that very send. Any transition away from a real session
  // is a reset/switch and must invalidate every conversation-owned ref. Abort
  // only the client-side stream: resetting the UI must not cancel the server's
  // turn for a session the visitor may reopen later.
  useEffect(() => {
    const previousClientStop = clientStopRef.current;
    clientStopRef.current = stop;
    const previousSessionId = previousSessionIdRef.current;
    if (previousSessionId === sessionId) return;
    previousSessionIdRef.current = sessionId;

    if (previousSessionId === null) {
      setTurnSources([]);
      return;
    }

    const hadActiveClientStream =
      statusRef.current === 'submitted' ||
      statusRef.current === 'streaming' ||
      prevStatusRef.current === 'submitted' ||
      prevStatusRef.current === 'streaming' ||
      inFlightRef.current;

    sendGenerationRef.current += 1;
    sendPreparationTailRef.current = Promise.resolve();
    queueRef.current = new AgentChatQueue<QueuedSend>(MAX_QUEUED_SENDS);
    inFlightRef.current = false;
    stoppingRef.current = false;
    reconcilingRef.current = false;
    lastDrainedRef.current = null;
    liveTurnKeyRef.current = null;
    pendingReleaseKeyRef.current = null;
    historicalFetchSessionRef.current = null;
    ignoredStatusAfterSessionResetRef.current =
      status === 'submitted' || status === 'streaming' ? status : null;
    prevStatusRef.current = 'ready';
    statusRef.current = 'ready';

    clearError();
    setQueueVersion((version) => version + 1);
    setSettling(false);
    setTurnSources([]);
    setLiveTurnKey(null);

    if (hadActiveClientStream) {
      try {
        void Promise.resolve(previousClientStop()).catch((err: unknown) => {
          console.error('agent chat client stream cancel failed:', err);
        });
      } catch (err) {
        console.error('agent chat client stream cancel failed:', err);
      }
    }
  }, [sessionId, status, stop, clearError]);

  // Single turn-boundary + drain effect.
  //
  // Boundary (streaming/submitted → ready|error): release the in-flight guard,
  // undim the delivered user bubbles, and poll the canonical rows. 'error' is
  // a boundary too — `sendMessage` recovers from an error status on its own,
  // so a failed turn must not strand the queue.
  //
  // Drain: whenever the chat is not mid-turn and nothing is in flight (and no
  // stop is awaiting its server ACK), send the next queued message: move its
  // bubble from below the live overlay into the transcript, then stream.
  useEffect(() => {
    const ignoredStatus = ignoredStatusAfterSessionResetRef.current;
    if (ignoredStatus !== null && status === ignoredStatus) {
      // `useChat` can expose the old session's status for the render in which
      // its id changes. Do not reconstruct that discarded turn after reset.
      prevStatusRef.current = 'ready';
      return;
    }
    ignoredStatusAfterSessionResetRef.current = null;

    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === 'submitted' || status === 'streaming') {
      // First active status of a NEW turn (prev was idle): a turn nobody sent
      // from here (resume reattach) still needs a stable node key for its
      // live→retained promotion.
      if (
        prev !== 'submitted' &&
        prev !== 'streaming' &&
        liveTurnKeyRef.current === null
      ) {
        const key = `turn-resumed-${genUuid()}`;
        liveTurnKeyRef.current = key;
        setLiveTurnKey(key);
      }
      setSettling(true);
    }
    if (status === 'streaming') {
      // First chunk proves delivery for this turn only. Later queued bubbles
      // have not reached the server yet and must stay pending.
      const userMessageId = lastDrainedRef.current?.userMessage.id;
      if (userMessageId) messageCtx.markUserMessageDelivered(userMessageId);
      return;
    }
    if (status !== 'ready' && status !== 'error') return;

    const justFinished = prev === 'streaming' || prev === 'submitted';
    if (justFinished) {
      inFlightRef.current = false;
      // RETENTION, synchronous: the stream's terminal `data-turn-settled`
      // part says exactly which ledger turn this was and which transcript
      // rows it produced — the streamed message becomes those rows' render
      // source right here, under the live node's key (no follow-up fetch, no
      // async race with the next queued send). Without the part (older
      // backend, failed turn) nothing is retained and the release below
      // falls back to the plain row swap. The internal fallback key keeps the
      // retained and rendered node identities identical.
      const finishedMessage = messagesRef.current.at(-1);
      const finishedKey = liveTurnKeyRef.current ?? LIVE_TURN_FALLBACK_KEY;
      pendingReleaseKeyRef.current = finishedKey;
      if (finishedMessage && finishedMessage.role === 'assistant') {
        retainFromMessage(finishedMessage, finishedKey);
      }
      // Only a turn that actually COMPLETED proves delivery. On `status ===
      // 'error'` the send may never have reached the server, so marking here
      // un-dims the user's bubble and renders a failed turn as delivered — the
      // customer sees a normally-sent message and simply never gets a reply,
      // with nothing anywhere indicating failure. A turn that errored MID-stream
      // is already covered: the `streaming` branch above marks delivery on the
      // first chunk, which is the point the server demonstrably had the message.
      if (status === 'ready') {
        const userMessageId = lastDrainedRef.current?.userMessage.id;
        if (userMessageId) messageCtx.markUserMessageDelivered(userMessageId);
      }
      // Ingest the finished turn's canonical rows BEFORE draining the next
      // queued message — transcript order is append-order, so the reply must
      // enter it before the next user bubble does.
      if (sessionId) {
        reconcilingRef.current = true;
        widgetCtx
          .reconcileAfterStream(sessionId)
          .catch((err: unknown) => {
            console.error('agent chat post-turn reconcile failed:', err);
          })
          .finally(() => {
            reconcilingRef.current = false;
            // Re-run this effect now that the rows are in — drain the queue.
            // The OVERLAY is not released here: this promise resolving only
            // means the fetch finished, which is not the same as the reply
            // having arrived (see the handoff effect below).
            setQueueVersion((v) => v + 1);
          });
      } else {
        // No session means nothing will ever ingest the rows — don't strand
        // the overlay waiting for a handoff that can't happen.
        setSettling(false);
      }
    }

    if (
      inFlightRef.current ||
      stoppingRef.current ||
      reconcilingRef.current ||
      !sessionId
    ) {
      return;
    }
    const next = queueRef.current.dequeueNext();
    if (!next) return;
    inFlightRef.current = true;
    lastDrainedRef.current = next;
    // The turn's node key — anchored on the user message uuid so it is stable
    // from the first streamed chunk through the retained render source.
    const turnKey = `turn-${next.userMessage.id}`;
    liveTurnKeyRef.current = turnKey;
    setLiveTurnKey(turnKey);
    // Its turn is starting — move the (queued) user bubble into the transcript,
    // above the response it's about to get. No-op for the current turn's message
    // (already added by `beginAgentTurn`). Stays dimmed until its first chunk.
    messageCtx.appendUserMessageIfAbsent(next.userMessage);
    setQueueVersion((v) => v + 1);
    void sendMessage(
      { text: next.userMessage.content },
      { body: bodyFor(next) },
    );
  }, [
    status,
    sessionId,
    queueVersion,
    sendMessage,
    messageCtx,
    widgetCtx,
    bodyFor,
    retainFromMessage,
  ]);

  const send = useCallback(
    (input: SendMessageInput): Promise<AgentChatSendResult> => {
      const generation = sendGenerationRef.current;
      const work = sendPreparationTailRef.current.then(
        async (): Promise<AgentChatSendResult> => {
          if (generation !== sendGenerationRef.current) {
            return { accepted: false, reason: 'conversation-changed' };
          }

          // A turn is already active (streaming, in flight, stopping, or something
          // queued) → this is a multi-send: hold the user message in the queue
          // pill above the composer and let it enter the transcript when its own
          // turn drains. Otherwise it's the current turn: render it now + ensure
          // a session, then stream.
          const turnActive =
            statusRef.current === 'submitted' ||
            statusRef.current === 'streaming' ||
            inFlightRef.current ||
            stoppingRef.current ||
            // Post-turn reconcile still ingesting the last reply: rendering this
            // message now would put its bubble above that reply. Queue it — the
            // drain picks it up the moment the rows land.
            reconcilingRef.current ||
            queueRef.current.size > 0;

          if (
            turnActive &&
            config.disableSendingWhenAwaitingAIReply !== false
          ) {
            console.warn('Cannot send messages while awaiting AI response');
            return { accepted: false, reason: 'awaiting-reply' };
          }

          let prepared: {
            sessionId: string;
            userMessage: WidgetUserMessage;
            initialMessages?: WidgetAiMessage[];
          } | null;
          if (turnActive) {
            prepared = messageCtx.buildQueuedUserMessage(input);
          } else {
            prepared = await messageCtx.beginAgentTurn(input);
          }
          if (!prepared) {
            return { accepted: false, reason: 'preparation-failed' };
          }
          if (generation !== sendGenerationRef.current) {
            return { accepted: false, reason: 'conversation-changed' };
          }

          const enqueued = queueRef.current.enqueue({
            sessionId: prepared.sessionId,
            userMessage: prepared.userMessage,
            input,
            initialMessages: prepared.initialMessages,
          });
          if (!enqueued) {
            console.warn('agent chat queue full; rejecting newest send', {
              rejectedMessageId: prepared.userMessage.id,
            });
            return { accepted: false, reason: 'queue-full' };
          }
          setQueueVersion((v) => v + 1);
          try {
            input.onAccepted?.();
          } catch (error) {
            console.error('[opencx] send acceptance callback failed', error);
          }
          return { accepted: true };
        },
      );

      // Keep later sends moving after a failed preparation while preserving the
      // original rejection for the caller that owns this work item.
      sendPreparationTailRef.current = work.then(
        () => undefined,
        () => undefined,
      );
      return work;
    },
    [messageCtx, config.disableSendingWhenAwaitingAIReply],
  );

  // Retry the FAILED turn: same bubble, fresh wire uuid (the failed turn's
  // ledger row owns the original uuid — resending it would dedupe to
  // silence). Re-enters through the normal queue/drain path.
  const retryFailedTurn = useCallback(() => {
    const last = lastDrainedRef.current;
    if (!last) return;
    const enqueued = queueRef.current.enqueue({
      ...last,
      wireUuid: genUuid(),
    });
    if (!enqueued) {
      console.warn('agent chat queue full; retry not enqueued');
      return;
    }
    clearError();
    setQueueVersion((v) => v + 1);
  }, [clearError]);

  // Drop one queued (not-yet-sent) message — the pill's per-row remove button.
  const removeQueued = useCallback((messageId: string) => {
    const removed = queueRef.current.removeWhere(
      (item) => item.userMessage.id === messageId,
    );
    if (removed) setQueueVersion((v) => v + 1);
  }, []);

  // Stop the live response — and ONLY the response. The queue survives: once
  // the server ACKs the cancel, the drain effect immediately sends the next
  // queued message to the API (the user's "stop mid-stream → my second message
  // starts streaming" flow). With nothing queued, this is a plain stop.
  const stopTurn = useCallback(() => {
    stoppingRef.current = true;
    inFlightRef.current = false;
    void stopAgentChatTurn({ api, sessionId, chatStop: stop })
      .catch((err: unknown) => {
        console.error('agent chat stop failed:', err);
      })
      .finally(() => {
        stoppingRef.current = false;
        // Re-run the drain effect now that the cancel has settled.
        setQueueVersion((v) => v + 1);
      });
  }, [api, sessionId, stop]);

  // Route the shared `sendMessage` API to this useChat engine while mounted.
  useEffect(() => {
    const handlers = { send };
    messageCtx.registerAgentHandlers(handlers);
    return () => messageCtx.unregisterAgentHandlers(handlers);
  }, [messageCtx, send]);

  // Session open / reload: fetch the settled turns' persisted `ui_parts` so
  // historical AI turns render through the streaming renderer (chips and all)
  // instead of their rows' plain text. A null result (older backend — 404,
  // or any fetch surprise) silently keeps the plain-row rendering. Guarded
  // per session so it fetches once, not once per `api` identity.
  useEffect(() => {
    if (!sessionId || historicalFetchSessionRef.current === sessionId) return;
    historicalFetchSessionRef.current = sessionId;
    let cancelled = false;
    void (async () => {
      try {
        const fetched = await api.getAgentTurnMessages(sessionId);
        if (!fetched || cancelled) return;
        setTurnSources((existing) => mergeTurnSources({ existing, fetched }));
      } catch (err) {
        console.error('agent chat turn sources fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, api]);

  // Normalize browser-effect tool calls without touching the host document.
  // The styled package consumes this narrow surface and owns validation,
  // theming, dedupe, and DOM effects.
  const pageEffects = useMemo<AgentChatPageEffect[]>(() => {
    const last = messages.at(-1);
    if (!last || last.role !== 'assistant') return [];
    const effects: AgentChatPageEffect[] = [];
    for (const part of last.parts) {
      if (!isToolUIPart(part)) continue;
      if (getToolName(part) !== HIGHLIGHT_ELEMENT_TOOL_NAME) continue;
      if (
        part.state !== 'input-available' &&
        part.state !== 'output-available'
      ) {
        continue;
      }
      effects.push({
        key: `${sessionId ?? 'pending'}:${part.toolCallId}`,
        type: 'highlight-element',
        input: part.input,
      });
    }
    return effects;
  }, [messages, sessionId]);

  const isStreaming = status === 'submitted' || status === 'streaming';

  // Under `throttle`, the final messages tick can TRAIL the status flip, so
  // the boundary read may see a snapshot without the terminal
  // `data-turn-settled` part. Retry retention on each trailing tick until the
  // release clears the pending key. Idempotent per turn id.
  useEffect(() => {
    if (isStreaming) return;
    const key = pendingReleaseKeyRef.current;
    if (key === null) return;
    const last = messages.at(-1);
    if (last && last.role === 'assistant') retainFromMessage(last, key);
  }, [messages, isStreaming, retainFromMessage]);

  // Mid-stream disconnect recovery: the SDK's `resume` only fires on mount,
  // so a tab-sleep or network blip mid-turn leaves a dead SSE and a reply
  // that never arrives. When the tab comes back (or the network does), and a
  // turn looks unresolved — errored, or still held by `settling` — probe the
  // reconnect endpoint: a live turn replays, a finished one 204s and the
  // poll reconciles.
  useEffect(() => {
    const rearm = () => {
      if (document.visibilityState !== 'visible') return;
      if (!sessionId) return;
      if (isStreaming) return;
      if (error === undefined && !settling) return;
      resumeStream();
    };
    document.addEventListener('visibilitychange', rearm);
    window.addEventListener('online', rearm);
    return () => {
      document.removeEventListener('visibilitychange', rearm);
      window.removeEventListener('online', rearm);
    };
  }, [sessionId, isStreaming, settling, error, resumeStream]);

  // Stand the overlay down only once the persisted transcript actually carries
  // a replacement for it — an assistant-side row after the last user message.
  // (The retained source is already in `turnSources` from the boundary; it
  // starts rendering the moment its rows land, in the same commit this
  // releases, so ownership passes without a gap or an overlap.)
  //
  // Releasing when the reconcile FETCH resolves is not the same thing: if the
  // backend hadn't committed the row when that fetch ran, it comes back empty
  // and the reply would blank out until the next poll tick. Waiting for the row
  // itself makes the handoff correct no matter who wins that race, and it
  // self-heals — a later poll (or a human agent's reply) releases it just the
  // same. Never runs mid-stream: a row polled in while tokens are still
  // arriving must not release the overlay that is still being written to.
  useEffect(() => {
    if (isStreaming || !settling) return;
    for (let i = persistedMessages.length - 1; i >= 0; i -= 1) {
      const row = persistedMessages[i];
      if (!row) continue;
      // Walking back from the end, the first row that settles the question
      // wins. Reaching a user row means this turn has no persisted reply yet,
      // so there is still nothing to hand off to.
      if (row.type === 'USER') return;
      if (row.type !== 'AI' && row.type !== 'AGENT') continue;

      setSettling(false);
      // Clear the live key only if it still belongs to the released turn —
      // a queued next send may have installed ITS key already.
      if (liveTurnKeyRef.current === pendingReleaseKeyRef.current) {
        liveTurnKeyRef.current = null;
        setLiveTurnKey(null);
      }
      pendingReleaseKeyRef.current = null;
      return;
    }
  }, [isStreaming, settling, persistedMessages]);

  // The live overlay: the in-flight assistant message's ordered items. Held
  // through `settling` as well as the stream itself — see above.
  const liveItems: StreamingTurnItem[] = useMemo(() => {
    if (!isStreaming && !settling) return [];
    const last = messages.at(-1);
    if (!last || last.role !== 'assistant') return [];
    return mapUiMessageToItems(last);
  }, [messages, isStreaming, settling]);

  // Messages the user queued mid-turn — surfaced so the composer can render
  // them as a queue pill. Recomputed on every enqueue/drain (`queueVersion`).
  const queuedUserMessages = useMemo(
    () => queueRef.current.items.map((item) => item.userMessage),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queueRef is mutable; queueVersion is the signal
    [queueVersion],
  );

  return {
    isStreaming,
    liveItems,
    /** Finished turns' render sources — see `TurnRenderSource`. */
    turnSources,
    /** The live turn's node key (stable through the retained promotion). */
    liveTurnKey: liveTurnKey ?? LIVE_TURN_FALLBACK_KEY,
    /** The last turn failed — the transcript renders a visible error row. */
    turnFailed: error !== undefined,
    retryFailedTurn,
    queuedUserMessages,
    removeQueued,
    stop: stopTurn,
    pageEffects,
  };
}
