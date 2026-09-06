import { defineRegistry, type ComponentRenderer } from '@json-render/react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Lightbulb,
  Phone,
  Play,
} from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '../components/lib/utils/cn';
import { useJsonRenderHost } from './host';
import { Chart as ChartView } from './Chart';
import { widgetCatalog } from './catalog';
import {
  badgePropsSchema,
  calloutPropsSchema,
  cardPropsSchema,
  chartPropsSchema,
  gridPropsSchema,
  headingPropsSchema,
  listPropsSchema,
  metricPropsSchema,
  parseProps,
  phoneAgentCardPropsSchema,
  stackPropsSchema,
  tablePropsSchema,
  textPropsSchema,
  type ListItem,
  type MetricDelta,
} from './props';

/**
 * Binds every catalog component to a widget React renderer. Built on the
 * widget's own primitives (tailwind semantic tokens + lucide) — no @open/hoose,
 * tanstack-table, or eager recharts — so the embed stays light. Every render fn
 * re-parses its streamed props through the schema (`parseProps`) so a malformed
 * or half-streamed prop degrades to a safe default instead of throwing.
 *
 * `defineRegistry`'s type checking makes this map exhaustive against the
 * catalog: renderer and catalog can't drift.
 *
 */

const GAP_CLASS = { sm: 'gap-1.5', md: 'gap-3', lg: 'gap-4' } as const;
// The prompt's contract is "Grid columns max 3" (compact chat widget).
/**
 * Narrowest a grid cell may get before the row wraps. A metric card needs
 * about this much for its label, number and caption to stay readable.
 */
const GRID_MIN_COLUMN = '10rem';

/**
 * `columns` is a CEILING, not a promise: the model asks for up to three
 * side-by-side cells, the container decides how many actually fit. Each cell
 * is at least a third/half of the width (so never more columns than asked)
 * and at least `GRID_MIN_COLUMN` (so a 400px compact panel wraps a
 * three-up into two and one). Column count is schema-clamped to 1–3.
 */
function gridColumns(columns: 1 | 2 | 3): string {
  if (columns === 1) return 'minmax(0, 1fr)';
  return `repeat(auto-fit, minmax(max(${GRID_MIN_COLUMN}, calc(100% / ${columns} - 1rem)), 1fr))`;
}

