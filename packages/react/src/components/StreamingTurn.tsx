import {
  resolveClientPresentation,
  type WidgetAiMessage,
} from '@opencx/widget-core';
import type {
  SpecDataPart,
  StreamingTurnItem,
  StreamingTurnState,
} from '@opencx/widget-react-headless';
import { applyPresentation, useWidget } from '@opencx/widget-react-headless';
import React, { useMemo, useState } from 'react';
import { buildSpec, SpecRenderer } from '../json-render';
import { dc } from '../utils/data-component';
import { AgentMessageGroup } from './AgentMessageGroup';
import { BrailleSpinner } from './lib/BrailleSpinner';

/**
 * The live streamed turn (streaming engine): rendered in STREAM ORDER —
 * top-to-bottom is time. Narration text renders through the STOCK
 * AgentMessageGroup (identical to persisted messages) at its true position,
 * each run of consecutive activity (reasoning/tools) renders as a collapsible
 * steps group right where it happened, and the turn's streamed json-render
 * spec (`data-spec` patches) renders progressively through `SpecRenderer` at
 * its true position. Unmounts when the stream ends and the canonical rows
 * take over.
 */
export function StreamingTurn({
  turn,
  agent,
  timestamp,
}: {
  turn: StreamingTurnState;
  agent: WidgetAiMessage['agent'];
  /**
   * The turn's persisted timestamp, when it has one — finished turns rendered
   * as the transcript's source for their rows pass the covered row's stamp so
   * a reloaded session shows real times, not the mount time.
   */
  timestamp?: string | null;
}) {
  // Registered by `Widget` (`agent_chat_steps` / `agent_chat_spec`) and
  // replaceable through the `components` prop.
  const { componentStore, config, widgetCtx } = useWidget();
  const StepsComponent = componentStore.getComponent('agent_chat_steps');
  const SpecComponent = componentStore.getComponent('agent_chat_spec');
  // Fixed for the life of the turn. A fresh `new Date()` per render would make
  // the group timestamp tick with every streamed token and then jump when the
  // persisted row (stamped once, server-side) takes over at the handoff.
  const [startedAt] = useState(() => new Date().toISOString());
  const groupTimestamp = timestamp ?? startedAt;
  const items = applyPresentation(
    turn.items,
    resolveClientPresentation(
      widgetCtx.agent.presentation,
      config.presentation,
    ),
  );

  // `questions` renders NOTHING in the transcript. A pending clarification
  // takes the composer's place instead (`ChatInput`), so the customer answers
  // where they would otherwise type — and a questionnaire the conversation
  // has moved past leaves no dead card behind.
  return (
    <div {...dc('chat/streaming_turn/root')} className="flex flex-col gap-2">
      {items.map((item, index) =>
        item.kind === 'text' ? (
          <AgentMessageGroup
            key={`text-${index}`}
            messages={[
              {
                id: `streaming-${index}`,
                type: 'AI',
                component: 'bot_message',
                timestamp: groupTimestamp,
                data: { message: item.text },
                agent,
              },
            ]}
            agent={agent}
            actions={!turn.active}
          />
        ) : item.kind === 'spec' ? (
          SpecComponent && (
            <SpecComponent key={`spec-${index}`} parts={item.parts} />
          )
        ) : item.kind === 'questions' ? null : (
          StepsComponent && (
            <StepsComponent
              key={`steps-${index}`}
              active={turn.active}
              steps={item.steps}
            />
          )
        ),
      )}
      {/* "Still working": a turn that has shown something and is still
          streaming keeps a spinner at its tail — a slow tool call or a large
          UI spec can take seconds with no new text, and silence reads as a
          stall. A running steps group carries its own loader, so the tail
          stays quiet while one is the last item. */}
      {turn.active && !endsWithRunningSteps(items) && (
        <div
          {...dc('chat/streaming_turn/working')}
          className="flex h-5 items-center ps-1"
        >
          <BrailleSpinner className="text-[14px] leading-none text-primary/70" />
        </div>
      )}
    </div>
  );
}

function endsWithRunningSteps(items: readonly StreamingTurnItem[]): boolean {
  const last = items.at(-1);
  return last?.kind === 'steps' && last.steps.some((step) => !step.done);
}

/**
 * Assembles the accumulating spec from the turn's `data-spec` patches and
 * renders it through the shared `SpecRenderer` seam (same defenses as the
 * persisted-history path).
 */
export type StreamingSpecComponentProps = { parts: SpecDataPart[] };

export function StreamingSpec({ parts }: StreamingSpecComponentProps) {
  // `mapUiPartsToItems` produces a fresh parts array on every stream
  // snapshot, so the reference itself is the change signal.
  const spec = useMemo(() => buildSpec(parts), [parts]);
  return <SpecRenderer spec={spec} />;
}
