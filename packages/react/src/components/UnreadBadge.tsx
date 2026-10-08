import type { OpenCxComponentNameU, WidgetConfig } from '@opencx/widget-core';
import { useConfig } from '@opencx/widget-react-headless';
import { motion } from 'framer-motion';
import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { QUICK_TWEEN } from '../motion';
import { dc } from '../utils/data-component';

const MAX_SHOWN_COUNT = 99;

type UnreadLook = NonNullable<WidgetConfig['unreadIndicator']>;

/**
 * The red mark for sessions holding a reply the visitor has not looked at.
 * Decorative: the control carrying it names the count (`useUnreadLabel`).
 * Inline-styled on purpose: it renders inside the trigger iframe, in the
 * host DOM on the companion pill, and in the sessions list.
 */
export function UnreadMark({
  count,
  showCount,
  component = 'trigger/unread',
  style,
}: {
  count: number;
  showCount: boolean;
  component?: OpenCxComponentNameU;
  style?: React.CSSProperties;
}) {
  if (count <= 0) return null;
  return (
    <motion.span
      {...dc(component)}
      aria-hidden
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={QUICK_TWEEN}
      style={{
        position: 'absolute',
        zIndex: 1,
        top: 0,
        insetInlineEnd: 0,
        minWidth: showCount ? 18 : 10,
        height: showCount ? 18 : 10,
        padding: showCount ? '0 5px' : 0,
        borderRadius: 999,
        background: 'hsl(var(--opencx-destructive))',
        color: 'hsl(var(--opencx-destructive-foreground))',
        boxShadow: '0 0 0 2px hsl(var(--opencx-background))',
        font: '600 11px/18px ui-sans-serif, system-ui, sans-serif',
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {showCount
        ? count > MAX_SHOWN_COUNT
          ? `${MAX_SHOWN_COUNT}+`
          : count
        : null}
    </motion.span>
  );
}

/** `config.unreadIndicator`, defaulting to the dot. */
export function useUnreadLook(): UnreadLook | false {
  return useConfig().unreadIndicator ?? 'dot';
}

/** The mark, as the embed configured it. */
export function UnreadBadge({
  count,
  indicator,
  component,
  style,
}: {
  count: number;
  /** Force a look; defaults to `config.unreadIndicator`. */
  indicator?: UnreadLook;
  component?: OpenCxComponentNameU;
  style?: React.CSSProperties;
}) {
  const look = useUnreadLook();
  if (look === false) return null;
  return (
    <UnreadMark
      count={count}
      showCount={(indicator ?? look) === 'count'}
      component={component}
      style={style}
    />
  );
}

/** What a control carrying the mark appends to its accessible name. */
export function useUnreadLabel(count: number): string | null {
  const look = useUnreadLook();
  const { t } = useTranslation();
  if (look === false || count <= 0) return null;
  return t('unread_sessions', { count });
}