export const { registry } = defineRegistry(widgetCatalog, {
  components: {
    Card: ({ props, children }) => {
      const p = parseProps(cardPropsSchema, props, {});
      return (
        <div className="flex flex-col gap-2 rounded-xl border border-muted-foreground/15 p-3">
          {(p.title || p.description) && (
            <div className="flex flex-col gap-0.5">
              {p.title && (
                <div className="text-sm font-semibold text-foreground">
                  {p.title}
                </div>
              )}
              {p.description && (
                <div className="text-xs text-muted-foreground">
                  {p.description}
                </div>
              )}
            </div>
          )}
          {children}
        </div>
      );
    },

    Stack: ({ props, children }) => {
      const p = parseProps(stackPropsSchema, props, {});
      const align = {
        start: 'items-start',
        center: 'items-center',
        end: 'items-end',
        stretch: 'items-stretch',
      }[p.align ?? 'stretch'];
      const justify = {
        start: 'justify-start',
        center: 'justify-center',
        end: 'justify-end',
        between: 'justify-between',
      }[p.justify ?? 'start'];
      return (
        <div
          className={cn(
            'flex',
            p.direction === 'row' ? 'flex-row' : 'flex-col',
            GAP_CLASS[p.gap ?? 'md'],
            align,
            justify,
          )}
        >
          {children}
        </div>
      );
    },

    Grid: ({ props, children }) => {
      const p = parseProps(gridPropsSchema, props, {});
      return (
        <div
          className={cn('grid', GAP_CLASS[p.gap ?? 'md'])}
          style={{ gridTemplateColumns: gridColumns(p.columns ?? 1) }}
        >
          {children}
        </div>
      );
    },

    Heading: ({ props }) => {
      const p = parseProps(headingPropsSchema, props, { text: '' });
      const level = p.level ?? 3;
      const size =
        {
          1: 'text-xl font-bold',
          2: 'text-lg font-bold',
          3: 'text-base font-semibold',
          4: 'text-sm font-semibold',
        }[level] ?? 'text-base font-semibold';
      return React.createElement(
        `h${level}`,
        { className: cn('text-foreground', size) },
        p.text,
      );
    },

    Text: ({ props }) => {
      const p = parseProps(textPropsSchema, props, { text: '' });
      if (p.variant === 'code') {
        return (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {p.text}
          </code>
        );
      }
      const muted = p.variant === 'muted' || p.variant === 'caption';
      return (
        <p
          className={cn(
            'whitespace-pre-wrap',
            muted ? 'text-xs text-muted-foreground' : 'text-sm text-foreground',
          )}
        >
          {p.text}
        </p>
      );
    },

    Badge: ({ props }) => {
      const p = parseProps(badgePropsSchema, props, { text: '' });
      const variant = {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        destructive: 'bg-destructive/15 text-destructive',
      }[p.variant ?? 'secondary'];
      return (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            variant,
          )}
        >
          {p.text}
        </span>
      );
    },

    List: ({ props }) => {
      const p = parseProps(listPropsSchema, props, { items: [] });
      if (p.items.length === 0) {
        return <EmptyState translationKey="json_no_items" />;
      }
      return <CompactList items={p.items} maxVisible={p.maxVisible} />;
    },

    Table: ({ props }) => {
      const p = parseProps(tablePropsSchema, props, { columns: [], rows: [] });
      if (p.columns.length === 0) {
        return <EmptyState translationKey="json_no_data" />;
      }
      return (
        <div className="overflow-x-auto rounded-lg border border-muted-foreground/15">
          <table className="w-full text-sm">
            {p.caption && (
              <caption className="px-3 py-2 text-start text-xs text-muted-foreground">
                {p.caption}
              </caption>
            )}
            <thead>
              <tr className="border-b border-muted-foreground/15 bg-muted/40">
                {p.columns.map((c, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-start font-medium text-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-b border-muted-foreground/10 last:border-0"
                >
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-muted-foreground">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },

    Metric: ({ props }) => {
      const p = parseProps(metricPropsSchema, props, { label: '', value: '' });
      return (
        <MetricCard
          label={p.label}
          value={p.value}
          description={p.description}
          trend={p.trend}
          delta={p.delta}
        />
      );
    },

    Callout: ({ props }) => {
      const p = parseProps(calloutPropsSchema, props, { content: '' });
      const style = CALLOUT_STYLES[p.type ?? 'info'];
      const Icon = style.Icon;
      return (
        <div className={cn('flex gap-2 rounded-lg border-l-2 p-3', style.cls)}>
          <Icon className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-0.5">
            {p.title && (
              <span className="text-sm font-semibold">{p.title}</span>
            )}
            <span className="text-sm">{p.content}</span>
          </div>
        </div>
      );
    },

    PhoneAgentCard: ({ props }) => {
      const p = parseProps(phoneAgentCardPropsSchema, props, {
        agentId: '',
        agentName: '',
      });
      return <PhoneAgentCard {...p} />;
    },

    Chart: ({ props }) => {
      const p = parseProps(chartPropsSchema, props, { type: 'bar', data: [] });
      return (
        <div className="flex flex-col gap-1">
          {p.title && (
            <span className="text-xs font-medium text-muted-foreground">
              {p.title}
            </span>
          )}
          <ChartView {...p} />
        </div>
      );
    },
  },
});

/** Rendered for any element whose `type` isn't in the registry. */
export const JsonRenderFallback: ComponentRenderer = ({ element }) => {
  const { t } = useJsonRenderHost();
  return (
    <div className="rounded-lg border border-dashed border-muted-foreground/30 px-2 py-1.5 text-xs text-muted-foreground">
      {t('json_unsupported', { type: element.type })}
    </div>
  );
};

const CALLOUT_STYLES = {
  info: { Icon: Info, cls: 'border-l-blue-500 bg-blue-500/5 text-foreground' },
  tip: {
    Icon: Lightbulb,
    cls: 'border-l-emerald-500 bg-emerald-500/5 text-foreground',
  },
  warning: {
    Icon: AlertTriangle,
    cls: 'border-l-amber-500 bg-amber-500/5 text-foreground',
  },
  important: {
    Icon: AlertCircle,
    cls: 'border-l-red-500 bg-red-500/5 text-foreground',
  },
} as const;

function EmptyState({
  translationKey,
}: {
  translationKey: 'json_no_items' | 'json_no_data';
}) {
  const { t } = useJsonRenderHost();
  return (
    <div className="rounded-lg border border-muted-foreground/15 px-3 py-2 text-xs text-muted-foreground">
      {t(translationKey)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhoneAgentCard — tool-built card; the action is the host's to complete
// (`onUiAction`), so without a handler it is a plain summary card.
const TESTABLE_PHONE_AGENT_MODEL = 'oppie-vox-livekit';

function PhoneAgentCard({
  agentId,
  agentName,
  model,
}: {
  agentId: string;
  agentName: string;
  model?: string | null;
}) {
  const { t, onUiAction } = useJsonRenderHost();
  const canTest =
    Boolean(onUiAction) &&
    Boolean(agentId) &&
    model === TESTABLE_PHONE_AGENT_MODEL;
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-muted-foreground/15 p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Phone className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {agentName}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('json_phone_agent')}
          </div>
        </div>
      </div>
      {canTest && (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={() =>
            onUiAction?.({
              type: 'test-phone-agent',
              payload: { agentId, model: model ?? null },
            })
          }
        >
          <Play className="size-4" aria-hidden />
          {t('json_phone_agent_test')}
        </button>
      )}
    </div>
  );
}

// Metric — KPI card (text arrows + delta)
// ---------------------------------------------------------------------------

const TREND_ICONS = {
  up: '\u2191',
  down: '\u2193',
  neutral: '\u2192',
} as const;
const TREND_COLORS = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
} as const;
// KPI delta: direction is the change direction (not good/bad). flat = no change.
const DELTA_ICONS = { up: '\u2191', down: '\u2193', flat: '\u2192' } as const;
const DELTA_COLORS = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  flat: 'text-muted-foreground',
} as const;

function MetricCard({
  label,
  value,
  description,
  trend,
  delta,
}: {
  label: string;
  value: string;
  description?: string | null;
  trend?: 'up' | 'down' | 'neutral' | null;
  delta?: MetricDelta | null;
}) {
  return (
    <div className="min-w-[140px] space-y-1 rounded-xl border border-muted-foreground/15 p-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-medium tracking-tight text-foreground">
          {value}
        </span>
        {trend ? (
          <span className={cn('text-sm font-medium', TREND_COLORS[trend])}>
            {TREND_ICONS[trend]}
          </span>
        ) : null}
      </div>
      {delta ? (
        <div className="flex items-baseline gap-1 text-xs">
          <span className={cn('font-medium', DELTA_COLORS[delta.direction])}>
            {DELTA_ICONS[delta.direction]} {delta.value}
          </span>
          {delta.label ? (
            <span className="text-muted-foreground">{delta.label}</span>
          ) : null}
        </div>
      ) : null}
      {description ? (
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List — compact item list (aligned subgrid columns: badge | label |
// secondary | status, with a "See X more" expander)
// ---------------------------------------------------------------------------

const STATUS_COLORS = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-muted-foreground/40',
} as const;

function ListItemContent({
  item,
  showBadge,
  showSecondary,
  showStatus,
}: {
  item: ListItem;
  showBadge: boolean;
  showSecondary: boolean;
  showStatus: boolean;
}) {
  return (
    <>
      {showBadge &&
        (item.badge ? (
          <span
            className="block min-w-0 truncate text-xs font-medium"
            title={item.badge}
          >
            {item.badge}
          </span>
        ) : (
          <span />
        ))}
      <span className="block min-w-0 truncate" title={item.label}>
        {item.label}
      </span>
      {showSecondary &&
        (item.secondary ? (
          <span
            className="block min-w-0 truncate text-xs text-muted-foreground"
            title={item.secondary}
          >
            {item.secondary}
          </span>
        ) : (
          <span />
        ))}
      {showStatus &&
        (item.status ? (
          <span
            className={cn('size-2 rounded-full', STATUS_COLORS[item.status])}
            aria-hidden
          />
        ) : (
          <span />
        ))}
    </>
  );
}

/**
 * One CSS grid so badge/label/secondary/status columns align across rows
 * (subgrid rows), link rows for `href`, and a "See X more" expander past
 * `maxVisible` (default 10). Dashboard-only affordances (audio preview,
 * send-message actions) are intentionally not carried over.
 */
function CompactList({
  items,
  maxVisible,
}: {
  items: ListItem[];
  maxVisible?: number | null;
}) {
  const limit = maxVisible ?? 10;
  // Same configured link target as RichText anchors — the embed decides where
  // links open (defaulting to the host page's top frame).
  const { anchorTarget, t } = useJsonRenderHost();
  const [expanded, setExpanded] = useState(false);
  const showExpand = items.length > limit;
  const visible = expanded ? items : items.slice(0, limit);

  const hasBadge = visible.some((it) => Boolean(it.badge));
  const hasSecondary = visible.some((it) => Boolean(it.secondary));
  const hasStatus = visible.some((it) => Boolean(it.status));

  const gridCols = [
    hasBadge && 'auto',
    'minmax(0,1fr)',
    hasSecondary && 'minmax(0,2fr)',
    hasStatus && 'auto',
  ]
    .filter(Boolean)
    .join(' ');

  const rowClass =
    'grid min-w-0 grid-cols-[subgrid] col-span-full items-center gap-x-2.5 px-3 py-2 text-sm text-foreground';

  return (
    <div
      className="grid overflow-hidden rounded-lg border border-muted-foreground/15"
      style={{ gridTemplateColumns: gridCols }}
    >
      {visible.map((item, i) => {
        const rowKey = item.id ?? `row-${i}`;
        const content = (
          <ListItemContent
            item={item}
            showBadge={hasBadge}
            showSecondary={hasSecondary}
            showStatus={hasStatus}
          />
        );
        return item.href ? (
          <a
            key={rowKey}
            href={item.href}
            target={anchorTarget || '_top'}
            rel="noopener noreferrer"
            className={cn(
              rowClass,
              'transition-colors hover:bg-muted/50',
              i > 0 && 'border-t border-muted-foreground/10',
            )}
          >
            {content}
          </a>
        ) : (
          <div
            key={rowKey}
            className={cn(
              rowClass,
              i > 0 && 'border-t border-muted-foreground/10',
            )}
          >
            {content}
          </div>
        );
      })}
      {showExpand && (
        <button
          type="button"
          className="col-span-full flex w-full items-center justify-center gap-1 border-t border-muted-foreground/10 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              {t('json_see_less')}
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              {t('json_see_more', { count: items.length - limit })}
            </>
          )}
        </button>
      )}
    </div>
  );
}
