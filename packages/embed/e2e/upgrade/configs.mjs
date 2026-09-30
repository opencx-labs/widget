// Only options present in the published v4 contract. This exact factory runs
// unchanged before and after the bundle swap, including all function options.
export const profiles = [
  'brand-form',
  'rtl-required-above',
  'below-optional',
  'custom-components',
  'custom-trigger',
  'inline',
  'verified',
  'user-data',
  'session-list',
  'long-content',
  'minimal',
  'mode-canvas',
];

export function legacyConfig(profile) {
  window.upgradeEvents = [];
  const record = (kind, value) => window.upgradeEvents.push({ kind, value });
  const jwt = (contact, revision = 1) => {
    const encode = (value) =>
      btoa(JSON.stringify(value))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: { type: 'widget-contact', payload: { org_id: 'upgrade-org', contact: { id: contact, verified: true } } }, iat: revision, exp: 4102444800 })}.synthetic`;
  };
  window.upgradeJwt = jwt;
  const custom = profile === 'custom-components';
  const rtl = profile === 'rtl-required-above';
  const inline = profile === 'inline';
  const language = rtl
    ? 'ar'
    : profile === 'below-optional'
      ? 'nl'
      : profile === 'long-content'
        ? 'de'
        : 'en';
  const config = {
    token: 'upgrade-bot',
    apiUrl: 'https://upgrade.test',
    language,
    isOpen: inline,
    collectUserData: profile === 'brand-form',
    prefillUserData: {
      name: 'Synthetic Visitor',
      email: 'visitor@example.invalid',
    },
    extraDataCollectionFields:
      profile === 'brand-form' ? ['Shipment number', 'Postal code'] : undefined,
    translationOverrides: {
      [language]: {
        write_a_message_placeholder: 'CUSTOM INPUT',
        send_message: 'CUSTOM SEND',
        new_conversation: 'CUSTOM NEW',
        your_issue_has_been_resolved: 'CUSTOM RESOLVED',
      },
    },
    bot: { name: 'CUSTOM BOT', avatarUrl: 'https://upgrade.test/avatar.svg' },
    humanAgent: {
      name: 'CUSTOM HUMAN',
      avatarUrl: 'https://upgrade.test/human.svg',
    },
    disableTooltips: true,
    theme: {
      palette: rtl ? 'slate' : 'zinc',
      primaryColor: '#7c2d12',
      widgetTrigger: {
        zIndex: 1900000000,
        offset: {
          bottom: 31,
          left: rtl ? 27 : 'initial',
          right: rtl ? 'initial' : 29,
        },
        size: { button: 58, icon: 26 },
      },
      widgetContentContainer: {
        zIndex: 1900000001,
        offset: { side: 13, align: 7 },
        outline: '3px solid',
        outlineColor: '#22c55e',
        borderRadius: '17px',
        boxShadow: '0px 4px 20px rgba(17,24,39,0.3)',
        transitionDuration: '0s',
      },
      screens: {
        welcome: { width: '430px', minHeight: '430px' },
        sessions: { width: '430px', height: '510px' },
        chat: {
          width: '430px',
          height: '570px',
          withCanvas: { width: '850px', height: '650px' },
        },
      },
    },
    cssOverrides: `* { font-family: Georgia, serif !important; }
      [data-component="chat/header"],[data-component="sessions/header"] {background-color:rgb(12,34,56) !important;color:rgb(240,230,220) !important;}
      [data-component="chat/input_box/textarea"] {color:rgb(85,26,139) !important;font-size:17px !important;letter-spacing:0.4px !important;}
      [data-component="chat/suggested_reply_btn"] {background-color:rgb(107,33,168) !important;color:white !important;border-radius:9px !important;}
      [data-component="chat/user_msg/msg"] {background-color:rgb(255,237,213) !important;color:rgb(124,45,18) !important;}
      [data-component="chat/agent_msg/msg"] {font-size:15px !important;}
      [data-component="chat/input_box/inner_root"] {border-radius:13px !important;}
      [data-upgrade="header-bottom"] {padding:3px 8px;color:rgb(71,85,105);}`,
    assets: {
      organizationLogo: 'https://upgrade.test/logo.svg',
      widgetTrigger: {
        openIcon: 'https://upgrade.test/open.svg',
        closeIcon: 'https://upgrade.test/close.svg',
      },
    },
    chatBannerItems: [
      { message: 'PERSISTENT BANNER', persistent: true },
      { message: 'TEMPORARY BANNER', persistent: false },
    ],
    initialMessages: ['LEGACY INITIAL'],
    initialQuestions: ['FIRST QUESTION', 'SECOND QUESTION'],
    requireInitialQuestion: rtl,
    initialQuestionsPosition:
      profile === 'below-optional'
        ? 'below-initial-messages'
        : 'above-chat-input',
    chatFooterItems: [
      {
        message:
          '<span style="color:#b91c1c;font-weight:700;font-size:12px">CUSTOM FOOTER</span> [Policy](https://upgrade.test/policy)',
        showWhenSessionIsResolved: false,
      },
      { message: 'RESOLVED FOOTER', showWhenSessionIsOpen: false },
    ],
    textContent: {
      welcomeScreen: {
        title: 'CUSTOM WELCOME',
        description: 'Custom collection description',
      },
      sessionsScreen: { headerTitle: 'CUSTOM SESSIONS' },
      chatScreen: { headerTitle: 'CUSTOM CHAT' },
    },
    headerButtons: {
      chatScreen: [
        {
          functionality: 'expand-shrink',
          expandIcon: 'Maximize',
          shrinkIcon: 'Minimize',
          hideOnSmallScreen: true,
          onClicked: (ctx) => record('expand', ctx.currentScreen),
        },
        {
          functionality: 'resolve-session',
          icon: 'Check',
          onResolved: 'stay-in-chat',
          confirmation: {
            type: 'modal',
            title: 'CUSTOM CONFIRM',
            description: 'Confirm resolution',
            confirmButtonText: 'YES RESOLVE',
            cancelButtonText: 'KEEP OPEN',
            onResolved: (ctx) => record('confirmed', ctx.session?.id),
          },
          onClicked: (ctx) => record('resolve', ctx.session?.id),
        },
        {
          functionality: 'close-widget',
          icon: 'X',
          onClicked: (ctx) => record('close', ctx.currentScreen),
        },
      ],
      sessionsScreen: [{ functionality: 'close-widget', icon: 'X' }],
    },
    customComponents: {
      headerTitle: custom
        ? ({ react, currentScreen }) =>
            react.createElement(
              'strong',
              { 'data-upgrade': 'title' },
              `REACT TITLE ${currentScreen}`,
            )
        : undefined,
      headerBottom: ({ react, org }) =>
        react.createElement(
          'div',
          { 'data-upgrade': 'header-bottom' },
          `HEADER BOTTOM ${org.name}`,
        ),
      chatBottomComponents: [
        {
          key: 'compat-bottom',
          component: ({ react, messages }) =>
            react.createElement(
              'div',
              {
                'data-upgrade': 'chat-bottom',
                'data-legacy-dates': JSON.stringify(
                  messages
                    .filter((m) => m.type === 'USER')
                    .map((m) => m.deliveredAt),
                ),
              },
              'CUSTOM CHAT BOTTOM',
            ),
        },
      ],
      onSessionResolved: custom
        ? ({ react, session }) =>
            react.createElement(
              'div',
              { 'data-upgrade': 'resolved' },
              `CUSTOM RESOLVED ${session?.id}`,
            )
        : undefined,
      'message::after': ({ react, currentMessage }) =>
        react.createElement(
          'small',
          { 'data-upgrade': 'after', 'data-message-type': currentMessage.type },
          currentMessage.type === 'USER'
            ? `LEGACY DATE ${String(currentMessage.deliveredAt)}`
            : 'CUSTOM AFTER',
        ),
      widgetTrigger:
        profile === 'custom-trigger'
          ? ({ react, isOpen, setIsOpen }) =>
              react.createElement(
                'button',
                {
                  'data-upgrade': 'trigger',
                  style: { position: 'fixed', right: 20, bottom: 20 },
                  onClick: () => setIsOpen(!isOpen),
                },
                isOpen ? 'CUSTOM CLOSE' : 'CUSTOM OPEN',
              )
          : undefined,
    },
    router: {
      chatScreenOnly: profile !== 'session-list',
      goToChatIfNoSessions: profile !== 'session-list',
    },
    oneOpenSessionAllowed: profile === 'session-list',
    hooks: {
      onNavigateToChat: ({ session }) =>
        record('navigate', session?.id ?? null),
      onSessionCreated: ({ session }) => record('created', session.id),
      onMessageReceived: ({ message }) => record('received', message.id),
    },
    anchorTarget: '_blank',
    headers: { 'x-business-context': 'fixture-context' },
    queryParams: { tenant: 'fixture-tenant' },
    bodyProperties: {
      tenant: { id: 'fixture-tenant' },
      flags: ['legacy', true, 7],
    },
    context: {
      category: { id: 42, name: 'custom-category' },
      locale: language,
    },
    messageCustomData: { order: 'order-42', nested: { visibleToHumans: true } },
    sessionCustomData: { source: 'upgrade-suite', priority: 3, vip: true },
    inline,
    thisWasHelpfulOrNot: { enabled: false },
    timestamps: { perMessageGroup: { enabled: true } },
    accessibility: { widgetTriggerButton: { label: 'CUSTOM SUPPORT' } },
    disableSendingWhenAwaitingAIReply: profile !== 'long-content',
  };
  if (profile === 'verified')
    config.user = { token: jwt('contact-a'), externalId: 'account-a' };
  if (profile === 'user-data')
    config.user = {
      data: {
        name: 'Supplied Visitor',
        email: 'supplied@example.invalid',
        avatarUrl: 'https://upgrade.test/avatar.svg',
        customData: { plan: 'enterprise' },
      },
      externalId: 'account-a',
    };
  if (custom)
    config.advancedInitialMessages = [
      { message: 'ADVANCED PERSISTENT', persistent: true },
      { message: 'ADVANCED TEMPORARY', persistent: false },
    ];
  if (profile === 'long-content')
    config.initialQuestions = Array.from(
      { length: 8 },
      (_, i) => `LONG QUESTION ${i + 1} ${'internationalization '.repeat(5)}`,
    );
  if (profile === 'mode-canvas')
    config.modesComponents = [
      {
        key: 'compat-mode',
        component: ({ react, mode }) =>
          react.createElement(
            'div',
            { 'data-upgrade': 'mode' },
            `CUSTOM MODE ${mode.name}`,
          ),
      },
    ];
  if (profile === 'minimal')
    return {
      token: config.token,
      apiUrl: config.apiUrl,
      collectUserData: false,
      router: { chatScreenOnly: true },
    };
  return config;
}
