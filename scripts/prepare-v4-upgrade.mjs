// Download only the immutable baseline. The browser suite itself is offline.
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const integrity =
  'Npu5DJFz8pHzMsRuZYuDvmQIShRb7PtmOWITinuwaejhG7Cb1zcDAkSdsSfuz39bAT3W2fFr/lgav8amYZqHTA==';
const tarball = 'https://registry.npmjs.org/@opencx/widget/-/widget-4.0.63.tgz';
const cache = fileURLToPath(
  new URL('../local-pack/v4-upgrade/', import.meta.url),
);
const scratch = await mkdtemp(join(tmpdir(), 'widget-v4-baseline-'));
try {
  const bytes = process.env.WIDGET_V4_TARBALL
    ? await readFile(process.env.WIDGET_V4_TARBALL)
    : await (async () => {
        const response = await fetch(tarball);
        if (!response.ok)
          throw new Error(`Baseline download failed: ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
      })();
  if (createHash('sha512').update(bytes).digest('base64') !== integrity)
    throw new Error(
      'v4.0.63 package integrity does not match the pinned baseline',
    );
  const archive = join(scratch, 'baseline.tgz');
  await writeFile(archive, bytes);
  execFileSync('tar', [
    '-xzf',
    archive,
    '-C',
    scratch,
    'package/dist-embed/script.js',
  ]);
  await mkdir(cache, { recursive: true });
  await copyFile(
    join(scratch, 'package/dist-embed/script.js'),
    join(cache, 'script.js'),
  );
  console.log(
    `Verified @opencx/widget@4.0.63 baseline: ${join(cache, 'script.js')}`,
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
