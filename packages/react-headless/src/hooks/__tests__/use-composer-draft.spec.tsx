import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimitiveState, type WidgetMention } from '@opencx/widget-core';
import { expect, it, vi } from 'vitest';
import { useComposerDraft } from '../useComposerDraft';

function conversation() {
  return {
    messageCtx: {
      draftState: new PrimitiveState({
        text: '',
        mentions: [] as WidgetMention[],
      }),
    },
  };
}
let active = conversation();
vi.mock('../../WidgetProvider', () => ({
  useWidget: () => ({ widgetCtx: active }),
}));

it('keeps edits made after submission and clears accepted drafts across unmounts', () => {
  const first = conversation();
  const second = conversation();
  active = first;
  let draft: ReturnType<typeof useComposerDraft>;
  function Probe() {
    draft = useComposerDraft();
    return <span>{draft.text}</span>;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  act(() => draft!.setText('submitted'));
  const acceptOriginal = draft!.clearSubmitted;
  act(() => draft!.setText('new edit'));
  expect(acceptOriginal()).toBe(false);
  expect(host.textContent).toBe('new edit');
  const acceptEdited = draft!.clearSubmitted;
  active = second;
  act(() => root.render(<Probe key="second" />));
  act(() => draft!.setText('second draft'));
  expect(acceptEdited()).toBe(true);
  expect(host.textContent).toBe('second draft');
  active = first;
  act(() => root.render(<Probe key="first" />));
  expect(host.textContent).toBe('');
  expect(second.messageCtx.draftState.get().text).toBe('second draft');
  act(() => root.unmount());
});
