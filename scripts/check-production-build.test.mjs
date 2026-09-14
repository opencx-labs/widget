import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(
  new URL('./check-production-build.mjs', import.meta.url),
);

test('accepts production JSX and ignores source maps', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'widget-production-jsx-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, 'index.js'),
    'import { jsx } from "react/jsx-runtime"; jsx("div", {});',
  );
  await writeFile(
    join(directory, 'index.js.map'),
    JSON.stringify({ sourcesContent: ['jsxDEV'] }),
  );
  await writeFile(
    join(directory, 'markdown.cjs'),
    'exports.check = options => typeof options.jsxDEV === "function";',
  );
  const result = spawnSync(process.execPath, [checker, directory], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 JavaScript files/);
});

for (const { filename, source } of [
  {
    filename: 'chunk.mjs',
    source:
      'import { jsxDEV as n } from "react/jsx-dev-runtime"; n("div", {});',
  },
  {
    filename: 'chunk.cjs',
    source: 'const r = require("react/jsx-dev-runtime"); r.jsxDEV("div", {});',
  },
  {
    filename: 'chunk.js',
    source: 'const element = runtime.jsxDEV("div", {});',
  },
  {
    filename: 'runtime.js',
    source:
      '/*! react-jsx-dev-runtime.development.js */ function createElement() {}',
  },
]) {
  test(`rejects development JSX in a nested ${filename}`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'widget-development-jsx-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(
      join(directory, 'index.js'),
      'export const version = "test";',
    );
    const clean = spawnSync(process.execPath, [checker, directory], {
      encoding: 'utf8',
    });
    assert.equal(clean.status, 0, clean.stderr);
    await mkdir(join(directory, 'chunks'));
    await writeFile(join(directory, 'chunks', filename), source);
    const result = spawnSync(process.execPath, [checker, directory], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Development JSX found/);
    assert.ok(result.stderr.includes(filename));
  });
}

test('rejects an output directory without compiled JavaScript', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'widget-empty-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [checker, directory], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No compiled JavaScript/);
});
