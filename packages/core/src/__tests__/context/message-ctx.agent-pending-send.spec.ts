// Regression: on an agent-bound (v5) embed, the companion quick-ask bar
// renders ONLY the composer — the chat pane (and with it `useAgentChat`, which
// registers the agent send handlers) mounts AFTER the first `sendMessage`.
// That first message used to be dropped with a console warning, so expanding
// the panel opened a fresh empty chat. The fix: hold handler-less sends and
// flush them the moment the surface registers.
import { expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ContactCtx } from '../../context/contact.ctx';
import { MessageCtx, type SendMessageInput } from '../../context/message.ctx';
import { SessionCtx } from '../../context/session.ctx';
import type { WidgetConfig } from '../../types/widget-config';

function buildAgentBoundCtx() {
  const config: WidgetConfig = { token: 'tok' };
  const api = new ApiCaller({ config });
  const contactCtx = new ContactCtx({ api, config });
  const sessionCtx = new SessionCtx({
    config,
    api,
    contactCtx,
    sessionsPollingIntervalSeconds: 3600,
  });
  const messageCtx = new MessageCtx({ config, api, sessionCtx, contactCtx });
  messageCtx.agentBound = true;
  return messageCtx;
}

suite('MessageCtx agent-bound sends racing the surface mount', () => {
  test('a send before the surface mounts is HELD, then flushed on register — in order', async () => {
    const messageCtx = buildAgentBoundCtx();
    const sent: string[] = [];
    const handlers = {
      send: vi.fn((input: SendMessageInput) => {
        sent.push(input.content);
      }),
      stop: vi.fn(),
    };

    // Quick-ask: composer dispatches before useAgentChat registered anything.
    await messageCtx.sendMessage({ content: 'first — from the quick-ask bar' });
    await messageCtx.sendMessage({ content: 'second' });
    expect(handlers.send).not.toHaveBeenCalled();

    // Chat pane mounts → handlers register → both held sends flush, in order.
    messageCtx.registerAgentHandlers(handlers);
    expect(sent).toEqual(['first — from the quick-ask bar', 'second']);

    // Once mounted, sends go straight through (nothing re-queued).
    await messageCtx.sendMessage({ content: 'third — live' });
    expect(sent).toEqual(['first — from the quick-ask bar', 'second', 'third — live']);
  });

  test('a flushed send is not replayed on a later re-register (unmount/remount)', async () => {
    const messageCtx = buildAgentBoundCtx();
    const first = { send: vi.fn(), stop: vi.fn() };
    await messageCtx.sendMessage({ content: 'held' });
    messageCtx.registerAgentHandlers(first);
    expect(first.send).toHaveBeenCalledTimes(1);

    messageCtx.unregisterAgentHandlers(first);
    const second = { send: vi.fn(), stop: vi.fn() };
    messageCtx.registerAgentHandlers(second);
    expect(second.send).not.toHaveBeenCalled();
  });

  test('reset discards held sends — they never leak into the next conversation', async () => {
    const messageCtx = buildAgentBoundCtx();
    await messageCtx.sendMessage({ content: 'stale quick-ask' });
    messageCtx.reset();

    const handlers = { send: vi.fn(), stop: vi.fn() };
    messageCtx.registerAgentHandlers(handlers);
    expect(handlers.send).not.toHaveBeenCalled();
  });
});
