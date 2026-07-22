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
  columns: z.number().int().min(1).max(6).nullish(),
  gap: z.enum(['sm', 'md', 'lg']).nullish(),
});

// ── Content ─────────────────────────────────────────────────────────────────

export const headingPropsSchema = z.object({
  text: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullish(),
});

export const textPropsSchema = z.object({
  text: z.string(),
  variant: z.enum(['body', 'caption', 'muted', 'code']).nullish(),
});

export const badgePropsSchema = z.object({
  text: z.string(),
  variant: z.enum(['default', 'secondary', 'success', 'warning', 'destructive']).nullish(),
});

// ── Data display ────────────────────────────────────────────────────────────

export const listItemSchema = z.object({
  id: z.string().nullish(),
  label: z.string(),
  secondary: z.string().nullish(),
  badge: z.string().nullish(),
  status: z.enum(['success', 'warning', 'error', 'info', 'neutral']).nullish(),
  href: z.string().nullish(),
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

/** Period-over-period change on a Metric (KPI delta), companion-identical. */
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

export const chartDatumSchema = z.object({
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

export type CardProps = z.infer<typeof cardPropsSchema>;
export type StackProps = z.infer<typeof stackPropsSchema>;
export type GridProps = z.infer<typeof gridPropsSchema>;
export type HeadingProps = z.infer<typeof headingPropsSchema>;
export type TextProps = z.infer<typeof textPropsSchema>;
export type BadgeProps = z.infer<typeof badgePropsSchema>;
export type ListProps = z.infer<typeof listPropsSchema>;
export type ListItem = z.infer<typeof listItemSchema>;
export type TableProps = z.infer<typeof tablePropsSchema>;
export type MetricProps = z.infer<typeof metricPropsSchema>;
export type MetricDelta = z.infer<typeof metricDeltaSchema>;
export type CalloutProps = z.infer<typeof calloutPropsSchema>;
export type ChartProps = z.infer<typeof chartPropsSchema>;

/**
 * Parse streamed props against a schema, returning a typed `fallback` on
 * failure instead of throwing. Failures are EXPECTED during streaming (a prop
 * arrives half-formed, then completes on the next patch) and on the occasional
 * model mistake — neither is an error worth surfacing, so we degrade quietly to
 * the fallback and let the next patch re-render. This is the widget's first line
 * of defense: one bad prop can never crash the whole spec render.
 */
export function parseProps<T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T {
  const result = schema.safeParse(raw);
  return result.success ? result.data : fallback;
}
