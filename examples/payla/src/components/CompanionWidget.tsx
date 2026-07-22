import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useSettings } from "../lib/queries.ts";
import { getWidgetConfig } from "../lib/widgetConfig.ts";

// Loads the OpenCX Companion widget from the LOCAL build (public/opencx-widget/script.js,
// copied from packages/embed by scripts/sync-widget.mjs — no unpkg), then calls
// initOpenScript({ token, agentId, apiUrl, bot, context }).
//   - apiUrl points the widget at the local opencx backend (default http://localhost:8080).
//   - context (merchant + current page) is forwarded to the agent as clientContext each turn.
// All values come from getWidgetConfig() (localStorage → env → baked default), configurable
// on the Settings page without a rebuild.

declare global {
  interface Window {
    initOpenScript?: (options: Record<string, unknown>) => void;
  }
}

export function CompanionWidget() {
  const { data: settings } = useSettings();
  const location = useLocation();
  const started = useRef(false);

  useEffect(() => {
    const cfg = getWidgetConfig();
    // Wait until settings resolve so the merchant context is populated, then init once.
    if (!cfg.token || started.current || settings === undefined) return;
    started.current = true;

    const boot = () =>
      window.initOpenScript?.({
        token: cfg.token,
        ...(cfg.agentId ? { agentId: cfg.agentId } : {}),
        ...(cfg.apiUrl ? { apiUrl: cfg.apiUrl } : {}),
        bot: { name: cfg.botName, avatarUrl: null },
        context: {
          app: "Payla merchant dashboard",
          page: { url: window.location.href, path: location.pathname },
          merchant: { id: settings.merchantId, name: settings.merchantName },
        },
      });

    const existing = document.querySelector(`script[src="${cfg.scriptUrl}"]`);
    if (existing) {
      boot();
      return;
    }
    const script = document.createElement("script");
    script.src = cfg.scriptUrl;
    script.defer = true;
    script.addEventListener("load", boot);
    document.body.appendChild(script);
  }, [settings, location.pathname]);

  return null;
}
