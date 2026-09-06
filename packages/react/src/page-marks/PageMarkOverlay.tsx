import type { TranslationKeyU } from '@opencx/widget-core';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHostPortal } from '../companion/useHostPortal';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import { MARK_SHAPES, type MarkShape } from './page-mark';
import { resolvePageMarkTheme, type PageMarkTheme } from './page-mark-theme';
import type { MarkDraft, MarkHover } from './usePageMarking';

/**
 * Mark-mode visuals, rendered on the HOST page: a hint bar while armed, a
 * hover frame over the element under the cursor, and — once a mark is placed
 * — its editor: corner handles showing where to grab, plus one card carrying
 * the shape palette and the note. The mark itself is notation ink anchored in
 * page coordinates, so it scrolls with the content.
 *
 * Everything here is pointer-inert except the editor card: the gestures live
 * on the host document (see `usePageMarking`), and an overlay that swallowed
 * pointer events would blind them.
 */
export function PageMarkOverlay({
  isActive,
  draft,
  hover,
  onShapeChange,
  onAttach,
  onDiscard,
}: {
  isActive: boolean;
  draft: MarkDraft | null;
  hover: MarkHover | null;
  onShapeChange: (shape: MarkShape) => void;
  onAttach: (note: string) => void;
  onDiscard: () => void;
}) {
  const target = useHostPortal();
  const { theme, cssVars } = useTheme();
  const { t } = useTranslation();
  if (!target || !isActive) return null;

  const markTheme = resolvePageMarkTheme({
    cssVars,
    primaryColor: theme.primaryColor,
    contentZIndex: theme.widgetContentContainer.zIndex,
  });
  const { accent } = markTheme;

  return createPortal(
    <div data-opencx-overlay="" style={{ pointerEvents: 'none' }}>
      <style>{`
        @keyframes opencx-mark-hint-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes opencx-mark-editor-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes opencx-mark-frame-in {
          from { opacity: 0; transform: scale(1.015); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-opencx-mark-hint], [data-opencx-mark-editor],
          [data-opencx-mark-frame] { animation: none !important; }
        }
      `}</style>

      {!draft && (
        <>
          <div
            data-opencx-mark-hint=""
            style={{
              position: 'fixed',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: markTheme.chromeZIndex,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: `color-mix(in srgb, ${markTheme.surface} 92%, transparent)`,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: markTheme.foreground,
              font: '500 12px/1.4 system-ui, sans-serif',
              padding: '7px 12px 7px 10px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              boxShadow: `0 0 0 1px ${markTheme.border}, 0 8px 24px color-mix(in srgb, ${markTheme.foreground} 14%, transparent)`,
              animation:
                'opencx-mark-hint-in 200ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: accent,
              }}
            />
            {t('page_mark_hint')}
            <KeyCap theme={markTheme}>{t('page_mark_escape')}</KeyCap>
          </div>

          {/* Hover frame, keyed per hovered ELEMENT so switching targets
              remounts crisply instead of morph-tweening across the screen. */}
          {hover && (
            <div
              key={hover.key}
              data-opencx-mark-frame=""
              style={{
                position: 'fixed',
                left: hover.rect.x - 4,
                top: hover.rect.y - 4,
                width: hover.rect.width + 8,
                height: hover.rect.height + 8,
                zIndex: markTheme.chromeZIndex,
                borderRadius: 10,
                boxShadow: `0 0 0 2px ${markTheme.surface}, 0 0 0 3.5px ${accent}, 0 12px 32px color-mix(in srgb, ${markTheme.foreground} 16%, transparent)`,
                animation:
                  'opencx-mark-frame-in 140ms cubic-bezier(0.23, 1, 0.32, 1)',
                transitionProperty: 'left, top, width, height',
                transitionDuration: '90ms',
                transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
                pointerEvents: 'none',
              }}
            />
          )}
        </>
      )}

      {draft && (
        <>
          {/* Corner handles — affordance only; the grab logic hit-tests the
              same corners on the host document, and the cursor changes there. */}
          {(
            [
              [draft.rect.x, draft.rect.y],
              [draft.rect.x + draft.rect.width, draft.rect.y],
              [draft.rect.x, draft.rect.y + draft.rect.height],
              [
                draft.rect.x + draft.rect.width,
                draft.rect.y + draft.rect.height,
              ],
            ] as const
          ).map(([x, y], i) => (
            <div
              key={i}
              style={{
                position: 'fixed',
                left: x - 5,
                top: y - 5,
                width: 10,
                height: 10,
                borderRadius: 999,
                background: markTheme.surface,
                boxShadow: `0 0 0 2px ${accent}, 0 2px 6px color-mix(in srgb, ${markTheme.foreground} 25%, transparent)`,
                zIndex: markTheme.chromeZIndex,
                pointerEvents: 'none',
              }}
            />
          ))}
          <MarkEditorCard
            key="editor"
            draft={draft}
            theme={markTheme}
            onShapeChange={onShapeChange}
            onAttach={onAttach}
            onDiscard={onDiscard}
          />
        </>
      )}
    </div>,
    target,
  );
}

