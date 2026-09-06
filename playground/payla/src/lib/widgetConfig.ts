// Config for the embedded OpenCX widget. The token and backend URL are baked here and
// match the seed (backend/scripts/seed-payla-demo.ts), so a fresh seed + a fresh app
// just work; set VITE_OPENCX_WIDGET_TOKEN / VITE_OPENCX_API_URL to point somewhere else.
//
// There is no agent id: the org IS the agent, and the backend decides whether the
// embed streams. Both demo surfaces (companion dashboard, support popover) share the
// one token and differ only in client-side presentation options.

/** The local widget build, mirrored into public/ by scripts/sync-widget.mjs. */
export const WIDGET_SCRIPT_URL = '/opencx-widget/script.js';

/** What the dashboard companion calls itself. */
export const BOT_NAME = 'Payla Assistant';

const fromEnv = (value: string | undefined, fallback: string) =>
  value?.trim() ? value.trim() : fallback;

export function getWidgetConfig() {
  return {
    token: fromEnv(
      import.meta.env.VITE_OPENCX_WIDGET_TOKEN,
      'payla-companion-demo-token',
    ),
    // Local opencx backend (`pnpm ddev` in the opencx repo).
    apiUrl: fromEnv(
      import.meta.env.VITE_OPENCX_API_URL,
      'http://localhost:8080',
    ),
  };
}
