import { useChat } from '@ai-sdk/react';
import {
  buildSendMessageBody,
  resolveClientPresentation,
  genUuid,
  log,
  type SendMessageInput,
  type StagedUserTurn,
  type WidgetConfig,
  type WidgetCtx,
  type WidgetMessageU,
} from '@opencx/widget-core';
import {
  getToolName,
  isToolUIPart,
  type ChatOnFinishCallback,
  type UIMessage,
} from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentChatQueue } from './agent-chat-queue';
import { applyPresentation } from './apply-presentation';
import { mapUiPartsToItems, type StreamingTurnItem } from './agent-chat-stream';
import { buildAgentChatTransport } from './agent-chat-transport';
import {
  mergeTurnSources,
  parseTurnSettledPart,
  type TurnRenderSource,
} from './agent-turn-sources';
import { readSteerOutcome, type SteerOutcome } from './steer-into-live-turn';
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

type QueuedSend = StagedUserTurn & {
  input: SendMessageInput;
  /**
   * Wire uuid of a RETRY: the bubble keeps its identity (no duplicate render)
   * while the server sees a fresh message uuid — resending the original uuid
   * would hit the ledger's dedupe (the failed turn already claimed it) and
   * produce silence.
   */
  retryUuid?: string;
};

/**
 * Where the engine is between two turns. `useChat`'s own `status` covers the
 * stream itself; this covers the gaps around it during which the queue must
 * not drain: a send handed to `useChat` but not yet reported, a stop awaiting
 * its server ACK (+ the partial reply's row), and the post-turn reconcile.
 */
type TurnPhase = 'idle' | 'in-flight' | 'stopping' | 'reconciling';

