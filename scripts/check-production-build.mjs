import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = process.argv[2];
if (!directory)
  throw new Error('Usage: node check-production-build.mjs <output-directory>');

const root = resolve(directory);
const files = (await readdir(root, { recursive: true })).filter((file) =>
  /\.[cm]?js$/.test(file),
);
if (files.length === 0)
  throw new Error(`No compiled JavaScript found in ${root}. Build first.`);

for (const file of files) {
  const source = await readFile(resolve(root, file), 'utf8');
  // Some production dependencies expose a dormant `jsxDEV` option. Reject
  // development-runtime imports, bundled development runtimes, and calls.
  if (
    /react\/jsx-dev-runtime|react-jsx(?:-dev)?-runtime\.development|\bjsxDEV\s*\(/.test(
      source,
    )
  ) {
    throw new Error(
      `Development JSX found in ${resolve(root, file)}. Rebuild with NODE_ENV=production before publishing.`,
    );
  }
}

console.log(
  `Production JSX check passed: ${files.length} JavaScript files in ${directory}.`,
);
