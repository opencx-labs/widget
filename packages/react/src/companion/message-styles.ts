/**
 * Flat "document" message rendering — the v5 DEFAULT. Agent replies flow as
 * unbubbled text, user messages become quiet chips, and avatars drop out of
 * the gutter (Linear/Claude-style reading layout).
 *
 * Scoped to the passed root selector so companion (`[data-companion-root]`)
 * and sidebar (`[data-opencx-sidebar-content]`) share one definition. When
 * `companion.bubbles: true` is set none of this is injected and the stock
 * chat bubbles render, identical to popover.
 */
export function flatMessageCss(scope: string): string {
  return `
${scope} [data-component="chat/msgs/root"] {
  overflow-x: hidden !important;
}
${scope} [data-component="chat/agent_msg_group/root"],
${scope} [data-component="chat/agent_msg_group/avatar_and_msgs/root"],
${scope} [data-component="chat/agent_msg_group/avatar_and_msgs/msgs"] {
  min-width: 0 !important;
  max-width: 100% !important;
}
${scope} [data-component="chat/agent_msg/msg"] {
  background: transparent !important;
  padding: 2px 0 !important;
  border-radius: 0 !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow-wrap: break-word !important;
}
${scope} [data-component="chat/agent_msg/msg"] table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}
${scope} [data-component="chat/agent_msg/msg"] th,
${scope} [data-component="chat/agent_msg/msg"] td {
  overflow-wrap: normal;
  word-break: normal;
  white-space: normal;
  vertical-align: top;
  text-align: left;
  padding: 4px 10px 4px 0;
  border-bottom: 1px solid hsl(var(--opencx-border));
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
