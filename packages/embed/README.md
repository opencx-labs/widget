# OpenCX Widget - Embed

The default React widget. Embeddable in HTML.

For more information, check [the documentation](https://docs.open.cx/widget/getting-started)

## CTA card

A declarative CTA/teaser card shown near the launcher while the widget is
closed — the "Crisp/Text-style" proactive card. Configure it with a `cta`
object on the options you pass to `initOpenScript`:

```js
const options = {
  token: 'your-widget-token',
  cta: {
    title: 'Do you have any questions? 😀',
    body: 'The team is online and typically replies in minutes.',
    avatarUrls: [
      'https://i.pravatar.cc/56?img=1',
      'https://i.pravatar.cc/56?img=2',
      'https://i.pravatar.cc/56?img=3',
    ],
    buttons: [
      // Opens the widget.
      { text: 'Chat with the team', action: 'open-chat' },
      // Opens a fresh chat and SENDS the message immediately.
      {
        text: 'How do earnings work?',
        action: 'ask',
        message: 'How do earnings work?',
        variant: 'secondary',
      },
      // `prefill` drafts the message in the composer without sending.
      // `url` opens a link (`openInNewTab` defaults to true).
      {
        text: 'Sign up free',
        action: 'url',
        url: 'https://open.cx',
        variant: 'secondary',
      },
    ],
    // Renders an inline input; submitting starts a fresh chat with the text.
    composer: { placeholder: 'Write a message…' },
    dismissForDays: 7,
  },
  hooks: {
    onCtaDisplayed: () => console.log('[cta] displayed'),
    onCtaClicked: (ctx) => console.log('[cta] clicked', ctx),
    onCtaDismissed: () => console.log('[cta] dismissed'),
  },
};

initOpenScript(options);
```

### Rule options

- `dismissForDays` — re-show the card this many days after the visitor
  dismisses it. Omit and a dismissal is permanent (per browser).
- `showAfterSeconds` — delay before the card first appears. Defaults to `0`.
- `urlMatch` — only show the card when `location.href` contains this
  substring. Omit to show on all pages.

### Hooks

- `onCtaDisplayed()` — fires the first time the card becomes visible on this
  page load.
- `onCtaClicked({ action, index })` — fires on a button or composer use;
  `action` is `'open-chat' | 'ask' | 'prefill' | 'url' | 'composer'` and
  `index` is the button index (`undefined` for the composer).
- `onCtaDismissed()` — fires when the visitor closes the card with the X.

### Host control

Drive the card programmatically from the page via `window.opencxWidget`:

- `window.opencxWidget.showCta()` — force-show the card, bypassing the
  dismissal, `urlMatch`, and `showAfterSeconds` rules (no-op while the widget
  is open).
- `window.opencxWidget.hideCta()` — force-hide the card until `showCta()` or a
  reload.

### Styling

Every part of the card carries a `data-component` name you can target with
`cssOverrides`: `cta/root`, `cta/dismiss_btn`, `cta/image`, `cta/title`,
`cta/body`, `cta/avatars`, `cta/btn`, `cta/composer/root`,
`cta/composer/input`, and `cta/composer/send_btn`.

```js
const options = {
  token: 'your-widget-token',
  cta: { title: 'Need a hand?' },
  cssOverrides: '[data-component="cta/title"] { color: orangered; }',
};
```
