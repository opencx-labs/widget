// A stateful, closed network fixture. Storage and history survive the bundle
// swap, so the upgrade must reuse the visitor and conversation, not create new ones.
export function createBackend(profile) {
  const requests = [],
    unexpected = [];
  let session = null,
    history = [],
    turn = 0,
    contacts = 0;
  const makeSession = () => ({
    id: 'upgrade-session',
    ticketNumber: 42,
    title: null,
    assignee: { kind: 'ai', name: null, avatarUrl: null },
    channel: 'web',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isHandedOff: false,
    isOpened: true,
    isVerified: profile === 'verified',
    lastMessage: '',
    latestStateCheckpointPayload: null,
    modeId: profile === 'mode-canvas' ? 'compat-mode' : null,
    sessionAttributes: {},
    customStatus: null,
  });
  function row(id, type, text, kind) {
    return {
      publicId: id,
      type,
      content: { text },
      sender: { kind, name: kind === 'agent' ? 'Backend Human' : null },
      sentAt: '2026-01-01T12:00:00Z',
      systemMessagePayload: null,
    };
  }
  return {
    requests,
    unexpected,
    get session() {
      return session;
    },
    get contacts() {
      return contacts;
    },
    get history() {
      return history;
    },
    switchAccount() {
      session = null;
      history = [];
      turn = 0;
    },
    addHumanReply() {
      history.push(
        row('polled-human', 'agent_message', 'POLLED HUMAN REPLY', 'agent'),
      );
    },
    async route(route, phase) {
      const req = route.request(),
        url = new URL(req.url());
      const headers = await req.allHeaders();
      const body = req.headers()['content-type']?.includes('application/json')
        ? req.postDataJSON()
        : req.postData();
      requests.push({
        phase,
        path: url.pathname,
        headers,
        body,
      });
      const json = (data) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(data),
        });
      if (url.pathname === '/backend/widget/v2/config')
        return json({
          org: { id: 'upgrade-org', name: 'Fixture Org' },
          modes:
            profile === 'mode-canvas'
              ? [
                  {
                    id: 'compat-mode',
                    slug: 'compat-mode',
                    name: 'Fixture Mode',
                  },
                ]
              : [],
          sessionsPollingIntervalSeconds: 3600,
          sessionPollingIntervalSeconds: 0.25,
          agent: {
            name: 'Backend Agent',
            avatar_url: null,
            streaming: true,
            features: {
              attachments: true,
              dictation: false,
              page_context: true,
              client_tools: true,
              inline_ui: false,
              preamble: false,
            },
          },
        });
      if (url.pathname === '/backend/widget/v2/contact/create-unverified') {
        contacts++;
        return json({ token: 'synthetic-contact-token' });
      }
      if (!headers.authorization?.startsWith('Bearer '))
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Missing widget contact token' }),
        });
      if (url.pathname === '/backend/widget/v2/sessions')
        return json({ items: session ? [session] : [], next: null });
      if (url.pathname === '/backend/widget/v2/create-session') {
        session = makeSession();
        return json(session);
      }
      if (url.pathname === '/backend/widget/v2/poll/upgrade-session')
        return json({ session, history });
      if (url.pathname === '/backend/widget/v2/session/history/upgrade-session')
        return json(history);
      if (url.pathname === '/backend/widget/v2/chat/send') {
        const n = ++turn;
        session.lastMessage = `UPGRADE REPLY ${n}`;
        for (const initial of body.initial_messages ?? [])
          history.push(row(initial.uuid, 'message', initial.content, 'ai'));
        history.push(row(body.uuid, 'message', body.content, 'user'));
        history.push(row(`reply-${n}`, 'message', `UPGRADE REPLY ${n}`, 'ai'));
        return json({
          success: true,
          autopilotResponse: {
            type: 'text',
            value: { error: false, content: `UPGRADE REPLY ${n}` },
            id: `reply-${n}`,
            mightSolveUserIssue: false,
            completelyAndFullyCoveredUserIssue: false,
            assistMode: false,
          },
        });
      }
      if (url.pathname === '/backend/widget/v2/upload')
        return json({
          fileName: 'upgrade.pdf',
          fileUrl: 'https://upgrade.test/uploaded.pdf',
        });
      if (url.pathname === '/backend/widget/v2/session/resolve') {
        session.isOpened = false;
        return json(session);
      }
      unexpected.push(url.pathname);
      return route.fulfill({ status: 404, body: '{}' });
    },
  };
}
