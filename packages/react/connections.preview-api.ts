export type PreviewMode = 'default' | 'oto' | 'mollie';
export type PreviewState = 'idle' | 'slow' | 'error' | 'reconnect';

type PreviewStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

type PreviewBackendOptions = {
  fallback: typeof fetch;
  mode: PreviewMode;
  origin: string;
  state: PreviewState;
  storage: PreviewStorage;
};

type HistoryRow = {
  publicId: string;
  type: 'message';
  content: { text: string };
  sender: { kind: 'user' | 'ai'; name: string | null; avatar: null };
  sentAt: string;
  actionCalls: null;
  attachments: null;
  systemMessagePayload: { type: 'none' };
};

type StreamPart = Record<string, unknown> & { type: string };

const SERVER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

const names: Record<Exclude<PreviewMode, 'default'>, string> = {
  oto: 'OTO',
  mollie: 'Bookkeeping',
};

const questions: Record<PreviewMode, string> = {
  default: 'Find the order for customer Alex.',
  oto: 'Show the status of my latest shipments.',
  mollie: 'Which invoices are missing a matching payment?',
};

const answers: Record<PreviewMode, string> = {
  default: 'Alex’s order shipped today and arrives Friday.',
  oto: 'Two shipments were delivered. One is on its way.',
  mollie: 'I found 3 invoices without a matching payment.',
};

const wait = (duration: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, duration));

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const storageKeys = {
  connected: (mode: PreviewMode) => `connections-preview:${mode}:connected`,
  attempt: (attemptId: string) =>
    `connections-preview:attempt:${attemptId}:status`,
};

const valueFrom = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null) return undefined;
  return Reflect.get(value, key);
};

const textFrom = (value: unknown, key: string): string | undefined => {
  const field = valueFrom(value, key);
  return typeof field === 'string' ? field : undefined;
};

const session = () => ({
  id: SESSION_ID,
  ticketNumber: 1,
  title: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isHandedOff: false,
  isOpened: true,
  assignee: { kind: 'ai', name: null, avatarUrl: null },
  channel: 'web',
  isVerified: true,
  lastMessage: null,
  modeId: null,
  latestStateCheckpointPayload: null,
  sessionAttributes: {},
  customStatus: null,
});

const historyRow = ({
  id,
  kind,
  text,
}: {
  id: string;
  kind: 'user' | 'ai';
  text: string;
}): HistoryRow => ({
  publicId: id,
  type: 'message',
  content: { text },
  sender: { kind, name: kind === 'ai' ? 'Assistant' : null, avatar: null },
  sentAt: new Date().toISOString(),
  actionCalls: null,
  attachments: null,
  systemMessagePayload: { type: 'none' },
});

