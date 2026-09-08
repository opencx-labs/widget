import React, { createContext, useContext, useEffect, useMemo } from 'react';
import {
  PrimitiveState,
  type WidgetConfig,
  type WidgetCtx,
} from '@opencx/widget-core';
import {
  AgentChatContext,
  AgentChatProvider,
  DEFAULT_AGENT_CHAT_UI,
  useAgentChatUi,
  type AgentChatUiValue,
} from './agent-chat/AgentChatContext';
import { usePrimitiveState } from './hooks/usePrimitiveState';

export type CompanionChat = {
  id: number;
  ctx: WidgetCtx;
  title: string;
  working: boolean;
  hasSession: boolean;
  hasDraft: boolean;
  ui: AgentChatUiValue;
  /** A closed tab may finish its current turn before its runtime is released. */
  closed?: boolean;
};

/** Keeps each send engine mounted while the visible conversation changes. */
export class ConversationWorkspace {
  state: PrimitiveState<{ chats: CompanionChat[]; activeId: number }>;
  private nextId = 1;
  private mountVersion = 0;
  private disposed = false;
  constructor(private root: WidgetCtx) {
    const chat = this.makeChat(root);
    this.state = new PrimitiveState({ chats: [chat], activeId: chat.id });
  }
  private makeChat(ctx: WidgetCtx): CompanionChat {
    return {
      id: this.nextId++,
      ctx,
      title: '',
      working: false,
      hasSession: false,
      hasDraft: false,
      ui: DEFAULT_AGENT_CHAT_UI,
    };
  }
  /** Attach only after commit: Strict Mode may discard render-time workspaces. */
  mount = () => {
    const version = ++this.mountVersion;
    this.root.routerCtx.navigateConversation = this.open;
    const active = this.state
      .get()
      .chats.find((chat) => chat.id === this.state.get().activeId)!;
    if (active.ctx === this.root)
      this.root.sessionCtx.restoreActiveSessionTracking();
    else this.root.sessionCtx.trackActiveSession(active.ctx.sessionCtx);
    return () => {
      // React replays effect cleanup/setup in Strict Mode. Keep the live
      // workspace intact during that replay; dispose after a real unmount.
      queueMicrotask(() => {
        if (this.mountVersion === version) this.dispose();
      });
    };
  };

  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    if (this.root.routerCtx.navigateConversation === this.open) {
      this.root.routerCtx.navigateConversation = undefined;
      // The initial runtime is borrowed from WidgetProvider. Return its
      // persistence subscription before resetting any owned child sessions.
      this.root.sessionCtx.restoreActiveSessionTracking();
    }
    for (const chat of this.state.get().chats) {
      if (chat.ctx !== this.root) chat.ctx.releaseConversation();
    }
    this.state.set({ chats: [], activeId: 0 });
  };

  select = (id: number) => {
    if (this.disposed) return;
    const chat = this.state.get().chats.find((chat) => chat.id === id);
    if (!chat) return;
    chat.ctx.routerCtx.navigateConversation = this.open;
    chat.ctx.routerCtx.state.setPartial({
      screen: chat.ctx.contactCtx.shouldCollectData() ? 'welcome' : 'chat',
    });
    this.root.sessionCtx.trackActiveSession(chat.ctx.sessionCtx);
    this.state.setPartial({
      activeId: id,
      chats: this.state
        .get()
        .chats.map((item) =>
          item.id === id ? { ...item, closed: false } : item,
        ),
    });
  };
  close = (id: number) => {
    if (this.disposed) return;
    const { chats, activeId } = this.state.get();
    const index = chats.findIndex((chat) => chat.id === id && !chat.closed);
    const chat = chats[index];
    if (!chat) return;
    const working = this.isWorking(chat);
    const remaining = working
      ? chats.map((item) => (item.id === id ? { ...item, closed: true } : item))
      : chats.filter((item) => item.id !== id);
    let next =
      remaining.find((item) => item.id === activeId && !item.closed) ??
      remaining
        .slice(0, index)
        .reverse()
        .find((item) => !item.closed) ??
      remaining.find((item) => !item.closed);
    if (!next) {
      next = this.makeChat(this.root.createConversation());
      remaining.push(next);
    }
    next.ctx.routerCtx.navigateConversation = this.open;
    this.root.sessionCtx.trackActiveSession(next.ctx.sessionCtx);
    this.state.set({ chats: remaining, activeId: next.id });
    // Closing a tab never resolves the server conversation or interrupts other
    // sends. A busy runtime stays mounted until it settles (including creation).
    if (!working) this.releaseChat(chat);
  };
  private releaseChat(chat: CompanionChat) {
    // WidgetProvider can reuse the initial runtime outside companion mode.
    // Only workspace-created runtimes own disposable routing subscriptions.
    if (chat.ctx === this.root) chat.ctx.resetChat();
    else chat.ctx.releaseConversation();
  }
  private isWorking(chat: CompanionChat) {
    return (
      chat.ui.isStreaming ||
      chat.ctx.messageCtx.state.get().isSendingMessage ||
      chat.ctx.sessionCtx.sessionState.get().isCreatingSession
    );
  }
  canCreateChat = () =>
    !this.disposed &&
    (!this.root.config.oneOpenSessionAllowed ||
      (!this.state.get().chats.some(({ ctx }) => {
        const { session, isCreatingSession } =
          ctx.sessionCtx.sessionState.get();
        return session?.isOpened || isCreatingSession;
      }) &&
        !this.root.sessionCtx.sessionsState
          .get()
          .data.some((s) => s.isOpened)));

  private isEmpty(chat: CompanionChat) {
    const { session } = chat.ctx.sessionCtx.sessionState.get();
    const { text, mentions } = chat.ctx.messageCtx.draftState.get();
    return (
      !chat.closed &&
      !session &&
      !this.isWorking(chat) &&
      !chat.ctx.messageCtx.state.get().messages.length &&
      !text &&
      !mentions.length &&
      !chat.ctx.uploadCtx.state.get().length
    );
  }

  open = (sessionId?: string) => {
    if (this.disposed) return;
    const { chats } = this.state.get();
    if (!sessionId && !this.canCreateChat()) return;
    const existing = sessionId
      ? chats.find(
          ({ ctx }) =>
            ctx.sessionCtx.sessionState.get().session?.id === sessionId,
        )
      : chats.find((chat) => this.isEmpty(chat));
    if (existing) {
      this.select(existing.id);
      this.root.config.hooks?.onNavigateToChat?.({
        session:
          existing.ctx.sessionCtx.sessionState.get().session ?? undefined,
      });
      return existing.ctx;
    }
    const session = sessionId
      ? this.root.sessionCtx.sessionsState
          .get()
          .data.find((s) => s.id === sessionId)
      : undefined;
    if (sessionId && !session) return;
    const chat =
      chats.find((item) => this.isEmpty(item)) ??
      this.makeChat(this.root.createConversation());
    if (session) chat.ctx.sessionCtx.sessionState.setPartial({ session });
    if (!chats.includes(chat))
      this.state.setPartial({ chats: [...chats, chat] });
    this.select(chat.id);
    this.root.config.hooks?.onNavigateToChat?.({ session });
    return chat.ctx;
  };
  update = (
    id: number,
    update: Partial<
      Pick<
        CompanionChat,
        'title' | 'working' | 'hasSession' | 'hasDraft' | 'ui'
      >
    >,
  ) => {
    const current = this.state.get().chats.find((chat) => chat.id === id);
    if (!current) return;
    const updated = { ...current, ...update };
    if (updated.closed && !this.isWorking(updated)) {
      this.state.setPartial({
        chats: this.state.get().chats.filter((chat) => chat.id !== id),
      });
      this.releaseChat(updated);
      return;
    }
    this.state.setPartial({
      chats: this.state
        .get()
        .chats.map((chat) => (chat.id === id ? { ...chat, ...update } : chat)),
    });
  };
}

