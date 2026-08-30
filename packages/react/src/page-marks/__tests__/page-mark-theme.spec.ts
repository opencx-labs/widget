import { describe, expect, it } from 'vitest';
import { resolvePageMarkTheme } from '../page-mark-theme';

describe('resolvePageMarkTheme', () => {
  it('uses widget palette colors and relative configured layers', () => {
    const theme = resolvePageMarkTheme({
      cssVars: {
        '--opencx-background': '0 0% 98%',
        '--opencx-foreground': '0 0% 9%',
        '--opencx-muted-foreground': '0 0% 45%',
        '--opencx-border': '0 0% 85%',
      },
      primaryColor: 'rebeccapurple',
      contentZIndex: 42,
    });

    expect(theme).toMatchObject({
      accent: 'rebeccapurple',
      surface: 'hsl(0 0% 98%)',
      foreground: 'hsl(0 0% 9%)',
      inkZIndex: 43,
      chromeZIndex: 44,
      editorZIndex: 45,
    });
  });
});
