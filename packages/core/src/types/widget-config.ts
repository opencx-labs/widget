import type React from 'react';
import type { Agent } from './agent';

// The type is imported so the `@link` in the jsdoc works
// eslint-disable-next-line unused-imports/no-unused-imports
import type { OpenCxComponentNameU } from './component-name';
import type { IconNameU } from './icons';
import type { JsonValue } from './json-value';
import type { ModeDto, SessionDto } from './dtos';
import type { SessionCtx } from '../context/session.ctx';
import type { MessageCtx } from '../context/message.ctx';
import type { Language, TranslationInterface } from '../translation';
import type { WidgetMessageU } from './messages';
import type { ScreenU } from '../context/router.ctx';

type UserBaseConfig =
  | {
      token: string;
      data?: never;
    }
  | {
      token?: never;
      data?: {
        name?: string;
        email?: string;
        avatarUrl?: string;
        customData?: Record<string, string>;
      };
    };

export type UserConfig = UserBaseConfig & {
  /**
   * An external ID is useful to scope the sessions of a single user based on workspace.
   * For example, if a user uses one email for multiple accounts (organizations) in your application.
   */
  externalId?: string;
};

type ThemeOptions = {
  /**
   * @default 'stone'
   */
  palette?: 'neutral' | 'stone' | 'zinc' | 'slate';
  primaryColor?: string;
  widgetTrigger?: {
    zIndex?: number;
    offset?: {
      /**
       * number in pixels
       */
      bottom?: number;

      /**
       * number in pixels
       * @default if host document direction === "ltr" then 20, otherwise `initial`
       */
      right?: number | 'initial';

      /**
       * number in pixels
       * @default if host document direction === "rtl" then 20, otherwise `initial`
       */
      left?: number | 'initial';
    };
    size?: {
      /** number in pixels */
      button?: number;

      /** number in pixels */
      icon?: number;
    };
  };
  widgetContentContainer?: {
    zIndex?: number;
    offset?: {
      /** number in pixels */
      side?: number;

      /** number in pixels */
      align?: number;
    };
    outline?: string;
    outlineColor?: string;
    borderRadius?: string;
    boxShadow?: string;
    transitionProperty?: string;
    transitionTimingFunction?: string;
    transitionDuration?: string;
  };
  screens?: {
    welcome?: {
      /**
       * Because the welcome screen can have dynamic content (org description and extra data collection fields), it is better to set a minHeight instead of a fixed height.
       */
      minHeight?: string;
      width?: string;
    };
    sessions?: {
      height?: string;
      width?: string;
    };
    chat?: {
      height?: string;
      width?: string;

      /** When the canvas is open */
      withCanvas?: {
        height?: string;
        width?: string;
        transitionTimingFunction?: string;
        transitionDuration?: string;
      };
    };
  };
};

type TextContentOptions = {
  welcomeScreen?: {
    title?: string;
    description?: string;
  };
  sessionsScreen?: {
    headerTitle?: string;
  };
  chatScreen?: {
    headerTitle?: string;
  };
};

type HeaderButtonBase = {
  icon?: IconNameU;
  // textContent?: string;
  // tooltipContent?: string;
  hideOnSmallScreen?: boolean;
  hideOnLargeScreen?: boolean;

  /**
   * Fires after the button is clicked and its default behavior has run.
   * It does not replace the button's default behavior.
   */
  onClicked?: (ctx: ComponentContext) => void;
};