const WorkspaceContext = createContext<ConversationWorkspace | null>(null);
const EMPTY_WORKSPACE = new PrimitiveState<{
  chats: CompanionChat[];
  activeId: number;
}>({ chats: [], activeId: 0 });

/** Optional only for shared hooks that also serve popover and inline widgets. */
export function useConversationWorkspace() {
  const workspace = useContext(WorkspaceContext);
  const state = usePrimitiveState(workspace?.state ?? EMPTY_WORKSPACE);
  const chats = state.chats.filter((chat) => !chat.closed);
  const openChats = chats.filter(
    (chat) => chat.hasSession || chat.working || chat.hasDraft || chat.title,
  );
  return { workspace, chats, openChats, activeId: state.activeId };
}

export function useCompanionChats() {
  const { workspace, ...state } = useConversationWorkspace();
  if (!workspace)
    throw new Error('Companion chats require a conversation workspace');
  return {
    ...state,
    selectChat: workspace.select,
    closeChat: workspace.close,
    newChat: workspace.open,
  };
}

function ObserveChat({
  chat,
  workspace,
}: {
  chat: CompanionChat;
  workspace: ConversationWorkspace;
}) {
  const ui = useAgentChatUi();
  const messages = usePrimitiveState(chat.ctx.messageCtx.state);
  const session = usePrimitiveState(chat.ctx.sessionCtx.sessionState);
  const draft = usePrimitiveState(chat.ctx.messageCtx.draftState);
  const files = usePrimitiveState(chat.ctx.uploadCtx.state);
  const firstUser = messages.messages.find(
    (message) => message.type === 'USER',
  );
  const title =
    firstUser?.type === 'USER' ? firstUser.content.slice(0, 60) : '';
  const working =
    ui.isStreaming || messages.isSendingMessage || session.isCreatingSession;
  const hasSession = !!session.session;
  const hasDraft =
    !!draft.text || draft.mentions.length > 0 || files.length > 0;
  useEffect(
    () =>
      workspace.update(chat.id, { title, working, hasSession, hasDraft, ui }),
    [workspace, chat.id, title, working, hasSession, hasDraft, ui],
  );
  return null;
}

export function CompanionConversationProvider({
  widgetCtx,
  config = widgetCtx.config,
  children,
}: {
  widgetCtx: WidgetCtx;
  config?: WidgetConfig;
  children: (active: WidgetCtx) => React.ReactNode;
}) {
  const workspace = useMemo(
    () => new ConversationWorkspace(widgetCtx),
    [widgetCtx],
  );
  useEffect(() => workspace.mount(), [workspace]);
  const { chats, activeId } = usePrimitiveState(workspace.state);
  const active = chats.find((chat) => chat.id === activeId)!;
  const engines = useMemo(
    () =>
      chats.map((chat) => (
        <AgentChatProvider key={chat.id} widgetCtx={chat.ctx} config={config}>
          <ObserveChat chat={chat} workspace={workspace} />
        </AgentChatProvider>
      )),
    [chats, config, workspace],
  );
  return (
    <WorkspaceContext.Provider value={workspace}>
      {engines}
      <AgentChatContext.Provider value={active.ui}>
        {children(active.ctx)}
      </AgentChatContext.Provider>
    </WorkspaceContext.Provider>
  );
}
