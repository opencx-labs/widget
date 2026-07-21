import '../../api-caller.mock';

import { WidgetCtx } from '../../../context/widget.ctx';
import { TestUtils } from '../../test-utils';

const init = async () => {
  const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });
  await TestUtils.sleep(20);
  return widgetCtx;
};

suite('composer draft', () => {
  test('defaults to an empty string', async () => {
    const widgetCtx = await init();
    expect(widgetCtx.composerDraft.get()).toBe('');
  });

  test('setComposerDraft sets the draft text', async () => {
    const widgetCtx = await init();
    widgetCtx.setComposerDraft('How do I withdraw earnings?');
    expect(widgetCtx.composerDraft.get()).toBe('How do I withdraw earnings?');
  });

  test('setComposerDraft can be overwritten and cleared', async () => {
    const widgetCtx = await init();
    widgetCtx.setComposerDraft('first');
    widgetCtx.setComposerDraft('second');
    expect(widgetCtx.composerDraft.get()).toBe('second');
    widgetCtx.setComposerDraft('');
    expect(widgetCtx.composerDraft.get()).toBe('');
  });

  test('resetChat() clears the draft (preserves "draft clears on new chat")', async () => {
    const widgetCtx = await init();
    widgetCtx.setComposerDraft('a pending question');
    widgetCtx.resetChat();
    expect(widgetCtx.composerDraft.get()).toBe('');
  });

  test('notifies subscribers when the draft changes', async () => {
    const widgetCtx = await init();
    const seen: string[] = [];
    widgetCtx.composerDraft.subscribe((v) => seen.push(v));
    widgetCtx.setComposerDraft('x');
    widgetCtx.setComposerDraft('xy');
    expect(seen).toEqual(['x', 'xy']);
  });

  test('does not notify when the draft is set to the same value', async () => {
    const widgetCtx = await init();
    widgetCtx.setComposerDraft('same');
    const seen: string[] = [];
    widgetCtx.composerDraft.subscribe((v) => seen.push(v));
    widgetCtx.setComposerDraft('same');
    expect(seen).toEqual([]);
  });
});
