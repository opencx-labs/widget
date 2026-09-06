import { useEffect, useRef } from 'react';
import { useSettings } from '../lib/queries.ts';
import {
  BOT_NAME,
  WIDGET_SCRIPT_URL,
  getWidgetConfig,
} from '../lib/widgetConfig.ts';
import { currentEntity, searchMentions } from '../lib/widgetMentions.ts';
import { WIDGET_CSS_OVERRIDES, WIDGET_INK } from '../lib/widgetTheme.ts';

// Loads the OpenCX Companion widget from the LOCAL build (public/opencx-widget/script.js,
// copied from packages/embed by scripts/sync-widget.mjs — no unpkg), then calls
// initOpenScript({ token, apiUrl, bot, context, ... }).

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
    // Mount once the settings query SETTLES (success OR error) — never block the widget
    // on the DB. If settings failed (e.g. empty DB), just skip the merchant context.
    if (started.current || settingsLoading) return;
    started.current = true;

    const isCompanion = variant === 'companion';
    const { token, apiUrl } = getWidgetConfig();

    const boot = () =>
      window.initOpenScript?.({
        token,
        // Points the widget at the local opencx backend.
        apiUrl,
        // The shell is a client choice: the dashboard assistant is the
        // companion pill, the public support surface the classic popover.
        displayMode: isCompanion ? 'companion' : 'popover',
        bot: isCompanion
          ? { name: BOT_NAME, avatarUrl: '/payla-mark.svg' }
          : { name: 'Payla Support' },
        // Function form: resolved fresh at every send, so the SPA's current
        // page rides along instead of the page the widget booted on.
        context: () => ({
          app: isCompanion ? 'Payla merchant dashboard' : 'Payla help center',
          page: { url: window.location.href, title: document.title },
          // Customer-facing support chats must not carry internal merchant
          // context, nor a "this" pill for a dashboard record.
          ...(isCompanion
            ? {
                // "This": the payment / customer / settlement the page shows.
                // The composer shows it as a removable pill; the agent
                // resolves it.
                entity: currentEntity(window.location.pathname),
                ...(settings
                  ? {
                      merchant: {
                        id: settings.merchantId,
                        name: settings.merchantName,
                      },
                    }
                  : {}),
              }
            : {}),
        }),
        // The support surface keeps the stock look, so the two demos read as
        // different products; everything below is the dashboard companion.
        ...(isCompanion
          ? {
              // Payla-branded companion, restyled after Linear's assistant
              // panel: the Payla mark instead of the OpenCX face, and a
              // monochrome ink accent rather than Payla blue — inside the
              // panel Linear is deliberately colorless, and the brand carries
              // on the mark alone.
              theme: { palette: 'neutral', primaryColor: WIDGET_INK },
              cssOverrides: WIDGET_CSS_OVERRIDES,
              // The header otherwise falls back to the ORG name ("Open"),
              // which reads as a stray OpenCX label on a Payla surface.
              textContent: {
                chatScreen: { headerTitle: BOT_NAME },
                sessionsScreen: { headerTitle: 'Chats' },
              },
              companion: {
                icon: '/payla-mark.svg',
                // No pillBackground: it only tints the built-in animated
                // face's head, and the Payla mark replaces that face. The
                // resting bar itself is the background token either way.
                pillLabel: 'Ask Payla…',
                placeholder: 'Ask Payla…',
                // quickAskTools stays at its default ('history-only'): the
                // resting bar shows history + send, and attach / dictation /
                // the element picker appear once the panel expands — the
                // same resting look as the OpenCX dashboard's own companion.
                // The demo shows off the app-frame: the page shrinks beside
                // the panel instead of sitting under it. The PACKAGE default
                // stays 'floating' on purpose — docking restyles the host's
                // document root and body, which is only safe on a page we own.
                // A visitor's own pick in the layout submenu overrides this.
                sidebar: { mode: 'docked' },
                compact: { maxWidth: 400, minHeight: 440, maxHeight: 560 },
              },
              // "@" in the composer searches the merchant's own payments and
              // customers; a pick rides the send as `clientContext.mentions`.
              mentions: { search: searchMentions },
              // A reload lands back in the conversation that was open.
              router: { restoreLastSession: true },
              // The companion has the copy button by default; keep it visible
              // rather than hover-only so the demo shows it.
              messageActions: { copy: true, display: 'always' },
              // Demo-only debug surface, as in the OpenCX dashboard: each
              // tool step expands to its arguments and result.
              showStepToolIO: true,
            }
          : {}),
      });

    const existing = document.querySelector(
      `script[src="${WIDGET_SCRIPT_URL}"]`,
    );
    if (existing) {
      boot();
      return;
    }
    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_URL;
    script.defer = true;
    script.addEventListener('load', boot);
    document.body.appendChild(script);
  }, [settings, settingsLoading, variant]);

  return null;
}
