import '../../api-caller.mock';

import { WidgetCtx } from '../../../context/widget.ctx';
import { TestUtils } from '../../test-utils';

const init = async () => {
  const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });
  await TestUtils.sleep(20);
  return widgetCtx;
};

suite('cta visible state (published by the card, read by the launcher)', () => {
  test('defaults to false (no card shown yet)', async () => {
    const widgetCtx = await init();
    expect(widgetCtx.ctaVisible.get()).toBe(false);
  });

  test('setCtaVisible toggles true and back to false', async () => {
    const widgetCtx = await init();
    widgetCtx.setCtaVisible(true);
    expect(widgetCtx.ctaVisible.get()).toBe(true);
    widgetCtx.setCtaVisible(false);
    expect(widgetCtx.ctaVisible.get()).toBe(false);
  });

  test('notifies subscribers on change (launcher swap in transform mode)', async () => {
    const widgetCtx = await init();
    const seen: boolean[] = [];
    widgetCtx.ctaVisible.subscribe((v) => seen.push(v));
    widgetCtx.setCtaVisible(true);
    widgetCtx.setCtaVisible(false);
    expect(seen).toEqual([true, false]);
  });

  test('does not notify on same-value writes (rapid open/close stays quiet)', async () => {
    const widgetCtx = await init();
    widgetCtx.setCtaVisible(true);
    const seen: boolean[] = [];
    widgetCtx.ctaVisible.subscribe((v) => seen.push(v));
    widgetCtx.setCtaVisible(true);
    expect(seen).toEqual([]);
  });

  test('resetChat() does NOT clear it (launcher state, not chat state)', async () => {
    const widgetCtx = await init();
    widgetCtx.setCtaVisible(true);
    widgetCtx.resetChat();
    expect(widgetCtx.ctaVisible.get()).toBe(true);
  });
});
