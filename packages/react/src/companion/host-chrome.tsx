import React from 'react';
import {
  useConfig,
  useSessions,
  useWidget,
} from '@opencx/widget-react-headless';
import { useTranslation } from '../hooks/useTranslation';

/**
 * Chrome that lives in the HOST document (fullscreen header, sidebar header)
 * can't use the widget's Tailwind sheet, so it's inline styles plus this one
 * scoped stylesheet for hover/active states. Colors are theme tokens — the
 * shells spread `cssVars` on their host container, so palette/primaryColor
 * apply to host chrome exactly as they do to the screens inside the iframe.
 */
const HOST_CHROME_STYLE = `
[data-opencx-host-btn] { display: flex; align-items: center; justify-content: center; border: 0; background: transparent; color: hsl(var(--opencx-muted-foreground)); cursor: pointer; padding: 0; transition: background-color 150ms ease-out, color 150ms ease-out, transform 150ms ease-out; }
@media (hover: hover) and (pointer: fine) {
  [data-opencx-host-btn]:hover { background: rgba(0, 0, 0, 0.05); color: hsl(var(--opencx-secondary-foreground)); }
}
[data-opencx-host-btn]:active { transform: scale(0.97); }
`;

export function HostChromeStyle() {
  return <style>{HOST_CHROME_STYLE}</style>;
}

export function HostIconButton({
  label,
  onClick,
  size = 28,
  borderRadius = 8,
  children,
}: {
  label: string;
  onClick: () => void;
  size?: number;
  borderRadius?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      data-opencx-host-btn=""
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ width: size, height: size, borderRadius }}
    >
      {children}
    </button>
  );
}

/**
 * Title for conversation-scoped host headers. Same precedence embedders
 * already rely on in popover mode (`textContent.chatScreen.headerTitle` →
 * org name), with the live session title leading because these headers
 * describe the open conversation. `customComponents.headerTitle` stays an
 * in-iframe concept — it expects the widget stylesheet, which host chrome
 * doesn't load.
 */
export function useHostPanelTitle(): string {
  const { widgetCtx } = useWidget();
  const { textContent } = useConfig();
  const { t } = useTranslation();
  const { sessionState } = useSessions();
  return (
    sessionState.session?.title ??
    textContent?.chatScreen?.headerTitle ??
    widgetCtx.org?.name ??
    t('new_conversation')
  );
}

export function HostPanelTitle({ style }: { style?: React.CSSProperties }) {
  const title = useHostPanelTitle();
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'hsl(var(--opencx-secondary-foreground))',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...style,
      }}
    >
      {title}
    </span>
  );
}
