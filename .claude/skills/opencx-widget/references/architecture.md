# Widget architecture notes

## Initialization

`WidgetCtx.initialize({ config, storage })` fetches `/widget/v2/config` and builds the
contexts. The response's `agent` block (`resolveWidgetAgent`) decides:

- `streaming` — whether the backend supports streaming; `WidgetCtx` also requires
  explicit `config.streaming === true` to select that engine;
- `features` — the org's effective features, narrowed by `config.features`
  (`resolveClientFeatures`) into `widgetCtx.features`.

A backend without an `agent` block (pre-v5) yields the classic widget: blocking send,
attachments on, nothing page-aware. A failed fetch throws `WidgetInitializationError`;
`WidgetProvider` renders `errorComponent` or nothing.

## Message lifecycle (both engines)

1. Caller invokes `messageCtx.sendMessage(input)` (composer, `newChat`, mode components).
2. `stageUserTurn` validates, builds the user message (extra collected data prepended on
   the first message; when `sendsPageContext`, page-mark chips from
   `input.clientContext.page_marks` and the picked `input.mentions`, which the bubble
   highlights where each `@Title` sits in the content), inserts it optimistically along
   with persistent greetings, and ensures a session (rolling back on failure).
3. `notifySendAccepted(input)` resets `lastAIResMightSolveUserIssue`, records any
   accepted option pick and fires `onAccepted` — the composer clears here, never earlier.
4. The body is `buildSendMessageBody(...)`: config-level headers/query/body properties,
   `clientContext` (`mergeSendContext`: host `context` always; the widget's own page
   context and `mentions` only when `sendsPageContext`; `entity` dropped when
   `input.withPageEntity === false`), `custom_data`, `language`, `features`
   (`resolveSendFeatures`), `initial_messages`.
5. Classic: `POST /widget/v2/chat/send`, reply appended, polling reconciles.
   Streaming: the registered handler (`useAgentChat.send`) takes over.

## Streaming turn (useAgentChat)

- `useChat` (AI SDK) with a `DefaultChatTransport` whose body is the full wire body per
  send; auth headers are re-read per request (the contact JWT is minted lazily).
- `turnPhaseRef`: `idle | in-flight | stopping | reconciling`. The queue drains only in
  `idle`; `useChat.status` covers the stream itself.
- Send while `streaming` and nothing queued → **steer**: bubble enters the transcript at
  once, the message is POSTed on a side stream; first decisive chunk classifies it
  (`steered` | `turn` → stop + resume | `failed` | `silent`).
- Otherwise → **queue** (`AgentChatQueue`, capacity 20, newest rejected); the queue pill
  shows pending messages; each drains when its turn starts.
- Stop: client abort + `POST /widget/v5/chat/:id/stop`; reconcile after the ACK so the
  partial reply's row lands before the next queued message.
- Boundary: on `streaming → ready|error` the finished message is retained as a
  `TurnRenderSource` keyed by its live node key (no remount), then canonical rows are
  fetched (`reconcileAfterStream`); the overlay stands down when a reply row appears.
- Feedback: a completed stream uses `message.metadata.mightSolveUserIssue === true`
  to update `MessageCtx.state.lastAIResMightSolveUserIssue`. Aborted, disconnected,
  failed, queued-follow-up and different-session completions cannot carry a verdict
  into the active session.
- Reload fidelity: `GET /widget/v5/chat/:id/messages` returns settled turns' `ui_parts`;
  `mergeTurnSources` keeps retained live turns over fetched ones.
- `pageEffects`: `highlight_element` tool parts, only when `features.clientTools`.
- `pendingClarification`: the newest `ask_questions` item of the newest turn, unless the
  turn is streaming or the customer has already replied; the composer swaps itself for
  the questionnaire.

## Unread state

`UnreadCtx` is shared by a widget's session runtimes. It derives unread IDs and a
count from loaded session rows, excluding the transcript currently being viewed;
it is not a backend-wide unread total. It reports reading to the backend, merges
the response without hiding newer replies, and stops retries/results after disposal.

A browser shell's `useUnreadViewing` requires an open widget, the chat screen,
loaded initial history, a visible transcript and a visible document. Companion's
input-only state passes `transcriptVisible: false`. Native hosts report equivalent
state directly through `unreadCtx.setViewingSessionId`, clearing it when hidden.
`unreadIndicator: false` hides built-in marks but does not disable count callbacks.

## Companion shell states

`pill` → (`launchFromPill`) → `input` (quick-ask) or `chat` (session exists / welcome
screen). A USER message appearing while in `input` promotes to `chat` (quick-ask send or
`WidgetRef.newChat({ message })`). `closePanel` steps down one rung; `dismissPanel`
(Escape) drops fullscreen or goes straight to the pill. `isOpen` from
`WidgetTriggerProvider` is two-way synced with `state !== 'pill'`.

Layouts: `compact` | `sidebar` | `fullscreen`, normalized by core `companion-layout.ts`;
the visitor's picks persist through `StorageCtx` (`companion-*` keys). Sidebar `docked`
mode frames the host page through leased `app-frame.ts`; fullscreen locks host scroll
through a ref-counted lock.