export type HeaderButtonU =
  | (HeaderButtonBase & {
      functionality: 'expand-shrink';

      /** if `HeaderButtonBase.icon` is passed, it will override this option  */
      expandIcon?: IconNameU;

      /** if `HeaderButtonBase.icon` is passed, it will override this option  */
      shrinkIcon?: IconNameU;
    })
  | (HeaderButtonBase & {
      functionality: 'close-widget';

      /**
       * A side effect to be executed when the button is clicked.
       * This will override the default behavior of closing the widget.
       * This is useful If opening and closing the widget is externally controlled.
       */
      handleClick?: () => void;
    })
  | (HeaderButtonBase & {
      functionality: 'resolve-session';

      /**
       * The side effect after the session is resolved.
       * @default 'stay-in-chat'
       */
      onResolved?:
        | 'stay-in-chat'
        | 'reset-chat'
        | 'close-widget'
        | 'reset-chat-and-close-widget';

      /**
       * Optional confirmation dialog before the session is resolved.
       */
      confirmation?: {
        type: 'modal';
        title?: string;
        description?: string;
        confirmButtonText?: string;
        cancelButtonText?: string;

        /**
         * Fires after the confirmation modal's confirm button is clicked and the session is successfully resolved.
         * It does not fire if resolving the session fails.
         * It does not replace the confirm button's default behavior.
         */
        onResolved?: (ctx: ComponentContext) => void;
      };

      /**
       * The button's behavior before the session is created (before the user sends their first message).
       * @default 'disabled'
       */
      behaviorBeforeSessionCreation?: 'disabled' | 'close-widget';

      /**
       * The button's behavior after the session is resolved and the user is still in the same chat session.
       * @default 'disabled'
       */
      behaviorIfSessionIsResolved?:
        | 'disabled'
        | 'reset-chat'
        | 'close-widget'
        | 'reset-chat-and-close-widget';
    });

export type ComponentContext = {
  react: typeof React;
  org: { id: string; name: string };
  config: WidgetConfig;
  session: SessionDto | null;
  messages: WidgetMessageU[];
  currentScreen: ScreenU;
};

export type ModeComponentProps = ComponentContext & {
  mode: ModeDto;
  createStateCheckpoint: SessionCtx['createStateCheckpoint'];
  sendMessage: MessageCtx['sendMessage'];
  isSendingMessage: boolean;
};
export type ModeComponent = {
  /** The mode's ID, name or slug */
  key: string;
  component: (
    props: ModeComponentProps,
  ) => ReturnType<typeof React.createElement>;
};

export type CustomComponentProps = ComponentContext & {};
export type CustomComponent = (
  props: CustomComponentProps,
) => ReturnType<typeof React.createElement> | null;

/**
 * How the widget presents itself on the host page.
 * - `popover` – the classic corner trigger button that opens a chat popover.
 * - `companion` – a bottom-centered floating pill that morphs into a
 *   floating chat panel. The docked "app-frame sidebar" presentation is
 *   NOT a separate mode — it is the companion's `sidebar` layout; set it as the
 *   resting default via `companion.defaultLayout: 'sidebar'`.
 */
export type WidgetDisplayModeU = 'popover' | 'companion';

/**
 * Runtime presentation of the companion widget: a bottom-centered compact
 * panel, an expanded fullscreen modal, or a docked sidebar. Switchable at
 * runtime via the header controls.
 */
export type WidgetCompanionLayoutU = 'compact' | 'sidebar' | 'fullscreen';

/**
 * Layouts embedders can explicitly configure as `defaultLayout`.
 * `fullscreen` is deliberately absent because it normally acts as a transient
 * expansion of the open chat. Runtime normalization can still select it when
 * every configured resting layout is excluded by `companion.layouts`.
 */
export type WidgetCompanionDefaultLayoutU = 'compact' | 'sidebar';

/**
 * Which viewport edge the sidebar layout occupies.
 * - `left` / `right` – pin to that physical edge regardless of text direction.
 * - `auto` – follow the host document's direction: the inline-end edge, i.e.
 *   right under LTR and left under RTL.
 */
export type WidgetSidebarSideU = 'left' | 'right' | 'auto';

/**
 * How the sidebar layout coexists with the host page.
 * - `floating` – the panel overlays the page edge; the page is untouched.
 * - `docked` – the host page is framed (inset, rounded, on a canvas) and the
 *   panel sits beside it, so nothing sits underneath the sidebar.
 */
export type WidgetSidebarModeU = 'docked' | 'floating';

