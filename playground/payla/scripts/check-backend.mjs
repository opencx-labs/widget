/**
 * Pre-flight for `pnpm dev`: is the OpenCX backend up, and does the demo's
 * widget token belong to a seeded org?
 *
 * The widget fails quietly by design — a bad token renders nothing rather
 * than breaking the host page — so without this check a dev who skipped a
 * seed step sees a dashboard with no assistant and no reason why. Warns and
 * exits 0 in every case: the mock dashboard is worth running on its own, and
 * a dev-server start must not hang on a backend that was never meant to be up.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Same defaults the app itself falls back to (`src/lib/widgetConfig.ts`). */
function demoDefaults() {
  const path = resolve(here, '../src/lib/demo-defaults.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export async function checkBackend({
  fetchImpl = fetch,
  env = process.env,
  logger = console,
  timeoutMs = 3000,
} = {}) {
  const defaults = demoDefaults();
  const token = env.VITE_OPENCX_WIDGET_TOKEN?.trim() || defaults.widgetToken;
  const apiUrl = env.VITE_OPENCX_API_URL?.trim() || defaults.apiUrl;
  const url = join(apiUrl, '/backend/widget/v2/config').replace(
    /^(https?:\/)([^/])/,
    '$1/$2',
  );

  let status;
  try {
    const response = await fetchImpl(url, {
      headers: { 'X-Bot-Token': token },
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = response.status;
  } catch {
    logger.warn(
      `[check-backend] ⚠ no OpenCX backend at ${apiUrl}. The dashboard runs; the assistant will not appear.`,
    );
    logger.warn(`[check-backend]   Start it: cd opencx/backend && pnpm ddev`);
    return false;
  }

  if (status === 200) return true;

  if (status === 401 || status === 404) {
    logger.warn(
      `[check-backend] ⚠ the backend does not know the widget token "${token}".`,
    );
    logger.warn(
      `[check-backend]   Seed the org, in this order (from opencx/backend):`,
    );
    logger.warn(
      `[check-backend]     NODE_ENV=test bun scripts/seed-opencx-companion.ts   # creates the org + this token`,
    );
    logger.warn(
      `[check-backend]     NODE_ENV=test bun scripts/seed-payla-demo.ts         # makes it Payla (persona + KB)`,
    );
    logger.warn(
      `[check-backend]     NODE_ENV=test bun scripts/seed-payla-actions.ts      # the HTTP actions`,
    );
    return false;
  }

  logger.warn(
    `[check-backend] ⚠ ${apiUrl} answered ${status} for the widget config; the assistant may not load.`,
  );
  return false;
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) await checkBackend();