/**
 * The agent-chat engine, powered by the AI SDK `useChat`.
 *
 * - **Streaming** is driven by `status` ('submitted' | 'streaming' | 'ready').
 * - **Resume** is native (`resume: true` reconnects to a live turn on mount).
 * - **Steering**: a message sent while a turn is STREAMING enters the
 *   transcript at once and is POSTed at once; the backend steers it into the
 *   live turn (`data-turn-steered`), whose single reply — still rendering on
 *   this engine's stream, untouched — answers both messages. When the live
 *   turn cannot take it (already over), the backend opens a new turn for it
 *   on that request's stream, which is replayed here via resume.
 * - **Multi-send queues** cover the gaps steering cannot: a turn that has
 *   not started streaming yet, a stop awaiting its ACK, and the post-turn
 *   reconcile window. A queued message is held in a queue pill above the
 *   composer and enters the transcript when its own turn starts.
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

  // Org features narrowed by the current embed options.
  const { pageContext: sendsPageContext, clientTools: performsClientTools } =
    widgetCtx.features;

  // The whole wire body rides each send's options (`bodyFor`); the transport
  // only owns the URLs and auth. The contact JWT can be minted AFTER this
  // memo runs (lazy contact creation), so auth is re-read per request.
  const transport = useMemo(
    () =>
      buildAgentChatTransport({
        ...api.getStreamTransportOptions(),
        headers: () => api.getStreamTransportOptions().headers,
        reconnectApi: (id) => {
          const url = new URL(api.getStreamTransportOptions().reconnectApi(id));
          const presentation = configRef.current.presentation;
          if (presentation?.toolActivity)
            url.searchParams.set('toolActivity', presentation.toolActivity);
          if (presentation?.reasoning !== undefined)
            url.searchParams.set('reasoning', String(presentation.reasoning));
          return url.toString();
        },
      }),
    [api],
  );

  // onFinish carries the final SDK snapshot, including a response with no
  // assistant parts. A ready status alone cannot distinguish silence from a
  // final message update that React has not observed yet.
  const [completedStream, setCompletedStream] = useState<
    Parameters<ChatOnFinishCallback<UIMessage>>[0] | null
  >(null);
  const stopAcknowledgedRef = useRef(false);

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
    onError: (error) => log.error('agent chat stream error', error),
    onFinish: setCompletedStream,
  });

  // The turn-boundary effect is triggered by status/queue ownership changes,
  // not by every streamed token. It still needs the newest message snapshot
  // when one of those boundaries fires; trailing message ticks have their own
  // focused retention effect below.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const queueRef = useRef(new AgentChatQueue<QueuedSend>(MAX_QUEUED_SENDS));
  // `in-flight`: a send is handed to useChat until the turn's boundary, so a
  // burst of ready-state sends can't overlap.
  // `stopping`: a user stop is in flight (client abort + server cancel + the
  // post-ACK reconcile). Draining on the abort's own ready-flip could start
  // the next turn before the cancel lands, and the session-scoped cancel
  // would then kill the NEW turn too; and the partial reply's row must be
  // ingested first so the queued message never lands above it.
  // `reconciling`: the finished turn's canonical rows are being ingested. The
  // polling merge appends new rows to the END of the transcript, so the next
  // queued user bubble must wait or it renders ABOVE the finished reply.
  const turnPhaseRef = useRef<TurnPhase>('idle');
  // Preparation is serialized separately from streaming: on a fresh chat the
  // first send may be creating the session. Followers must wait for that id and
  // enqueue behind the first send, rather than being dropped or overtaking it.
  const sendPreparationTailRef = useRef<Promise<void>>(Promise.resolve());
  const preparingSendsRef = useRef(0);
  const pendingSteersRef = useRef(0);
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
  // Message snapshots are throttled independently of status. An empty render
  // does not release ownership while the persisted-row handoff is pending.
  const pendingHandoffRef = useRef(settling);
  pendingHandoffRef.current = settling;
  // Per-turn render sources: finished turns whose transcript rows render
  // through the streaming renderer instead of their plain bubbles. Retained
  // live turns (the streamed message STAYS the render source — no swap, no
  // flash) and server-fetched historical turns (`ui_parts` — reload fidelity)
  // live in the same list; `mergeTurnSources` owns the precedence.
  const [turnSources, setTurnSources] = useState<TurnRenderSource[]>([]);
  // The live turn's React key. Set when its send drains (or when a resumed
  // stream is detected) and handed to the retained source at release — SAME
  // key before and after the promotion, so the turn's node never remounts.
  // Mirrored in a ref for the synchronous reads in effects and `send`.
  const [liveTurnKey, setLiveTurnKeyState] = useState<string | null>(null);
  const liveTurnKeyRef = useRef<string | null>(null);
  const setLiveTurnKey = useCallback((key: string | null) => {
    liveTurnKeyRef.current = key;
    setLiveTurnKeyState(key);
  }, []);
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
  const historicalFetchRef = useRef<{
    sessionId: string;
    presentation: WidgetConfig['presentation'];
  } | null>(null);
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
    const items = mapUiPartsToItems(message.parts);
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

  // The same wire body the blocking engine sends, from the LIVE config: an
  // embedder's refreshed config object and a function-form `context` are
  // reflected on every request without re-creating the transport.
  const bodyFor = useCallback(
    (next: QueuedSend) =>
      buildSendMessageBody({
        config: configRef.current,
        input: next.input,
        uuid: next.retryUuid ?? next.userMessage.id,
        sessionId: next.sessionId,
        content: next.userMessage.content,
        initialMessages: next.initialMessages,
        sendsPageContext,
      }),
    [sendsPageContext],
  );

  // Steer a message into the live turn. The bubble is already in the
  // transcript; this POSTs the message on a side stream (NOT through
  // `useChat` — a second `sendMessage` on the engine would push a duplicate
  // of the live assistant message and flip its status under the stream) and
  // acts on the first chunk. The live turn's stream keeps rendering untouched.
  const steer = useCallback(
    async (next: QueuedSend) => {
      const generation = sendGenerationRef.current;
      const abort = new AbortController();
      let outcome: SteerOutcome;
      try {
        const stream = await transport.sendMessages({
          trigger: 'submit-message',
          chatId: next.sessionId,
          messageId: undefined,
          messages: [],
          abortSignal: abort.signal,
          body: bodyFor(next),
        });
        outcome = await readSteerOutcome(stream);
      } catch (err) {
        log.error('agent chat steer failed', err);
        return;
      } finally {
        abort.abort();
      }
      // A session reset/switch mid-flight already discarded this bubble.
      if (generation !== sendGenerationRef.current) return;
      switch (outcome.kind) {
        case 'steered':
          // The live turn has it: its reply is the answer. Un-dim the bubble —
          // the server demonstrably received it.
          messageCtx.markUserMessageDelivered(next.userMessage.id);
          return;
        case 'turn':
          // The live turn was already over: the backend superseded it and
          // opened a NEW turn for this message on the stream just released.
          // The engine's stream (the superseded turn) is dead — drop it on
          // the client too, then replay the new turn from the session's
          // resume pointer so it renders through the normal live path. The
          // resumed stream's first chunk marks this bubble delivered, and
          // it is the retry source should the turn fail.
          lastDrainedRef.current = next;
          try {
            await stop();
          } catch (err) {
            log.error('agent chat steer fallback: client stop failed', err);
          }
          if (generation !== sendGenerationRef.current) return;
          await resumeStream();
          return;
        case 'failed':
          log.error('agent chat steer: the turn failed', {
            errorText: outcome.errorText,
          });
          break;
        case 'silent':
          // Accepted, reply withheld — the rows say what happened.
          messageCtx.markUserMessageDelivered(next.userMessage.id);
          break;
      }
      await widgetCtx
        .reconcileAfterStream(next.sessionId)
        .catch((err: unknown) => {
          log.error('agent chat post-steer reconcile failed', err);
        });
    },
    [transport, bodyFor, messageCtx, stop, resumeStream, widgetCtx],
  );
  // `send` is memoized on the MessageCtx alone (it is registered as the
  // shared send handler); it reads the latest steer through a ref.
  const steerRef = useRef(steer);
  steerRef.current = steer;

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
      turnPhaseRef.current === 'in-flight';

    sendGenerationRef.current += 1;
    preparingSendsRef.current = 0;
    pendingSteersRef.current = 0;
    sendPreparationTailRef.current = Promise.resolve();
    queueRef.current = new AgentChatQueue<QueuedSend>(MAX_QUEUED_SENDS);
    turnPhaseRef.current = 'idle';
    lastDrainedRef.current = null;
    pendingReleaseKeyRef.current = null;
    setCompletedStream(null);
    stopAcknowledgedRef.current = false;
    historicalFetchRef.current = null;
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
      Promise.resolve()
        .then(() => previousClientStop())
        .catch((err: unknown) => {
          log.error('agent chat client stream cancel failed', err);
        });
    }
  }, [sessionId, status, stop, clearError, setLiveTurnKey]);

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
        setLiveTurnKey(`turn-resumed-${genUuid()}`);
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

    const justFinished =
      prev === 'streaming' ||
      prev === 'submitted' ||
      // An empty response can finish before React observes an active status.
      (turnPhaseRef.current === 'in-flight' &&
        completedStream?.messages === messagesRef.current);
    if (justFinished) {
      setSettling(true);
      if (turnPhaseRef.current === 'in-flight') turnPhaseRef.current = 'idle';
      // RETENTION, synchronous: the stream's terminal `data-turn-settled`
      // part says exactly which ledger turn this was and which transcript
      // rows it produced — the streamed message becomes those rows' render
      // source right here, under the live node's key (no follow-up fetch, no
      // async race with the next queued send). A turn that ends without the
      // part never settled (it failed): nothing is retained and the release
      // below falls back to the plain row swap.
      const finishedMessage = messagesRef.current.at(-1);
      const finishedKey = liveTurnKeyRef.current;
      pendingReleaseKeyRef.current = finishedKey;
      if (
        finishedKey !== null &&
        finishedMessage &&
        finishedMessage.role === 'assistant'
      ) {
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
      //
      // NOT on a stop: this flip is the CLIENT abort, which lands before the
      // server has settled the turn and persisted the partial reply. A
      // reconcile now fetches an empty transcript, the queue drains, and the
      // partial bubble is gone until a later poll appends it BELOW the queued
      // message. `stopTurn` reconciles once the `/stop` ACK says the row is
      // there; the overlay stays up (`settling`) until that row lands.
      if (turnPhaseRef.current === 'stopping') {
        // Nothing to do here — `stopTurn` owns the rest of this turn.
      } else if (sessionId) {
        turnPhaseRef.current = 'reconciling';
        widgetCtx
          .reconcileAfterStream(sessionId)
          .catch((err: unknown) => {
            log.error('agent chat post-turn reconcile failed', err);
          })
          .finally(() => {
            if (turnPhaseRef.current === 'reconciling') {
              turnPhaseRef.current = 'idle';
            }
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

    if (turnPhaseRef.current !== 'idle' || !sessionId) return;
    const next = queueRef.current.dequeueNext();
    if (!next) return;
    turnPhaseRef.current = 'in-flight';
    lastDrainedRef.current = next;
    setCompletedStream(null);
    stopAcknowledgedRef.current = false;
    // The turn's node key — anchored on the user message uuid so it is stable
    // from the first streamed chunk through the retained render source.
    setLiveTurnKey(`turn-${next.userMessage.id}`);
    // Its turn is starting — move the (queued) user bubble into the transcript,
    // above the response it's about to get. No-op for the current turn's message
    // (already added by `stageUserTurn`). Stays dimmed until its first chunk.
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
    setLiveTurnKey,
    completedStream,
  ]);

  const send = useCallback(
    (input: SendMessageInput): Promise<void> => {
      const generation = sendGenerationRef.current;
      preparingSendsRef.current++;
      const work = sendPreparationTailRef.current.then(
        async (): Promise<void> => {
          if (generation !== sendGenerationRef.current) return;

          // A turn is STREAMING (its first chunk arrived, so the server is
          // generating) and nothing else is pending → steer: the bubble
          // enters the transcript now, above the live reply, and the message
          // is POSTed now. Not while a stop awaits its ACK (that message is
          // for AFTER the stop — the queue drains it once the cancel lands),
          // not while the reconcile is ingesting the last reply (the bubble
          // would land above it), and not behind queued messages (order).
          const phase = turnPhaseRef.current;
          const steerable =
            statusRef.current === 'streaming' &&
            phase !== 'stopping' &&
            phase !== 'reconciling' &&
            queueRef.current.size === 0;
          // Otherwise a turn is active (submitted, in flight, stopping,
          // reconciling, or something queued) → multi-send queue: hold the
          // user message in the queue pill above the composer and let it
          // enter the transcript when its own turn drains. Or nothing is
          // active: it's the current turn — render it now + ensure a session,
          // then stream.
          const turnActive =
            statusRef.current === 'submitted' ||
            statusRef.current === 'streaming' ||
            phase !== 'idle' ||
            queueRef.current.size > 0;

          // `disableSendingWhenAwaitingAIReply` is the non-streaming engine's
          // gate — there a mid-turn send has nowhere to go. Here it has: the
          // queue IS multi-send, so a busy turn never rejects a message.

          const staged: StagedUserTurn | null = turnActive
            ? withoutInitialMessages(messageCtx.buildQueuedUserMessage(input))
            : await messageCtx.stageUserTurn(input, { pending: true });
          if (!staged) return;
          if (generation !== sendGenerationRef.current) return;

          const next: QueuedSend = { ...staged, input };
          if (steerable) {
            // Into the transcript at once, dimmed until the server has it.
            messageCtx.appendUserMessageIfAbsent(next.userMessage);
            messageCtx.notifySendAccepted(input);
            pendingSteersRef.current++;
            void steerRef
              .current(next)
              .catch((err: unknown) =>
                log.error('agent chat steer failed', err),
              )
              .finally(() => {
                if (generation !== sendGenerationRef.current) return;
                pendingSteersRef.current--;
              });
            return;
          }

          if (!queueRef.current.enqueue(next)) {
            log.warn('agent chat queue full; rejecting newest send', {
              rejectedMessageId: next.userMessage.id,
            });
            return;
          }
          setQueueVersion((v) => v + 1);
          messageCtx.notifySendAccepted(input);
        },
      );

      // Keep later sends moving after a failed preparation while preserving the
      // original rejection for the caller that owns this work item.
      const finished = work.finally(() => {
        if (generation !== sendGenerationRef.current) return;
        preparingSendsRef.current--;
      });
      sendPreparationTailRef.current = finished.then(
        () => undefined,
        () => undefined,
      );
      return finished;
    },
    [messageCtx],
  );

  // Retry the FAILED turn: same bubble, fresh wire uuid (the failed turn's
  // ledger row owns the original uuid — resending it would dedupe to
  // silence). Re-enters through the normal queue/drain path.
  const retryFailedTurn = useCallback(() => {
    const last = lastDrainedRef.current;
    if (!last) return;
    const enqueued = queueRef.current.enqueue({
      ...last,
      retryUuid: genUuid(),
    });
    if (!enqueued) {
      log.warn('agent chat queue full; retry not enqueued');
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
  //
  // Ordering matters: the client abort flips `useChat` to ready at once, but
  // the server persists the partial reply only as it settles the turn — the
  // `/stop` ACK is the signal that row exists. So the partial stays on screen
  // (the boundary effect skips its reconcile while the phase is `stopping`)
  // and the reconcile runs AFTER the ACK — or after a failed stop, so the UI
  // can never stick: the overlay is released by the row landing, the queue by
  // the reconcile finishing. The `stopping` phase holds the drain for the
  // whole stop → reconcile span, so the queued message enters the transcript
  // BELOW the partial reply.
  const stopTurn = useCallback(() => {
    turnPhaseRef.current = 'stopping';
    stopAcknowledgedRef.current = false;
    // A session reset/switch mid-stop already discarded this turn's state;
    // its late ACK must not reconcile or re-arm the drain for the new one.
    const generation = sendGenerationRef.current;
    void stopAgentChatTurn({ api, sessionId, chatStop: stop })
      .then(() => {
        if (generation === sendGenerationRef.current)
          stopAcknowledgedRef.current = true;
      })
      .catch((err: unknown) => {
        log.error('agent chat stop failed', err);
      })
      .then(() => {
        if (generation !== sendGenerationRef.current) return;
        if (!sessionId) {
          // No session means nothing will ever ingest the rows — don't
          // strand the overlay waiting for a handoff that can't happen.
          setSettling(false);
          return;
        }
        return widgetCtx
          .reconcileAfterStream(sessionId)
          .catch((err: unknown) => {
            log.error('agent chat post-stop reconcile failed', err);
          });
      })
      .finally(() => {
        if (generation !== sendGenerationRef.current) return;
        turnPhaseRef.current = 'idle';
        // Re-run the drain effect now that the cancel has settled and the
        // partial reply's row has been ingested.
        setQueueVersion((v) => v + 1);
      });
  }, [api, sessionId, stop, widgetCtx]);

  // Route the shared `sendMessage` API to this useChat engine while mounted.
  useEffect(() => {
    const handlers = {
      send,
      hasPendingWork: () =>
        preparingSendsRef.current > 0 ||
        pendingSteersRef.current > 0 ||
        pendingHandoffRef.current ||
        queueRef.current.size > 0 ||
        turnPhaseRef.current !== 'idle' ||
        statusRef.current === 'submitted' ||
        statusRef.current === 'streaming',
    };
    messageCtx.registerAgentHandlers(handlers);
    return () => messageCtx.unregisterAgentHandlers(handlers);
  }, [messageCtx, send]);

  // Presentation is part of the history request, so changing it invalidates the
  // previous projection. Late responses from superseded requests are ignored.
  const toolActivity = config.presentation?.toolActivity;
  const reasoning = config.presentation?.reasoning;
  useEffect(() => {
    if (!sessionId) return;
    const presentation =
      toolActivity === undefined && reasoning === undefined
        ? undefined
        : { toolActivity, reasoning };
    const previous = historicalFetchRef.current;
    const refreshItems =
      previous?.sessionId === sessionId &&
      (previous.presentation?.toolActivity !== toolActivity ||
        previous.presentation?.reasoning !== reasoning);
    historicalFetchRef.current = { sessionId, presentation };
    let cancelled = false;
    void (async () => {
      try {
        const fetched =
          presentation === undefined
            ? await api.getAgentTurnMessages(sessionId)
            : await api.getAgentTurnMessages(sessionId, presentation);
        if (!fetched || cancelled) return;
        setTurnSources((existing) =>
          mergeTurnSources({ existing, fetched, refreshItems }),
        );
      } catch (err) {
        log.error('agent chat turn sources fetch failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, api, toolActivity, reasoning]);

  // Normalize browser-effect tool calls without touching the host document.
  // The styled package consumes this narrow surface and owns validation,
  // theming, dedupe, and DOM effects. Client tools off (org or embed) → a
  // streamed tool part is ignored, never performed.
  const pageEffects = useMemo<AgentChatPageEffect[]>(() => {
    if (!performsClientTools) return [];
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
  }, [messages, sessionId, performsClientTools]);

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
    const release = () => {
      setSettling(false);
      // A queued next send may have installed its own key already.
      if (liveTurnKeyRef.current === pendingReleaseKeyRef.current) {
        setLiveTurnKey(null);
      }
      pendingReleaseKeyRef.current = null;
    };

    // Compare the SDK snapshot by identity: a late callback from a previous
    // session/turn must not settle this one, and a throttled snapshot must
    // catch up before it can prove silence. Hidden suggestions can carry row
    // ids, while older agents may omit the terminal part altogether. Neither
    // needs a visitor-facing row when the completed response has no reply.
    if (
      liveTurnKeyRef.current === pendingReleaseKeyRef.current &&
      completedStream?.messages === messages &&
      !completedStream.isError &&
      !completedStream.isDisconnect &&
      (!completedStream.isAbort || stopAcknowledgedRef.current) &&
      !mapUiPartsToItems(completedStream.message.parts).some(
        (item) => item.kind !== 'steps',
      )
    ) {
      const lastUser = persistedMessages.findLast((row) => row.type === 'USER');
      if (lastUser) {
        // Preserve completion when switching to the blocking engine, whose
        // composer otherwise treats a final user row as an unanswered send.
        messageCtx.state.setPartial({ settledAgentUserMessageId: lastUser.id });
      }
      release();
      return;
    }

    for (let i = persistedMessages.length - 1; i >= 0; i -= 1) {
      const row = persistedMessages[i];
      if (!row) continue;
      // A user row means this reply has not reached persisted history yet.
      if (row.type === 'USER') return;
      if (row.type !== 'AI' && row.type !== 'AGENT') continue;
      release();
      return;
    }
  }, [
    isStreaming,
    settling,
    persistedMessages,
    setLiveTurnKey,
    completedStream,
    messages,
    messageCtx,
    queueVersion,
  ]);

  const visiblePresentation = resolveClientPresentation(
    widgetCtx.agent.presentation,
    config.presentation,
  );
  const visibleToolActivity = visiblePresentation?.toolActivity;
  const visibleReasoning = visiblePresentation?.reasoning;

  // The live overlay: the in-flight assistant message's ordered items. Held
  // through `settling` as well as the stream itself — see above.
  const liveItems: StreamingTurnItem[] = useMemo(() => {
    if (!isStreaming && !settling) return [];
    const last = messages.at(-1);
    if (!last || last.role !== 'assistant') return [];
    return applyPresentation(mapUiPartsToItems(last.parts), {
      toolActivity: visibleToolActivity,
      reasoning: visibleReasoning,
    });
  }, [messages, isStreaming, settling, visibleToolActivity, visibleReasoning]);

  const visibleTurnSources = useMemo(
    () =>
      turnSources.flatMap((source) => {
        const items = applyPresentation(source.items, {
          toolActivity: visibleToolActivity,
          reasoning: visibleReasoning,
        });
        if (items.length === 0) return [];
        return [items === source.items ? source : { ...source, items }];
      }),
    [turnSources, visibleToolActivity, visibleReasoning],
  );

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
    turnSources: visibleTurnSources,
    /** The live turn's node key (stable through the retained promotion). */
    liveTurnKey,
    /** The last turn failed — the transcript renders a visible error row. */
    turnFailed: error !== undefined,
    retryFailedTurn,
    queuedUserMessages,
    removeQueued,
    stop: stopTurn,
    pageEffects,
  };
}

/** A queued turn never carries greetings: the conversation already has them. */
function withoutInitialMessages(
  built: {
    sessionId: string;
    userMessage: StagedUserTurn['userMessage'];
  } | null,
): StagedUserTurn | null {
  return built ? { ...built, initialMessages: [] } : null;
}
