import React from 'react';
import { createPortal } from 'react-dom';
import { useHostPortal } from '../companion/useHostPortal';
import { useTheme } from '../hooks/useTheme';
import type { ElementPickerHover } from './useElementPicker';

/**
 * The pick-mode visuals, rendered on the HOST page (not inside the widget
 * iframe): a focus frame + name label over the hovered element, and a
 * top-center hint bar while pick mode is armed.
 *
 * Visual identity: the frame is a dual ring — a white halo separating the
 * page's content from a ring in the widget's own theme `primaryColor` — so
 * the picker inherits each org's brand instead of a hardcoded accent.
 *
 * Inline styles + a tiny injected <style> for keyframes only — host-rendered
 * nodes can't reach the widget's iframe-scoped stylesheet. `pointerEvents:
 * none` everywhere so `elementFromPoint` in the picker hook never hits the
 * overlay itself, and `data-opencx-picker-overlay` marks it widget-owned as a
 * second guard.
 */
export function ElementPickerOverlay({
  isActive,
  hover,
}: {
  isActive: boolean;
  hover: ElementPickerHover | null;
}) {
  const target = useHostPortal();
  const { theme } = useTheme();
  if (!target || !isActive) return null;

  const accent = theme.primaryColor;
  const labelOnTop = hover ? hover.rect.y > 40 : false;

  return createPortal(
    <div data-opencx-picker-overlay="" style={{ pointerEvents: 'none' }}>
      <style>{`
        @keyframes opencx-picker-hint-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes opencx-picker-dot-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-opencx-picker-hint] { animation: none !important; }
          [data-opencx-picker-dot] { animation: none !important; }
        }
      `}</style>

      {/* Hint bar: frosted light pill (the inverse of the page-dimming dark
          bars most annotators use), with a live "armed" dot + esc affordance. */}
      <div
        data-opencx-picker-hint=""
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2147483646,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          color: 'rgba(0, 0, 0, 0.85)',
          font: '500 12px/1.4 system-ui, sans-serif',
          padding: '7px 12px 7px 10px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
          boxShadow:
            '0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.12)',
          animation: 'opencx-picker-hint-in 200ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <span
          data-opencx-picker-dot=""
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: accent,
            animation: 'opencx-picker-dot-pulse 1.6s ease-in-out infinite',
          }}
        />
        Select an element to attach
        <span
          style={{
            font: '600 10px/1 system-ui, sans-serif',
            color: 'rgba(0, 0, 0, 0.55)',
            background: 'rgba(0, 0, 0, 0.06)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: 5,
            padding: '3px 5px 2px',
          }}
        >
          esc
        </span>
      </div>

      {hover && (
        <div
          style={{
            position: 'fixed',
            left: hover.rect.x - 4,
            top: hover.rect.y - 4,
            width: hover.rect.width + 8,
            height: hover.rect.height + 8,
            zIndex: 2147483646,
            borderRadius: 10,
            // Dual ring: white halo lifts the frame off any background, then
            // the brand ring. No colored fill — the content stays legible.
            boxShadow: `0 0 0 2px rgba(255, 255, 255, 0.95), 0 0 0 3.5px ${accent}, 0 12px 32px rgba(0, 0, 0, 0.14)`,
            transitionProperty: 'left, top, width, height',
            transitionDuration: '90ms',
            transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              ...(labelOnTop
                ? { bottom: '100%', marginBottom: 8 }
                : { top: '100%', marginTop: 8 }),
              left: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: 'rgba(0, 0, 0, 0.85)',
              font: '500 11px/1.4 system-ui, sans-serif',
              padding: '4px 10px 4px 8px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              maxWidth: 320,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              boxShadow:
                '0 0 0 1px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.12)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: accent,
                flexShrink: 0,
              }}
            />
            {hover.name}
          </div>
        </div>
      )}
    </div>,
    target,
  );
}
