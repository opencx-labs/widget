/** Host/API-driven override of the CTA card's visibility. */
export type CtaOverride = 'show' | 'hide' | null;

/** What we persist (JSON) in storage when the visitor dismisses the card. */
export type CtaDismissalRecord = { dismissedAt: number };

export function parseCtaDismissalRecord(
  raw: string | null,
): CtaDismissalRecord | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'dismissedAt' in parsed &&
      typeof parsed.dismissedAt === 'number'
    ) {
      return { dismissedAt: parsed.dismissedAt };
    }
    return null;
  } catch {
    return null;
  }
}

const DAY_MS = 86_400_000;

/**
 * `dismissForDays === undefined` means a dismissal is permanent; otherwise the
 * card comes back once the window has elapsed.
 */
export function isCtaDismissed(
  record: CtaDismissalRecord | null,
  dismissForDays: number | undefined,
  now: number,
): boolean {
  if (!record) return false;
  if (dismissForDays === undefined) return true;
  return now < record.dismissedAt + dismissForDays * DAY_MS;
}

export function ctaUrlMatches(
  urlMatch: string | undefined,
  href: string,
): boolean {
  return urlMatch === undefined || href.includes(urlMatch);
}

/**
 * Single source of truth for whether the CTA card renders. An open widget
 * always wins (the card never overlaps the chat); `hide` beats `show`; `show`
 * bypasses dismissal, URL, and delay rules.
 */
export function resolveCtaVisible(input: {
  hasCta: boolean;
  isWidgetOpen: boolean;
  override: CtaOverride;
  dismissed: boolean;
  urlMatches: boolean;
  delayElapsed: boolean;
}): boolean {
  if (!input.hasCta || input.isWidgetOpen) return false;
  if (input.override === 'hide') return false;
  if (input.override === 'show') return true;
  return !input.dismissed && input.urlMatches && input.delayElapsed;
}
