# OpenCX Widget

For all the available options, check [the documentation](https://docs.open.cx/widget/getting-started)

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
both popover and companion mode. Each new chat requires a choice; conversations
with messages stay editable. The option defaults to `false` and is ignored if
there are no non-empty initial questions.
