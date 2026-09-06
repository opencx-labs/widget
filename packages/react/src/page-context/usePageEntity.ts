import {
  resolveConfigContext,
  type WidgetPageContext,
} from '@opencx/widget-core';
import { useConfig, useWidget } from '@opencx/widget-react-headless';
import { z } from 'zod';

const entitySchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type PageEntity = NonNullable<WidgetPageContext['entity']>;

/**
 * The entity the host says the visitor is looking at, read the same way the
 * send reads it (`resolveConfigContext`, so a function-form `context` is
 * live). Null when the host set none or set something malformed — the pill
 * simply does not show, and the send still carries whatever the host sent.
 * Also null when page context is off for this embed (org feature narrowed
 * by `config.features.pageContext`): the agent will not read the page, so
 * the pill must not promise it.
 */
export function usePageEntity(): PageEntity | null {
  const config = useConfig();
  const { widgetCtx } = useWidget();
  if (!widgetCtx.features.pageContext) return null;
  const parsed = entitySchema.safeParse(
    resolveConfigContext(config)?.['entity'],
  );
  return parsed.success ? parsed.data : null;
}
