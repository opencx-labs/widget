// Mirrors the LOCAL OpenCX widget build (@opencx/widget, packages/embed) into
// public/ so the app embeds it from a local path instead of unpkg. script.js is
// only the loader: widget.js and every hashed lazy chunk must travel with it.
// Runs automatically before `pnpm dev` / `pnpm build`. Non-fatal if the widget
// isn't built yet — build it first: (widget root) `pnpm --filter @opencx/widget build`.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // playground/payla/scripts
const defaultSource = resolve(here, '../../../packages/embed/dist-embed');
const defaultDestination = resolve(here, '../public/opencx-widget');

export function syncWidgetBuild({
  source = defaultSource,
  destination = defaultDestination,
  logger = console,
} = {}) {
  const sourceDirectory = resolve(source);
  const loaderEntry = join(sourceDirectory, 'script.js');
  const moduleEntry = join(sourceDirectory, 'widget.js');

  // Validate the complete minimum build before touching a previously synced
  // directory. A loader without its module is worse than leaving the last
  // known-good local copy in place.
  if (!existsSync(loaderEntry) || !existsSync(moduleEntry)) {
    logger.warn(
      `[sync-widget] ⚠ complete local widget build not found at:\n  ${sourceDirectory}`,
    );
    logger.warn(`[sync-widget]   Expected both script.js and widget.js.`);
    logger.warn(`[sync-widget]   Build it once from the widget repo root:`);
    logger.warn(
      `[sync-widget]     pnpm install && pnpm --filter @opencx/widget build`,
    );
    logger.warn(
      `[sync-widget]   then re-run \`pnpm dev\`. Skipping — the app runs, the widget won't load until synced.`,
    );
    return false;
  }

  const destinationDirectory = resolve(destination);
  const destinationParent = dirname(destinationDirectory);
  mkdirSync(destinationParent, { recursive: true });

  // Stage a full copy before deleting the established output. Replacing the
  // dedicated directory removes chunks from older hashes without risking a
  // half-copied build if the source copy fails.
  const stagingDirectory = mkdtempSync(
    join(destinationParent, `.${basename(destinationDirectory)}-`),
  );
  let installed = false;
  try {
    for (const entry of readdirSync(sourceDirectory)) {
      cpSync(join(sourceDirectory, entry), join(stagingDirectory, entry), {
        recursive: true,
      });
    }
    rmSync(destinationDirectory, { recursive: true, force: true });
    renameSync(stagingDirectory, destinationDirectory);
    installed = true;
  } finally {
    if (!installed) {
      rmSync(stagingDirectory, { recursive: true, force: true });
    }
  }

  logger.log(
    `[sync-widget] ✓ ${sourceDirectory} → public/opencx-widget/ (complete build)`,
  );
  return true;
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) syncWidgetBuild();