/**
 * An action a visitor takes on agent-rendered inline UI (json-render card)
 * that the host page must complete. Discriminated on `type` so hosts can
 * narrow the payload.
 */
export type WidgetUiAction = {
  type: 'test-phone-agent';
  payload: { agentId: string; model: string | null };
};

/**
 * The page the visitor is on and, when the host knows it, the one thing on
 * that page they are looking at. This is what the agent treats as "here" and
 * "this": a Linear-style context pill in the composer shows the entity, and
 * the agent resolves it (by `type` + `id`) before asking the visitor what
 * they mean.
 */
export type WidgetPageContext = {
  page?: {
    url: string;
    title?: string;
  };
  entity?: {
    /** Host vocabulary, e.g. `instruction`, `order`, `workflow`. */
    type: string;
    id: string;
    /** What the pill shows and the agent calls it. */
    title: string;
    /** Anything the agent needs to act on the entity that is not in `id`. */
    meta?: Record<string, unknown>;
  };
};

/** `WidgetConfig.context`: the well-known page keys plus free-form host data. */
export type WidgetContext = WidgetPageContext & Record<string, unknown>;

/**
 * Something on the host the visitor can @-mention in a message — the same
 * shape as `context.entity`, so the agent has one vocabulary for "this" (the
 * entity pill) and "these" (mentions).
 */
export type WidgetMention = {
  /** Host vocabulary, e.g. `workflow`, `integration`, `order`. */
  type: string;
  id: string;
  /** What the picker and the chip show, and what the agent calls it. */
  title: string;
  /** One line under the title in the picker. */
  description?: string;
  /** Icon URL shown in the picker and on the chip. Wins over `iconName`. */
  icon?: string;
  /** A built-in icon instead of a URL. See {@link IconNameU}. */
  iconName?: IconNameU;
  /** Anything the agent needs to act on it that is not in `id`. */
  meta?: Record<string, unknown>;
};

export interface WidgetConfig {
  /**
   * Your organization's widget token.
   * Can be found in the dashboard in the web widget page.
   */
  token: string;

  /**
   * Per-embed feature toggles. Each one can only NARROW what your
   * organization enabled server-side — `true` (or omitted) leaves the org
   * setting in charge; `false` switches the feature off for this embed.
   */
  features?: {
    /**
     * Whether the agent sends a short heads-up line before it starts tool
     * work ("Let me look that up…").
     * @default org setting
     */
    preamble?: boolean;

    /**
     * Whether the agent may reply with inline UI (rich rendered blocks)
     * instead of plain text where that fits the answer better.
     * @default org setting
     */
    inlineUi?: boolean;

    /**
     * Whether the composer offers voice dictation (speak, and the words land
     * in the message box). Only available when your organization enabled it.
     * @default org setting
     */
    dictation?: boolean;

    /**
     * Whether the visitor can mark things on your page from the composer
     * and the agent reads them, along with the well-known `page` / `entity`
     * keys of the `context` you pass. Only available when your organization
     * enabled it. Switch it off for an embed on a page the visitor should
     * not be able to mark.
     * @default org setting
     */
    pageContext?: boolean;

    /**
     * Whether the agent may act on your page (highlight elements) as part of
     * its reply. Only available when your organization enabled it. Switch it
     * off for an embed on a page the agent should never draw on.
     * @default org setting
     */
    clientTools?: boolean;
  };

  /**
   * The language of the widget.
   * Translations are available in the default non-headless widget.
   * @default en
   */
  language?: Language;

  translationOverrides?: {
    [key in Language]?: Partial<TranslationInterface>;
  };

  /**
   * A name and an avatar for the bot. Overrides the agent name/avatar your
   * organization configured in the dashboard.
   */
  bot?: Pick<
    Agent,
    | 'name'
    | 'avatarUrl'
    /** @deprecated Use `avatarUrl` instead */
    | 'avatar'
  >;
  /**
   * Unified options for all human agents.
   */
  humanAgent?: Partial<Pick<Agent, 'name' | 'avatarUrl'>>;

