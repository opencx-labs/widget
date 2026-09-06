import { useEffect, useRef } from 'react';
import { useSettings } from '../lib/queries.ts';
import { getWidgetConfig } from '../lib/widgetConfig.ts';
import {
  WIDGET_CSS_OVERRIDES,
  WIDGET_INK,
  WIDGET_PANEL_RADIUS,
} from '../lib/widgetTheme.ts';

// Loads the OpenCX Companion widget from the LOCAL build (public/opencx-widget/script.js,
// copied from packages/embed by scripts/sync-widget.mjs — no unpkg), then calls
// initOpenScript({ token, apiUrl, bot, context, ... }).
//   - apiUrl points the widget at the local opencx backend (default http://localhost:8080).
//   - context (merchant + current page) is resolved at every send and forwarded to the
//     agent as clientContext.
// All values come from getWidgetConfig() (env → baked default).

declare global {
  interface Window {
    initOpenScript?: (options: Record<string, unknown>) => void;
  }
}

// The org IS the agent — there is no agent id, and the BACKEND decides whether
// the embed streams. Both variants use the same token and differ only in
// client-side presentation:
//   - 'companion' (default): the merchant-dashboard assistant —
//     `displayMode: 'companion'` + page marks + merchant context.
//   - 'support': the public help-center surface — the classic popover, no
//     merchant context (customer-facing chats must not carry internal data).
// Switching variants requires a full page load (the script boots once), so
// links between the dashboard and /support are hard <a> navigations.
export function CompanionWidget({
  variant = 'companion',
}: {
  variant?: 'companion' | 'support';
}) {
  const { data: settings, isLoading: settingsLoading } = useSettings();
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
        // The shell is a client choice: the dashboard assistant is the
        // companion pill, the public support surface the classic popover.
        displayMode: variant === 'companion' ? 'companion' : 'popover',
        ...(cfg.apiUrl ? { apiUrl: cfg.apiUrl } : {}),
        bot: {
          name: variant === 'support' ? 'Payla Support' : cfg.botName,
          avatarUrl: variant === 'companion' ? '/payla-mark.svg' : null,
        },
        // Payla-branded companion, restyled after Linear's assistant panel:
        // the Payla mark instead of the OpenCX face, and a monochrome ink
        // accent rather than Payla blue — inside the panel Linear is
        // deliberately colorless, and the brand carries on the mark alone.
        // The support surface keeps the stock look so the two demos read as
        // different products.
        ...(variant === 'companion'
          ? {
              theme: { palette: 'neutral', primaryColor: WIDGET_INK },
              cssOverrides: WIDGET_CSS_OVERRIDES,
              // The header otherwise falls back to the ORG name ("Open"),
              // which reads as a stray OpenCX label on a Payla surface.
              textContent: {
                chatScreen: { headerTitle: 'Payla Assistant' },
                sessionsScreen: { headerTitle: 'Chats' },
              },
              companion: {
                icon: '/payla-mark.svg',
                // No pillBackground: it only tints the built-in animated
                // face's head, and the Payla mark replaces that face. The
                // resting bar itself is the background token either way.
                pillLabel: 'Ask Payla…',
                placeholder: 'Ask Payla…',
                // Linear keeps its tools on the resting bar too; the stock
                // default ('history-only') hides attach + the element picker
                // until the panel expands.
                quickAskTools: 'all',
                // The demo shows off the app-frame: the page shrinks beside
                // the panel instead of sitting under it. The PACKAGE default
                // stays 'floating' on purpose — docking restyles the host's
                // document root and body, which is only safe on a page we own.
                // A visitor's own pick in the layout submenu overrides this.
                sidebar: { mode: 'docked' },
                compact: {
                  maxWidth: 400,
                  minHeight: 440,
                  maxHeight: 560,
                  borderRadius: WIDGET_PANEL_RADIUS,
                },
              },
            }
          : {}),
        // Element picker + agent highlights. `enablePageMarks` is the real
        // option name — this demo used to pass `enableElementPicker`, which
        // the widget ignores, so the composer button never appeared AND
        // `highlight_element` silently no-op'd (AgentChatPageEffects bails
        // when the flag is off) while the agent still claimed it highlighted.
        // The visitor can click any element on the Payla page to attach it as
        // context; the agent reasons about it and can point back at it.
        enablePageMarks: true,
        // Function form: resolved fresh at every send, so the SPA's current
        // page rides along instead of the page the widget booted on.
        context: () => ({
          app:
            variant === 'support'
              ? 'Payla help center'
              : 'Payla merchant dashboard',
          page: {
            url: window.location.href,
            title: document.title,
          },
          // Customer-facing support chats must not carry internal merchant context.
          ...(variant === 'companion' && settings
            ? {
                merchant: {
                  id: settings.merchantId,
                  name: settings.merchantName,
                },
              }
            : {}),
        }),
      });

    const existing = document.querySelector(`script[src="${cfg.scriptUrl}"]`);
    if (existing) {
      boot();
      return;
    }
    const script = document.createElement('script');
    script.src = cfg.scriptUrl;
    script.defer = true;
    script.addEventListener('load', boot);
    document.body.appendChild(script);
  }, [settings, settingsLoading, variant]);

  return null;
}
