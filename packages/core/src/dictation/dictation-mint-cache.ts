import type { DictationMint } from './dictation-session';

/** Don't reuse a token that could expire mid-handshake. */
const REUSE_SAFETY_MARGIN_MS = 20_000;

/**
 * Session-token reuse: an ephemeral client secret can open multiple realtime
 * sessions until it expires (120s TTL), so re-minting on every activation
 * wastes a full backend round trip. The cache holds the latest mint and
 * hands it back while comfortably inside its TTL; hovering the mic
 * pre-warms it so the first click starts instantly too.
 *
 * One instance per widget (owned by DictationCtx), never module state — two
 * widgets on one page must not share a mint across orgs.
 */
export class DictationMintCache {
  private cached: DictationMint | null = null;
  private inflight: Promise<DictationMint> | null = null;

  /** Valid cached mint, or null. */
  get(): DictationMint | null {
    if (!this.cached) return null;
    const expiresAtMs = Date.parse(this.cached.expiresAt);
    if (
      Number.isNaN(expiresAtMs) ||
      expiresAtMs - Date.now() < REUSE_SAFETY_MARGIN_MS
    ) {
      this.cached = null;
      return null;
    }
    return this.cached;
  }

  /**
   * Resolve a mint, deduping concurrent requests (hover-prewarm racing a
   * click reuses the same in-flight promise instead of double-minting).
   */
  async resolve(
    mintFresh: () => Promise<DictationMint>,
  ): Promise<DictationMint> {
    const valid = this.get();
    if (valid) return valid;
    if (!this.inflight) {
      this.inflight = mintFresh()
        .then((mint) => {
          this.cached = mint;
          return mint;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  /** Drop the cache (e.g. after a failed handshake — token may be stale). */
  clear() {
    this.cached = null;
  }
}
