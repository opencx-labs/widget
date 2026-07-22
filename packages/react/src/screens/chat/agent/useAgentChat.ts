import { useChat } from '@ai-sdk/react';
import {
  AgentChatQueue,
  buildAgentChatTransport,
  mapUiMessageToItems,
  stopAgentChatTurn,
  type SendMessageInput,
  type StreamingTurnItem,
  type WidgetUserMessage,
} from '@opencx/widget-core';
import { useConfig, useSessions, useWidget } from '@opencx/widget-react-headless';
import { getToolName, isToolUIPart } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HIGHLIGHT_ELEMENT_TOOL_NAME,
  highlightElementInputSchema,
  highlightElementOnHostPage,
} from '../../../element-picker/agent-highlight';

/** Bounded drop-oldest multi-send backlog. */
const MAX_QUEUED_SENDS = 20;

type QueuedSend = {
  sessionId: string;
  userMessage: WidgetUserMessage;
  input: SendMessageInput;
};

/**
 * The v5 (agent-bound) chat engine, powered by the AI SDK `useChat`.
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
export function useAgentChat() {
  const { widgetCtx } = useWidget();
  const { api, messageCtx } = widgetCtx;
  const config = useConfig();
  const {
    sessionState: { session },
  } = useSessions();
  const sessionId = session?.id ?? null;

  // Per-send fields (uuid / session_id / content / attachments / custom_data)
  // ride the send options `body`; the transport merges them over the config
  // defaults. Reconnect + auth headers come from the api layer.
  const transport = useMemo(
    () =>
      buildAgentChatTransport({
        options: api.getStreamTransportOptions(),
        buildBody: ({ body }) => ({
          bot_token: config.token,
          headers: config.headers,
          query_params: config.queryParams,
          body_properties: config.bodyProperties,
          clientContext: config.context,
          language: config.language,
          ...body,
        }),
      }),
    [
      api,
      config.token,
      config.headers,
      config.queryParams,
      config.bodyProperties,
      config.context,
      config.language,
    ],
  );

  const { status, messages, sendMessage, stop } = useChat({
    id: sessionId ?? undefined,
    resume: true,
    transport,
    // Batch token updates: without it every streamed token re-renders the
    // whole chat surface (transcript + composer), which stutters on long
    // replies inside customer pages.
    throttle: 50,
    onError: (error) => console.error('agent chat stream error:', error),
  });

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
  // True while a ready-state send is awaiting `beginAgentTurn` (which can
  // create a session over the network). A second send racing that window must
  // queue — without this guard both would take the current-turn path: two
  // bubbles rendered at once AND two concurrent createSession calls.
  const preparingRef = useRef(false);
  // Bumped on every enqueue / stop-completion so the drain effect re-evaluates
  // (the queue itself is a ref, so mutating it wouldn't trigger a render).
  const [queueVersion, setQueueVersion] = useState(0);
  // The live overlay must outlive the stream. `useChat` reports 'ready' the
  // moment the stream closes, but the canonical rows that replace the overlay
  // are still a fetch away, so tearing it down at 'ready' leaves the reply
  // missing for that whole window — it blanks out and flashes back in. This
  // stays true across the gap and is cleared only once the rows are ingested.
  // Raised while streaming (never at the boundary) so the hold is already up on
  // the frame the stream ends, and so a RESUMED turn is covered too.
  const [settling, setSettling] = useState(false);
  const prevStatusRef = useRef(status);
  // Latest status, readable synchronously from the `send` callback (which needs
  // to decide current-turn vs queued before the next render).
  const statusRef = useRef(status);
  statusRef.current = status;

  const bodyFor = useCallback(
    (next: QueuedSend) => ({
      uuid: next.userMessage.id,
      session_id: next.sessionId,
      content: next.userMessage.content,
      attachments: next.input.attachments,
      custom_data: {
        ...config.messageCustomData,
        ...next.input.customData,
      },
      // Per-message AI-visible context (picked page elements) merged over the
      // config-level context. Only set when present — the transport's
      // `buildBody` already sends `config.context` as the default, and an
      // explicit `undefined` here would override it away.
      ...(next.input.clientContext
        ? { clientContext: { ...config.context, ...next.input.clientContext } }
        : {}),
    }),
    [config.messageCustomData, config.context],
  );

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
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === 'submitted' || status === 'streaming') {
      setSettling(true);
    }
    if (status === 'streaming') {
      // First chunk arrived — every message posted before it was delivered.
      messageCtx.markUserMessagesDelivered();
      return;
    }
    if (status !== 'ready' && status !== 'error') return;

    const justFinished = prev === 'streaming' || prev === 'submitted';
    if (justFinished) {
      inFlightRef.current = false;
      messageCtx.markUserMessagesDelivered();
      // Ingest the finished turn's canonical rows BEFORE draining the next
      // queued message — transcript order is append-order, so the reply must
      // enter it before the next user bubble does.
      const reconcile = sessionId
        ? messageCtx.reconcileAfterStream?.(sessionId)
        : undefined;
      if (reconcile) {
        reconcilingRef.current = true;
        reconcile
          .catch((err: unknown) => {
            console.error('agent chat post-turn reconcile failed:', err);
          })
          .finally(() => {
            reconcilingRef.current = false;
            // The rows are in — hand the turn back to the persisted transcript.
            setSettling(false);
            // Re-run this effect now that the rows are in — drain the queue.
            setQueueVersion((v) => v + 1);
          });
      } else {
        // Nothing will ever ingest the rows (no polling ctx / no session):
        // don't strand the overlay waiting for a handoff that can't happen.
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
    // Its turn is starting — move the (queued) user bubble into the transcript,
    // above the response it's about to get. No-op for the current turn's message
    // (already added by `beginAgentTurn`). Stays dimmed until its first chunk.
    messageCtx.appendUserMessageIfAbsent(next.userMessage);
    setQueueVersion((v) => v + 1);
    void sendMessage({ text: next.userMessage.content }, { body: bodyFor(next) });
  }, [status, sessionId, queueVersion, sendMessage, messageCtx, bodyFor]);

  const send = useCallback(
    async (input: SendMessageInput) => {
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
        // A ready-state send is mid-`beginAgentTurn` (see `preparingRef`).
        preparingRef.current ||
        queueRef.current.size > 0;

      let prepared: { sessionId: string; userMessage: WidgetUserMessage } | null;
      if (turnActive) {
        prepared = messageCtx.buildQueuedUserMessage(input);
      } else {
        preparingRef.current = true;
        try {
          prepared = await messageCtx.beginAgentTurn(input);
        } finally {
          preparingRef.current = false;
        }
      }
      if (!prepared) return;

      const evicted = queueRef.current.enqueue({
        sessionId: prepared.sessionId,
        userMessage: prepared.userMessage,
        input,
      });
      if (evicted) {
        console.warn('agent chat queue full; dropping oldest queued message', {
          droppedMessageId: evicted.userMessage.id,
        });
      }
      setQueueVersion((v) => v + 1);
    },
    [messageCtx],
  );

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

  // Route the shared `sendMessage`/`stopStreaming` API (composer, suggested
  // replies, imperative handle, canvas) to this useChat engine while mounted.
  useEffect(() => {
    const handlers = { send, stop: stopTurn };
    messageCtx.registerAgentHandlers(handlers);
    return () => messageCtx.unregisterAgentHandlers(handlers);
  }, [messageCtx, send, stopTurn]);

  // Browser-effect tool calls: the backend's `highlight_element` tool is an
  // instant server-side ack — the REAL work (spotlighting an element on the
  // host page) happens here, watching the turn's streamed tool parts. Dedupe
  // per toolCallId so a re-render (or a resumed stream replaying parts) never
  // double-fires the same call.
  const handledHighlightToolCallsRef = useRef(new Set<string>());
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.role !== 'assistant') return;
    for (const part of last.parts) {
      if (!isToolUIPart(part)) continue;
      if (getToolName(part) !== HIGHLIGHT_ELEMENT_TOOL_NAME) continue;
      if (part.state !== 'input-available' && part.state !== 'output-available') {
        continue;
      }
      if (handledHighlightToolCallsRef.current.has(part.toolCallId)) continue;
      handledHighlightToolCallsRef.current.add(part.toolCallId);
      const parsed = highlightElementInputSchema.safeParse(part.input);
      if (!parsed.success) {
        console.warn('highlight_element: invalid tool input', {
          issues: parsed.error.issues,
        });
        continue;
      }
      const found = highlightElementOnHostPage(parsed.data, {
        accentColor: config.theme?.primaryColor,
      });
      if (!found) {
        console.warn('highlight_element: element not found on page', parsed.data);
      }
    }
  }, [messages, config.theme?.primaryColor]);

  const isStreaming = status === 'submitted' || status === 'streaming';

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
    queuedUserMessages,
    removeQueued,
    send,
    stop: stopTurn,
  };
}
