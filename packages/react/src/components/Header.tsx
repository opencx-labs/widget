import {
  isExhaustive,
  type HeaderButtonU,
  type SafeExtract,
  type ScreenU,
} from '@opencx/widget-core';
import {
  useConfig,
  useSessions,
  useWidget,
  useWidgetRouter,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';
import { AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon } from 'lucide-react';
import React, { useState } from 'react';
import { useIsSmallScreen } from '../hooks/useIsSmallScreen';
import { useSetWidgetSizeFn } from '../hooks/useSetWidgetSize';
import { useTheme } from '../hooks/useTheme';
import { dc } from '../utils/data-component';
import {
  Dialoger,
  DialogerBody,
  DialogerContent,
  DialogerDescription,
  DialogerFooter,
  DialogerHeader,
  DialogerTitle,
  useDialoger,
} from './Dialoger';
import { Button } from './lib/button';
import { DynamicIcon } from './lib/DynamicIcon';
import { cn } from './lib/utils/cn';
import { HeaderBottomComponent } from './custom-components/HeaderBottomComponent';
import { HeaderTitleComponent } from './custom-components/HeaderTitleComponent';

function useGetHeaderTitle() {
  const {
    widgetCtx: { org, agent },
  } = useWidget();
  const {
    routerState: { screen },
  } = useWidgetRouter();
  const { textContent } = useConfig();

  const override = (() => {
    switch (screen) {
      case 'chat':
        return textContent?.chatScreen?.headerTitle;
      case 'sessions':
        return textContent?.sessionsScreen?.headerTitle;
      case 'welcome':
        return undefined;
      default:
        isExhaustive(screen, useGetHeaderTitle.name);
        return undefined;
    }
  })();

  // Agent-bound embeds title the widget with the agent's name.
  return override ?? agent?.name ?? org.name ?? 'Chat';
}

function useGetHeaderDataComponentProp(
  screen: ScreenU,
): ReturnType<typeof dc> | undefined {
  switch (screen) {
    case 'chat':
      return dc('chat/header');
    case 'sessions':
      return dc('sessions/header');
    case 'welcome':
      return undefined;
    default:
      isExhaustive(screen, useGetHeaderTitle.name);
      return undefined;
  }
}

function Header__BackToSessionsScreenButton() {
  const { router } = useConfig();
  const {
    routerState: { screen },
    toSessionsScreen,
  } = useWidgetRouter();

  if (screen !== 'chat') return null;
  if (router?.chatScreenOnly) return null;

  return (
    <Button
      variant="ghost"
      size="fit"
      className="rounded-full"
      onClick={toSessionsScreen}
    >
      <ChevronLeftIcon className="size-4 rtl:-scale-100" />
    </Button>
  );
}

function Header__Buttons__Item__CloseWidget({
  button,
}: {
  button: SafeExtract<HeaderButtonU, { functionality: 'close-widget' }>;
}) {
  const { setIsOpen } = useWidgetTrigger();
  const { isSmallScreen } = useIsSmallScreen();

  if (isSmallScreen && button.hideOnSmallScreen) return null;
  if (!isSmallScreen && button.hideOnLargeScreen) return null;

  const handleClick = () => {
    if (button.handleClick) return button.handleClick();
    setIsOpen(false);
  };

  return (
    <Button
      variant="ghost"
      size="fit"
      className="rounded-full"
      onClick={handleClick}
    >
      <DynamicIcon name={button.icon} />
    </Button>
  );
}

function Header__Buttons__Item__ExpandShrink({
  button,
}: {
  button: SafeExtract<HeaderButtonU, { functionality: 'expand-shrink' }>;
}) {
  const [expanded, setExpanded] = useState(false);

  const {
    routerState: { screen },
  } = useWidgetRouter();
  const { isSmallScreen } = useIsSmallScreen();
  const { theme } = useTheme();
  const { setWidth, setHeight } = useSetWidgetSizeFn();

  if (screen !== 'chat' && screen !== 'sessions') return null;

  const screenHeight = (() => {
    switch (screen) {
      case 'chat':
        return theme.screens.chat.height;
      case 'sessions':
        return theme.screens.sessions.height;
      default:
        isExhaustive(screen, Header__Buttons__Item__ExpandShrink.name);
        return theme.screens.chat.height;
    }
  })();
  const screenWidth = (() => {
    switch (screen) {
      case 'chat':
        return theme.screens.chat.width;
      case 'sessions':
        return theme.screens.sessions.width;
      default:
        isExhaustive(screen, Header__Buttons__Item__ExpandShrink.name);
        return theme.screens.chat.width;
    }
  })();

  const handleClick = () => {
    setExpanded((prev) => {
      const isExpanded = !prev;
      setHeight(isExpanded ? '100vh' : screenHeight);
      setWidth(isExpanded ? `max(40vw, ${screenWidth})` : screenWidth);

      return isExpanded;
    });
  };

  if (isSmallScreen && button.hideOnSmallScreen) return null;
  if (!isSmallScreen && button.hideOnLargeScreen) return null;

  return (
    <Button
      variant="ghost"
      size="fit"
      className="rounded-full"
      onClick={handleClick}
    >
      <DynamicIcon
        name={button.icon || (expanded ? button.shrinkIcon : button.expandIcon)}
      />
    </Button>
  );
}

function Header__Buttons__Item__ResolveSession({
  button,
}: {
  button: SafeExtract<HeaderButtonU, { functionality: 'resolve-session' }>;
}) {
  const { close: closeDialog } = useDialoger();
  const { widgetCtx } = useWidget();
  const { setIsOpen } = useWidgetTrigger();
  const { resolveSession, sessionState } = useSessions();
  const { isSmallScreen } = useIsSmallScreen();

  const isNoSession = !sessionState.session;
  const isResolved = sessionState.session?.isOpened === false;
  const onResolved: NonNullable<typeof button.onResolved> =
    button.onResolved || 'stay-in-chat';
  const behaviorBeforeSessionCreation: NonNullable<
    typeof button.behaviorBeforeSessionCreation
  > = button.behaviorBeforeSessionCreation || 'disabled';
  const behaviorIfSessionIsResolved: NonNullable<
    typeof button.behaviorIfSessionIsResolved
  > = button.behaviorIfSessionIsResolved || 'disabled';

  const isDisabled = (() => {
    if (sessionState.isResolvingSession) return true;
    if (isNoSession && behaviorBeforeSessionCreation === 'disabled')
      return true;
    if (isResolved && behaviorIfSessionIsResolved === 'disabled') return true;
    return false;
  })();

  const handleResolve = async () => {
    const { success, error } = await resolveSession();
    closeDialog();
    if (!success) return console.error(error);

    switch (onResolved) {
      case 'stay-in-chat':
        return;
      case 'close-widget':
        setIsOpen(false);
        break;
      case 'reset-chat':
        widgetCtx.resetChat();
        break;
      case 'reset-chat-and-close-widget':
        setIsOpen(false);
        widgetCtx.resetChat();
        break;
      default:
        isExhaustive(onResolved, Header__Buttons__Item__ResolveSession.name);
        break;
    }
  };

  const handleResolveAlternative = () => {
    if (isNoSession) {
      switch (behaviorBeforeSessionCreation) {
        case 'disabled':
          return;
        case 'close-widget':
          setIsOpen(false);
          break;
        default:
          isExhaustive(
            behaviorBeforeSessionCreation,
            handleResolveAlternative.name,
          );
      }
    }

    if (isResolved) {
      switch (behaviorIfSessionIsResolved) {
        case 'disabled':
          return;
        case 'close-widget':
          setIsOpen(false);
          break;
        case 'reset-chat':
          widgetCtx.resetChat();
          break;
        case 'reset-chat-and-close-widget':
          setIsOpen(false);
          setTimeout(() => {
            widgetCtx.resetChat();
          }, 200);
          break;
        default:
          isExhaustive(
            behaviorIfSessionIsResolved,
            handleResolveAlternative.name,
          );
      }
    }
  };

  if (isSmallScreen && button.hideOnSmallScreen) return null;
  if (!isSmallScreen && button.hideOnLargeScreen) return null;

  // TODO: add translations for fallbacks
  if (button.confirmation?.type === 'modal' && !isResolved && !isNoSession) {
    return (
      <Dialoger
        trigger={
          <Button
            variant="ghost"
            size="fit"
            className="rounded-full"
            disabled={isDisabled}
          >
            <DynamicIcon name={button.icon} />
          </Button>
        }
      >
        <DialogerContent>
          <DialogerHeader>
            <DialogerTitle>
              {button.confirmation.title || 'Close conversation'}
            </DialogerTitle>
          </DialogerHeader>
          <DialogerBody>
            <DialogerDescription>
              {button.confirmation.description ||
                'Are you sure you want to close this conversation?'}
            </DialogerDescription>
          </DialogerBody>
          <DialogerFooter>
            <Button
              variant="secondary"
              onClick={closeDialog}
              disabled={sessionState.isResolvingSession}
            >
              {button.confirmation.cancelButtonText || 'No'}
            </Button>
            <Button
              variant="destructive"
              onClick={handleResolve}
              disabled={sessionState.isResolvingSession}
            >
              {button.confirmation.confirmButtonText || 'Yes'}
            </Button>
          </DialogerFooter>
        </DialogerContent>
      </Dialoger>
    );
  }

  return (
    <Button
      variant="ghost"
      size="fit"
      className="rounded-full"
      onClick={
        isResolved || isNoSession ? handleResolveAlternative : handleResolve
      }
      disabled={isDisabled}
    >
      <DynamicIcon name={button.icon} />
    </Button>
  );
}

function Header__Buttons__Item({ button }: { button: HeaderButtonU }) {
  switch (button.functionality) {
    case 'close-widget':
      return <Header__Buttons__Item__CloseWidget button={button} />;
    case 'expand-shrink':
      return <Header__Buttons__Item__ExpandShrink button={button} />;
    case 'resolve-session':
      return <Header__Buttons__Item__ResolveSession button={button} />;
    default:
      isExhaustive(button, Header__Buttons__Item.name);
      return null;
  }
}

const defaultCloseWidgetButton = {
  functionality: 'close-widget',
  hideOnLargeScreen: true,
  icon: 'X',
} satisfies HeaderButtonU;

export function Header__Buttons() {
  const {
    routerState: { screen },
  } = useWidgetRouter();
  const { headerButtons } = useConfig();

  const buttons =
    screen === 'chat'
      ? headerButtons?.chatScreen
      : screen === 'sessions'
        ? headerButtons?.sessionsScreen
        : [];

  if (!buttons || buttons.length === 0) {
    return <Header__Buttons__Item button={defaultCloseWidgetButton} />;
  }

  return (
    <>
      {buttons.map((button) => (
        <Header__Buttons__Item
          key={`${button.functionality}-${button.icon}`}
          button={button}
        />
      ))}
    </>
  );
}

export function Header() {
  const {
    routerState: { screen },
  } = useWidgetRouter();
  const dataComponentProp = useGetHeaderDataComponentProp(screen);
  const title = useGetHeaderTitle();

  return (
    <header {...dataComponentProp} className="py-2 px-4 shrink-0">
      <div className="flex items-center gap-2">
        <Header__BackToSessionsScreenButton />
        <div
          className={cn(
            'flex-1 h-8 flex items-center',
            screen === 'sessions' && 'ps-2',
          )}
        >
          <HeaderTitleComponent
            fallback={<h2 className="font-semibold">{title}</h2>}
          />
        </div>
        <Header__Buttons />
      </div>
      <HeaderBottomComponent />
    </header>
  );
}
