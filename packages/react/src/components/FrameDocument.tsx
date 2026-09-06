import React from 'react';
import { useConfig } from '@opencx/widget-react-headless';
import styles from '../../index.css?inline.css';
import { version } from '../../package.json';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import { DialogerProvider } from './Dialoger';
import { TooltipProvider } from './lib/tooltip';
import { cn } from './lib/utils/cn';

/**
 * Every display mode renders the widget UI inside an iframe so host-page CSS
 * can't leak in. This module is the single source for that document:
 * `buildFrameHtml` is the iframe's initial markup and `FrameDocument` is the
 * inner wrapper. Style order is the contract that keeps embedder
 * customizations working across `displayMode` switches: mode-specific
 * `overrides` first, the embedder's `cssOverrides` after (so theirs always
 * win), then the theme variables (palette/primaryColor) + language direction
 * on the root element — identical wiring in popover, companion, and sidebar.
 */

/** Accessible title of the widget content iframe, every display mode. */
export const WIDGET_FRAME_TITLE = 'OpenCX Live Chat';

export function buildFrameHtml({
  transparent = false,
}: { transparent?: boolean } = {}) {
  return `<!DOCTYPE html>
<html>
<head>
<style>
${styles}
html, body {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    font-size: 16px;${transparent ? '\n    background: transparent;' : ''}
}
</style>
<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">
</head>
<body>
</body>
</html>`;
}

export function FrameDocument({
  overrides,
  rootRef,
  style,
  shellRadius,
  children,
}: {
  /** Mode-specific restyle of the stock screens; `cssOverrides` inject after */
  overrides?: string;
  rootRef?: React.Ref<HTMLDivElement>;
  style?: React.CSSProperties;
  /**
   * The outer corner radius of the shell this document fills, as a CSS
   * length. Nested surfaces (the composer card) derive their own radius from
   * it so corners stay concentric: inner = outer − the gap between the edges.
   * @default the popover container's radius
   */
  shellRadius?: string;
  children: React.ReactNode;
}) {
  const { cssOverrides } = useConfig();
  const { cssVars, theme } = useTheme();
  const { dir } = useTranslation();
  const radiusVars = {
    ['--opencx-shell-radius' as string]:
      shellRadius ?? theme.widgetContentContainer.borderRadius,
    // The concentric radius for any card the screens inset by their 8px
    // padding — the composer and the session-closed card both wear it, so
    // neither can drift from the shell or from each other. Floored at 12px so
    // a square-cornered small-screen shell still gets a soft card.
    ['--opencx-inset-radius' as string]:
      'max(0.75rem, calc(var(--opencx-shell-radius) - 0.5rem))',
  };

  return (
    <>
      {overrides ? <style>{overrides}</style> : null}
      {cssOverrides ? <style>{cssOverrides}</style> : null}
      <div
        ref={rootRef}
        style={{ ...cssVars, ...radiusVars, ...style }}
        data-version={version}
        dir={dir}
        className={cn(
          'antialiased font-sans size-full overflow-hidden relative text-secondary-foreground isolate',
        )}
      >
        <TooltipProvider
          delayDuration={200}
          // this is important, because without it, the tooltip remains even after moving the mouse away from trigger
          disableHoverableContent
        >
          <DialogerProvider>{children}</DialogerProvider>
        </TooltipProvider>
      </div>
    </>
  );
}
