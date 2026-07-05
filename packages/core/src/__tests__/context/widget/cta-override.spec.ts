import '../../api-caller.mock';

import { WidgetCtx } from '../../../context/widget.ctx';
import { TestUtils } from '../../test-utils';

const init = async () => {
  const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });
  await TestUtils.sleep(20);
  return widgetCtx;
};

suite('cta override state', () => {
  test('defaults to null (rules decide)', async () => {
    const widgetCtx = await init();
    expect(widgetCtx.ctaOverride.get()).toBeNull();
  });

  test('setCtaOverride sets show, hide, and back to null', async () => {
    const widgetCtx = await init();
    widgetCtx.setCtaOverride('show');
    expect(widgetCtx.ctaOverride.get()).toBe('show');
    widgetCtx.setCtaOverride('hide');
    expect(widgetCtx.ctaOverride.get()).toBe('hide');
    widgetCtx.setCtaOverride(null);
    expect(widgetCtx.ctaOverride.get()).toBeNull();
  });

  test('notifies subscribers on change', async () => {
    const widgetCtx = await init();
    const seen: Array<'show' | 'hide' | null> = [];
    widgetCtx.ctaOverride.subscribe((v) => seen.push(v));
    widgetCtx.setCtaOverride('show');
    widgetCtx.setCtaOverride('hide');
    expect(seen).toEqual(['show', 'hide']);
  });

  test('resetChat() does NOT clear the override (CTA is not chat state)', async () => {
    const widgetCtx = await init();
    widgetCtx.setCtaOverride('show');
    widgetCtx.resetChat();
    expect(widgetCtx.ctaOverride.get()).toBe('show');
  });
});
