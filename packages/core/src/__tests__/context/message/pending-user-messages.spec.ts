import '../../api-caller.mock';

import { describe, expect, it } from 'vitest';
import { WidgetCtx } from '../../../context/widget.ctx';
import type { WidgetAiMessage, WidgetUserMessage } from '../../../types/messages';
import { genUuid } from '../../../utils/uuid';

/**
 * The v5 pending lifecycle on `MessageCtx`: `beginAgentTurn` renders the user
 * bubble optimistically with `pending: true` (the UI dims it), and
 * `markUserMessagesDelivered` — called by the engine when the turn starts
 * streaming or ends — clears the flag. The react hook only wires the calls;
 * the state transitions are asserted here.
 */
describe('v5 pending user messages', () => {
  const init = () => WidgetCtx.initialize({ config: { token: '' } });

  it('beginAgentTurn renders the message with pending: true', async () => {
    const widgetCtx = await init();

    const prepared = await widgetCtx.messageCtx.beginAgentTurn({ content: 'hey' });

    expect(prepared).not.toBeNull();
    const messages = widgetCtx.messageCtx.state.get().messages;
    const rendered = messages.find((m) => m.id === prepared?.userMessage.id);
    if (rendered?.type !== 'USER') throw new Error('user bubble not rendered');
    expect(rendered.pending).toBe(true);
  });

  it('markUserMessagesDelivered clears pending on EVERY pending user message', async () => {
    const widgetCtx = await init();
    await widgetCtx.messageCtx.beginAgentTurn({ content: 'first' });
    await widgetCtx.messageCtx.beginAgentTurn({ content: 'second' });

    widgetCtx.messageCtx.markUserMessagesDelivered();

    const users = widgetCtx.messageCtx.state
      .get()
      .messages.filter((m): m is WidgetUserMessage => m.type === 'USER');
    expect(users).toHaveLength(2);
    expect(users.every((m) => m.pending === false)).toBe(true);
  });

  it('is a state no-op when nothing is pending (no new messages array)', async () => {
    const widgetCtx = await init();
    await widgetCtx.messageCtx.beginAgentTurn({ content: 'hey' });
    widgetCtx.messageCtx.markUserMessagesDelivered();
    const settled = widgetCtx.messageCtx.state.get().messages;

    widgetCtx.messageCtx.markUserMessagesDelivered();

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
    await widgetCtx.messageCtx.beginAgentTurn({ content: 'hey' });

    widgetCtx.messageCtx.markUserMessagesDelivered();

    const messages = widgetCtx.messageCtx.state.get().messages;
    expect(messages.find((m) => m.id === aiMessage.id)).toEqual(aiMessage);
  });
});
