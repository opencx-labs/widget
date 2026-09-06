import '../../api-caller.mock';

import { describe, expect, it } from 'vitest';
import { WidgetCtx } from '../../../context/widget.ctx';

/**
 * The composer's ↑/↓ recall history lives on `MessageCtx` rather than in the
 * composer, because the quick-ask bar and the full chat panel are different
 * mounts of the same component and recall has to survive the morph between
 * them. Living here also gives it the two boundaries it needs: one widget
 * instance (not the module, so two embeds on a page never share a visitor's
 * typing), and one conversation (`resetChat` clears it, so a new chat cannot
 * recall the previous session's messages).
 */
describe('sent text history (composer recall)', () => {
  const init = () => WidgetCtx.initialize({ config: { token: '' } });

  it('records sent text oldest-first', async () => {
    const { messageCtx } = await init();

    messageCtx.rememberSentText('first');
    messageCtx.rememberSentText('second');

    expect(messageCtx.getSentTextHistory()).toEqual(['first', 'second']);
  });

  it('trims surrounding whitespace and ignores empty sends', async () => {
    const { messageCtx } = await init();

    messageCtx.rememberSentText('  padded  ');
    messageCtx.rememberSentText('   ');
    messageCtx.rememberSentText('');

    expect(messageCtx.getSentTextHistory()).toEqual(['padded']);
  });

  it('collapses a consecutive duplicate — re-sending the same line after a failure', async () => {
    const { messageCtx } = await init();

    messageCtx.rememberSentText('retry me');
    messageCtx.rememberSentText('retry me');
    messageCtx.rememberSentText('something else');
    messageCtx.rememberSentText('retry me');

    expect(messageCtx.getSentTextHistory()).toEqual([
      'retry me',
      'something else',
      'retry me',
    ]);
  });

  it('caps the history, dropping the oldest entries', async () => {
    const { messageCtx } = await init();

    for (let i = 0; i < 55; i++) messageCtx.rememberSentText(`m${i}`);

    const history = messageCtx.getSentTextHistory();
    expect(history).toHaveLength(50);
    expect(history.at(0)).toBe('m5');
    expect(history.at(-1)).toBe('m54');
  });

  it('a new chat cannot recall the previous conversation — resetChat clears it', async () => {
    const widgetCtx = await init();

    widgetCtx.messageCtx.rememberSentText('my order number is 12345');
    expect(widgetCtx.messageCtx.getSentTextHistory()).toHaveLength(1);

    widgetCtx.resetChat();

    expect(widgetCtx.messageCtx.getSentTextHistory()).toEqual([]);
  });

  it('two widget instances never share history', async () => {
    const a = await init();
    const b = await init();

    a.messageCtx.rememberSentText('typed into A');

    expect(b.messageCtx.getSentTextHistory()).toEqual([]);
  });
});