function KeyCap({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: PageMarkTheme;
}) {
  return (
    <span
      style={{
        font: '600 10px/1 system-ui, sans-serif',
        color: theme.mutedForeground,
        background: `color-mix(in srgb, ${theme.foreground} 7%, transparent)`,
        border: `1px solid ${theme.border}`,
        borderRadius: 5,
        padding: '3px 5px 2px',
      }}
    >
      {children}
    </span>
  );
}

/**
 * Each shape as the mark it makes, drawn rather than lettered — a palette of
 * glyphs reads at a glance where eight text labels would not.
 */
const SHAPE_GLYPH: Record<MarkShape, React.ReactNode> = {
  box: <rect x="3" y="5" width="14" height="10" rx="1" />,
  circle: <ellipse cx="10" cy="10" rx="7" ry="5.5" />,
  arrow: (
    <>
      <path d="M3 10h13" />
      <path d="M12 6l4 4-4 4" />
    </>
  ),
  bracket: <path d="M7 4H4v12h3" />,
  underline: (
    <>
      <path d="M5 8h10" opacity="0.35" />
      <path d="M4 14h12" />
    </>
  ),
  highlight: (
    <>
      <rect
        x="3"
        y="7"
        width="14"
        height="6"
        rx="1"
        fill="currentColor"
        opacity="0.3"
        stroke="none"
      />
      <path d="M5 10h10" />
    </>
  ),
  'strike-through': (
    <>
      <path d="M6 6h8" opacity="0.35" />
      <path d="M6 14h8" opacity="0.35" />
      <path d="M4 10h12" />
    </>
  ),
  'crossed-off': (
    <>
      <path d="M4 5l12 10" />
      <path d="M16 5L4 15" />
    </>
  ),
};

const SHAPE_LABEL_KEY = {
  box: 'page_mark_shape_box',
  circle: 'page_mark_shape_circle',
  arrow: 'page_mark_shape_arrow',
  bracket: 'page_mark_shape_bracket',
  underline: 'page_mark_shape_underline',
  highlight: 'page_mark_shape_highlight',
  'strike-through': 'page_mark_shape_strike_through',
  'crossed-off': 'page_mark_shape_crossed_off',
} as const satisfies Record<MarkShape, TranslationKeyU>;

/**
 * The editor card: the shape palette on top, the note below. Anchored under
 * the mark (clamped into the viewport) and following it as it moves. Enter
 * attaches — with or without a note — Esc discards the mark. The overlay root
 * is pointer-inert, so the card re-enables pointer events for itself only.
 */
function MarkEditorCard({
  draft,
  theme,
  onShapeChange,
  onAttach,
  onDiscard,
}: {
  draft: MarkDraft;
  theme: PageMarkTheme;
  onShapeChange: (shape: MarkShape) => void;
  onAttach: (note: string) => void;
  onDiscard: () => void;
}) {
  const { accent } = theme;
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const CARD_W = 320;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { rect } = draft;
  const left = Math.max(
    12,
    Math.min(rect.x + rect.width / 2 - CARD_W / 2, vw - CARD_W - 12),
  );
  const below = rect.y + rect.height + 16;
  const top = below + 120 > vh ? Math.max(12, rect.y - 116) : below;

  return (
    <div
      data-opencx-mark-editor=""
      style={{
        position: 'fixed',
        left,
        top,
        width: CARD_W,
        zIndex: theme.editorZIndex,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: `color-mix(in srgb, ${theme.surface} 96%, transparent)`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: 8,
        borderRadius: 14,
        boxShadow: `0 0 0 1px ${theme.border}, 0 12px 32px color-mix(in srgb, ${theme.foreground} 18%, transparent)`,
        animation: 'opencx-mark-editor-in 180ms cubic-bezier(0.23, 1, 0.32, 1)',
      }}
    >
      <div style={{ display: 'flex', gap: 2, justifyContent: 'space-between' }}>
        {MARK_SHAPES.map((shape) => {
          const selected = shape === draft.shape;
          const shapeLabel = t(SHAPE_LABEL_KEY[shape]);
          return (
            <button
              key={shape}
              type="button"
              title={shapeLabel}
              aria-label={t('page_mark_shape_aria', { shape: shapeLabel })}
              aria-pressed={selected}
              onClick={() => onShapeChange(shape)}
              style={{
                border: 'none',
                cursor: 'pointer',
                borderRadius: 8,
                width: 32,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: selected ? accent : 'transparent',
                color: selected ? theme.surface : theme.mutedForeground,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {SHAPE_GLYPH[shape]}
              </svg>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          ref={inputRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAttach(note);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onDiscard();
            }
          }}
          placeholder={t('page_mark_note_placeholder')}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: theme.foreground,
            font: '500 13px/1.4 system-ui, sans-serif',
            paddingInlineStart: 4,
          }}
        />
        <button
          type="button"
          aria-label={t('page_mark_attach')}
          onClick={() => onAttach(note)}
          style={{
            border: 'none',
            borderRadius: 999,
            width: 26,
            height: 26,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: accent,
            color: theme.surface,
            font: '600 13px/1 system-ui, sans-serif',
            cursor: 'pointer',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
