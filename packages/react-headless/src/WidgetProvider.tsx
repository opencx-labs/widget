import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { version } from '../package.json';
import {
  type ExternalStorage,
  type WidgetConfig,
  WidgetCtx,
} from '@opencx/widget-core';
import { ComponentRegistry } from './ComponentRegistry';
import { AgentChatProvider } from './agent-chat/AgentChatContext';
import type { WidgetComponentType } from './types/components';

interface WidgetProviderValue {
  widgetCtx: WidgetCtx;
  config: WidgetConfig;
  components?: WidgetComponentType[];
  componentStore: ComponentRegistry;
  version: string;
  contentIframeRef?: React.MutableRefObject<HTMLIFrameElement | null>;
}

const context = createContext<WidgetProviderValue | null>(null);

export function WidgetProvider({
  options: config,
  children,
  components,
  storage,
  loadingComponent,
  errorComponent,
}: {
  options: WidgetConfig;
  children: React.ReactNode;
  components?: WidgetComponentType[];
  storage?: ExternalStorage;
  /**
   * Custom loading component while the widget is initializing
   * Not to be confused with the `loading` custom component which renders when the bot's reply is pending
   */
  loadingComponent?: React.ReactNode;
  /**
   * Render initialization failures (invalid token, unavailable agent, network
   * failure). When omitted the error is thrown to the nearest React error
   * boundary instead of leaving the loading state mounted forever.
   */
  errorComponent?: (error: Error) => React.ReactNode;
}): React.ReactElement | null {
  const contentIframeRef = useRef<HTMLIFrameElement | null>(null);
  const initializationRef = useRef<Promise<WidgetCtx> | null>(null);
  const [initialization, setInitialization] = useState<
    | { status: 'loading' }
    | { status: 'ready'; widgetCtx: WidgetCtx }
    | { status: 'error'; error: Error }
  >({ status: 'loading' });

  const componentStore = useMemo(
    () =>
      new ComponentRegistry({
        components: components,
      }),
    [components],
  );

  useEffect(() => {
    const request =
      initializationRef.current ??
      (initializationRef.current = WidgetCtx.initialize({ config, storage }));
    let active = true;
    void request.then(
      (widgetCtx) => {
        if (active) setInitialization({ status: 'ready', widgetCtx });
      },
      (reason: unknown) => {
        const error =
          reason instanceof Error
            ? reason
            : new Error('Widget initialization failed', { cause: reason });
        console.error('[opencx] widget initialization failed', error);
        if (active) setInitialization({ status: 'error', error });
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (initialization.status === 'loading') {
    return loadingComponent ? <>{loadingComponent}</> : null;
  }
  if (initialization.status === 'error') {
    if (errorComponent) return <>{errorComponent(initialization.error)}</>;
    throw initialization.error;
  }

  const { widgetCtx } = initialization;

  return (
    <context.Provider
      value={{
        widgetCtx,
        config,
        components,
        componentStore,
        version,
        contentIframeRef,
      }}
    >
      <AgentChatProvider widgetCtx={widgetCtx} config={config}>
        {children}
      </AgentChatProvider>
    </context.Provider>
  );
}

export function useWidget() {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error('useWidget must be used within a WidgetProvider');
  }
  return ctx;
}
