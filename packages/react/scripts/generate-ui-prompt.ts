/**
 * Codegen: widget json-render catalog → opencx backend system prompt.
 *
 * The agent-v3 model needs the inline-mode UI prompt server-side so it emits
 * JSONL patches the v5 stream's `pipeJsonRender` can split into `data-spec`
 * parts. The catalog (component schemas + custom rules) lives in this package
 * because the renderer that consumes the spec is the widget's React registry.
 * To avoid duplicating the catalog server-side, we materialize the resolved
 * prompt as a frozen string into the opencx backend tree. Run this script
 * after changing the catalog and commit the regenerated file over there.
 *
 * Usage (from the widget repo):
 *   pnpm -F @opencx/widget-react gen:ui-prompt
 * The opencx checkout defaults to the sibling `../opencx`; override with
 * OPENCX_REPO=/path/to/opencx.
 *
 * Mirrors `dashboard/apps/dashboard/scripts/generate-companion-ui-prompt.ts`
 * (the companion's proven codegen split).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { widgetUiPrompt } from '../src/json-render/catalog';

const here = dirname(fileURLToPath(import.meta.url));
// scripts/ → packages/react/ → packages/ → widget/ → (sibling) opencx/
const opencxRoot = process.env.OPENCX_REPO ?? resolve(here, '../../../../opencx');
const outPath = resolve(opencxRoot, 'backend/src/agent-v3/ui-prompt.generated.ts');

const raw = `// AUTO-GENERATED. Do not edit by hand.
// Source: widget repo — packages/react/src/json-render/catalog.ts (\`widgetUiPrompt\`)
// Regenerate via \`pnpm -F @opencx/widget-react gen:ui-prompt\` (in the widget
// repo) after changing the catalog, and commit the result here.

export const WIDGET_UI_PROMPT: string = ${JSON.stringify(widgetUiPrompt)};
`;

function main(): void {
  const backendRoot = resolve(opencxRoot, 'backend');
  if (!existsSync(backendRoot)) {
    throw new Error(
      `opencx backend not found at ${backendRoot} — set OPENCX_REPO to your opencx checkout`,
    );
  }

  // The output lands in the opencx backend — format it with that repo's oxfmt
  // (single quotes etc.) so the committed file matches `pnpm format` there and
  // a later format pass over backend/src is a no-op.
  const content = execFileSync(
    resolve(backendRoot, 'node_modules/.bin/oxfmt'),
    [`--stdin-filepath=${outPath}`],
    { input: raw, encoding: 'utf8', cwd: backendRoot },
  );

  writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath} (${(content.length / 1024).toFixed(1)} KB)`);
}

main();
