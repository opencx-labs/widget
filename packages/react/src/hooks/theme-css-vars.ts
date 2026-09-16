import tc from 'tinycolor2';
import {
  isExhaustive,
  type WidgetColorSchemeU,
  type WidgetConfig,
} from '@opencx/widget-core';

export type WidgetCssVariables = {
  [name: `--opencx-${string}`]: string;
};

type PaletteName = NonNullable<NonNullable<WidgetConfig['theme']>['palette']>;

/** The scheme the widget actually renders in. */
export type ResolvedColorScheme = Exclude<WidgetColorSchemeU, 'system'>;

/** `system` follows the OS preference; anything else is explicit. */
export function resolveColorScheme(
  preference: WidgetColorSchemeU | undefined,
  prefersDark: boolean,
): ResolvedColorScheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference ?? 'light';
}

/**
 * The theme tokens every widget surface reads, as raw `H S% L%` triplets so
 * tailwind opacity modifiers can wrap them. The dark scheme mirrors the light
 * mapping across the palette scale: the same steps, read from the other end.
 */
export function themeCssVars({
  palette: paletteName,
  primary,
  colorScheme,
}: {
  palette: PaletteName;
  primary: string;
  colorScheme: ResolvedColorScheme;
}): WidgetCssVariables {
  const palette = getPaletteColors(paletteName);
  const dark = colorScheme === 'dark';
  const _primary = tc(primary).toHsl();
  const primaryForeground = tc(primary).isLight()
    ? palette['950']
    : palette['50'];
  const primitivePrimary = `${_primary.h} ${_primary.s * 100}% ${_primary.l * 100}%`;
  const foreground = dark ? palette['50'] : palette['950'];
  const surface = dark ? palette['800'] : palette['200'];

  return {
    '--opencx-primary': primitivePrimary,
    '--opencx-primary-foreground': primaryForeground,

    '--opencx-background': dark ? palette['900'] : palette['100'],
    '--opencx-foreground': foreground,

    '--opencx-destructive': dark ? '0 62.8% 50.6%' : '0 72.2% 50.6%',
    '--opencx-destructive-foreground': palette['50'],

    '--opencx-accent': surface,
    '--opencx-accent-foreground': 'var(--opencx-foreground)',

    '--opencx-secondary': surface,
    '--opencx-secondary-foreground': 'var(--opencx-foreground)',

    '--opencx-muted': surface,
    '--opencx-muted-foreground': dark ? palette['400'] : palette['500'],

    '--opencx-input': dark ? palette['700'] : palette['300'],
    '--opencx-border': dark ? palette['700'] : palette['300'],
    '--opencx-ring': 'var(--opencx-foreground)',

    // The docked sidebar's canvas behind the framed host page. A CSS color,
    // not a triplet: the host frame paints it directly.
    '--opencx-canvas': dark ? `hsl(${palette['950']})` : '#f4f4f5',
  };
}

type PaletteValues = {
  '50': string;
  '100': string;
  '200': string;
  '300': string;
  '400': string;
  '500': string;
  '600': string;
  '700': string;
  '800': string;
  '900': string;
  '950': string;
};

/**
 * @returns A palette object with HSL values
 */
function getPaletteColors(palette: PaletteName): PaletteValues {
  const neutral: PaletteValues = {
    '50': '0 0% 98%',
    '100': '0 0% 96.1%',
    '200': '0 0% 89.8%',
    '300': '0 0% 83.1%',
    '400': '0 0% 63.9%',
    '500': '0 0% 45.1%',
    '600': '0 0% 32.2%',
    '700': '0 0% 25.1%',
    '800': '0 0% 14.9%',
    '900': '0 0% 9%',
    '950': '0 0% 3.9%',
  };

  const stone: PaletteValues = {
    '50': '60 9.1% 97.8%',
    '100': '60 4.8% 95.9%',
    '200': '20 5.9% 90%',
    '300': '24 5.7% 82.9%',
    '400': '24 5.4% 63.9%',
    '500': '25 5.3% 44.7%',
    '600': '33.3 5.5% 32.4%',
    '700': '30 6.3% 25.1%',
    '800': '12 6.5% 15.1%',
    '900': '24 9.8% 10%',
    '950': '20 14.3% 4.1%',
  };

  const zinc: PaletteValues = {
    '50': '0 0% 98%',
    '100': '240 4.8% 95.9%',
    '200': '240 5.9% 90%',
    '300': '240 4.9% 83.9%',
    '400': '240 5% 64.9%',
    '500': '240 3.8% 46.1%',
    '600': '240 5.2% 33.9%',
    '700': '240 5.3% 26.1%',
    '800': '240 3.7% 15.9%',
    '900': '240 5.9% 10%',
    '950': '240 10% 3.9%',
  };

  const slate: PaletteValues = {
    '50': '210 40% 98%',
    '100': '210 40% 96.1%',
    '200': '214.3 31.8% 91.4%',
    '300': '212.7 26.8% 83.9%',
    '400': '215 20.2% 65.1%',
    '500': '215.4 16.3% 46.9%',
    '600': '215.3 19.3% 34.5%',
    '700': '215.3 25% 26.7%',
    '800': '217.2 32.6% 17.5%',
    '900': '222.2 47.4% 11.2%',
    '950': '222.2 84% 4.9%',
  };

  switch (palette) {
    case 'neutral':
      return neutral;
    case 'stone':
      return stone;
    case 'zinc':
      return zinc;
    case 'slate':
      return slate;
    default:
      isExhaustive(palette, getPaletteColors.name);
      return neutral;
  }
}
