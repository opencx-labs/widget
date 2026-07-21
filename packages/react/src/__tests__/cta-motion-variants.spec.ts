import { makeCtaMotionVariants } from '../CtaContainer';

suite('makeCtaMotionVariants', () => {
  test('full motion: blob and droplet-shown use interruptible springs', () => {
    const v = makeCtaMotionVariants(false);
    expect(v.blob.shown.transition).toMatchObject({ type: 'spring' });
    expect(v.blob.hidden.transition).toMatchObject({ type: 'spring' });
    expect(v.droplet.shown.transition).toMatchObject({ type: 'spring' });
  });

  test('full motion: blob collapses toward the corner, content fades fast', () => {
    const v = makeCtaMotionVariants(false);
    expect(v.blob.shown).toMatchObject({ scale: 1, x: 0, y: 0 });
    expect(v.blob.hidden.scale).toBeLessThan(0.1);
    expect(v.blob.hidden.x).toBeGreaterThan(0);
    expect(v.blob.hidden.y).toBeGreaterThan(0);
    // content exits quicker than it re-enters (text must never sit in the goo)
    expect(v.content.hidden.transition.duration).toBeLessThan(
      v.content.shown.transition.duration + v.content.shown.transition.delay,
    );
  });

  test('full motion: droplet swells then vanishes (keyframes) on hide', () => {
    const v = makeCtaMotionVariants(false);
    expect(v.droplet.hidden.scale).toEqual([1.4, 0]);
  });

  test('reduced motion: every transition is an instant swap', () => {
    const v = makeCtaMotionVariants(true);
    for (const group of [v.blob, v.droplet, v.content]) {
      expect(group.shown.transition).toEqual({ duration: 0 });
      expect(group.hidden.transition).toEqual({ duration: 0 });
    }
  });

  test('reduced motion: droplet never animates keyframes', () => {
    const v = makeCtaMotionVariants(true);
    expect(v.droplet.hidden.scale).toBe(0);
  });

  test('end states are identical regardless of reduced-motion (same UI, different journey)', () => {
    const full = makeCtaMotionVariants(false);
    const reduced = makeCtaMotionVariants(true);
    const strip = (o: object) =>
      JSON.parse(
        JSON.stringify(o, (k, v: unknown) =>
          k === 'transition' || k === 'scale' ? undefined : v,
        ),
      );
    expect(strip(full.blob)).toEqual(strip(reduced.blob));
    expect(strip(full.content)).toEqual(strip(reduced.content));
  });
});
