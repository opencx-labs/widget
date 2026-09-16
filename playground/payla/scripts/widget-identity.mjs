/**
 * Dev-only stand-in for Payla's own backend: signs the demo merchant into the
 * widget so per-user connections (Linear, the Payla test lab) work.
 *
 * A real host authenticates its signed-in user first, then makes this same
 * server-to-server call. The OpenCX API key is read from the private file
 * `seed-payla-connections.ts` writes and never reaches the browser; the page
 * receives only a one-hour user token.
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = '/private/tmp/payla-identity.json';

/** The one demo merchant. `account_id` scopes their connections and sessions. */
export const DEMO_MERCHANT = {
  name: 'Mo Haddad',
  email: 'mo@mos-coffee-roasters.example',
  accountId: 'org_payla_demo',
};

function readConfig(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (
    typeof parsed?.apiKey !== 'string' ||
    !Array.isArray(parsed.serverIds) ||
    !parsed.serverIds.every((id) => typeof id === 'string')
  ) {
    throw new Error(`${path} is not a Payla identity config`);
  }
  return { apiKey: parsed.apiKey, serverIds: parsed.serverIds };
}

/** Pure request handler, so it can be tested without a dev server. */
export async function issueWidgetIdentity({
  method,
  host,
  origin,
  env = process.env,
  fetchImpl = fetch,
  logger = console,
}) {
  const hostname = host?.split(':')[0];
  if (
    method !== 'POST' ||
    !['localhost', '127.0.0.1'].includes(hostname) ||
    origin !== `http://${host}`
  ) {
    return {
      status: 403,
      body: { message: 'Open the local Payla demo to sign in.' },
    };
  }
  const configPath = env.PAYLA_IDENTITY_CONFIG?.trim() || DEFAULT_CONFIG;
  const defaults = JSON.parse(
    readFileSync(resolve(here, '../src/lib/demo-defaults.json'), 'utf8'),
  );
  const apiUrl = env.VITE_OPENCX_API_URL?.trim() || defaults.apiUrl;
  try {
    const { apiKey, serverIds } = readConfig(configPath);
    const response = await fetchImpl(
      join(apiUrl, '/widget/authenticate-user').replace(
        /^(https?:\/)([^/])/,
        '$1/$2',
      ),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: DEMO_MERCHANT.name,
          email: DEMO_MERCHANT.email,
          mcp_access: {
            server_ids: serverIds,
            account_id: DEMO_MERCHANT.accountId,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new Error(`authenticate-user returned ${response.status}`);
    }
    const identity = await response.json();
    if (
      typeof identity?.token !== 'string' ||
      typeof identity?.contact?.id !== 'string'
    ) {
      throw new Error('authenticate-user returned an unexpected body');
    }
    return {
      status: 200,
      body: { token: identity.token, externalId: identity.contact.id },
    };
  } catch (error) {
    logger.error('[widget-identity] sign-in failed', {
      _e: error instanceof Error ? error.message : String(error),
      configPath,
      apiUrl,
    });
    return {
      status: 503,
      body: {
        message:
          'Widget sign-in is unavailable. Run seed-payla-connections.ts and start the backend, then reload.',
      },
    };
  }
}

/** Vite plugin mounting the handler at POST /api/widget-identity (dev server only). */
export function widgetIdentity() {
  return {
    name: 'payla-widget-identity',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(
        '/api/widget-identity',
        async (request, response) => {
          const result = await issueWidgetIdentity({
            method: request.method,
            host: request.headers.host,
            origin: request.headers.origin,
          });
          response.statusCode = result.status;
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(result.body));
        },
      );
    },
  };
}
