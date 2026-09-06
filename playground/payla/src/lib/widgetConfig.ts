import demoDefaults from './demo-defaults.json';

// Config for the embedded OpenCX widget. The token and backend URL live in
// `demo-defaults.json` — one file, read by the app here and by the `pnpm dev`
// pre-flight (`scripts/check-backend.mjs`), so the two can never disagree
// about what a fresh clone should talk to. The token is the one
// `seed-opencx-companion.ts` writes; set VITE_OPENCX_WIDGET_TOKEN /
// VITE_OPENCX_API_URL to point somewhere else.
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
      demoDefaults.widgetToken,
    ),
    // Local opencx backend (`pnpm ddev` in the opencx repo).
    apiUrl: fromEnv(import.meta.env.VITE_OPENCX_API_URL, demoDefaults.apiUrl),
  };
}
