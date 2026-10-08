import type { OpenCxComponentNameU, WidgetConfig } from '@opencx/widget-core';
import { useConfig } from '@opencx/widget-react-headless';
import { motion } from 'framer-motion';
import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { QUICK_TWEEN } from '../motion';
import { dc } from '../utils/data-component';

const MAX_SHOWN_COUNT = 99;

type UnreadLook = NonNullable<WidgetConfig['unreadIndicator']>;

/** Pixel size of the mark; keep in sync with the `data-unread-look` rules. */
export const unreadMarkSize = (showCount: boolean) => (showCount ? 16 : 9);

/**
 * Inset from a round launcher's top/end edges that centers the mark on the
 * circle's edge at 45°, where a badge sits on a disc. Negative when the mark
 * is larger than the room the corner leaves.
 */
export const unreadMarkInsetOnDisc = (discSize: number, showCount: boolean) =>
  (discSize / 2) * (1 - Math.SQRT1_2) - unreadMarkSize(showCount) / 2;

/**
 * The red mark for sessions holding a reply the visitor has not looked at.
 * Decorative: the control carrying it names the count (`useUnreadLabel`).
 * Its look lives in the stylesheet under `[data-component='trigger/unread']`
 * / `'sessions/unread'` plus `[data-unread-look='dot' | 'count']`, so
 * `cssOverrides` restyle it like any other part; callers only pass where it
 * sits. The companion pill renders in the host page, outside the iframe
 * stylesheet, so it mounts `UnreadMarkHostStyles` beside the mark.
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
      data-unread-look={showCount ? 'count' : 'dot'}
      aria-hidden
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={QUICK_TWEEN}
      style={style}
    >
      {showCount
        ? count > MAX_SHOWN_COUNT
          ? `${MAX_SHOWN_COUNT}+`
          : count
        : null}
    </motion.span>
  );
}

/** Mirror of the `index.css` rule for marks rendered in the host page. */
export function UnreadMarkHostStyles() {
  return (
    <style>{`
    [data-component='trigger/unread'] {
      position: absolute;
      z-index: 1;
      pointer-events: none;
      border-radius: 999px;
      background: hsl(var(--opencx-destructive));
      color: hsl(var(--opencx-destructive-foreground));
      box-shadow: 0 0 0 2px hsl(var(--opencx-background));
      font: 600 10px/16px ui-sans-serif, system-ui, sans-serif;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    [data-unread-look='dot'] { width: 9px; height: 9px; }
    [data-unread-look='count'] { min-width: 16px; height: 16px; padding: 0 4px; }
  `}</style>
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
