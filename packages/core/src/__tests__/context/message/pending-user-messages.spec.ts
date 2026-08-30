import '../../api-caller.mock';

import { describe, expect, it } from 'vitest';
import { WidgetCtx } from '../../../context/widget.ctx';
import type {
  WidgetAiMessage,
  WidgetUserMessage,
} from '../../../types/messages';
import { genUuid } from '../../../utils/uuid';

/**
 * The v5 pending lifecycle on `MessageCtx`: `beginAgentTurn` renders the user
 * bubble optimistically with `pending: true` (the UI dims it), and
 * `markUserMessageDelivered` — called by the engine when that turn starts
 * streaming or ends — clears only its flag. The react hook wires the calls;
 * the state transitions are asserted here.
 */
describe('v5 pending user messages', () => {
  const init = () => WidgetCtx.initialize({ config: { token: '' } });

  it('beginAgentTurn renders the message with pending: true', async () => {
    const widgetCtx = await init();

    const prepared = await widgetCtx.messageCtx.beginAgentTurn({
      content: 'hey',
    });

    expect(prepared).not.toBeNull();
    const messages = widgetCtx.messageCtx.state.get().messages;
    const rendered = messages.find((m) => m.id === prepared?.userMessage.id);
    if (rendered?.type !== 'USER') throw new Error('user bubble not rendered');
    expect(rendered.pending).toBe(true);
  });

  it('marks only the user message owned by the delivered turn', async () => {
    const widgetCtx = await init();
    const first = await widgetCtx.messageCtx.beginAgentTurn({
      content: 'first',
    });
    const second = await widgetCtx.messageCtx.beginAgentTurn({
      content: 'second',
    });
    if (!first || !second) throw new Error('turn preparation failed');

    widgetCtx.messageCtx.markUserMessageDelivered(first.userMessage.id);

    const users = widgetCtx.messageCtx.state
      .get()
      .messages.filter((m): m is WidgetUserMessage => m.type === 'USER');
    expect(users).toHaveLength(2);
    expect(users.find((m) => m.id === first.userMessage.id)?.pending).toBe(
      false,
    );
    expect(users.find((m) => m.id === second.userMessage.id)?.pending).toBe(
      true,
    );
  });

  it('is a state no-op when nothing is pending (no new messages array)', async () => {
    const widgetCtx = await init();
    const prepared = await widgetCtx.messageCtx.beginAgentTurn({
      content: 'hey',
    });
    if (!prepared) throw new Error('turn preparation failed');
    widgetCtx.messageCtx.markUserMessageDelivered(prepared.userMessage.id);
    const settled = widgetCtx.messageCtx.state.get().messages;

    widgetCtx.messageCtx.markUserMessageDelivered(prepared.userMessage.id);

    // Referential equality: no pointless state churn (re-renders) once settled.
    expect(widgetCtx.messageCtx.state.get().messages).toBe(settled);
  });

  it('leaves non-user messages untouched', async () => {
    const widgetCtx = await init();
    const aiMessage: WidgetAiMessage = {
      id: genUuid(),
      type: 'AI',
      component: 'bot_message',
      timestamp: new Date().toISOString(),
      data: { message: 'hello' },
    };
    widgetCtx.messageCtx.state.setPartial({ messages: [aiMessage] });
    const prepared = await widgetCtx.messageCtx.beginAgentTurn({
      content: 'hey',
    });
    if (!prepared) throw new Error('turn preparation failed');

    widgetCtx.messageCtx.markUserMessageDelivered(prepared.userMessage.id);

    const messages = widgetCtx.messageCtx.state.get().messages;
    expect(messages.find((m) => m.id === aiMessage.id)).toEqual(aiMessage);
  });
});
