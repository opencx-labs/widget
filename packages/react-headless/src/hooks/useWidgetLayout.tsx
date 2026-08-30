import React, {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  normalizeCompanionLayouts,
  resolveCompanionDefaultLayout,
  type WidgetCompanionLayoutU,
} from '@opencx/widget-core';
import { useConfig } from './useConfig';

type WidgetLayoutCtx = {
  layout: WidgetCompanionLayoutU;
  setLayout: Dispatch<SetStateAction<WidgetCompanionLayoutU>>;
  allowedLayouts: readonly WidgetCompanionLayoutU[];
  defaultLayout: WidgetCompanionLayoutU;
};

const context = createContext<WidgetLayoutCtx | null>(null);

export function WidgetLayoutProvider({ children }: { children: ReactNode }) {
  const { companion } = useConfig();

  return (
    <WidgetLayoutStateProvider
      configuredDefaultLayout={companion?.defaultLayout}
      configuredLayouts={companion?.layouts}
    >
      {children}
    </WidgetLayoutStateProvider>
  );
}

/**
 * Layout state keyed to the CONFIGURED options. `useConfig()` is live — hosts
 * like the dashboard playground edit options on an already-mounted widget —
 * so the default and allowed layouts can change after mount. The effective
 * default is always allowed. A changed effective default is applied; removing
 * the current manual layout falls back to it; otherwise manual header toggles
 * survive unrelated config edits.
 *
 * Exported separately so tests can drive the configured values as props
 * without standing up the whole `WidgetProvider`/`WidgetCtx` stack.
 */
export function WidgetLayoutStateProvider({
  configuredDefaultLayout,
  configuredLayouts,
  children,
}: {
  configuredDefaultLayout?: WidgetCompanionLayoutU;
  configuredLayouts?: readonly WidgetCompanionLayoutU[];
  children: ReactNode;
}) {
  const allowedLayouts = normalizeCompanionLayouts(configuredLayouts);
  const defaultLayout = resolveCompanionDefaultLayout(
    configuredDefaultLayout,
    allowedLayouts,
  );
  const allowedLayoutsKey = allowedLayouts.join('|');
  const [layout, setLayoutState] =
    useState<WidgetCompanionLayoutU>(defaultLayout);
  const [previousConfig, setPreviousConfig] = useState({
    defaultLayout,
    allowedLayoutsKey,
  });

  // "Adjusting state during render" (React-sanctioned): apply live config
  // before descendants commit with an excluded layout. Reordering options by
  // itself does not clobber a still-valid manual selection.
  if (
    previousConfig.defaultLayout !== defaultLayout ||
    previousConfig.allowedLayoutsKey !== allowedLayoutsKey
  ) {
    setPreviousConfig({ defaultLayout, allowedLayoutsKey });
    if (
      previousConfig.defaultLayout !== defaultLayout ||
      !allowedLayouts.includes(layout)
    ) {
      setLayoutState(defaultLayout);
    }
  }

  const setLayout: Dispatch<SetStateAction<WidgetCompanionLayoutU>> = (
    action,
  ) => {
    setLayoutState((current) => {
      const next = typeof action === 'function' ? action(current) : action;
      return allowedLayouts.includes(next) ? next : current;
    });
  };

  return (
    <context.Provider
      value={{ layout, setLayout, allowedLayouts, defaultLayout }}
    >
      {children}
    </context.Provider>
  );
}

export function useWidgetLayout() {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error(
      'useWidgetLayout must be used within a WidgetLayoutProvider',
    );
  }
  return ctx;
}
