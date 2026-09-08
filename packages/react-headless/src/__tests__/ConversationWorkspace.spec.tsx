import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PrimitiveState,
  type WidgetCtx,
  type WidgetMessageU,
} from '@opencx/widget-core';
import { describe, expect, it, vi } from 'vitest';
import {
  CompanionConversationProvider,
  ConversationWorkspace,
  useCompanionChats,
} from '../ConversationWorkspace';

function runtime(): WidgetCtx {
  const ctx = {
    config: { token: 'test' },
    streaming: false,
    contactCtx: { shouldCollectData: () => false },
    sessionCtx: {
      trackActiveSession: vi.fn(),
      sessionState: new PrimitiveState({
        session: null,
        isCreatingSession: false,
        isResolvingSession: false,
      }),
      sessionsState: new PrimitiveState({ data: [] }),
    },
    uploadCtx: { state: new PrimitiveState([]) },
    messageCtx: {
      draftState: new PrimitiveState({ text: '', mentions: [] }),
      state: new PrimitiveState({
        messages: [] as WidgetMessageU[],
        isSendingMessage: false,
      }),
    },
    routerCtx: { state: new PrimitiveState({ screen: 'chat' }) },
    releaseConversation: vi.fn(),
    createConversation: vi.fn(() => runtime()),
  };
  return ctx as unknown as WidgetCtx;
}
function started(ctx: WidgetCtx, id: string) {
  ctx.sessionCtx.sessionState.setPartial({
    session: { id, isOpened: true } as never,
  });
  ctx.messageCtx.state.setPartial({
    messages: [{ id: `${id}-user`, type: 'USER', content: id, timestamp: '' }],
    isSendingMessage: true,
  });
}

