import {
  ctaUrlMatches,
  isCtaDismissed,
  parseCtaDismissalRecord,
  resolveCtaVisible,
} from '../../cta/cta-visibility';

const DAY = 86_400_000;

suite('parseCtaDismissalRecord', () => {
  test('null / empty raw → null', () => {
    expect(parseCtaDismissalRecord(null)).toBeNull();
    expect(parseCtaDismissalRecord('')).toBeNull();
  });

  test('valid record round-trips', () => {
    expect(parseCtaDismissalRecord('{"dismissedAt":123}')).toEqual({
      dismissedAt: 123,
    });
  });

  test('malformed JSON → null (does not throw)', () => {
    expect(parseCtaDismissalRecord('{oops')).toBeNull();
  });

  test('wrong shape → null (string timestamp, missing key, non-object)', () => {
    expect(parseCtaDismissalRecord('{"dismissedAt":"123"}')).toBeNull();
    expect(parseCtaDismissalRecord('{}')).toBeNull();
    expect(parseCtaDismissalRecord('42')).toBeNull();
  });
});

suite('isCtaDismissed', () => {
  test('no record → not dismissed', () => {
    expect(isCtaDismissed(null, undefined, 1000)).toBe(false);
  });

  test('record + no dismissForDays → dismissed forever', () => {
    expect(isCtaDismissed({ dismissedAt: 0 }, undefined, 1000 * DAY)).toBe(
      true,
    );
  });

  test('record within the dismissForDays window → still dismissed', () => {
    expect(isCtaDismissed({ dismissedAt: 0 }, 7, 6 * DAY)).toBe(true);
  });

  test('record past the dismissForDays window → shown again', () => {
    expect(isCtaDismissed({ dismissedAt: 0 }, 7, 8 * DAY)).toBe(false);
  });

  test('exact window boundary → shown again (strict comparison)', () => {
    expect(isCtaDismissed({ dismissedAt: 0 }, 7, 7 * DAY)).toBe(false);
  });
});

suite('ctaUrlMatches', () => {
  test('no urlMatch → matches everything', () => {
    expect(ctaUrlMatches(undefined, 'https://x.com/any')).toBe(true);
  });

  test('substring hit and miss', () => {
    expect(ctaUrlMatches('/pricing', 'https://x.com/pricing?a=1')).toBe(true);
    expect(ctaUrlMatches('/pricing', 'https://x.com/docs')).toBe(false);
  });
});

suite('resolveCtaVisible', () => {
  const base = {
    hasCta: true,
    isWidgetOpen: false,
    override: null,
    dismissed: false,
    urlMatches: true,
    delayElapsed: true,
  } as const;

  test('default happy path → visible', () => {
    expect(resolveCtaVisible({ ...base })).toBe(true);
  });

  test('no cta config → hidden even with override "show"', () => {
    expect(resolveCtaVisible({ ...base, hasCta: false, override: 'show' })).toBe(
      false,
    );
  });

  test('widget open → hidden even with override "show"', () => {
    expect(
      resolveCtaVisible({ ...base, isWidgetOpen: true, override: 'show' }),
    ).toBe(false);
  });

  test('override "hide" beats everything else', () => {
    expect(resolveCtaVisible({ ...base, override: 'hide' })).toBe(false);
  });

  test('override "show" beats dismissal, url mismatch, and pending delay', () => {
    expect(
      resolveCtaVisible({
        ...base,
        override: 'show',
        dismissed: true,
        urlMatches: false,
        delayElapsed: false,
      }),
    ).toBe(true);
  });

  test('dismissed → hidden', () => {
    expect(resolveCtaVisible({ ...base, dismissed: true })).toBe(false);
  });

  test('url mismatch → hidden', () => {
    expect(resolveCtaVisible({ ...base, urlMatches: false })).toBe(false);
  });

  test('delay not yet elapsed → hidden', () => {
    expect(resolveCtaVisible({ ...base, delayElapsed: false })).toBe(false);
  });
});
