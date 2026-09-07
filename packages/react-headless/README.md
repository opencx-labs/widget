# OpenCX Widget - React Headless

Headless React helpers and hooks.

For more information, check [the documentation](https://docs.open.cx/widget/getting-started)

## Selectable questions

A custom client must render question choices, collect selections or free text, and submit the answer before declaring support:

```tsx
<WidgetProvider
  options={{
    token: 'YOUR_WIDGET_TOKEN',
    capabilities: { structuredQuestions: true },
  }}
>
  <YourChat />
</WidgetProvider>
```

Omitting this capability leaves the structured question tool unavailable. Ordinary text questions remain available. The organization must also enable **Selectable questions**. The built-in `Widget` declares support automatically for its default question component. If you replace `agent_chat_questions`, explicitly declare support after implementing the replacement.
