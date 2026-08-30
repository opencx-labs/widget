import { z } from 'zod';

/**
 * Runtime prop schemas for every json-render component the widget agent can
 * emit, plus a defensive parser. These are the single source of truth: the
 * catalog (`catalog.ts`) feeds them to the model prompt, and the registry
 * (`registry.tsx`) parses streamed props through them before rendering.
 *
 * Optional props use `.nullish()` (null OR absent) rather than `.optional()` so
 * a prop the model omits — or hasn't finished streaming — never fails the parse.
 * Required props that ARE malformed fall back to a typed default (see
 * `parseProps`), so a bad prop degrades one component to a safe empty state
 * instead of throwing and tearing down the whole spec.
 */

// ── Layout / structure ──────────────────────────────────────────────────────

export const cardPropsSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
});

export const stackPropsSchema = z.object({
  direction: z.enum(['row', 'column']).nullish(),
  gap: z.enum(['sm', 'md', 'lg']).nullish(),
  align: z.enum(['start', 'center', 'end', 'stretch']).nullish(),
  justify: z.enum(['start', 'center', 'end', 'between']).nullish(),
});

export const gridPropsSchema = z.object({
  // The prompt's contract is "Grid columns max 3" — this renders in a compact
  // chat widget, so wider grids are rejected at the schema.
  columns: z.number().int().min(1).max(3).nullish(),
  gap: z.enum(['sm', 'md', 'lg']).nullish(),
});

// ── Content ─────────────────────────────────────────────────────────────────

export const headingPropsSchema = z.object({
  text: z.string(),
  level: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .nullish(),
});

export const textPropsSchema = z.object({
  text: z.string(),
  variant: z.enum(['body', 'caption', 'muted', 'code']).nullish(),
});

export const badgePropsSchema = z.object({
  text: z.string(),
  variant: z
    .enum(['default', 'secondary', 'success', 'warning', 'destructive'])
    .nullish(),
});

// ── Data display ────────────────────────────────────────────────────────────

/**
 * Web-linkable protocols. Everything else — `javascript:`, `data:`, `blob:`,
 * `file:`, custom app schemes — is dropped.
 */
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * A link the MODEL authored, so it is untrusted input: a poisoned knowledge-base
 * article or a crafted customer message can put any string here, and the anchor
 * renders inside the host page's realm. An unsafe value degrades to `null` (the
 * item renders as plain text) rather than failing the parse, matching this
 * file's "one bad prop never tears down the spec" contract.
 *
 * `javascript:` is the sharp edge: React 19 refuses it, but this package's peer
 * range still admits React 18, which does not — there it would be script
 * execution in the embedder's origin. Relative URLs are dropped too; they would
 * resolve against whatever page the widget happens to be embedded on, which the
 * model cannot know.
 */
const modelAuthoredHrefSchema = z
  .string()
  .nullish()
  .transform((value) => {
    if (!value) return null;
    try {
      return SAFE_LINK_PROTOCOLS.has(new URL(value).protocol) ? value : null;
    } catch {
      // Not an absolute URL — includes every relative form.
      return null;
    }
  });

export const listItemSchema = z.object({
  id: z.string().nullish(),
  label: z.string(),
  secondary: z.string().nullish(),
  badge: z.string().nullish(),
  status: z.enum(['success', 'warning', 'error', 'info', 'neutral']).nullish(),
  href: modelAuthoredHrefSchema,
});

export const listPropsSchema = z.object({
  items: z.array(listItemSchema),
  /** Show first N items with a "See X more" expand control. Default 10. */
  maxVisible: z.number().int().positive().nullish(),
});

export const tablePropsSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  caption: z.string().nullish(),
});

/** Period-over-period change on a Metric (KPI delta). */
export const metricDeltaSchema = z.object({
  /** Formatted change, e.g. "+4.2 pts" or "-8%". */
  value: z.string(),
  /** Change direction — colours the delta (up=green, down=red, flat=muted). */
  direction: z.enum(['up', 'down', 'flat']),
  /** Comparison context, e.g. "vs previous 30d". */
  label: z.string().nullish(),
});

export const metricPropsSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().nullish(),
  trend: z.enum(['up', 'down', 'neutral']).nullish(),
  delta: metricDeltaSchema.nullish(),
});

export const calloutPropsSchema = z.object({
  type: z.enum(['info', 'tip', 'warning', 'important']).nullish(),
  title: z.string().nullish(),
  content: z.string(),
});

const chartDatumSchema = z.object({
  label: z.string(),
  value: z.number(),
});

export const chartPropsSchema = z.object({
  type: z.enum(['bar', 'line', 'pie']),
  data: z.array(chartDatumSchema),
  title: z.string().nullish(),
  height: z.number().int().positive().nullish(),
  /** Pie only: big number/text shown in the donut hole (e.g. the total). */
  centerLabel: z.string().nullish(),
});

export type ListItem = z.infer<typeof listItemSchema>;
export type MetricDelta = z.infer<typeof metricDeltaSchema>;
export type ChartProps = z.infer<typeof chartPropsSchema>;

/**
 * Parse streamed props against a schema, returning a typed `fallback` on
 * failure instead of throwing. Failures are EXPECTED during streaming (a prop
 * arrives half-formed, then completes on the next patch) and on the occasional
 * model mistake — neither is an error worth surfacing, so we degrade quietly to
 * the fallback and let the next patch re-render. This is the widget's first line
 * of defense: one bad prop can never crash the whole spec render.
 */
export function parseProps<Schema extends z.ZodType>(
  schema: Schema,
  raw: unknown,
  fallback: z.output<Schema>,
): z.output<Schema> {
  const result = schema.safeParse(raw);
  return result.success ? result.data : fallback;
}
