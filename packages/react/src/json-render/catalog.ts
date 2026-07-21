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
        'A single key figure (KPI / insight) with a label, big value, optional detail and trend arrow.',
      example: { label: 'Total spent', value: '$1,240', detail: 'Last 30 days', trend: 'up' },
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
        'A bar, line, or pie chart. `data` is an array of { label, value } points. Use for trends or distributions, not for a handful of numbers (use Metric for those).',
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
