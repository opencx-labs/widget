export type OpenCxComponentNameU =
  /* ------------------------------------------------------ */
  /*                         UI Lib                         */
  /* ------------------------------------------------------ */
  | 'ui_lib/btn'
  /* ------------------------------------------------------ */
  /*                         Trigger                        */
  /* ------------------------------------------------------ */
  | 'trigger/btn'

  /* ------------------------------------------------------ */
  /*                     Sessions Screen                    */
  /* ------------------------------------------------------ */
  | 'sessions/root'
  | 'sessions/header'
  | 'sessions/list'
  | 'sessions/new_conversation_btn'

  /* ------------------------------------------------------ */
  /*                       Chat Screen                      */
  /* ------------------------------------------------------ */
  | 'chat/root'
  | 'chat/header'
  | 'chat/main/root'
  | 'chat/canvas/root'
  | 'chat/msgs/wrapper'
  | 'chat/msgs/root'
  | 'chat/msgs/scroll-to-bottom'
  | 'chat/streaming_turn/root'
  | 'chat/streaming_turn/steps'
  | 'chat/streaming_turn/working'
  | 'chat/turn_failed/root'
  | 'chat/turn_failed/retry'
  /* ------------- Agent clarification questions ------------ */
  | 'chat/clarification_questions/root'
  | 'chat/clarification_questions/prompt'
  | 'chat/clarification_questions/option'
  | 'chat/clarification_questions/manual_input'
  | 'chat/clarification_questions/type_it'
  | 'chat/clarification_questions/back'
  | 'chat/clarification_questions/next'
  | 'chat/clarification_questions/send'
  /* -------------------- Agent Message ------------------- */
  | 'chat/agent_msg_group/root'
  | 'chat/agent_msg_group/actions'
  | 'chat/agent_msg_group/actions/copy'
  | 'chat/agent_msg_group/avatar_and_msgs/root'
  | 'chat/agent_msg_group/avatar_and_msgs/avatar'
  | 'chat/agent_msg_group/avatar_and_msgs/msgs'
  | 'chat/agent_msg_group/root/avatar'
  | 'chat/agent_msg_group/suggestions'
  | 'chat/agent_msg/root'
  | 'chat/agent_msg/msg'
  /* -------------------- Chat Message -------------------- */
  | 'chat/user_msg_group/root'
  | 'chat/user_msg_group/avatar/root'
  | 'chat/user_msg/root'
  | 'chat/user_msg/msg'
  | 'chat/user_msg/marked_elements'
  /* --------------------- Chat Input --------------------- */
  | 'chat/input_box/root'
  | 'chat/input_box/inner_root'
  /* Fused tray: attached context + the composer card, as one unit. */
  | 'chat/input_box/attached_context_tray'
  | 'chat/input_box/textarea_and_attachments_container'
  | 'chat/input_box/textarea'
  | 'chat/input_box/attachments_container'
  /* Page marks (click an element, edit the mark, attach it as context) */
  | 'chat/input_box/page_mark_btn'
  | 'chat/input_box/dictate_btn'
  | 'chat/input_box/page_context_container'
  | 'chat/input_box/page_mark_pill'
  | 'chat/input_box/page_marks_toggle'
  | 'chat/input_box/page_context_pill'
  /* @-mentions: the menu above the composer, and the highlighted `@Title` in
     the composer's text and the sent bubble. */
  | 'chat/mention'
  | 'chat/input_box/mention_picker'
  | 'chat/input_box/mention_picker/group'
  | 'chat/input_box/mention_picker/option'
  | 'chat/input_box/mention_picker/more'
  | 'chat/input_box/mention_picker/detail'
  /* Multi-send queue pill, docked above the composer (streaming engine). */
  | 'chat/queued_sends/root'
  | 'chat/queued_sends/header'
  | 'chat/queued_sends/list'
  | 'chat/queued_sends/item'
  | 'chat/queued_sends/remove'
  | 'chat/queued_sends/send_now'
  /* --------------------- Chat Utils --------------------- */
  | 'chat/bot_loading/root'
  | 'chat/bot_loading/bouncing_dots_container'
  | 'chat/suggested_reply_btn'
  | 'chat/might_solve_user_issue_suggested_replies_container'

  /* ------------------------------------------------------ */
  /*                        Companion                       */
  /* ------------------------------------------------------ */
  /* Corner chrome shared by the companion panel + the sidebar. */
  | 'companion/controls/root'
  | 'companion/layout_picker/trigger'
  | 'companion/layout_picker/menu'
  | 'companion/layout_picker/option'
  | 'companion/layout_picker/sidebar_options'
  | 'companion/layout_picker/sidebar_option'
  | 'companion/close_btn';
