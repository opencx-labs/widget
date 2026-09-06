import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  normalizeCompanionLayouts,
  resolveCompanionDefaultLayout,
  resolveSidebarMode,
  resolveSidebarSide,
  type WidgetCompanionDefaultLayoutU,
  type WidgetCompanionLayoutU,
  type WidgetSidebarModeU,
  type WidgetSidebarSideResolvedU,
} from '@opencx/widget-core';
import { useConfig } from './useConfig';
import { useDocumentDir } from './useDocumentDir';
import { useWidget } from '../WidgetProvider';

type CompanionPreferenceStorage = {
  getCompanionLayout: () => Promise<WidgetCompanionDefaultLayoutU | null>;
  setCompanionLayout: (layout: WidgetCompanionDefaultLayoutU) => Promise<void>;
  getCompanionSidebarSide: () => Promise<WidgetSidebarSideResolvedU | null>;
  setCompanionSidebarSide: (side: WidgetSidebarSideResolvedU) => Promise<void>;
  getCompanionSidebarMode: () => Promise<WidgetSidebarModeU | null>;
  setCompanionSidebarMode: (mode: WidgetSidebarModeU) => Promise<void>;
};

/** A layout the visitor can rest in, i.e. anything but the fullscreen mode. */
function isRestingLayout(
  layout: WidgetCompanionLayoutU,
): layout is WidgetCompanionDefaultLayoutU {
  return layout !== 'fullscreen';
}

type WidgetLayoutCtx = {
  layout: WidgetCompanionLayoutU;
  setLayout: Dispatch<SetStateAction<WidgetCompanionLayoutU>>;
  /**
   * The visitor CHOOSING a layout, as opposed to the shell moving them
   * between layouts on their behalf (leaving fullscreen, opening history).
   * Only a deliberate pick is remembered for the next visit — otherwise a
   * trip through fullscreen would quietly rewrite the saved preference to
   * whatever the shell relaxed back to.
   */
  setLayoutPreference: (layout: WidgetCompanionLayoutU) => void;
  allowedLayouts: readonly WidgetCompanionLayoutU[];
  defaultLayout: WidgetCompanionLayoutU;
  /**
   * Sidebar side/mode live HERE rather than in the companion shell because the
   * two surfaces that need them sit on opposite sides of the content iframe:
   * the shell (host DOM) positions the panel and frames the page, while the
   * layout picker (inside the iframe) is what the visitor clicks. A shared
   * context is the only thing both can read.
   */
  sidebarSide: WidgetSidebarSideResolvedU;
  setSidebarSide: (side: WidgetSidebarSideResolvedU) => void;
  sidebarMode: WidgetSidebarModeU;
  setSidebarMode: (mode: WidgetSidebarModeU) => void;
};

const context = createContext<WidgetLayoutCtx | null>(null);

export function WidgetLayoutProvider({ children }: { children: ReactNode }) {
  const { companion } = useConfig();
  const { dir } = useDocumentDir();
  const { widgetCtx } = useWidget();

  return (
    <WidgetLayoutStateProvider
      configuredDefaultLayout={companion?.defaultLayout}
      configuredLayouts={companion?.layouts}
      configuredSidebarSide={resolveSidebarSide(companion?.sidebar?.side, dir)}
      configuredSidebarMode={resolveSidebarMode(companion?.sidebar?.mode)}
      storage={widgetCtx.storageCtx}
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
  configuredSidebarSide,
  configuredSidebarMode,
  storage,
  children,
}: {
  configuredDefaultLayout?: WidgetCompanionLayoutU;
  configuredLayouts?: readonly WidgetCompanionLayoutU[];
  configuredSidebarSide: WidgetSidebarSideResolvedU;
  configuredSidebarMode: WidgetSidebarModeU;
  storage?: CompanionPreferenceStorage | undefined;
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

  // Read by the async restore below, which must not judge a saved layout
  // against the options as they stood on first render.
  const allowedLayoutsRef = useRef(allowedLayouts);
  allowedLayoutsRef.current = allowedLayouts;

  const setLayoutPreference = (layout: WidgetCompanionLayoutU) => {
    setLayout(layout);
    if (!allowedLayoutsRef.current.includes(layout)) return;
    // Entering fullscreen leaves the remembered resting layout alone: the
    // visitor is still "in" the sidebar or card they came from.
    if (!isRestingLayout(layout)) return;
    void storage?.setCompanionLayout(layout).catch(() => {});
  };

  // Config is the seed; a visitor's own pick (restored below, or made in the
  // picker) overrides it for the rest of the session and future visits. A
  // config change after mount still wins — an embedder moving the sidebar is
  // an explicit act, not a stale default.
  const [sidebarSide, setSidebarSideState] = useState(configuredSidebarSide);
  const [sidebarMode, setSidebarModeState] = useState(configuredSidebarMode);
  const [previousSidebarConfig, setPreviousSidebarConfig] = useState({
    side: configuredSidebarSide,
    mode: configuredSidebarMode,
  });
  if (
    previousSidebarConfig.side !== configuredSidebarSide ||
    previousSidebarConfig.mode !== configuredSidebarMode
  ) {
    setPreviousSidebarConfig({
      side: configuredSidebarSide,
      mode: configuredSidebarMode,
    });
    if (previousSidebarConfig.side !== configuredSidebarSide) {
      setSidebarSideState(configuredSidebarSide);
    }
    if (previousSidebarConfig.mode !== configuredSidebarMode) {
      setSidebarModeState(configuredSidebarMode);
    }
  }

  // Restore the visitor's saved pick once, and only where they actually made
  // one — a missing key must leave the configured value alone.
  useEffect(() => {
    if (!storage) return;
    let cancelled = false;
    void storage
      .getCompanionLayout()
      .then((saved) => {
        if (cancelled || !saved) return;
        // An embedder who has since excluded the saved layout outranks a
        // preference the visitor set under the old configuration.
        if (!allowedLayoutsRef.current.includes(saved)) return;
        setLayoutState(saved);
      })
      .catch(() => {});
    void storage
      .getCompanionSidebarSide()
      .then((saved) => {
        if (!cancelled && saved) setSidebarSideState(saved);
      })
      .catch(() => {});
    void storage
      .getCompanionSidebarMode()
      .then((saved) => {
        if (!cancelled && saved) setSidebarModeState(saved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setSidebarSide = useCallback(
    (side: WidgetSidebarSideResolvedU) => {
      setSidebarSideState(side);
      void storage?.setCompanionSidebarSide(side).catch(() => {});
    },
    [storage],
  );

  const setSidebarMode = useCallback(
    (mode: WidgetSidebarModeU) => {
      setSidebarModeState(mode);
      void storage?.setCompanionSidebarMode(mode).catch(() => {});
    },
    [storage],
  );

  return (
    <context.Provider
      value={{
        layout,
        setLayout,
        setLayoutPreference,
        allowedLayouts,
        defaultLayout,
        sidebarSide,
        setSidebarSide,
        sidebarMode,
        setSidebarMode,
      }}
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
