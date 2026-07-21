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
  /*                         CTA Card                       */
  /* ------------------------------------------------------ */
  | 'cta/root'
  | 'cta/dismiss_btn'
  | 'cta/image'
  | 'cta/title'
  | 'cta/body'
  | 'cta/avatars'
  | 'cta/btn'
  | 'cta/composer/root'
  | 'cta/composer/input'
  | 'cta/composer/send_btn'
  | 'cta/goo_blob'

  /* ------------------------------------------------------ */
  /*                     Sessions Screen                    */
  /* ------------------------------------------------------ */
  | 'sessions/root'
  | 'sessions/header'
  | 'sessions/new_conversation_btn'

  /* ------------------------------------------------------ */
  /*                       Chat Screen                      */
  /* ------------------------------------------------------ */
  | 'chat/root'
  | 'chat/header'
  | 'chat/main/root'
  | 'chat/canvas/root'
  | 'chat/msgs/root'
  /* -------------------- Agent Message ------------------- */
  | 'chat/agent_msg_group/root'
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
  /* --------------------- Chat Input --------------------- */
  | 'chat/input_box/root'
  | 'chat/input_box/inner_root'
  | 'chat/input_box/textarea_and_attachments_container'
  | 'chat/input_box/textarea'
  | 'chat/input_box/attachments_container'
  /* --------------------- Chat Utils --------------------- */
  | 'chat/bot_loading/root'
  | 'chat/bot_loading/bouncing_dots_container'
  | 'chat/suggested_reply_btn'
  | 'chat/might_solve_user_issue_suggested_replies_container';
