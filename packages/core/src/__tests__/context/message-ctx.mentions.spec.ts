// Real MessageCtx → ApiCaller wire path (stubbed fetch): @-mentions ride the
// send as `clientContext.mentions` — identity only, never the icon — and show
// on the user bubble; nothing about them is sent when page context is off.
import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import { ApiCaller } from '../../api/api-caller';
import { ContactCtx } from '../../context/contact.ctx';
import { MessageCtx } from '../../context/message.ctx';
import { SessionCtx } from '../../context/session.ctx';
import type { SessionDto } from '../../types/dtos';

const session: SessionDto = {
  id: 'a3a3a3a3-0000-4000-8000-000000000001',
  ticketNumber: 1,
  title: null,
  createdAt: '',
  updatedAt: '',
  isHandedOff: false,
  isOpened: true,
  assignee: { kind: 'ai', name: null, avatarUrl: null },
  channel: 'web',
  isVerified: false,
  lastMessage: null,
  modeId: null,
  latestStateCheckpointPayload: null,
  sessionAttributes: {},
  customStatus: null,
};

function buildCtx(sendsPageContext: boolean) {
  const config = { token: 'tok', context: { plan: 'pro' } };
  const api = new ApiCaller({ config });
  const contactCtx = new ContactCtx({ api, config });
  const sessionCtx = new SessionCtx({
    config,
    api,
    contactCtx,
    sessionsPollingIntervalSeconds: 3600,
  });
  sessionCtx.sessionState.setPartial({ session });
  return new MessageCtx({
    config,
    api,
    sessionCtx,
    contactCtx,
    streaming: false,
    sendsPageContext,
  });
}

const mention = {
  type: 'workflow',
  id: 'wf_1',
  title: 'PostgreSQL Backup',
  icon: 'https://cdn/wf.svg',
  meta: { env: 'prod' },
};

suite('MessageCtx — @-mentions on the wire', () => {
  let bodies: Record<string, unknown>[];
  beforeEach(() => {
    bodies = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        if (request.url.includes('send')) {
          bodies.push(JSON.parse(await request.text()));
        }
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  test('mentions merge into clientContext without their icon, and show on the bubble', async () => {
    const messageCtx = buildCtx(true);
    await messageCtx.sendMessage({
      content: 'hey @PostgreSQL Backup',
      mentions: [mention],
    });
    expect(bodies[0]?.clientContext).toEqual({
      plan: 'pro',
      mentions: [
        {
          type: 'workflow',
          id: 'wf_1',
          title: 'PostgreSQL Backup',
          meta: { env: 'prod' },
        },
      ],
    });
    const sent = messageCtx.state.get().messages.find((m) => m.type === 'USER');
    expect(sent?.type === 'USER' && sent.mentions).toEqual([mention]);
  });

  test('page context off: mentions are neither sent nor shown', async () => {
    const messageCtx = buildCtx(false);
    await messageCtx.sendMessage({ content: 'hey', mentions: [mention] });
    expect(bodies[0]?.clientContext).toEqual({ plan: 'pro' });
    const sent = messageCtx.state.get().messages.find((m) => m.type === 'USER');
    expect(sent?.type === 'USER' && sent.mentions).toBeUndefined();
  });
});
