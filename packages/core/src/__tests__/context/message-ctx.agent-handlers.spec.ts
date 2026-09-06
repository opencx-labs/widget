// On an agent-bound embed, `sendMessage` delegates to the registered
// agent-chat engine (the `useAgentChat` hook, mounted with the widget root).
// Imperative `newChat({ message })` can dispatch before the chat surface's
// mount effect registers the engine, so that short render gap is buffered.
import { expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ContactCtx } from '../../context/contact.ctx';
import { MessageCtx, type SendMessageInput } from '../../context/message.ctx';
import { SessionCtx } from '../../context/session.ctx';
import type { WidgetConfig } from '../../types/widget-config';

function buildAgentBoundCtx() {
  // A fixed verified contact keeps this unit test at the MessageCtx boundary;
  // constructing ContactCtx must not start an unrelated anonymous-contact
  // request in the background.
  const config: WidgetConfig = {
    token: 'tok',
    user: { token: 'contact-token' },
  };
  const api = new ApiCaller({ config });
  vi.spyOn(api, 'getSessions').mockResolvedValue({
    data: { items: [], next: null },
    response: new Response(),
  });
  const contactCtx = new ContactCtx({ api, config });
  const sessionCtx = new SessionCtx({
    config,
    api,
    contactCtx,
    sessionsPollingIntervalSeconds: 3600,
  });
  return new MessageCtx({
    config,
    api,
    sessionCtx,
    contactCtx,
    streaming: true,
    sendsPageContext: true,
  });
}

suite('MessageCtx agent-bound send delegation', () => {
  test('sends route to the registered engine, in order', async () => {
    const messageCtx = buildAgentBoundCtx();
    const sent: string[] = [];
    const handlers = {
      send: vi.fn((input: SendMessageInput) => {
        sent.push(input.content);
      }),
    };
    messageCtx.registerAgentHandlers(handlers);

    await messageCtx.sendMessage({ content: 'first' });
    await messageCtx.sendMessage({ content: 'second' });
    expect(sent).toEqual(['first', 'second']);
  });

  test('sends before registration are buffered and drained in FIFO order', async () => {
    const messageCtx = buildAgentBoundCtx();
    const handlers = { send: vi.fn() };

    await messageCtx.sendMessage({ content: 'first' });
    await messageCtx.sendMessage({ content: 'second' });
    expect(handlers.send).not.toHaveBeenCalled();

    messageCtx.registerAgentHandlers(handlers);

    expect(handlers.send.mock.calls.map(([input]) => input.content)).toEqual([
      'first',
      'second',
    ]);
  });

  test('reset clears sends buffered for the previous conversation', async () => {
    const messageCtx = buildAgentBoundCtx();
    const handlers = { send: vi.fn() };

    await messageCtx.sendMessage({ content: 'stale' });
    messageCtx.reset();
    messageCtx.registerAgentHandlers(handlers);

    expect(handlers.send).not.toHaveBeenCalled();
  });

  test('a late unmount does not clobber a newer registration', async () => {
    const messageCtx = buildAgentBoundCtx();
    const first = { send: vi.fn() };
    const second = { send: vi.fn() };
    messageCtx.registerAgentHandlers(first);
    messageCtx.registerAgentHandlers(second);
    // First surface unmounts late — the second registration must survive.
    messageCtx.unregisterAgentHandlers(first);

    await messageCtx.sendMessage({ content: 'live' });
    expect(second.send).toHaveBeenCalledTimes(1);
    expect(first.send).not.toHaveBeenCalled();
  });
});
