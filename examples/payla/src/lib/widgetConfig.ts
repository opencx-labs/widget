// Runtime config for the embedded OpenCX Companion widget.
//
// Resolution order (first non-empty wins): localStorage → VITE_* env → baked default.
// The baked defaults match what scripts/seed-payla-demo.ts (in the opencx repo) creates,
// so a freshly-seeded local opencx + this app work with ZERO configuration. The Settings
// page can override any value at runtime (saved to localStorage) — no rebuild needed.
//
// ⚠ Keep DEFAULT_TOKEN / DEFAULT_AGENT_ID in sync with the seed script's
//   PAYLA_ORG_TOKEN / PAYLA_AGENT_ID constants.

export const DEFAULT_TOKEN = "payla-companion-demo-token";
export const DEFAULT_AGENT_ID = "0a71a000-0000-4000-8000-0000000000a2";
export const DEFAULT_API_URL = "http://localhost:8080"; // local opencx backend (pnpm ddev)
export const DEFAULT_SCRIPT_URL = "/opencx-widget/script.js"; // local widget build (see scripts/sync-widget.mjs)
export const DEFAULT_BOT_NAME = "Payla Assistant";

export const WIDGET_CONFIG_CHANGED = "payla:opencx:config-changed";

const KEYS = {
  token: "payla:opencx:token",
  agentId: "payla:opencx:agentId",
  apiUrl: "payla:opencx:apiUrl",
  scriptUrl: "payla:opencx:scriptUrl",
  botName: "payla:opencx:botName",
} as const;

export interface WidgetConfig {
  token: string;
  agentId: string;
  apiUrl: string;
  scriptUrl: string;
  botName: string;
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

const pick = (stored: string, env: string | undefined, fallback: string) =>
  stored || (env ?? "") || fallback;

/** Resolved config: localStorage → env → baked default. */
export function getWidgetConfig(): WidgetConfig {
  return {
    token: pick(read(KEYS.token), import.meta.env.VITE_OPENCX_WIDGET_TOKEN, DEFAULT_TOKEN),
    agentId: pick(read(KEYS.agentId), import.meta.env.VITE_OPENCX_AGENT_ID, DEFAULT_AGENT_ID),
    apiUrl: pick(read(KEYS.apiUrl), import.meta.env.VITE_OPENCX_API_URL, DEFAULT_API_URL),
    scriptUrl: pick(read(KEYS.scriptUrl), import.meta.env.VITE_OPENCX_WIDGET_SRC, DEFAULT_SCRIPT_URL),
    botName: pick(read(KEYS.botName), import.meta.env.VITE_OPENCX_BOT_NAME, DEFAULT_BOT_NAME),
  };
}

export function isWidgetConfigured(): boolean {
  const c = getWidgetConfig();
  return Boolean(c.token && c.agentId);
}

/** Persist overrides. A value equal to its default is cleared so the default keeps flowing. */
export function saveWidgetConfig(input: WidgetConfig): void {
  try {
    const set = (key: string, value: string, dflt: string) => {
      const v = value.trim();
      if (v && v !== dflt) localStorage.setItem(key, v);
      else localStorage.removeItem(key);
    };
    set(KEYS.token, input.token, DEFAULT_TOKEN);
    set(KEYS.agentId, input.agentId, DEFAULT_AGENT_ID);
    set(KEYS.apiUrl, input.apiUrl, DEFAULT_API_URL);
    set(KEYS.scriptUrl, input.scriptUrl, DEFAULT_SCRIPT_URL);
    set(KEYS.botName, input.botName, DEFAULT_BOT_NAME);
    window.dispatchEvent(new Event(WIDGET_CONFIG_CHANGED));
  } catch {
    // localStorage unavailable — nothing to do in this environment.
  }
}

export function clearWidgetConfig(): void {
  try {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    window.dispatchEvent(new Event(WIDGET_CONFIG_CHANGED));
  } catch {
    // ignore
  }
}
