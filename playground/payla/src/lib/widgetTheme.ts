// Linear-inspired restyle of the OpenCX Companion widget for the Payla demo.
//
// Everything here goes in through the widget's PUBLIC customization surface
// (`theme`, `companion`, `cssOverrides`) — no fork, no patched build. The
// widget injects `cssOverrides` last inside its iframe, so these rules win
// over the stock sheet and the companion's own layout overrides.
//
// The reference is Linear's assistant panel: one hairline-bordered white
// surface, a quiet 13px title, grey secondary type, a monochrome ink accent
// (no brand blue inside the panel), and a composer that reads as a raised
// card instead of melting into the transcript.

/** Near-black ink: send button, armed page-mark button, pill. */
export const WIDGET_INK = '#16161a';

export const WIDGET_CSS_OVERRIDES = `
/* ---------------------------------------------------------------- tokens
   The stock neutral hairline (#d4d4d4) is a step darker than Linear's, and
   its secondary type is a lighter grey. Redeclaring the custom properties on
   the panel root beats the inherited values the widget sets inline on its
   frame root.

   Deliberately NOT touched: --opencx-background and --opencx-secondary. The
   background paints the companion SHELL too, on the host document, where
   these iframe-scoped rules can't reach — moving it here alone would leave a
   two-tone panel. And --opencx-secondary is the user-message chip, which
   already needs every bit of the one step it has against that background. */
[data-companion-root],
[data-companion-input] {
  --opencx-border: 0 0% 88%;
  --opencx-input: 0 0% 88%;
  --opencx-muted-foreground: 0 0% 51%;
}

/* ---------------------------------------------------------------- header
   Small and quiet — no rule under it: the title floats over the transcript
   the way Linear's does, and the panel reads as one surface. Padding stays
   tall enough (40px) for the absolutely-positioned corner controls (top: 8px
   + 28px tall) to sit inside it. */
[data-companion-root] [data-component="chat/header"] {
  padding: 4px 8px;
}
[data-companion-root] [data-component="chat/header"] h2 {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.005em;
}

/* ------------------------------------------------------------ transcript
   13.5px reading size with generous leading; user turns become quiet chips.
   The !important mirrors the companion's own flat-message sheet, which sets
   these same properties that way. */
[data-companion-root] [data-component="chat/msgs/root"] {
  padding-inline: 14px;
}
[data-companion-root] [data-component="chat/agent_msg/msg"] {
  font-size: 13.5px;
  line-height: 1.6;
}
[data-companion-root] [data-component="chat/user_msg/msg"] {
  font-size: 13px !important;
  padding: 6px 10px !important;
  border-radius: 8px !important;
}

/* -------------------------------------------------------------- composer
   Left to the stock sheet on purpose. The composer is already a raised
   card with corners concentric to the shell and no focus ring on click —
   the same look as the OpenCX dashboard's companion. Only the type size is
   pulled down to match the transcript. */
[data-companion-root] [data-component="chat/input_box/textarea"],
[data-companion-input] [data-component="chat/input_box/textarea"] {
  font-size: 13px;
}
`;
