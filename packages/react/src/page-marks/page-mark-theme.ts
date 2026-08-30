import type { CSSProperties } from 'react';

export type PageMarkTheme = {
  accent: string;
  surface: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  inkZIndex: number;
  chromeZIndex: number;
  editorZIndex: number;
};

type PageMarkCssVars =
  | CSSProperties
  | { [key: `--opencx-${string}`]: string | number | undefined };

function readColor(
  cssVars: PageMarkCssVars,
  name: `--opencx-${string}`,
): string {
  const value = Object.entries(cssVars).find(([key]) => key === name)?.[1];
  return typeof value === 'string' ? `hsl(${value})` : 'currentColor';
}

/** Concrete colors and document layers for page-mark UI, which is portaled
 * outside the iframe and therefore cannot inherit the widget's CSS variables. */
export function resolvePageMarkTheme({
  cssVars,
  primaryColor,
  contentZIndex,
}: {
  cssVars: PageMarkCssVars;
  primaryColor: string;
  contentZIndex: number;
}): PageMarkTheme {
  return {
    accent: primaryColor,
    surface: readColor(cssVars, '--opencx-background'),
    foreground: readColor(cssVars, '--opencx-foreground'),
    mutedForeground: readColor(cssVars, '--opencx-muted-foreground'),
    border: readColor(cssVars, '--opencx-border'),
    inkZIndex: contentZIndex + 1,
    chromeZIndex: contentZIndex + 2,
    editorZIndex: contentZIndex + 3,
  };
}