const stream = (parts: StreamPart[]) => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const part of parts) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(part)}\n\n`),
          );
          await wait(70);
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    {
      headers: {
        'cache-control': 'no-cache',
        'content-type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
    },
  );
};

const textParts = (text: string): StreamPart[] => [
  { type: 'text-start', id: 'answer' },
  { type: 'text-delta', id: 'answer', delta: text },
  { type: 'text-end', id: 'answer' },
];

export function parsePreviewMode(value: string | null): PreviewMode {
  return value === 'default' || value === 'mollie' ? value : 'oto';
}

export function parsePreviewState(value: string | null): PreviewState {
  return value === 'slow' || value === 'error' || value === 'reconnect'
    ? value
    : 'idle';
}

export function clearPreviewState(storage: PreviewStorage, mode: PreviewMode) {
  storage.removeItem(storageKeys.connected(mode));
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith('connections-preview:attempt:')) {
      storage.removeItem(key);
      index -= 1;
    }
  }
}

export function createPreviewBackend({
  fallback,
  mode,
  origin,
  state,
  storage,
}: PreviewBackendOptions): typeof fetch {
  const history: HistoryRow[] = [];
  const turns: Array<{
    turn_id: string;
    ui_parts: StreamPart[];
    message_uuids: string[];
  }> = [];
  const handledConnectionRequestIds = new Set<string>();
  let startAttempts = 0;
  let turnNumber = 0;
  let connectionRequestNumber = 0;

  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== origin || !url.pathname.startsWith('/backend/')) {
      return fallback(input, init);
    }

    if (
      request.method === 'GET' &&
      url.pathname.endsWith('/widget/v2/config')
    ) {
      return json({
        org: {
          id: 'preview',
          name: mode === 'oto' ? 'OTO' : mode === 'mollie' ? 'Mollie' : 'Acme',
        },
        modes: [],
        sessionPollingIntervalSeconds: 3600,
        sessionsPollingIntervalSeconds: 3600,
        agent: {
          name: 'Assistant',
          streaming: true,
          avatar_url: null,
          features: {
            preamble: false,
            inline_ui: false,
            dictation: false,
            attachments: false,
            page_context: false,
            client_tools: false,
          },
        },
      });
    }

    if (
      request.method === 'GET' &&
      url.pathname.endsWith('/widget/v2/sessions')
    ) {
      return json({ items: [], next: null });
    }

    if (
      request.method === 'POST' &&
      url.pathname.endsWith('/widget/v2/create-session')
    ) {
      return json(session());
    }

    if (request.method === 'GET' && url.pathname.includes('/widget/v2/poll/')) {
      return json({ session: session(), history });
    }

    if (
      request.method === 'GET' &&
      url.pathname.endsWith(`/widget/v5/chat/${SESSION_ID}/messages`)
    ) {
      return json({
        turns,
        handled_connection_request_ids: Array.from(
          handledConnectionRequestIds,
        ),
      });
    }

    if (
      request.method === 'GET' &&
      url.pathname.endsWith(`/widget/v5/chat/${SESSION_ID}/stream`)
    ) {
      return new Response(null, { status: 204 });
    }

    const attemptMatch = url.pathname.match(
      /^\/backend\/widget\/v5\/connections\/([^/]+)\/attempts\/([^/]+)$/,
    );
    if (request.method === 'GET' && attemptMatch) {
      const requestedServerId = attemptMatch[1];
      const attemptId = attemptMatch[2];
      if (requestedServerId !== SERVER_ID || !attemptId) {
        return json({ message: 'Connection attempt not found.' }, 404);
      }
      const status = storage.getItem(storageKeys.attempt(attemptId));
      return status
        ? json({ status })
        : json({ message: 'Connection attempt not found.' }, 404);
    }

    if (
      request.method === 'POST' &&
      url.pathname.endsWith(`/widget/v5/connections/${SERVER_ID}/start`)
    ) {
      startAttempts += 1;
      if (state === 'slow') await wait(4_000);
      if (state === 'error' && startAttempts === 1) {
        return json({ message: 'Connection service unavailable.' }, 503);
      }
      if (state === 'reconnect' && startAttempts === 1) {
        return json({ message: 'Connection request expired.' }, 410);
      }
      const authorizationUrl = new URL('/connections.consent.html', origin);
      authorizationUrl.searchParams.set('case', mode);
      if (mode === 'mollie') {
        return json(
          {
            authorization_url: authorizationUrl.href,
            completion: 'external',
          },
          201,
        );
      }
      const attemptId = `44444444-4444-4444-8444-${String(startAttempts).padStart(12, '0')}`;
      storage.setItem(storageKeys.attempt(attemptId), 'pending');
      authorizationUrl.searchParams.set('attempt', attemptId);
      return json(
        {
          authorization_url: authorizationUrl.href,
          completion: 'oauth',
          attempt_id: attemptId,
        },
        201,
      );
    }

    if (
      request.method === 'POST' &&
      url.pathname.endsWith('/widget/v5/chat/stream')
    ) {
      const body: unknown = await request.json();
      const userId = textFrom(body, 'uuid') ?? crypto.randomUUID();
      const content = textFrom(body, 'content') ?? '';
      turnNumber += 1;
      const replyId = `55555555-5555-4555-8555-${String(turnNumber).padStart(12, '0')}`;
      const turnId = `66666666-6666-4666-8666-${String(turnNumber).padStart(12, '0')}`;
      const clientContext = valueFrom(body, 'clientContext');
      const background =
        valueFrom(clientContext, 'opencx__background') === true;
      const handledConnectionRequestId = textFrom(
        clientContext,
        'opencx__connection_request_id',
      );
      if (!background) {
        history.push(historyRow({ id: userId, kind: 'user', text: content }));
      }

      const connected =
        mode === 'default' ||
        storage.getItem(storageKeys.connected(mode)) === 'true';
      const continuedWithoutAccess = content.includes('without connecting');
      const renewingExpiredRequest = content.includes('connection request for');
      const reply = continuedWithoutAccess
        ? 'I can help with general questions. Connect your account when you want me to check your data.'
        : connected
          ? answers[mode]
          : state === 'reconnect' && !renewingExpiredRequest
            ? `Your access to ${names[mode]} expired. Connect again so I can continue.`
            : `Connect ${names[mode]} so I can check your account.`;
      connectionRequestNumber += 1;
      const connectionRequestId = `33333333-3333-4333-8333-${String(connectionRequestNumber).padStart(12, '0')}`;
      const uiParts: StreamPart[] =
        connected || continuedWithoutAccess
          ? [{ type: 'text', text: reply, state: 'done' }]
          : [
              { type: 'text', text: reply, state: 'done' },
              {
                type: 'dynamic-tool',
                toolName: 'account_lookup',
                toolCallId: `connection-${turnNumber}`,
                state: 'output-available',
                input: {},
                output: {
                  connection_required: {
                    request_id: connectionRequestId,
                    server_id: SERVER_ID,
                    name: names[mode],
                  },
                },
              },
            ];
      history.push(historyRow({ id: replyId, kind: 'ai', text: reply }));
      turns.push({
        turn_id: turnId,
        ui_parts: uiParts,
        message_uuids: [replyId],
      });
      if (handledConnectionRequestId) {
        handledConnectionRequestIds.add(handledConnectionRequestId);
      }

      const wireParts: StreamPart[] =
        connected || continuedWithoutAccess
          ? textParts(reply)
          : [
              ...textParts(reply),
              {
                type: 'tool-input-available',
                toolCallId: `connection-${turnNumber}`,
                toolName: 'account_lookup',
                input: {},
                dynamic: true,
              },
              {
                type: 'tool-output-available',
                toolCallId: `connection-${turnNumber}`,
                output: {
                  connection_required: {
                    request_id: connectionRequestId,
                    server_id: SERVER_ID,
                    name: names[mode],
                  },
                },
                dynamic: true,
              },
            ];
      return stream([
        { type: 'start', messageId: replyId },
        ...wireParts,
        { type: 'finish', finishReason: 'stop' },
        {
          type: 'data-turn-settled',
          data: { turn_id: turnId, message_uuids: [replyId] },
        },
      ]);
    }

    return json(
      { message: `No preview response for ${request.method} ${url.pathname}.` },
      404,
    );
  };
}

export const preview = {
  answers,
  questions,
  storageKeys,
};