describe('companion conversation workspace', () => {
  it('keeps independent sends and messages when switching and returning from history', () => {
    const first = runtime();
    const workspace = new ConversationWorkspace(first);
    started(first, 'first');
    workspace.open();
    const second = workspace.state.get().chats[1]!;
    started(second.ctx, 'second');
    workspace.open('first');
    expect(workspace.state.get().activeId).toBe(1);
    expect(workspace.state.get().chats).toHaveLength(2);
    expect(first.messageCtx.state.get().isSendingMessage).toBe(true);
    expect(second.ctx.messageCtx.state.get().isSendingMessage).toBe(true);
    expect(first.releaseConversation).not.toHaveBeenCalled();
    expect(second.ctx.releaseConversation).not.toHaveBeenCalled();
    second.ctx.messageCtx.state.setPartial({ isSendingMessage: false });
    expect(first.messageCtx.state.get().isSendingMessage).toBe(true);
    expect(first.messageCtx.state.get().messages[0]?.id).toBe('first-user');
  });
  it('reuses an empty chat, but never reuses a session being created', () => {
    const first = runtime();
    const workspace = new ConversationWorkspace(first);
    workspace.open();
    expect(workspace.state.get().chats).toHaveLength(1);
    first.sessionCtx.sessionState.setPartial({ isCreatingSession: true });
    workspace.open();
    expect(workspace.state.get().chats).toHaveLength(2);
  });
  it('preserves unsent text, mentions and attachments instead of reusing their tab', () => {
    const first = runtime();
    const workspace = new ConversationWorkspace(first);
    first.messageCtx.draftState.setPartial({ text: 'Unsent question' });
    const second = workspace.open()!;
    expect(second).not.toBe(first);
    second.messageCtx.draftState.setPartial({
      mentions: [{ type: 'payment', id: '1', title: 'Payment' }],
    });
    const third = workspace.open()!;
    expect(third).not.toBe(second);
    third.uploadCtx.state.set([
      {
        id: 'upload',
        file: new File(['data'], 'receipt.txt'),
        status: 'uploading',
        progress: 30,
      },
    ]);
    const fourth = workspace.open()!;
    expect(fourth).not.toBe(third);
    workspace.select(1);
    expect(first.messageCtx.draftState.get().text).toBe('Unsent question');
    expect(third.uploadCtx.state.get()[0]?.progress).toBe(30);
  });
  it('checks the single-session restriction before reusing a blank tab', () => {
    const first = runtime();
    first.config.oneOpenSessionAllowed = true;
    const workspace = new ConversationWorkspace(first);
    first.messageCtx.draftState.setPartial({ text: 'Draft' });
    workspace.open();
    started(first, 'first');
    expect(workspace.canCreateChat()).toBe(false);
    expect(workspace.open()).toBeUndefined();
    expect(workspace.state.get().activeId).toBe(2);
    expect(workspace.open('first')).toBe(first);
  });
  it('tracks the selected conversation before releasing a background runtime', () => {
    const first = runtime();
    const workspace = new ConversationWorkspace(first);
    started(first, 'first');
    first.messageCtx.state.setPartial({ isSendingMessage: false });
    const second = workspace.open()!;
    workspace.close(1);
    expect(first.sessionCtx.trackActiveSession).toHaveBeenLastCalledWith(
      second.sessionCtx,
    );
    expect(first.releaseConversation).toHaveBeenCalledOnce();
  });
  it('respects oneOpenSessionAllowed and ignores missing history IDs', () => {
    const first = runtime();
    first.config.oneOpenSessionAllowed = true;
    const workspace = new ConversationWorkspace(first);
    started(first, 'first');
    workspace.open();
    workspace.open('missing');
    expect(workspace.state.get().chats).toHaveLength(1);
    expect(first.createConversation).not.toHaveBeenCalled();
  });
  it('closes an idle tab without deleting history, then selects a remaining chat', () => {
    const first = runtime();
    const workspace = new ConversationWorkspace(first);
    started(first, 'first');
    first.messageCtx.state.setPartial({ isSendingMessage: false });
    const session = first.sessionCtx.sessionState.get().session!;
    first.sessionCtx.sessionsState.setPartial({ data: [session] });
    workspace.open();
    workspace.close(1);
    expect(workspace.state.get().activeId).toBe(2);
    expect(workspace.state.get().chats.map((chat) => chat.id)).toEqual([2]);
    expect(first.releaseConversation).toHaveBeenCalledOnce();
    expect(first.sessionCtx.sessionsState.get().data).toEqual([session]);
    workspace.open('first');
    expect(
      workspace.state.get().chats[0]!.ctx.sessionCtx.sessionState.get().session
        ?.id,
    ).toBe('first');
  });
  it('returns to the previous chat and provides a fresh draft after the last close', () => {
    const first = runtime();
    const workspace = new ConversationWorkspace(first);
    started(first, 'first');
    first.messageCtx.state.setPartial({ isSendingMessage: false });
    workspace.open();
    workspace.close(2);
    expect(workspace.state.get().activeId).toBe(1);
    workspace.close(1);
    expect(workspace.state.get().chats).toHaveLength(1);
    expect(workspace.state.get().activeId).toBe(3);
    expect(
      workspace.state.get().chats[0]!.ctx.sessionCtx.sessionState.get().session,
    ).toBeNull();
    workspace.close(999);
    expect(workspace.state.get().activeId).toBe(3);
  });
  it('lets a closed busy tab finish, supports reopening it, then releases it after completion', () => {
    const first = runtime();
    const workspace = new ConversationWorkspace(first);
    started(first, 'first');
    workspace.close(1);
    expect(workspace.state.get().activeId).toBe(2);
    expect(workspace.state.get().chats[0]!.closed).toBe(true);
    expect(first.releaseConversation).not.toHaveBeenCalled();
    workspace.open('first');
    expect(workspace.state.get().activeId).toBe(1);
    expect(workspace.state.get().chats[0]!.closed).toBe(false);
    workspace.close(1);
    first.messageCtx.state.setPartial({ isSendingMessage: false });
    workspace.update(1, { working: false });
    expect(workspace.state.get().chats.map((chat) => chat.id)).toEqual([2]);
    expect(first.releaseConversation).toHaveBeenCalledOnce();
  });
  it('keeps session creation alive after closing and hides that runtime from open chats', async () => {
    const first = runtime();
    first.sessionCtx.sessionState.setPartial({ isCreatingSession: true });
    let chats: ReturnType<typeof useCompanionChats>;
    function Probe() {
      chats = useCompanionChats();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () =>
      root.render(
        <CompanionConversationProvider widgetCtx={first}>
          {() => <Probe />}
        </CompanionConversationProvider>,
      ),
    );
    act(() => chats!.closeChat(1));
    expect(chats!.chats.map((chat) => chat.id)).toEqual([2]);
    expect(first.releaseConversation).not.toHaveBeenCalled();
    act(() => {
      started(first, 'first');
      first.sessionCtx.sessionState.setPartial({ isCreatingSession: false });
    });
    expect(first.releaseConversation).not.toHaveBeenCalled();
    act(() => first.messageCtx.state.setPartial({ isSendingMessage: false }));
    expect(first.releaseConversation).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
  it('observes background work even with no visible chat content mounted', async () => {
    const first = runtime();
    started(first, 'first');
    let chats: ReturnType<typeof useCompanionChats>;
    function Probe() {
      chats = useCompanionChats();
      return null;
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <CompanionConversationProvider widgetCtx={first}>
          {() => <Probe />}
        </CompanionConversationProvider>,
      ),
    );
    expect(chats!.chats.filter((chat) => chat.working)).toHaveLength(1);
    act(() => chats!.newChat());
    const second = chats!.chats[1]!.ctx;
    act(() => started(second, 'second'));
    expect(chats!.chats.filter((chat) => chat.working)).toHaveLength(2);
    act(() => first.messageCtx.state.setPartial({ isSendingMessage: false }));
    expect(chats!.chats.filter((chat) => chat.working)).toHaveLength(1);
    expect(chats!.activeId).toBe(2);
    act(() => root.unmount());
  });
});
