import type { CSSProperties } from 'react';
import tc from 'tinycolor2';
import { isExhaustive, type WidgetConfig } from '@opencx/widget-core';
import { useConfig, useDocumentDir } from '@opencx/widget-react-headless';
import { WOBBLE_MAX_MOVEMENT_PIXELS } from '../components/lib/wobble';
import { resolveTriggerSide } from '../utils/resolve-trigger-side';
import { useIsSmallScreen } from './useIsSmallScreen';

type DeepRequired<T> = {
  [K in keyof T]-?: DeepRequired<T[K]>;
};

const DEFAULTS = {
  transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
  transitionDuration: '1000ms',
};

/**
 * @returns The widget config theme with fallback default value
 */
export function useTheme() {
  const { dir } = useDocumentDir();
  const { isSmallScreen } = useIsSmallScreen();
  const { theme, inline } = useConfig();

  const withInlineDefault = (v: string) => {
    return inline ? '100%' : v;
  };

  const withSmallScreenDefault = (target: 'w' | 'h', v: string) => {
    return isSmallScreen ? `100dv${target}` : v;
  };

  const withDefaults = (target: 'w' | 'h', v: string) => {
    return withInlineDefault(withSmallScreenDefault(target, v));
  };

  const triggerSide = resolveTriggerSide(theme?.widgetTrigger?.offset, dir);

  const widgetTrigger = {
    zIndex: theme?.widgetTrigger?.zIndex ?? 10_000_000,
    offset: {
      bottom: theme?.widgetTrigger?.offset?.bottom ?? 20,
      right:
        theme?.widgetTrigger?.offset?.right ??
        (triggerSide === 'right' ? 20 : 'initial'),
      left:
        theme?.widgetTrigger?.offset?.left ??
        (triggerSide === 'left' ? 20 : 'initial'),
    },
    size: {
      button: theme?.widgetTrigger?.size?.button ?? 48,
      icon: theme?.widgetTrigger?.size?.icon ?? 24,
    },
  } satisfies NonNullable<DeepRequired<WidgetConfig['theme']>>['widgetTrigger'];

  const triggerOffset = (() => {
    const v =
      triggerSide === 'right'
        ? widgetTrigger.offset.right
        : widgetTrigger.offset.left;
    if (typeof v !== 'number') return 0;
    return v;
  })();

  const themeWithFallbacks = {
    palette: theme?.palette ?? 'neutral',
    primaryColor: theme?.primaryColor ?? 'hsl(0 0% 9%)',
    widgetTrigger,
    widgetContentContainer: {
      borderRadius: isSmallScreen
        ? '0px'
        : (theme?.widgetContentContainer?.borderRadius ?? '32px'),
      zIndex: theme?.widgetContentContainer?.zIndex ?? widgetTrigger.zIndex + 1,
      outline: theme?.widgetContentContainer?.outline ?? 'none', // was: '1px solid'
      outlineColor:
        theme?.widgetContentContainer?.outlineColor ?? 'hsl(0 0% 50% / .5)',
      boxShadow:
        theme?.widgetContentContainer?.boxShadow ??
        '0 0px 100px 0px rgb(0 0 0 / 0.25)',
      transitionProperty:
        theme?.widgetContentContainer?.transitionProperty ?? 'all',
      transitionTimingFunction:
        theme?.widgetContentContainer?.transitionTimingFunction ??
        DEFAULTS.transitionTimingFunction,
      transitionDuration:
        theme?.widgetContentContainer?.transitionDuration ??
        DEFAULTS.transitionDuration,
      offset: {
        side: isSmallScreen
          ? 0
          : widgetTrigger.offset.bottom +
            widgetTrigger.size.button +
            WOBBLE_MAX_MOVEMENT_PIXELS.y * 2 +
            (theme?.widgetContentContainer?.offset?.side ?? 10),
        align: isSmallScreen
          ? 0
          : triggerOffset + (theme?.widgetContentContainer?.offset?.align ?? 0),
      },
    },
    screens: {
      welcome: {
        width: withDefaults('w', theme?.screens?.welcome?.width ?? '400px'),
        // By setting minHeight to 1px, a nice animation will play from 1px to the dynamic height of the content of the screen
        minHeight: withDefaults(
          'h',
          theme?.screens?.welcome?.minHeight ?? '1px',
        ),
      },
      sessions: {
        width: withDefaults('w', theme?.screens?.sessions?.width ?? '450px'),
        height: withDefaults('h', theme?.screens?.sessions?.height ?? '600px'),
      },
      chat: {
        width: withDefaults('w', theme?.screens?.chat?.width ?? '525px'),
        height: withDefaults('h', theme?.screens?.chat?.height ?? '700px'),
        withCanvas: {
          width: withDefaults(
            'w',
            theme?.screens?.chat?.withCanvas?.width ?? 'min(1050px, 100vw)',
          ),
          height: withDefaults(
            'h',
            theme?.screens?.chat?.withCanvas?.height ?? 'min(800px, 100vh)',
          ),
          transitionTimingFunction:
            theme?.screens?.chat?.withCanvas?.transitionTimingFunction ??
            DEFAULTS.transitionTimingFunction,
          transitionDuration:
            theme?.screens?.chat?.withCanvas?.transitionDuration ??
            DEFAULTS.transitionDuration,
        },
      },
    },
  } satisfies NonNullable<DeepRequired<WidgetConfig['theme']>>;

  const computed = {
    // Subtract the offset.bottom twice so that it adds a bit of padding to the top
    // Subtract the distance between the trigger and the widget content container
    // Subtract the invisible padding of the trigger (for the wobble effect)
    maxHeight: withDefaults(
      'h',
      `calc(
        100vh 
        - ${themeWithFallbacks.widgetTrigger.offset.bottom}px
        - ${themeWithFallbacks.widgetContentContainer.offset.side}px
        - ${WOBBLE_MAX_MOVEMENT_PIXELS.y * 2}px
      )`,
    ),
    // Subtract the offset.right twice so that it adds a bit of padding to the left
    maxWidth: withDefaults(
      'w',
      `calc(
        100vw 
        - ${triggerOffset * 2}px
      )`,
    ),

    minHeight: withDefaults(
      'h',
      `min(
        ${themeWithFallbacks.screens.welcome.minHeight}, 
        ${themeWithFallbacks.screens.sessions.height}, 
        ${themeWithFallbacks.screens.chat.height}
      )`,
    ),
    minWidth: withDefaults(
      'w',
      `min(
        ${themeWithFallbacks.screens.welcome.width}, 
        ${themeWithFallbacks.screens.sessions.width}, 
        ${themeWithFallbacks.screens.chat.width}
      )`,
    ),
  };

  return {
    theme: themeWithFallbacks,
    triggerSide,
    computed,
    cssVars: cssVars({
      palette: themeWithFallbacks.palette,
      primary: themeWithFallbacks.primaryColor,
    }),
  };
}

