import { DictationMintCache } from '../../dictation/dictation-mint-cache';

suite('DictationMintCache (per widget instance)', () => {
  afterEach(() => vi.useRealTimers());

  const fresh = (ttlMs: number) => ({
    token: 'ek',
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    model: 'm',
  });

  test('reuses a mint comfortably inside its TTL and dedupes in-flight mints', async () => {
    const cache = new DictationMintCache();
    const mint = vi.fn(async () => fresh(120_000));
    const [a, b] = await Promise.all([
      cache.resolve(mint),
      cache.resolve(mint),
    ]);
    expect(a).toBe(b);
    expect(mint).toHaveBeenCalledTimes(1);
    await cache.resolve(mint);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('re-mints when the token could expire mid-handshake', async () => {
    const cache = new DictationMintCache();
    const mint = vi.fn(async () => fresh(10_000));
    await cache.resolve(mint);
    await cache.resolve(mint);
    expect(mint).toHaveBeenCalledTimes(2);
  });

  test('clear() drops the cache; a failed mint is not cached', async () => {
    const cache = new DictationMintCache();
    const failing = vi.fn(async () => {
      throw new Error('nope');
    });
    await expect(cache.resolve(failing)).rejects.toThrow('nope');
    const ok = vi.fn(async () => fresh(120_000));
    await cache.resolve(ok);
    cache.clear();
    await cache.resolve(ok);
    expect(ok).toHaveBeenCalledTimes(2);
  });

  test('two widgets never share a mint', async () => {
    const a = new DictationMintCache();
    const b = new DictationMintCache();
    const mint = vi.fn(async () => fresh(120_000));
    await a.resolve(mint);
    await b.resolve(mint);
    expect(mint).toHaveBeenCalledTimes(2);
  });
});
