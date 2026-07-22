// Copies the LOCAL OpenCX widget build (@opencx/widget, packages/embed) into
// public/ so the app embeds it from a local path instead of unpkg.
// Runs automatically before `pnpm dev` / `pnpm build`. Non-fatal if the widget
// isn't built yet — build it first: (widget root) `pnpm --filter @opencx/widget build`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // examples/payla/scripts
const src =
  process.env.OPENCX_WIDGET_DIST ??
  resolve(here, "../../../packages/embed/dist-embed/script.js");
const dest = resolve(here, "../public/opencx-widget/script.js");

if (!existsSync(src)) {
  console.warn(`[sync-widget] ⚠ local widget build not found at:\n  ${src}`);
  console.warn(`[sync-widget]   Build it once from the widget repo root:`);
  console.warn(`[sync-widget]     pnpm install && pnpm --filter @opencx/widget build`);
  console.warn(`[sync-widget]   (or set OPENCX_WIDGET_DIST). Skipping — the app runs, the widget won't load until synced.`);
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[sync-widget] ✓ ${src} → public/opencx-widget/script.js`);
