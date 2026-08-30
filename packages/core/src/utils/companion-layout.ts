import type { WidgetCompanionLayoutU } from '../types/widget-config';

export const DEFAULT_COMPANION_LAYOUTS = [
  'compact',
  'sidebar',
  'fullscreen',
] as const satisfies readonly WidgetCompanionLayoutU[];

const COMPANION_LAYOUTS = new Set<WidgetCompanionLayoutU>(
  DEFAULT_COMPANION_LAYOUTS,
);

function isCompanionLayout(value: unknown): value is WidgetCompanionLayoutU {
  return COMPANION_LAYOUTS.has(value as WidgetCompanionLayoutU);
}

/**
 * Resolve the layouts available to the companion. Configured order is part of
 * the public contract, so it is preserved while duplicates and invalid runtime
 * values are discarded. An omitted or unusable list falls back to every
 * layout, keeping the result non-empty for all consumers.
 */
export function normalizeCompanionLayouts(
  layouts?: unknown,
): readonly WidgetCompanionLayoutU[] {
  if (!Array.isArray(layouts)) return DEFAULT_COMPANION_LAYOUTS;

  const normalized: WidgetCompanionLayoutU[] = [];
  const seen = new Set<WidgetCompanionLayoutU>();
  for (const layout of layouts) {
    if (!isCompanionLayout(layout) || seen.has(layout)) continue;
    seen.add(layout);
    normalized.push(layout);
  }

  return normalized.length > 0 ? normalized : DEFAULT_COMPANION_LAYOUTS;
}

/** Choose an allowed initial/fallback layout for the companion shell. */
export function resolveCompanionDefaultLayout(
  configuredDefault: unknown,
  allowedLayouts: readonly WidgetCompanionLayoutU[],
): WidgetCompanionLayoutU {
  if (
    isCompanionLayout(configuredDefault) &&
    allowedLayouts.includes(configuredDefault)
  ) {
    return configuredDefault;
  }
  return allowedLayouts[0] ?? DEFAULT_COMPANION_LAYOUTS[0];
}
