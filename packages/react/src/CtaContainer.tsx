import IFrame from '@uiw/react-iframe';
import React from 'react';
import styles from '../index.css?inline.css';
import {
  ctaUrlMatches,
  isCtaDismissed,
  parseCtaDismissalRecord,
  resolveCtaVisible,
  type CtaButton,
} from '@opencx/widget-core';
import {
  useConfig,
  useContact,
  useMessages,
  usePrimitiveState,
  useWidget,
  useWidgetRouter,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';
import { CtaCard } from './CtaCard';
import { useTheme } from './hooks/useTheme';

const initialContent = `<!DOCTYPE html>
<html>
<head>
<style>
${styles}
html, body {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    font-size: 16px;
}
</style>
</head>
<body>
</body>
</html>`;

function dismissalStorageKey(token: string) {
  return `opencx:cta:dismissed:${token}`;
}

export function CtaContainer() {
  const config = useConfig();
  const { widgetCtx } = useWidget();
  const { contactState } = useContact();
  const { isOpen, setIsOpen } = useWidgetTrigger();
  const {
    toChatScreen,
    routerState: { screen },
  } = useWidgetRouter();
  const { sendMessage } = useMessages();
  const { theme, cssVars } = useTheme();
  const override = usePrimitiveState(widgetCtx.ctaOverride);
  const cta = config.cta;

  const [dismissed, setDismissed] = React.useState(() =>
    isCtaDismissed(
      parseCtaDismissalRecord(
        localStorage.getItem(dismissalStorageKey(config.token)),
      ),
      cta?.dismissForDays,
      Date.now(),
    ),
  );

  const [delayElapsed, setDelayElapsed] = React.useState(
    !cta?.showAfterSeconds,
  );
  React.useEffect(() => {
    if (!cta?.showAfterSeconds) return;
    const timer = setTimeout(
      () => setDelayElapsed(true),
      cta.showAfterSeconds * 1000,
    );
    return () => clearTimeout(timer);
  }, [cta?.showAfterSeconds]);

  const visible = resolveCtaVisible({
    hasCta: !!cta,
    isWidgetOpen: isOpen,
    override,
    dismissed,
    urlMatches: ctaUrlMatches(cta?.urlMatch, window.location.href),
    delayElapsed,
  });

  const displayedRef = React.useRef(false);
  React.useEffect(() => {
    if (visible && !displayedRef.current) {
      displayedRef.current = true;
      config.hooks?.onCtaDisplayed?.();
    }
  }, [visible, config.hooks]);

  // The card's children render into the iframe via a portal, so this observer
  // runs in the host context and can size the iframe element to its content.
  // Callback ref (not an effect): @uiw/react-iframe re-portals the children
  // once the iframe document loads, so we must observe whichever node is
  // currently mounted — an effect keyed on `visible` would keep watching the
  // first, detached node and the iframe would stay at its 150px default.
  const [height, setHeight] = React.useState(0);
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const wrapperRef = React.useCallback((el: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    setHeight(el.offsetHeight);
    resizeObserverRef.current = observer;
  }, []);

  if (!cta || !visible) return null;

  const dismiss = () => {
    localStorage.setItem(
      dismissalStorageKey(config.token),
      JSON.stringify({ dismissedAt: Date.now() }),
    );
    setDismissed(true);
    if (override === 'show') widgetCtx.setCtaOverride(null);
    config.hooks?.onCtaDismissed?.();
  };

  // Inlined equivalent of WidgetImperativeHandler's newChat({ message }).
  const ask = (message: string) => {
    if (!contactState.contact?.token) {
      console.warn('CTA: cannot start a chat — contact not yet initialized.');
      return;
    }
    setIsOpen(true);
    if (screen === 'chat') widgetCtx.resetChat();
    toChatScreen();
    sendMessage({ content: message });
  };

  const handleButtonClick = (button: CtaButton, index: number) => {
    config.hooks?.onCtaClicked?.({ action: button.action, index });
    switch (button.action) {
      case 'open-chat':
        setIsOpen(true);
        break;
      case 'prefill':
        // Inlined equivalent of WidgetImperativeHandler's prefill().
        setIsOpen(true);
        if (screen !== 'chat') toChatScreen();
        widgetCtx.setComposerDraft(button.message);
        break;
      case 'ask':
        ask(button.message);
        break;
      case 'url':
        window.open(
          button.url,
          button.openInNewTab === false ? '_self' : '_blank',
        );
        break;
    }
  };

  const handleComposerSubmit = (text: string) => {
    config.hooks?.onCtaClicked?.({ action: 'composer' });
    ask(text);
  };

  return (
    <IFrame
      initialContent={initialContent}
      title="OpenCX Chat CTA"
      style={{
        position: 'fixed',
        zIndex: theme.widgetTrigger.zIndex,
        right: theme.widgetTrigger.offset.right,
        left: theme.widgetTrigger.offset.left,
        bottom: `calc(${theme.widgetTrigger.offset.bottom}px + ${theme.widgetTrigger.size.button}px + 16px)`,
        width: 'min(360px, calc(100vw - 32px))',
        height: height || undefined,
        fontSize: '16px',
        boxSizing: 'border-box',
        borderWidth: '0px',
        borderRadius: '16px',
      }}
    >
      {config.cssOverrides && <style>{config.cssOverrides}</style>}
      <div ref={wrapperRef} style={{ ...cssVars }}>
        <CtaCard
          cta={cta}
          onButtonClick={handleButtonClick}
          onComposerSubmit={handleComposerSubmit}
          onDismiss={dismiss}
        />
      </div>
    </IFrame>
  );
}
