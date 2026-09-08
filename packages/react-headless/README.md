# OpenCX Widget - React Headless

Headless React helpers and hooks.

For more information, check [the documentation](https://docs.open.cx/widget/getting-started)

## Selectable questions

A custom client must render question choices, collect selections or free text, and submit the answer before declaring support:

```tsx
<WidgetProvider
  components={yourComponents}
  options={{
    token: 'YOUR_WIDGET_TOKEN',
    capabilities: { structuredQuestions: true },
  }}
>
  <YourChat />
</WidgetProvider>
```

Omitting this capability leaves the structured question tool unavailable. Ordinary text questions remain available. The organization must also enable **Selectable questions**. The built-in `Widget` declares support automatically for its default question component. If you replace `agent_chat_questions`, explicitly declare support after implementing the replacement.

## Delivery, activity and renderer support

These options are included in the next beta after `5.0.0-beta.1`:

```tsx
<WidgetProvider
  components={yourComponents}
  options={{
    token: '<WIDGET_TOKEN>',
    streaming: false,
    presentation: { toolActivity: 'hidden', reasoning: false },
  }}
>
  <YourChat />
</WidgetProvider>
```

`streaming: false` chooses polling without changing the server's agent version.
The organization controls maximum activity visibility. An embed may narrow
`toolActivity` to `status` (name and status without inputs/results) or `hidden`,
and disable `reasoning`. It cannot override an organization restriction.
Tools still execute when their activity is hidden. The backend applies the same
limits to live replies, reconnects and history; the default is status-only
activity and hidden reasoning.

A headless client does not declare renderer support automatically. Set
`capabilities.structuredQuestions`, `capabilities.richReplies`, or
`capabilities.pageEffects` to `true` only after implementing that interaction.
These capabilities also require the organization's feature and streaming;
polling receives completed replies without structured interactions. Ordinary
clarifying questions in text do not require a selectable-question renderer.
Interactive question and highlight payloads remain available when activity is
hidden because they drive the customer-facing UI.

Changing options on an existing provider updates subsequent requests without
resetting its session. A delivery change waits for accepted messages, queued
messages and reply reconciliation to finish on their current transport.
Streaming reconnects and history fetches include the current presentation
opt-outs. Changing visibility refreshes existing history; `useAgentChatUi()`
immediately hides opted-out activity in both live and cached turns, including
while that refresh is pending or fails. Integrations keeping a separate cache
can use `applyPresentation(items, presentation)` to apply the same display rules.
