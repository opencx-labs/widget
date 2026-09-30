import type { WidgetConfig } from '@opencx/widget-core';
import { resolveColorScheme, themeCssVars } from './theme-css-vars';
import { usePrefersDark } from './usePrefersDark';
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
  const prefersDark = usePrefersDark();

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

  const colorScheme = resolveColorScheme(theme?.colorScheme, prefersDark);

  const themeWithFallbacks = {
    palette: theme?.palette ?? 'neutral',
    primaryColor: theme?.primaryColor ?? 'hsl(0 0% 9%)',
    colorScheme,
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
    colorScheme,
    cssVars: themeCssVars({
      palette: themeWithFallbacks.palette,
      primary: themeWithFallbacks.primaryColor,
      colorScheme,
    }),
  };
}
