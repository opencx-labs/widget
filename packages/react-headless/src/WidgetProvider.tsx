import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { version } from '../package.json';
import {
  type ExternalStorage,
  type WidgetConfig,
  log,
  WidgetCtx,
} from '@opencx/widget-core';
import { CompanionConversationProvider } from './ConversationWorkspace';
import { ComponentRegistry } from './ComponentRegistry';
import { AgentChatProvider } from './agent-chat/AgentChatContext';
import type { WidgetComponentType } from './types/components';
import { widgetUserIdentity } from './widget-user-identity';

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
   * Render initialization failures (invalid token, network failure). When
   * omitted the widget renders nothing and reports the failure to the
   * console — a support widget must never take the host's React tree down
   * with it.
   */
  errorComponent?: (error: Error) => React.ReactNode;
}): React.ReactElement | null {
  const configRef = useRef(config);
  configRef.current = config;
  const identity = widgetUserIdentity(config);
  const contentIframeRef = useRef<HTMLIFrameElement | null>(null);
  const initializationRef = useRef<{
    identity: string;
    request: Promise<WidgetCtx>;
  } | null>(null);
  const activeWidgetRef = useRef<{
    identity: string;
    widgetCtx: WidgetCtx;
  } | null>(null);
  const [initialization, setInitialization] = useState<
    | { status: 'loading' }
    | { status: 'ready'; identity: string; widgetCtx: WidgetCtx }
    | { status: 'error'; identity: string; error: Error }
  >({ status: 'loading' });

  const componentStore = useMemo(
    () =>
      new ComponentRegistry({
        components: components,
      }),
    [components],
  );

  useEffect(() => {
    if (activeWidgetRef.current?.identity !== identity) {
      activeWidgetRef.current?.widgetCtx.dispose({ clearActiveSession: true });
      activeWidgetRef.current = null;
    }
    if (initializationRef.current?.identity !== identity) {
      setInitialization({ status: 'loading' });
      initializationRef.current = {
        identity,
        request: WidgetCtx.initialize({
          config,
          storage,
          getClientCapabilities: () => configRef.current.capabilities,
          getRequestConfig: () => configRef.current,
        }),
      };
    }
    const request = initializationRef.current.request;
    const requestIdentity = initializationRef.current.identity;
    void request.then(
      (widgetCtx) => {
        if (initializationRef.current?.request !== request) {
          widgetCtx.dispose();
          return;
        }
        activeWidgetRef.current = { identity: requestIdentity, widgetCtx };
        setInitialization({
          status: 'ready',
          identity: requestIdentity,
          widgetCtx,
        });
      },
      (reason: unknown) => {
        if (initializationRef.current?.request !== request) return;
        const error =
          reason instanceof Error
            ? reason
            : new Error('Widget initialization failed', { cause: reason });
        log.error('widget initialization failed', error);
        setInitialization({
          status: 'error',
          identity: requestIdentity,
          error,
        });
      },
    );
  }, [identity, config, storage]);

  useEffect(
    () => () => {
      initializationRef.current = null;
      activeWidgetRef.current?.widgetCtx.dispose();
      activeWidgetRef.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    if (
      initialization.status !== 'ready' ||
      initialization.identity !== identity
    ) {
      return;
    }
    initialization.widgetCtx.api.setAuthToken(config.user?.token ?? '');
  }, [config.user?.token, identity, initialization]);

  if (
    initialization.status === 'loading' ||
    ('identity' in initialization && initialization.identity !== identity)
  ) {
    return loadingComponent ? <>{loadingComponent}</> : null;
  }
  if (initialization.status === 'error') {
    return errorComponent ? <>{errorComponent(initialization.error)}</> : null;
  }

  const { widgetCtx } = initialization;

  const renderChildren = (activeCtx: WidgetCtx, content: React.ReactNode) => (
    <context.Provider
      value={{
        widgetCtx: activeCtx,
        config,
        components,
        componentStore,
        version,
        contentIframeRef,
      }}
    >
      {content}
    </context.Provider>
  );

  if (config.displayMode === 'companion' && !config.inline) {
    return (
      <CompanionConversationProvider widgetCtx={widgetCtx} config={config}>
        {(activeCtx) => renderChildren(activeCtx, children)}
      </CompanionConversationProvider>
    );
  }
  return renderChildren(
    widgetCtx,
    <AgentChatProvider key={identity} widgetCtx={widgetCtx} config={config}>
      {children}
    </AgentChatProvider>,
  );
}

export function useWidget() {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error('useWidget must be used within a WidgetProvider');
  }
  return ctx;
}
