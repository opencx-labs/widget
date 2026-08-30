import type { WidgetAiMessage } from '@opencx/widget-core';
import type {
  SpecDataPart,
  StreamingStep,
  StreamingTurnState,
} from '@opencx/widget-react-headless';
import { useWidget } from '@opencx/widget-react-headless';
import React, { useMemo, useState } from 'react';
import { buildSpec, SpecRenderer } from '../json-render';
import { dc } from '../utils/data-component';
import { AgentMessageGroup } from './AgentMessageGroup';
import { StepsGroup } from './StepsGroup';

/**
 * The live streamed turn (agent-bound embeds): rendered in STREAM ORDER —
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
  const { componentStore } = useWidget();
  const StepsComponent =
    componentStore.getComponent('agent_chat_steps') ?? StepsGroup;
  const SpecComponent =
    componentStore.getComponent('agent_chat_spec') ?? StreamingSpec;
  // Fixed for the life of the turn. A fresh `new Date()` per render would make
  // the group timestamp tick with every streamed token and then jump when the
  // persisted row (stamped once, server-side) takes over at the handoff.
  const [startedAt] = useState(() => new Date().toISOString());
  const groupTimestamp = timestamp ?? startedAt;

  return (
    <div {...dc('chat/streaming_turn/root')} className="flex flex-col gap-2">
      {turn.items.map((item, index) =>
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
          />
        ) : item.kind === 'spec' ? (
          <SpecComponent key={`spec-${index}`} parts={item.parts} />
        ) : (
          <StepsComponent
            key={`steps-${index}`}
            // `StepsGroup` reads "still running" off its steps' own `done`
            // flags. A turn that ended with a step unfinished — a stopped turn
            // leaves its last tool call at `input-available` — would otherwise
            // shimmer "running..." forever. Once the turn is over nothing is
            // running, so settle them, exactly as the persisted `stepsBefore`
            // path does.
            active={turn.active}
            steps={
              turn.active
                ? item.steps
                : item.steps.map((step) => ({ ...step, done: true }))
            }
          />
        ),
      )}
    </div>
  );
}

/**
 * Assembles the accumulating spec from the turn's `data-spec` patches and
 * renders it through the shared `SpecRenderer` seam (same defenses as the
 * persisted-history path).
 */
export type StreamingSpecComponentProps = { parts: SpecDataPart[] };
export type StreamingStepsComponentProps = {
  steps: StreamingStep[];
  active: boolean;
};

export function StreamingSpec({ parts }: StreamingSpecComponentProps) {
  // `mapUiMessageToItems` produces a fresh parts array on every stream
  // snapshot, so the reference itself is the change signal.
  const spec = useMemo(() => buildSpec(parts), [parts]);
  return <SpecRenderer spec={spec} />;
}
