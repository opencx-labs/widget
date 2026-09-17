/**
 * Flat "document" message rendering — the agent chat DEFAULT. Agent replies
 * flow as unbubbled text and user messages become quiet chips
 * (Linear/Claude-style reading layout). Avatars are a separate sheet so an
 * embed can keep them without bubbles, or drop them with bubbles.
 *
 * Every rule is scoped to the companion panel root. `companion.bubbles: true`
 * skips FLAT_MESSAGE_CSS; `companion.avatars: true` skips HIDE_AVATARS_CSS.
 */
const scope = '[data-companion-root]';

export const FLAT_MESSAGE_CSS = `
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
  text-align: start;
  padding: 4px 10px 4px 0;
  border-bottom: 1px solid hsl(var(--opencx-border));
}
${scope} [data-component="chat/user_msg/msg"] {
  background: hsl(var(--opencx-secondary)) !important;
  color: hsl(var(--opencx-secondary-foreground)) !important;
  padding: 8px 12px !important;
  border-radius: 10px !important;
}
`;

export const HIDE_AVATARS_CSS = `
${scope} [data-component="chat/agent_msg_group/root/avatar"],
${scope} [data-component="chat/agent_msg_group/avatar_and_msgs/avatar"] {
  display: none !important;
}
`;

/**
 * Flat layout WITH avatars: a reply reads as a document, so the avatar marks
 * where it starts — top-aligned with the first line and sized to it — instead
 * of hanging at the bottom beside the actions row like a chat bubble's.
 */
export const FLAT_AVATARS_CSS = `
${scope} [data-component="chat/agent_msg_group/avatar_and_msgs/root"] {
  align-items: flex-start !important;
}
${scope} [data-component="chat/agent_msg_group/avatar_and_msgs/avatar"] {
  width: 20px !important;
  height: 20px !important;
  margin-top: 2px !important;
}
/* Steps, rendered blocks, the working spinner and the actions row are siblings
   of the text groups in a streamed turn: indent them by the avatar gutter
   (20px avatar + 8px gap) so everything shares the text's left edge. */
${scope} [data-component="chat/streaming_turn/root"] > :not([data-component="chat/agent_msg_group/root"]) {
  margin-inline-start: 28px !important;
}
`;
