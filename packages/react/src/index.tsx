import * as PopoverPrimitive from '@radix-ui/react-popover';
import React from 'react';
import type {
  ExternalStorage,
  LiteralWidgetComponentKey,
  WidgetConfig,
} from '@opencx/widget-core';
import {
  useWidgetLayout,
  useWidgetTrigger,
  WidgetLayoutProvider,
  WidgetProvider,
  WidgetTriggerProvider,
  type WidgetComponentType,
} from '@opencx/widget-react-headless';
import { AgentMessageDefaultComponent } from './components/custom-components/AgentMessageDefaultComponent';
import { FallbackDefaultComponent } from './components/custom-components/FallbackDefaultComponent';
import { LoadingDefaultComponent } from './components/custom-components/LoadingDefaultComponent';
import { WidgetContent, WidgetPopoverContent } from './WidgetPopoverContent';
import { WidgetPopoverTrigger } from './WidgetPopoverTrigger';
import { WidgetPopoverAnchor } from './WidgetPopoverAnchor';
import { WidgetCompanion } from './companion/WidgetCompanion';
import { WidgetSidebar } from './companion/WidgetSidebar';
import {
  WidgetImperativeHandler,
  type WidgetRef,
} from './WidgetImperativeHandler';

function WidgetPopoverTriggerAndContent() {
  const { isOpen, setIsOpen } = useWidgetTrigger();

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <WidgetPopoverAnchor />
      <WidgetPopoverTrigger />
      <WidgetPopoverContent />
    </PopoverPrimitive.Root>
  );
}

/**
 * Companion + sidebar are one display mode with two runtime layouts: the
 * floating companion and the docked sidebar swap by mount/unmount as the
 * layout crosses the sidebar boundary. Session/message/isOpen state live in
 * shared providers, so the conversation persists across the swap.
 */
function WidgetCompanionRoot() {
  const { layout } = useWidgetLayout();
  const { isOpen } = useWidgetTrigger();
  // The sidebar is only the OPEN presentation of the sidebar layout. The
  // resting trigger is ALWAYS the companion pill (one consistent launcher), so
  // a closed sidebar falls back to the companion pill — not the sidebar's own
  // corner trigger.
  return layout === 'sidebar' && isOpen ? (
    <WidgetSidebar />
  ) : (
    <WidgetCompanion />
  );
}

const defaultComponents: WidgetComponentType[] = [
  {
    key: 'loading' satisfies LiteralWidgetComponentKey,
    component: LoadingDefaultComponent,
  },
  {
    key: 'fallback' satisfies LiteralWidgetComponentKey,
    component: FallbackDefaultComponent,
  },
  {
    key: 'bot_message' satisfies LiteralWidgetComponentKey,
    component: AgentMessageDefaultComponent,
  },
  {
    key: 'agent_message' satisfies LiteralWidgetComponentKey,
    component: AgentMessageDefaultComponent,
  },
];

const storage: ExternalStorage = {
  get: async (key: string) => {
    return localStorage.getItem(key);
  },
  set: async (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
  remove: async (key: string) => {
    localStorage.removeItem(key);
  },
};

const Widget = React.forwardRef<
  WidgetRef,
  {
    options: WidgetConfig;
    components?: WidgetComponentType[];
    loadingComponent?: React.ReactNode;
  }
>(function Widget({ options, components = [], loadingComponent }, ref) {
  return (
    <WidgetProvider
      components={[...defaultComponents, ...components]}
      options={options}
      storage={storage}
      loadingComponent={loadingComponent}
    >
      <WidgetTriggerProvider>
        <WidgetLayoutProvider>
          <WidgetImperativeHandler widgetRef={ref} />
          {options.inline ? (
            <WidgetContent />
          ) : options.displayMode === 'companion' ? (
            <WidgetCompanionRoot />
          ) : (
            <WidgetPopoverTriggerAndContent />
          )}
        </WidgetLayoutProvider>
      </WidgetTriggerProvider>
    </WidgetProvider>
  );
});
Widget.displayName = 'Widget';

export { Widget };
export type { WidgetRef };
