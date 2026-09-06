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
import { PageMarksProvider } from './page-marks/PageMarksProvider';
import { AgentChatPageEffects } from './screens/chat/agent/AgentChatPageEffects';
import {
  StreamingSpec,
  type StreamingSpecComponentProps,
} from './components/StreamingTurn';
import {
  StepsGroup,
  type StreamingStepsComponentProps,
} from './components/StepsGroup';
import {
  ClarificationQuestions,
  type ClarificationQuestionsProps,
} from './components/ClarificationQuestions';
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
 * Shell picker: the classic popover unless the embed asked for the companion
 * (`displayMode`). Must render INSIDE WidgetProvider. The companion is one
 * shell across every layout (compact, fullscreen, sidebar): it morphs between
 * them in place — no mount/unmount swap — so switching layouts expands FROM
 * the current rect.
 */
function WidgetDisplayRoot() {
  const displayMode = useDisplayMode();
  return displayMode === 'companion' ? (
    // Layout state (compact/sidebar/fullscreen + the visitor's remembered
    // preferences) is a companion concept; the popover never reads it.
    <WidgetLayoutProvider>
      <WidgetCompanion />
    </WidgetLayoutProvider>
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
  {
    key: 'agent_chat_steps' satisfies LiteralWidgetComponentKey,
    component: StepsGroup,
  },
  {
    key: 'agent_chat_spec' satisfies LiteralWidgetComponentKey,
    component: StreamingSpec,
  },
  {
    key: 'agent_chat_questions' satisfies LiteralWidgetComponentKey,
    component: ClarificationQuestions,
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
    errorComponent?: (error: Error) => React.ReactNode;
  }
>(function Widget(
  { options, components = [], loadingComponent, errorComponent },
  ref,
) {
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
        errorComponent={errorComponent}
      >
        <WidgetTriggerProvider>
          <PageMarksProvider>
            <AgentChatPageEffects />
            <WidgetImperativeHandler widgetRef={ref} />
            {options.inline ? <WidgetContent /> : <WidgetDisplayRoot />}
          </PageMarksProvider>
        </WidgetTriggerProvider>
      </WidgetProvider>
    </MotionConfig>
  );
});
Widget.displayName = 'Widget';

export { Widget };
/**
 * The agent's inline UI, for a host page that shows widget transcripts
 * outside the widget (the OpenCX inbox): the same catalog, renderer, and
 * fence parser the widget uses, so what the agent reads is what the customer
 * saw.
 */
export {
  HostedSpecRenderer,
  segmentContent,
  type ContentSegment,
} from './json-render';
export type {
  ClarificationQuestionsProps,
  StreamingSpecComponentProps,
  StreamingStepsComponentProps,
  WidgetRef,
};
