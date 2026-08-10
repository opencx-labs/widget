import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import {
  badgePropsSchema,
  calloutPropsSchema,
  cardPropsSchema,
  chartPropsSchema,
  gridPropsSchema,
  headingPropsSchema,
  listPropsSchema,
  metricPropsSchema,
  stackPropsSchema,
  tablePropsSchema,
  textPropsSchema,
} from './props';

/**
 * The widget's json-render catalog — the closed set of components the agent may
 * emit. It is the single source of truth in two directions: `registry.tsx`
 * binds each name to a React renderer, and the backend prompt is generated from
 * this same catalog (`catalog.prompt({ mode: 'inline' })`), so the model can
 * never emit a component the widget can't render.
 *
 * Kept deliberately small and embed-light (no per-org customization in v1):
 * layout primitives + list / table / metric / callout / chart. `description`
 * and `example` are the model's only guidance — they steer generation, so keep
 * them tight.
 */
export const widgetCatalog = defineCatalog(schema, {
  components: {
    Card: {
      props: cardPropsSchema,
      slots: ['default'],
      description: 'Container card with an optional title/description. Group related content.',
      example: { title: 'Order summary', description: 'Placed 2 days ago' },
    },
    Stack: {
      props: stackPropsSchema,
      slots: ['default'],
      description: 'Flex layout. Use direction="row" for side-by-side, "column" (default) to stack.',
    },
    Grid: {
      props: gridPropsSchema,
      slots: ['default'],
      description: 'Responsive column grid. Use columns=2/3 for side-by-side metrics or cards.',
    },
    Heading: {
      props: headingPropsSchema,
      description: 'Section heading. level 1 (largest) to 4.',
      example: { text: 'Your orders', level: 3 },
    },
    Text: {
      props: textPropsSchema,
      description: 'A paragraph of text. variant "muted"/"caption" for secondary text, "code" for monospace.',
    },
    Badge: {
      props: badgePropsSchema,
      description: 'Small status pill. Use variant to convey state (success/warning/destructive).',
      example: { text: 'Delivered', variant: 'success' },
    },
    List: {
      props: listPropsSchema,
      description:
        'A vertical list of items, each with a label and optional secondary text, badge, and status dot. Pass the full array in `items` — do NOT use repeat/state for the rows.',
      example: {
        items: [
          { label: 'Order #1024', secondary: 'Shipped', status: 'success' },
          { label: 'Order #1025', secondary: 'Processing', status: 'warning' },
        ],
      },
    },
    Table: {
      props: tablePropsSchema,
      description:
        'A data table. `columns` are header strings; `rows` is a 2D array of cell strings (each row same length as columns).',
      example: {
        columns: ['Item', 'Qty', 'Price'],
        rows: [
          ['Widget', '2', '$20'],
          ['Gadget', '1', '$15'],
        ],
      },
    },
    Metric: {
      props: metricPropsSchema,
      description:
        'A single key figure (KPI / insight card) with a label, big value, optional description, trend arrow, and an optional period-over-period delta ({ value, direction, label }).',
      example: {
        label: 'Total spent',
        value: '$1,240',
        description: 'Last 30 days',
        trend: 'up',
        delta: { value: '+8%', direction: 'up', label: 'vs previous 30d' },
      },
    },
    Callout: {
      props: calloutPropsSchema,
      description:
        'A highlighted info / tip / warning box for a single important note. Use for one call-out, not for long prose.',
      example: { type: 'tip', title: 'Heads up', content: 'Free shipping over $50.' },
    },
    Chart: {
      props: chartPropsSchema,
      description:
        'A bar, line, or pie (donut) chart. `data` is an array of { label, value } points. Choose by the question: line = trend over time, bar = comparison across categories, pie = share of a total (optional `centerLabel` shows a big number in the donut hole). Use for trends or distributions, not for a handful of numbers (use Metric for those). Colours, axes, legend, and tooltips are handled for you.',
      example: {
        type: 'bar',
        title: 'Orders per month',
        data: [
          { label: 'Jan', value: 12 },
          { label: 'Feb', value: 18 },
        ],
      },
    },
  },
  actions: {},
});

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
 * The inline-mode UI prompt for the widget catalog. The agent-v3 model needs
 * this server-side so it emits ` ```spec ` JSONL the v5 stream can transform;
 * the catalog lives HERE because the renderer that consumes the spec is this
 * React registry. To avoid duplicating the catalog server-side, the resolved
 * prompt is materialized into the opencx backend as a frozen string — run
 * `pnpm -F @opencx/widget-react gen:ui-prompt` after changing the catalog and
 * commit the regenerated `backend/src/agent-v3/ui-prompt.generated.ts`.
 * (Same codegen split as the dashboard companion's
 * `generate-companion-ui-prompt.ts`.)
 *
 * DELIBERATELY SLIM — display-only contract, all data inline in props.
 * The full `catalog.prompt({ mode: 'inline' })` output (~19KB: state model,
 * repeat, events, watchers, visibility, dynamic props) made the chat model
 * reason for 85s+ before its first token, blowing through the 180s agent-v3
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
- Only emit a spec when structured data genuinely benefits from it. Plain conversational answers stay text-only — never over-render prose.
- When data is rendered in spec components, do not restate it in prose. One short lead-in sentence before the spec, at most one actionable next step after.
- NEVER use emojis in component props.`;
