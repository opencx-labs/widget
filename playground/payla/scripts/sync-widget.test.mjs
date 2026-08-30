import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { syncWidgetBuild } from './sync-widget.mjs';

const silentLogger = { log() {}, warn() {} };

test('syncWidgetBuild mirrors the complete build and removes stale chunks', () => {
  const root = mkdtempSync(join(tmpdir(), 'opencx-widget-sync-'));
  try {
    const source = join(root, 'dist-embed');
    const destination = join(root, 'public', 'opencx-widget');
    mkdirSync(join(source, 'assets'), { recursive: true });
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(source, 'script.js'), 'loader');
    writeFileSync(join(source, 'widget.js'), 'module');
    writeFileSync(join(source, 'Chart-newhash.js'), 'new chunk');
    writeFileSync(join(source, 'assets', 'nested.js'), 'nested chunk');
    writeFileSync(join(destination, 'Chart-oldhash.js'), 'stale chunk');

    // Keep accepting the old environment-variable shape: a script.js path.
    assert.equal(
      syncWidgetBuild({
        source: join(source, 'script.js'),
        destination,
        logger: silentLogger,
      }),
      true,
    );

    assert.equal(
      readFileSync(join(destination, 'script.js'), 'utf8'),
      'loader',
    );
    assert.equal(
      readFileSync(join(destination, 'widget.js'), 'utf8'),
      'module',
    );
    assert.equal(
      readFileSync(join(destination, 'Chart-newhash.js'), 'utf8'),
      'new chunk',
    );
    assert.equal(
      readFileSync(join(destination, 'assets', 'nested.js'), 'utf8'),
      'nested chunk',
    );
    assert.equal(existsSync(join(destination, 'Chart-oldhash.js')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('syncWidgetBuild preserves the last good copy when the build is incomplete', () => {
  const root = mkdtempSync(join(tmpdir(), 'opencx-widget-sync-'));
  try {
    const source = join(root, 'dist-embed');
    const destination = join(root, 'public', 'opencx-widget');
    mkdirSync(source, { recursive: true });
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(source, 'script.js'), 'loader without module');
    writeFileSync(join(destination, 'script.js'), 'last good loader');
    writeFileSync(join(destination, 'widget.js'), 'last good module');

    assert.equal(
      syncWidgetBuild({ source, destination, logger: silentLogger }),
      false,
    );
    assert.equal(
      readFileSync(join(destination, 'script.js'), 'utf8'),
      'last good loader',
    );
    assert.equal(
      readFileSync(join(destination, 'widget.js'), 'utf8'),
      'last good module',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