  /**
   * Whether the widget is open or not.
   * Can be used to have the widget open by default (useful when embedded in a webview for a mobile app).
   * Also useful to open and close the widget programmatically.
   * @default false
   */
  isOpen?: boolean;

  /**
   * Automatically open the widget after N seconds.
   * @default undefined
   */
  openAfterNSeconds?: number;

  /**
   * A custom vanilla stylesheet to override the default styles. See {@link OpenCxComponentNameU} for available component names.
   *
   * @example Overriding a component's styles
   * ```css
   * [data-component="sessions_screen/new_conversation_button"] {
   *   background-color: orangered;
   * }
   * ```
   *
   * @example Changing the font family
   * ```css
   * \@import url('https://fonts.googleapis.com/css2?family=Baskervville:ital,wght@0,400..700;1,400..700&display=swap');
   * * {
   *   font-family: "Baskervville", serif;
   * }
   * ```
   */
  cssOverrides?: string;
  theme?: ThemeOptions;

  /**
   * Disable tooltips for all components.
   * @default false
   */
  disableTooltips?: boolean;

  /**
   * Assets URLs to be used in the widget.
   */
  assets?: {
    organizationLogo?: string;
    widgetTrigger?: {
      openIcon?: string;
      closeIcon?: string;
    };
  };

  /**
   * Messages or simple components to be shown first thing in the chat.
   * Useful for privacy policies or announcements.
   * @default undefined
   */
  chatBannerItems?: Array<{
    /** Text or html as a string */
    message: string;

    /** Whether it stays at the top of chat after the user sends their first message. */
    persistent?: boolean;
  }>;

  /**
   * Initial messages that the contact sees in a new chat session.
   * These messages will disappear once the contact sends their first message.
   * @default - ['Hello, how can I help you?']
   */
  initialMessages?: string[];

  /**
   * Initial messages that the contact sees in a new chat session.
   * Similar to the `initialMessages` option, but with more control over the messages.
   * Using this option will override the `initialMessages` option.
   * @default undefined
   */
  advancedInitialMessages?: Array<{
    message: string;

    /**
     * If `true`, the message will be persisted in the database and will stay in the chat after the user sends their first message.
     */
    persistent?: boolean;
  }>;

  /**
   * Suggested initial questions that the contact sees in a new chat session.
   * If a user clicks on one of the suggested questions, the widget will send it as the user's first message.
   * @default undefined
   * @example - ['What is my account balance?', 'How do I pay my bill?', 'How do I change my address?']
   */
  initialQuestions?: string[];

  /**
   * Where to display the suggested initial questions.
   * @default 'above-chat-input'
   */
  initialQuestionsPosition?: 'above-chat-input' | 'below-initial-messages';

  /**
   * Disclaimers or simple components to be shown at the bottom of the chat below the input box.
   * @default undefined
   */
  chatFooterItems?: Array<{
    /** Text or html as a string */
    message: string;

    /**
     * Whether to show the item when the session is open.
     * @default true
     */
    showWhenSessionIsOpen?: boolean;

    /**
     * Whether to show the item when the session is resolved.
     * @default true
     */
    showWhenSessionIsResolved?: boolean;
  }>;

  /**
   * If turned on, the widget will have a login-like screen to collect user's name and email.
   * A non-verified contact will be created based on the provided information.
   * @default false
   */
  collectUserData?: boolean;

  /**
   * Provide initial values for the `name` and `email` inputs in the welcome screen.
   * For this setting to take effect, `collectUserData` must be set to `true`.
   * @default undefined
   */
  prefillUserData?: {
    name?: string;
    email?: string;
  };

  /**
   * Extra data collection fields besides `name` and `email`.
   * For this setting to take effect, `collectUserData` must be set to `true`.
   *
   * Not to be confused with `WidgetConfig.user.data.customData`,
   * the purpose of `extraDataCollectionFields` is to provide context to the session,
   * the data collected will be prepended in the first contact message in a session.
   *
   * @default undefined
   */
  extraDataCollectionFields?: string[];

