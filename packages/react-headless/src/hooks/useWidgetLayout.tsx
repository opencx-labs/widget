import React, {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { WidgetCompanionLayoutU } from '@opencx/widget-core';
import { useConfig } from './useConfig';

type WidgetLayoutCtx = {
  layout: WidgetCompanionLayoutU;
  setLayout: Dispatch<SetStateAction<WidgetCompanionLayoutU>>;
};

const context = createContext<WidgetLayoutCtx | null>(null);

export function WidgetLayoutProvider({ children }: { children: ReactNode }) {
  const { companion, displayMode } = useConfig();
  const defaultLayout =
    companion?.defaultLayout ??
    (displayMode === 'sidebar' ? 'sidebar' : 'compact');

  return (
    <WidgetLayoutStateProvider defaultLayout={defaultLayout}>
      {children}
    </WidgetLayoutStateProvider>
  );
}

/**
 * Layout state keyed to the CONFIGURED default. `useConfig()` is live — hosts
 * like the dashboard playground edit options on an already-mounted widget —
 * so the default can change after mount. A plain `useState(default)` would
 * capture it once and go stale (the playground's "Default layout" select did
 * nothing). When the configured default changes we re-apply it; between
 * config edits the user's manual header toggles (`setLayout`) win.
 *
 * Exported separately so tests can drive `defaultLayout` as a prop without
 * standing up the whole `WidgetProvider`/`WidgetCtx` stack.
 */
export function WidgetLayoutStateProvider({
  defaultLayout,
  children,
}: {
  defaultLayout: WidgetCompanionLayoutU;
  children: ReactNode;
}) {
  const [layout, setLayout] = useState<WidgetCompanionLayoutU>(defaultLayout);
  // "Adjusting state during render" (React-sanctioned): re-apply the default
  // only when it actually changes, never on unrelated re-renders.
  const [prevDefault, setPrevDefault] = useState(defaultLayout);
  if (prevDefault !== defaultLayout) {
    setPrevDefault(defaultLayout);
    setLayout(defaultLayout);
  }

  return (
    <context.Provider value={{ layout, setLayout }}>
      {children}
    </context.Provider>
  );
}

export function useWidgetLayout() {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error('useWidgetLayout must be used within a WidgetLayoutProvider');
  }
  return ctx;
}
