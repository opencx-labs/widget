import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export async function writePrivateJson(path, value) {
  const serialized = JSON.stringify(value);
  const destination = resolve(path);
  // Same filesystem for atomic replacement. Never follow an existing symlink
  // or write credentials into an existing file with more permissive access.
  const directory = await mkdtemp(
    join(dirname(destination), '.widget-private-'),
  );
  try {
    const temporary = join(directory, 'identity.json');
    await writeFile(temporary, serialized, { mode: 0o600, flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
