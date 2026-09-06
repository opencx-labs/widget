import { widgetCatalog } from './catalog';

/**
 * CODEGEN-ONLY — never import this from widget runtime code. Building the
 * prompt calls `widgetCatalog.prompt({ mode: 'inline' })` at module scope and
 * throws if the generated prompt's layout changed, which must never happen
 * inside the shipped bundle. Only `scripts/generate-ui-prompt.ts` and the
 * catalog spec may import this module; `json-render/index.ts`'s runtime import
 * chain must not reach it.
 */

/**
 * The AVAILABLE COMPONENTS section of the auto-generated catalog prompt —
 * extracted so the slim widget prompt below stays in sync with the catalog
 * (props + descriptions) without shipping the full generated contract.
 */
function extractComponentsSection(): string {
  const fullPrompt = widgetCatalog.prompt({ mode: 'inline' });
  // Match the section heading ("AVAILABLE COMPONENTS (11):"), not the prose
  // mention "the AVAILABLE COMPONENTS list below" that appears earlier.
  const start = fullPrompt.search(/^AVAILABLE COMPONENTS \(/m);
  const end = fullPrompt.indexOf('AVAILABLE ACTIONS');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      'widgetUiPrompt: could not locate the AVAILABLE COMPONENTS section in the generated catalog prompt — the @json-render/core prompt layout changed',
    );
  }
  return fullPrompt.slice(start, end).trimEnd();
}

/**
 * The inline-mode UI prompt for the widget catalog. The agent chat model needs
 * this server-side so it emits ` ```spec ` JSONL the stream can transform; the
 * catalog lives in this package because the renderer that consumes the spec is
 * the widget's React registry. To avoid duplicating the catalog server-side,
 * the resolved prompt is materialized into the opencx backend as a frozen
 * string — run `pnpm -F @opencx/widget-react gen:ui-prompt` after changing the
 * catalog and commit the regenerated
 * `backend/src/agent-engine/ui-prompt.generated.ts`.
 *
 * DELIBERATELY SLIM — display-only contract, all data inline in props.
 * The full `catalog.prompt({ mode: 'inline' })` output (~19KB: state model,
 * repeat, events, watchers, visibility, dynamic props) made the chat model
 * reason for 85s+ before its first token, blowing through the 180s agent chat
 * turn ceiling (`ai_decided_to_not_reply`). None of that machinery applies to
 * the widget's static components, so the prompt documents only: the patch
 * format, the component catalog (extracted from the generated prompt so props
 * and descriptions never drift), and the usage rules. Measured: ~2x faster
 * turns, identical spec quality.
 */
export const widgetUiPrompt: string = `When your answer contains structured data (item collections, tabular data, KPIs, comparisons, charts), render it as an inline UI spec instead of markdown. Write one short lead-in sentence, then a \`\`\`spec fence containing JSONL patch lines (RFC 6902), one JSON object per line:

\`\`\`spec
{"op":"add","path":"/root","value":"main"}
{"op":"add","path":"/elements/main","value":{"type":"Stack","props":{},"children":["chart-1"]}}
{"op":"add","path":"/elements/chart-1","value":{"type":"Chart","props":{"type":"bar","title":"Orders","data":[{"label":"Jan","value":12},{"label":"Feb","value":18}]},"children":[]}}
\`\`\`

Structure: the first patch sets /root to the root element key; each following patch adds /elements/<key> with {type, props, children} (children = array of child element keys; every referenced key must exist as its own /elements patch). ALL data goes inline in props — there is no state model.

${extractComponentsSection()}

RULES:
- Only Card, Stack, and Grid accept children; every other component is a leaf (children: []) that renders its own props data.
- Put ALL rows/items/points inline in the leaf's props: a List of N items is ONE List element with N objects in props.items; a Table is ONE Table element with all rows in props.rows.
- Simple collections (1-2 attributes) → List; 3+ columns → Table; numeric KPIs → Metric cards side-by-side in a Grid (columns=2 or 3); trends/distributions → Chart (line = trend over time, bar = category comparison, pie = share of a total, optional centerLabel for the headline number). One headline number is a Metric, not a chart.
- Keep specs minimal: a bare List/Table/Chart needs no Card wrapper — use Stack as the root; only use Card when a bordered group genuinely helps. This renders in a compact chat widget: Grid columns max 3, use List maxVisible for long collections.
- Data from tools or the knowledge base (a list of items, a count, a KPI, rows) is ALWAYS a spec — never a markdown list, a table in prose, or a bold number in a sentence. Only conversational replies with no data stay text-only.
- When data is rendered in spec components, do not restate it in prose. One short lead-in sentence before the spec, at most one actionable next step after.
- NEVER use emojis in component props.`;
