import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, mergeConfig } from 'vite';
import type { Plugin } from 'vite';
import { z } from 'zod';
import base from './vite.config';

// Local customer-backend example. The org API key never enters the client bundle.
const config = z
  .object({
    apiKey: z.string(),
    widgetToken: z.string(),
    serverId: z.string().uuid(),
  })
  .parse(
    JSON.parse(
      readFileSync(
        process.env.OPENCX_CONNECTIONS_DEMO_CONFIG ??
          '/private/tmp/opencx-linear-demo.json',
        'utf8',
      ),
    ),
  );
const identity = z.object({
  token: z.string(),
  contact: z.object({ id: z.string() }),
});
const signature = (value: string) =>
  createHmac('sha256', config.apiKey).update(value).digest('hex');
export default defineConfig(
  mergeConfig(base, {
    plugins: [
      {
        name: 'local-connection-identity',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use(
            '/connections-live/session',
            async (request, response) => {
              response.setHeader('Cache-Control', 'no-store');
              response.setHeader('Content-Type', 'application/json');
              const host = request.headers.host;
              if (
                !['localhost:3017', '127.0.0.1:3017'].includes(host ?? '') ||
                request.method !== 'POST' ||
                request.headers.origin !== `http://${host}` ||
                request.headers['x-opencx-demo'] !== '1'
              ) {
                response.statusCode = 403;
                response.end(
                  JSON.stringify({ message: 'Open this demo on localhost.' }),
                );
                return;
              }
              try {
                const cookie = request.headers.cookie?.match(
                  /(?:^|;\s*)opencx_linear_demo=([a-f0-9]{64})\.([a-f0-9]{64})(?:;|$)/,
                );
                const suppliedId = cookie?.[1];
                const suppliedSignature = cookie?.[2];
                const sessionId =
                  suppliedId &&
                  suppliedSignature &&
                  timingSafeEqual(
                    Buffer.from(signature(suppliedId), 'hex'),
                    Buffer.from(suppliedSignature, 'hex'),
                  )
                    ? suppliedId
                    : randomBytes(32).toString('hex');
                const upstream = await fetch(
                  'http://127.0.0.1:8080/widget/authenticate-user',
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${config.apiKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      name: 'Local user',
                      email: `linear-${sessionId}@example.invalid`,
                      mcp_access: {
                        server_ids: [config.serverId],
                        account_id: 'local-linear-demo',
                      },
                    }),
                    signal: AbortSignal.timeout(15_000),
                  },
                );
                if (!upstream.ok)
                  throw new Error(
                    `Identity endpoint returned ${upstream.status}`,
                  );
                const result = identity.parse(await upstream.json());
                response.setHeader(
                  'Set-Cookie',
                  `opencx_linear_demo=${sessionId}.${signature(sessionId)}; HttpOnly; SameSite=Strict; Path=/connections-live; Max-Age=86400`,
                );
                response.end(
                  JSON.stringify({
                    widgetToken: config.widgetToken,
                    userToken: result.token,
                    externalId: result.contact.id,
                  }),
                );
              } catch {
                response.statusCode = 503;
                response.end(
                  JSON.stringify({
                    message:
                      'The local backend is unavailable. Try again after it starts.',
                  }),
                );
              }
            },
          );
        },
      } satisfies Plugin,
    ],
    server: {
      host: '127.0.0.1',
      port: 3017,
      strictPort: true,
      proxy: {
        '/backend': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      },
    },
  }),
);
