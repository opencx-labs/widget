import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePrivateJson } from './write-private-json.mjs';

async function directory(t) {
  const dir = await mkdtemp(join(tmpdir(), 'widget-private-json-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('new and existing identity files are private after each write', async (t) => {
  const dir = await directory(t);
  for (const existing of [false, true]) {
    const path = join(dir, existing ? 'existing.json' : 'new.json');
    if (existing) {
      await writeFile(path, '{}');
      await chmod(path, 0o644);
    }
    await writePrivateJson(path, { token: 'synthetic-only' });
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(
      (await readFile(path, 'utf8')).includes('synthetic-only'),
      true,
    );
  }
});

test('an existing symlink cannot redirect credentials into another file', async (t) => {
  const dir = await directory(t);
  const target = join(dir, 'public.json');
  const path = join(dir, 'identity.json');
  await writeFile(target, 'untouched', { mode: 0o644 });
  await symlink(target, path);
  await writePrivateJson(path, { token: 'synthetic-only' });
  assert.equal(await readFile(target, 'utf8'), 'untouched');
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual((await readdir(dir)).sort(), [
    'identity.json',
    'public.json',
  ]);
});

test('serialization failure preserves the prior file and leaves no temporary credentials', async (t) => {
  const dir = await directory(t);
  const path = join(dir, 'identity.json');
  await writeFile(path, 'previous', { mode: 0o600 });
  await assert.rejects(writePrivateJson(path, { invalid: 1n }));
  assert.equal(await readFile(path, 'utf8'), 'previous');
  assert.deepEqual(await readdir(dir), ['identity.json']);
});

test('failed replacement preserves the destination and removes the private temporary file', async (t) => {
  const dir = await directory(t);
  const path = join(dir, 'identity.json');
  await mkdir(path);
  await writeFile(join(path, 'keep'), 'previous');
  await assert.rejects(writePrivateJson(path, { token: 'synthetic-only' }));
  assert.equal(await readFile(join(path, 'keep'), 'utf8'), 'previous');
  assert.deepEqual(await readdir(dir), ['identity.json']);
});
