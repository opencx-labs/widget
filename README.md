# OpenCX Widget

For all the available options, check [the documentation](https://docs.open.cx/widget/getting-started)

## Page access in v5

Page reading and agent actions are off by default in both popover and Companion.
Enable them only on pages intended to be shared with the agent, with organization
support and explicit embed options:

```ts
features: { pageContext: true, clientTools: true }
```

Use only `pageContext: true` to allow reading/marking without agent actions.
Mark sensitive regions with `data-opencx-private`. Names and marked text exclude
private/hidden descendants and form values; screenshots are omitted for regions
containing private/hidden content, fields, or opaque embedded media. Mark previews
stay local until Send. Captured page URLs omit credentials, queries, and fragments;
URL paths and ordinary visible page text can still contain business data.

Host-provided `context`, message custom data, typed messages, and deliberately
attached files remain shared as configured. Page-access flags do not sanitize
those explicit inputs.

## Initial questions

To require visitors to start with one of your initial questions, set
`requireInitialQuestion: true` in the widget options:

```ts
{
  token: 'YOUR_WIDGET_TOKEN',
  initialQuestions: ['Track my order', 'Help with a return'],
  requireInitialQuestion: true,
}
```

The message box stays hidden until a question is sent, then appears for
follow-up messages. This works with either `initialQuestionsPosition` and in
both popover and inline mode. Each new chat requires a choice; conversations
with messages stay editable. The option defaults to `false` and is ignored if
there are no non-empty initial questions.

In v5 Companion, `initialQuestions` appear as floating pills above the quick-ask
bar. With `requireInitialQuestion: false` (the default), visitors can choose a
suggestion or type their own question. Set it to `true` to hide the input until
one is selected. Suggestions disappear after the conversation starts and return
for a new chat. Popover and inline keep their configured question placement.
