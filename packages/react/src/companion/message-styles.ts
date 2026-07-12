/**
 * Flat "document" message rendering — the opt-out from bubbles
 * (`companion.bubbles: false`). Agent replies flow as unbubbled text, user
 * messages become quiet chips, and avatars drop out of the gutter
 * (Linear/Claude-style reading layout).
 *
 * Scoped to the passed root selector so companion (`[data-companion-root]`)
 * and sidebar (`[data-opencx-sidebar-content]`) share one definition. When
 * `bubbles` is on (default) none of this is injected and the stock bubbles
 * render, identical to popover.
 */
export function flatMessageCss(scope: string): string {
  return `
${scope} [data-component="chat/agent_msg/msg"] {
  background: transparent !important;
  padding: 2px 0 !important;
  border-radius: 0 !important;
  max-width: 100% !important;
}
${scope} [data-component="chat/agent_msg_group/root/avatar"],
${scope} [data-component="chat/agent_msg_group/avatar_and_msgs/avatar"] {
  display: none !important;
}
${scope} [data-component="chat/user_msg/msg"] {
  background: hsl(var(--opencx-secondary)) !important;
  color: hsl(var(--opencx-secondary-foreground)) !important;
  padding: 8px 12px !important;
  border-radius: 10px !important;
}
`;
}
