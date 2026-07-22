// Config for the embedded OpenCX Companion widget — resolved from CODE + build-time env.
// No runtime/localStorage override: the demo's ids are baked here and match the seed
// (backend/scripts/seed-payla-demo.ts). Set VITE_* only if you need to point elsewhere.

export const DEFAULT_TOKEN = "payla-companion-demo-token";
export const DEFAULT_AGENT_ID = "0a71a000-0000-4000-8000-0000000000a2";
export const DEFAULT_API_URL = "http://localhost:8080"; // local opencx backend (pnpm ddev)
export const DEFAULT_SCRIPT_URL = "/opencx-widget/script.js"; // local widget build (scripts/sync-widget.mjs)
export const DEFAULT_BOT_NAME = "Payla Assistant";

export interface WidgetConfig {
  token: string;
  agentId: string;
  apiUrl: string;
  scriptUrl: string;
  botName: string;
}

const val = (env: string | undefined, fallback: string) => (env?.trim() ? env.trim() : fallback);

export function getWidgetConfig(): WidgetConfig {
  return {
    token: val(import.meta.env.VITE_OPENCX_WIDGET_TOKEN, DEFAULT_TOKEN),
    agentId: val(import.meta.env.VITE_OPENCX_AGENT_ID, DEFAULT_AGENT_ID),
    apiUrl: val(import.meta.env.VITE_OPENCX_API_URL, DEFAULT_API_URL),
    scriptUrl: val(import.meta.env.VITE_OPENCX_WIDGET_SRC, DEFAULT_SCRIPT_URL),
    botName: val(import.meta.env.VITE_OPENCX_BOT_NAME, DEFAULT_BOT_NAME),
  };
}

export function isWidgetConfigured(): boolean {
  const c = getWidgetConfig();
  return Boolean(c.token && c.agentId);
}