  /**
   * Verified or non-verified contact data.
   * To know more, check the README
   * @default undefined
   */
  user?: UserConfig;

  /**
   * Custom text content to override the defaults in the default widget.
   */
  textContent?: TextContentOptions;

  /**
   * Custom header buttons to expand-shrink the size of the widget, close the widget, resolve the session, etc.
   *
   * Note that using this option will remove the default `close-widget` button on small screens.
   *
   * @default close-widget button on small screens
   */
  headerButtons?: {
    sessionsScreen?: Array<HeaderButtonU>;
    chatScreen?: Array<HeaderButtonU>;
  };

  /**
   * Custom components to be mounted in the canvas if there is an active mode.
   */
  modesComponents?: Array<ModeComponent>;

  /**
   * Custom components to be shown in certain sc
   */
  customComponents?: {
    /**
     * A component that shows at the bottom of the chat when the session is resolved and no longer open
     * Useful for CSAT surveys
     * @default undefined
     */
    onSessionResolved?: CustomComponent;

    /**
     * A component that replaces the header title.
     * Overrides `textContent.sessionsScreen.headerTitle` and `textContent.chatScreen.headerTitle`
     *
     * @default undefined
     */
    headerTitle?: CustomComponent;
    /**
     * A component that shows in the chat header below the title
     * @default undefined
     */
    headerBottom?: CustomComponent;

    /**
     * Custom components to be shown in the chat bottom section
     * @default undefined
     */
    chatBottomComponents?: Array<{
      /** Unique key per component */
      key: string;
      component: CustomComponent;
    }>;

    'message::after'?: (
      props: CustomComponentProps & {
        currentMessage: WidgetMessageU;
      },
    ) => ReturnType<typeof React.createElement> | null;

    widgetTrigger?: (props: {
      react: typeof React;
      isOpen: boolean;
      setIsOpen: (open: boolean) => void;
    }) => ReturnType<typeof React.createElement> | null;
  };

  /**
   * Customize the router behavior.
   */
  router?: {
    /**
     * If true, the router will navigate to the `chat` screen instead of `sessions` screen if the contact has no previous sessions.
     * @default true
     */
    goToChatIfNoSessions?: boolean;

    /**
     * If true, only the `welcome` and `chat` screens are visible.
     * The most recent `open` session will be selected.
     * If none found, a new empty conversation will be opened, and a session will be created if the user sends a message.
     * The `back to sessions screen` button in the header will be hidden.
     *
     * @default false
     */
    chatScreenOnly?: boolean;

    /**
     * If true, a page load returns the visitor to the conversation they were
     * last in (when it is still open), instead of the sessions list or an
     * empty chat. Only the session POINTER is stored client-side — through the
     * same storage adapter as the contact token — and it is dropped as soon as
     * the conversation is closed or a new one is started.
     *
     * @default false
     */
    restoreLastSession?: boolean;
  };

  /**
   * Lifecycle hooks that fire on certain widget events.
   */
  hooks?: {
    /**
     * Fires when the widget navigates to the chat screen,
     * whether opening an existing session or starting a new one.
     */
    onNavigateToChat?: (ctx: { session?: SessionDto }) => void;

    /**
     * Fires after the user sends their first message and
     * the backend returns the newly created session.
     */
    onSessionCreated?: (ctx: { session: SessionDto }) => void;

    /**
     * Fires when a new non-user message (AI, human-agent, or system) arrives in the widget,
     * whether from the response to the user's send-message request or from polling.
     *
     * Does NOT fire for the historical messages that flow in when an existing session
     * is opened — those are treated as loaded context, not new arrivals.
     *
     * Guaranteed to be called at most once per message id within a widget instance —
     * an internal set tracks dispatched ids to dedupe races between the send-message
     * response and the background poller.
     */
    onMessageReceived?: (ctx: {
      message: WidgetMessageU;
      session: SessionDto;
    }) => void;
  };

  /**
   * By default, the user can have multiple open sessions.
   *
   * Setting this option to `true` will hide the `new conversation` button if there is an open session.
   *
   * @default false
   */
  oneOpenSessionAllowed?: boolean;

