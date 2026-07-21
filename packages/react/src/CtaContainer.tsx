import IFrame from '@uiw/react-iframe';
import { motion, useReducedMotion } from 'framer-motion';
import React from 'react';
import styles from '../index.css?inline.css';
import {
  ctaUrlMatches,
  isCtaDismissed,
  isExhaustive,
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
import { dc } from './utils/data-component';
import { useTheme } from './hooks/useTheme';

/**
 * Gooey transition (Aceternity gooey-input / Chris Coyier goo): the filter
 * lives on a BLOB layer only — blur + a high-contrast alpha matrix makes
 * nearby shapes visually merge like liquid — while the real card content sits
 * unfiltered above so text stays crisp. The blob springs toward the launcher
 * corner and merges with a small droplet parked there; springs are
 * interruptible, so rapid open/close retargets mid-flight instead of
 * glitching.
 */
const GOO_SVG = (
  <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
    <defs>
      <filter id="opencx-cta-goo">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
        <feColorMatrix
          in="blur"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
        />
      </filter>
    </defs>
  </svg>
);

const SPRING = { type: 'spring', stiffness: 380, damping: 32 } as const;

/**
 * Exported for tests. `reduced` (prefers-reduced-motion) collapses every
 * transition to an instant swap while keeping one render path.
 */
export function makeCtaMotionVariants(reduced: boolean) {
  const instant = { duration: 0 } as const;
  return {
    blob: {
      shown: { scale: 1, x: 0, y: 0, transition: reduced ? instant : SPRING },
      hidden: {
        scale: 0.04,
        x: 24,
        y: 24,
        transition: reduced ? instant : SPRING,
      },
    },
    droplet: {
      shown: { scale: 0, transition: reduced ? instant : SPRING },
      hidden: {
        scale: reduced ? 0 : [1.4, 0],
        transition: reduced ? instant : { duration: 0.34, delay: 0.1 },
      },
    },
    content: {
      // Content re-enters once the blob has mostly re-formed.
      shown: {
        opacity: 1,
        scale: 1,
        transition: reduced ? instant : { duration: 0.18, delay: 0.16 },
      },
      // Content bows out fast so the goo never blurs live text.
      hidden: {
        opacity: 0,
        scale: 0.97,
        transition: reduced ? instant : { duration: 0.12 },
      },
    },
  } as const;
}

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

function readDismissalRecord(token: string): string | null {
  try {
    return localStorage.getItem(dismissalStorageKey(token));
  } catch {
    return null;
  }
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
  const reducedMotion = useReducedMotion();
  const variants = React.useMemo(
    () => makeCtaMotionVariants(!!reducedMotion),
    [reducedMotion],
  );
  const cta = config.cta;

  const [dismissed, setDismissed] = React.useState(() =>
    isCtaDismissed(
      // Guarded: this initializer runs during render for every non-inline
      // widget (hooks precede the no-cta early return), and localStorage
      // access throws synchronously when the host blocks site data.
      parseCtaDismissalRecord(readDismissalRecord(config.token)),
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

  // Publish the resolved visibility so the launcher can consume it
  // (`cta.mode: 'transform'` swaps the bubble for the card).
  React.useEffect(() => {
    widgetCtx.setCtaVisible(visible);
    return () => widgetCtx.setCtaVisible(false);
  }, [widgetCtx, visible]);

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

  // Once the exit animation settles, the (invisible) iframe must stop
  // hit-testing and disappear from the a11y tree.
  const [exitDone, setExitDone] = React.useState(!visible);
  React.useEffect(() => {
    if (visible) setExitDone(false);
  }, [visible]);
  const fullyHidden = !visible && exitDone;

  // Stay MOUNTED while merely hidden (widget open, rules pending): the card's
  // local state — e.g. a half-typed composer draft — must survive open/close
  // round-trips ("picks up where it left off"), and the persistent element is
  // what the goo animation interpolates between.
  if (!cta) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(
        dismissalStorageKey(config.token),
        JSON.stringify({ dismissedAt: Date.now() }),
      );
    } catch (e) {
      // Blocked/full storage must not keep the card on screen.
      console.warn('CTA: could not persist dismissal', e);
    }
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
      default:
        isExhaustive(button);
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
        // Kept displayed while animating; fully hidden only once the exit
        // settles (so springs can play), and never hit-testable while hidden.
        visibility: fullyHidden ? 'hidden' : undefined,
        pointerEvents: visible ? undefined : 'none',
        position: 'fixed',
        zIndex: theme.widgetTrigger.zIndex,
        right: theme.widgetTrigger.offset.right,
        left: theme.widgetTrigger.offset.left,
        // In transform mode the card IS the launcher, so it takes the
        // launcher's spot; in coexist mode it floats above the bubble.
        bottom:
          cta.mode === 'transform'
            ? theme.widgetTrigger.offset.bottom
            : `calc(${theme.widgetTrigger.offset.bottom}px + ${theme.widgetTrigger.size.button}px + 16px)`,
        width: 'min(360px, calc(100vw - 32px))',
        height: height || undefined,
        fontSize: '16px',
        boxSizing: 'border-box',
        borderWidth: '0px',
        borderRadius: '16px',
      }}
    >
      {config.cssOverrides && <style>{config.cssOverrides}</style>}
      <div ref={wrapperRef} style={{ ...cssVars, position: 'relative' }}>
        {GOO_SVG}
        {/* Goo layer: filter applies ONLY here so live text never blurs. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            filter: 'url(#opencx-cta-goo)',
            pointerEvents: 'none',
          }}
        >
          <motion.div
            {...dc('cta/goo_blob')}
            className="bg-background"
            variants={variants.blob}
            animate={visible ? 'shown' : 'hidden'}
            initial={false}
            onAnimationComplete={(definition) => {
              if (definition === 'hidden') setExitDone(true);
            }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 16,
              transformOrigin: '100% 100%',
            }}
          />
          <motion.div
            {...dc('cta/goo_blob')}
            className="bg-background"
            variants={variants.droplet}
            animate={visible ? 'shown' : 'hidden'}
            initial={false}
            style={{
              position: 'absolute',
              right: 6,
              bottom: 6,
              width: 26,
              height: 26,
              borderRadius: '50%',
            }}
          />
        </div>
        {/* Content layer: the real card, unfiltered and crisp. */}
        <motion.div
          variants={variants.content}
          animate={visible ? 'shown' : 'hidden'}
          initial={false}
          style={{ position: 'relative', transformOrigin: '100% 100%' }}
        >
          <CtaCard
            cta={cta}
            onButtonClick={handleButtonClick}
            onComposerSubmit={handleComposerSubmit}
            onDismiss={dismiss}
          />
        </motion.div>
      </div>
    </IFrame>
  );
}
