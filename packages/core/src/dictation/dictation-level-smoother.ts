/**
 * Asymmetric level smoother shared by every voice meter: fast attack so the
 * UI kicks with speech, slow release so it settles instead of twitching.
 * One implementation so the mic bars, edge glow, and width swell can never
 * drift apart in feel — only in their chosen constants.
 */
export class DictationLevelSmoother {
  private readonly attack: number;
  private readonly release: number;
  private value = 0;

  constructor({ attack, release }: { attack: number; release: number }) {
    this.attack = attack;
    this.release = release;
  }

  next(target: number): number {
    this.value +=
      (target - this.value) *
      (target > this.value ? this.attack : this.release);
    return this.value;
  }

  current(): number {
    return this.value;
  }
}