  /**
   * The target attribute for all links in the AI or human agents responses.
   *
   * `_blank` opens links in a new tab or window.
   *
   * `_top` opens links in the same tab.
   *
   * @default '_top'
   */
  anchorTarget?: '_blank' | '_top';

  /**
   * Headers to be added to every Http AI action taken.
   * @default undefined
   */
  headers?: Record<string, string>;

  /**
   * Query params to be added to every Http AI action taken.
   * @default undefined
   */
  queryParams?: Record<string, string>;

  /**
   * Properties to be added to the `body` of every Http AI action taken.
   * @default undefined
   */
  bodyProperties?: Record<string, JsonValue>;

  /**
   * AI-visible context sent with each send-message request: where the
   * visitor is and what they are looking at, plus anything else the host
   * wants the agent to know. The two well-known keys, `page` and `entity`,
   * are what the agent reads as "here" and "this" (see `WidgetPageContext`);
   * `entity` also shows as a context pill in the composer, removable per
   * message. Pass a FUNCTION to have it resolved fresh at every send — the
   * right form for SPAs, where a static object captured at init goes stale on
   * the first navigation.
   * @default undefined
   */
  context?: WidgetContext | (() => WidgetContext);

  /**
   * Let the visitor @-mention things on your site in a message. Typing `@`
   * in the composer opens a picker; a picked item shows as `@Title` in the
   * text and as a removable chip beside the composer, and rides the send as
   * `clientContext.mentions` (type, id, title, meta) so the agent can resolve
   * it. Give the picker either a fixed list or a search. Only available when
   * your organization enabled "sees the page".
   */
  mentions?:
    | {
        /**
         * A fixed list the widget filters itself as the visitor types
         * (case-insensitive match on title, then description). Right for a
         * few dozen items known up front.
         */
        items: WidgetMention[];
        search?: never;
      }
    | {
        /**
         * Called as the visitor types after `@` (debounced), with the text so
         * far — empty right after the `@` — and must return the items to
         * offer, best first. Right for anything you look up on a server.
         * Keep it short; the picker shows the first eight.
         */
        search: (query: string) => WidgetMention[] | Promise<WidgetMention[]>;
        items?: never;
      };

  /**
   * Receives actions the visitor takes on agent-rendered inline UI that the
   * widget cannot complete on its own — today only `test-phone-agent`, the
   * "Test via web" button on a phone-agent card. Meant for the OpenCX
   * dashboard embed; without a handler such cards render without the action.
   */
  onUiAction?: (action: WidgetUiAction) => void;

  /**
   * Makes each step row in an agent turn's trace expandable to show that tool
   * call's arguments and its result, pretty-printed. For debugging an agent
   * against a real conversation — the default trace shows only what each step
   * did, which is what a customer should see.
   *
   * @default false
   */
  showStepToolIO?: boolean;

  /**
   * How long an agent-requested page highlight remains visible, in
   * milliseconds (the `clientTools` feature).
   * @default 8000
   */
  pageMarkHighlightDurationMs?: number;

  /**
   * Dynamic custom data to be sent with each contact message.
   * This custom data is intended for human use only; the AI will not see it and it will not affect the AI's response.
   * @default undefined
   */
  messageCustomData?: Record<string, unknown>;

  /**
   * Custom data to be added to the session upon creation.
   * This custom data is intended for human use only; the AI will not see it and it will not affect the AI's response.
   * @default undefined
   */
  sessionCustomData?: Record<string, string | number | boolean>;

  /**
   * If this is set to `true`:
   * 1. The widget content will fill it's parent element.
   * 2. The content will always be open.
   * 3. The widget trigger will not be visible.
   *
   * This is useful if you want to embed the widget in a parent element and have it always open.
   *
   * @default false
   */
  inline?: boolean;

