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

// variant 'companion' (default): binds the seeded companion agent via agentId.
// variant 'support': binds the SCOPED support agent (own identity, help-center
// instructions only, zero actions) — the unbound default agent resolves
// {mode:'all'} on everything and leaked merchant data to the public surface.
// Switching variants requires a full page load (the script boots once), so
// links between the dashboard and /support are hard <a> navigations.
export function CompanionWidget({ variant = "companion" }: { variant?: "companion" | "support" }) {
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const location = useLocation();
  const started = useRef(false);

  useEffect(() => {
    const cfg = getWidgetConfig();
    // Mount once the settings query SETTLES (success OR error) — never block the widget
    // on the DB. If settings failed (e.g. empty DB), just skip the merchant context.
    if (!cfg.token || started.current || settingsLoading) return;
    started.current = true;

    const boot = () =>
      window.initOpenScript?.({
        token: cfg.token,
        ...(variant === "companion" && cfg.agentId ? { agentId: cfg.agentId } : {}),
        // Bound agents default to the companion shell — the public support
        // surface stays the classic popover explicitly.
        ...(variant === "support" && cfg.supportAgentId
          ? { agentId: cfg.supportAgentId, displayMode: "popover" }
          : {}),
        ...(cfg.apiUrl ? { apiUrl: cfg.apiUrl } : {}),
        bot: {
          name: variant === "support" ? "Payla Support" : cfg.botName,
          avatarUrl: variant === "companion" ? "/payla-mark.svg" : null,
        },
        // Payla-branded companion: its own mark instead of the OpenCX face,
        // Payla ink pill, Payla blue accents. The support surface keeps the
        // stock look so the two demos read as different products.
        ...(variant === "companion"
          ? {
              theme: { primaryColor: "#2e50ff" },
              companion: {
                icon: "/payla-mark.svg",
                pillBackground: "#1c1714",
                pillLabel: "Ask Payla…",
                placeholder: "Ask Payla…",
              },
            }
          : {}),
        // Show the element-picker button (mouse-pointer): the visitor can click any
        // element on the Payla page to attach it as context, which the agent can then
        // reason about and highlight back via the highlight_element tool.
        enableElementPicker: true,
        context: {
          app: variant === "support" ? "Payla help center" : "Payla merchant dashboard",
          page: { url: window.location.href, path: location.pathname },
          // Customer-facing support chats must not carry internal merchant context.
          ...(variant === "companion" && settings
            ? { merchant: { id: settings.merchantId, name: settings.merchantName } }
            : {}),
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
  }, [settings, settingsLoading, location.pathname, variant]);

  return null;
}
