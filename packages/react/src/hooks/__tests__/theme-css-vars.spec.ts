import { describe, expect, it } from 'vitest';
import { resolveColorScheme, themeCssVars } from '../theme-css-vars';

const NEUTRAL_100 = '0 0% 96.1%';
const NEUTRAL_900 = '0 0% 9%';
const NEUTRAL_950 = '0 0% 3.9%';
const NEUTRAL_50 = '0 0% 98%';

describe('resolveColorScheme', () => {
  it('defaults to light and keeps explicit choices regardless of the OS', () => {
    expect(resolveColorScheme(undefined, true)).toBe('light');
    expect(resolveColorScheme('light', true)).toBe('light');
    expect(resolveColorScheme('dark', false)).toBe('dark');
  });

  it('system follows the OS preference', () => {
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('system', false)).toBe('light');
  });
});

describe('themeCssVars', () => {
  const light = themeCssVars({
    palette: 'neutral',
    primary: '#0A0A0A',
    colorScheme: 'light',
  });
  const dark = themeCssVars({
    palette: 'neutral',
    primary: '#0A0A0A',
    colorScheme: 'dark',
  });

  it('light keeps the v4 mapping', () => {
    expect(light['--opencx-background']).toBe(NEUTRAL_100);
    expect(light['--opencx-foreground']).toBe(NEUTRAL_950);
    expect(light['--opencx-canvas']).toBe('#f4f4f5');
  });

  it('dark reads the same palette from the other end', () => {
    expect(dark['--opencx-background']).toBe(NEUTRAL_900);
    expect(dark['--opencx-foreground']).toBe(NEUTRAL_50);
    expect(dark['--opencx-canvas']).toBe(`hsl(${NEUTRAL_950})`);
    // Surfaces stay one step off the background in both schemes.
    expect(dark['--opencx-muted']).not.toBe(dark['--opencx-background']);
    expect(light['--opencx-muted']).not.toBe(light['--opencx-background']);
  });

  it('every token exists in both schemes and only colors differ', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    // The primary color is the host's choice and does not flip.
    expect(dark['--opencx-primary']).toBe(light['--opencx-primary']);
    expect(dark['--opencx-primary-foreground']).toBe(
      light['--opencx-primary-foreground'],
    );
  });
});

describe('companionShadows', () => {
  it('light keeps the original four shadows', async () => {
    const m = await import('../../motion');
    expect(m.companionShadows('light')).toEqual({
      pill: m.PILL_SHADOW,
      dock: m.DOCK_SHADOW,
      input: m.INPUT_SHADOW,
      chat: m.CHAT_SHADOW,
    });
  });

  it('dark drops the bright inset highlight and keeps four interpolable slots', async () => {
    const { companionShadows } = await import('../../motion');
    const dark = companionShadows('dark');
    for (const value of Object.values(dark)) {
      expect(value.split(', ').length).toBe(4);
      expect(value).not.toContain('rgba(255,255,255,0.5)');
    }
  });
});