  /**
   * How the widget presents itself on the host page.
   * - `popover` – the classic corner trigger button that opens a chat popover.
   * - `companion` – a bottom-centered floating pill that morphs into a
   *   floating chat panel.
   *
   * Ignored when `inline` is `true`.
   * @default 'popover'
   */
  displayMode?: WidgetDisplayModeU;

  /**
   * Options for the `companion` display mode.
   */
  companion?: {
    /**
     * Layout the companion rests in: a compact panel or a docked sidebar.
     * Fullscreen cannot be selected here because it normally acts as a runtime
     * expansion of the open chat. If this value is excluded by `layouts`, the
     * first allowed layout is used instead; this can be `fullscreen` when it is
     * the only or first configured option.
     * When omitted, the first allowed layout is used. With the default
     * `layouts` order this is `'compact'`; a custom order makes its first entry
     * the resting default.
     * @default first allowed layout
     */
    defaultLayout?: WidgetCompanionDefaultLayoutU;

    /**
     * Which layouts the corner layout picker offers, and in what order. The
     * current layout is highlighted; picking one switches to it. Order is
     * preserved and duplicate entries are ignored. Provide fewer
     * than two to hide the picker entirely (there is nothing to switch
     * between) — e.g. `['sidebar']` locks the companion to the sidebar with no
     * switcher. An omitted, empty, or otherwise unusable list falls back to all
     * three: compact ("Floating"), sidebar, fullscreen.
     * @default ['compact', 'sidebar', 'fullscreen']
     */
    layouts?: WidgetCompanionLayoutU[];

    /**
     * Render messages as chat bubbles (agent + user bubbles, avatars in the
     * gutter). By default the companion uses a flat, document-style layout:
     * agent replies flow as unbubbled text and user messages become quiet
     * chips (Linear/Claude-style). Set `true` to opt into classic chat
     * bubbles. Applies to the `companion` display mode; the `popover` mode is
     * always bubbles.
     * @default false
     */
    bubbles?: boolean;

    /**
     * URL of an icon that replaces the built-in animated face, on the
     * floating pill and in the quick-ask input bar.
     */
    icon?: string;

    /**
     * Which composer tools the docked quick-ask bar shows. The expanded chat
     * panel always shows the full tool row regardless.
     * - 'history-only' (default): just the conversation-history control —
     *   the resting bar stays quiet.
     * - 'all': attach + page-mark buttons too.
     * @default 'history-only'
     */
    quickAskTools?: 'history-only' | 'all';

    /** Geometry of the floating conversation panel. Values are pixels except
     * `viewportHeightRatio`, which is a 0–1 fraction of viewport height. */
    compact?: {
      /** Maximum panel width. @default 440 */
      maxWidth?: number;

      /** Preferred minimum panel width when the viewport has room. @default 280 */
      minWidth?: number;

      /** Preferred minimum conversation height. @default 420 */
      minHeight?: number;

      /** Maximum conversation height. @default 640 */
      maxHeight?: number;

      /** Preferred share of viewport height. @default 0.65 */
      viewportHeightRatio?: number;

      /** Chat-panel corner radius. @default 20 */
      borderRadius?: number;
    };

    /**
     * Maximum width of the centered conversation column in fullscreen mode.
     * Any valid CSS length is accepted.
     * @default '48rem'
     */
    contentMaxWidth?: string;

    /**
     * Background color of the resting pill. The built-in animated face
     * adopts this color for its head so the two blend seamlessly.
     * @default 'hsl(var(--opencx-primary))' – the widget's primary theme color
     */
    pillBackground?: string;

    /**
     * Placeholder text for the quick-ask input bar.
     * Defaults to the localized "Write a message...".
     */
    placeholder?: string;

    /**
     * Text shown beside the icon while the companion rests at the bottom
     * of the page, turning the small round pill into a wider docked bar
     * (e.g. "Ask Companion…").
     * Defaults to `placeholder` (localized "Write a message...").
     */
    pillLabel?: string;

    /**
     * Fullscreen-layout behavior. The option touches the embedder's page,
     * so it can be turned off.
     */
    fullscreen?: {
      /**
       * Prevent the host page from scrolling while fullscreen is open.
       * @default true
       */
      lockScroll?: boolean;
    };

    /**
     * Sidebar-layout behavior: which edge it occupies (`side`) and how it
     * coexists with the page (`mode`). The sidebar floats over the page edge
     * on its inline-end by default; docking (host-page framing) is an explicit
     * opt-in because it restyles the document root and body.
     */
    sidebar?: {
      /**
       * Which viewport edge the sidebar occupies. `auto` follows the host
       * document's direction (right under LTR, left under RTL); `left` and
       * `right` pin to that physical edge in both directions.
       * @default 'auto'
       */
      side?: WidgetSidebarSideU;

      /**
       * How the sidebar coexists with the host page.
       * - `floating` – the panel overlays the page edge, leaving the host
       *   document untouched.
       * - `docked` – the host page is framed (inset on the sidebar's side,
       *   rounded, on a canvas) so the two sit side by side. Opt-in because
       *   framing restyles the host's document root and body.
       * @default 'floating'
       */
      mode?: WidgetSidebarModeU;

      /**
       * Sidebar width in pixels.
       * @default 400
       */
      width?: number;

      /** Minimum width allowed by pointer or keyboard resizing. @default 320 */
      minWidth?: number;

      /** Maximum width allowed by pointer or keyboard resizing. @default 560 */
      maxWidth?: number;

      /**
       * Canvas color revealed behind the framed page.
       * @default '#f4f4f5'
       */
      canvasColor?: string;
    };

    /**
     * How the resting pill label shows:
     * - `always` – the resting state is the labeled bar.
     * - `hover` – rests as the icon-only pill and expands to the labeled
     *   bar on hover. Falls back to the icon-only pill on touch devices.
     * - `never` – icon-only pill.
     * @default 'always'
     */
    pillLabelDisplay?: 'always' | 'hover' | 'never';
  };