function cssVars({
  palette: paletteName,
  primary,
}: {
  palette: NonNullable<NonNullable<WidgetConfig['theme']>['palette']>;
  primary: string;
}) {
  const palette = getPaletteColors(paletteName);
  const _primary = tc(primary).toHsl();
  const primaryForeground = tc(primary).isLight()
    ? palette['950']
    : palette['50'];

  /**
   * Spread the primary color without the `hsl()` call so that we can use tailwind opacity classes on it
   */
  const primitivePrimary = `${_primary.h} ${_primary.s * 100}% ${_primary.l * 100}%`;

  return {
    '--opencx-primary': primitivePrimary,
    '--opencx-primary-foreground': primaryForeground,

    '--opencx-background': palette['100'],
    '--opencx-foreground': palette['950'],

    '--opencx-destructive': '0 72.2% 50.6%',
    '--opencx-destructive-foreground': palette['50'],

    '--opencx-accent': palette['200'],
    '--opencx-accent-foreground': 'var(--opencx-foreground)',

    '--opencx-secondary': palette['200'],
    '--opencx-secondary-foreground': 'var(--opencx-foreground)',

    '--opencx-muted': palette['200'],
    '--opencx-muted-foreground': palette['500'],

    '--opencx-input': palette['300'],
    '--opencx-border': palette['300'],
    '--opencx-ring': 'var(--opencx-foreground)',
  } as CSSProperties;
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
function getPaletteColors(
  palette: NonNullable<NonNullable<WidgetConfig['theme']>['palette']>,
): PaletteValues {
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
