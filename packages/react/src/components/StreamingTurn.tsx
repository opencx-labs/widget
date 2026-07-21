import type {
  StreamingTurnState,
  WidgetAiMessage,
} from '@opencx/widget-core';
import React from 'react';
import { dc } from '../utils/data-component';
import { AgentMessageGroup } from './AgentMessageGroup';
import { StepsGroup } from './StepsGroup';

/**
 * The live v5 streamed turn (agent-bound embeds): rendered in STREAM ORDER —
 * top-to-bottom is time. Narration text renders through the STOCK
 * AgentMessageGroup (identical to persisted messages) at its true position,
 * and each run of consecutive activity (reasoning/tools) renders as a
 * collapsible steps group right where it happened. Unmounts when the stream
 * ends and the canonical rows take over.
 */
export function StreamingTurn({
  turn,
  agent,
}: {
  turn: StreamingTurnState;
  agent: WidgetAiMessage['agent'];
}) {
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
                timestamp: new Date().toISOString(),
                data: { message: item.text },
                agent,
              },
            ]}
            agent={agent}
          />
        ) : (
          <StepsGroup key={`steps-${index}`} steps={item.steps} />
        ),
      )}
    </div>
  );
}