  /**
   * This shows when the AI's response might have solved the user's issue.
   * The prompt shows as two buttons: "This was helpful" and "I need more help".
   */
  thisWasHelpfulOrNot?: {
    /** @default true */
    enabled?: boolean;
  };

  timestamps?: {
    perMessageGroup?: {
      /** @default false */
      enabled?: boolean;
    };
  };

  /**
   * Actions offered under each AI reply.
   */
  messageActions?: {
    /**
     * A "Copy" button that copies the reply as text.
     * @default true in the `companion` display mode, false in the `popover`
     * (so a v4 embed looks the same after upgrading)
     */
    copy?: boolean;

    /**
     * When the actions show under a reply.
     * - `hover` – revealed while the reply is hovered or focused; always
     *   visible on touch screens, which have no hover.
     * - `always` – visible under every reply.
     * @default 'hover'
     */
    display?: 'hover' | 'always';
  };

  /**
   * Accessibility options.
   */
  accessibility?: {
    widgetTriggerButton?: {
      /**
       * The accessible name for the widget trigger button.
       * Applied as `aria-label` (for assistive tech) and `title` (native hover tooltip).
       * Required to satisfy WCAG 2.4.4 / 4.1.2 (button-name), since the trigger is icon-only.
       * @default 'Chat with us'
       */
      label?: string;
    };
  };

  /**
   * By default, the send button is disabled while the AI is generating a reply,
   * preventing the user from sending another message until the AI is done.
   *
   * Set this to `false` to let the user send messages even while the AI is still
   * generating. The in-chat typing indicator is preserved; only the send button's
   * disabled/spinner state is dropped.
   *
   * Applies to the non-streaming reply engine only. The streaming agent surface
   * never blocks: a message sent while a reply is streaming is queued and sent
   * the moment the current reply finishes or is stopped.
   *
   * @default true
   */
  disableSendingWhenAwaitingAIReply?: boolean;

  /**
   * An apiUrl to override production backend.
   * This is for us to test the widget locally, you don't need to play with this option 😊.
   * @default https://api.open.cx
   */
  apiUrl?: string;
}
