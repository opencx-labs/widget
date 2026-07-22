import * as PopoverPrimitive from '@radix-ui/react-popover';
import { MotionConfig } from 'framer-motion';
import React from 'react';
import type {
  ExternalStorage,
  LiteralWidgetComponentKey,
  WidgetConfig,
} from '@opencx/widget-core';
import {
  useDisplayMode,
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
 * Shell picker. Must render INSIDE WidgetProvider: the effective display mode
 * comes from `useDisplayMode`, which needs the resolved config — agent-bound
 * embeds (agent v3) default to the companion shell, explicit `displayMode`
 * always wins. The companion is one shell across every layout (compact,
 * fullscreen, sidebar): it morphs between them in place — no mount/unmount
 * swap — so switching layouts expands FROM the current rect.
 */
function WidgetDisplayRoot() {
  const displayMode = useDisplayMode();
  return displayMode === 'companion' ? (
    <WidgetCompanion />
  ) : (
    <WidgetPopoverTriggerAndContent />
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
    // reducedMotion="user" makes every descendant motion.* snap its
    // transform/x/y/scale/layout animations when the visitor's OS asks for less
    // motion, while keeping opacity fades. Non-transform values (the companion
    // shell's width/height/borderRadius morph) are untouched, so its own
    // shouldReduceMotion branch still applies — this is purely additive.
    <MotionConfig reducedMotion="user">
      <WidgetProvider
        components={[...defaultComponents, ...components]}
        options={options}
        storage={storage}
        loadingComponent={loadingComponent}
      >
        <WidgetTriggerProvider>
          <WidgetLayoutProvider>
            <WidgetImperativeHandler widgetRef={ref} />
            {options.inline ? <WidgetContent /> : <WidgetDisplayRoot />}
          </WidgetLayoutProvider>
        </WidgetTriggerProvider>
      </WidgetProvider>
    </MotionConfig>
  );
});
Widget.displayName = 'Widget';

export { Widget };
export type { WidgetRef };
