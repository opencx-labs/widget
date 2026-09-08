import '../api-caller.mock';
import { ApiCaller } from '../../api/api-caller';
import { WidgetCtx } from '../../context/widget.ctx';
import { TestUtils } from '../test-utils';

suite('independent companion conversations', () => {
  test('releasing a runtime aborts creation and ignores a late response without restarting polling', async () => {
    const onSessionCreated = vi.fn();
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, undefined);
    const root = await WidgetCtx.initialize({
      config: {
        token: 'test',
        user: { token: 'visitor' },
        hooks: { onSessionCreated },
      },
    });
    const response = await root.api.createSession({});
    let finish!: (value: typeof response) => void;
    vi.mocked(root.api.createSession).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const child = root.createConversation();
    const pending = child.sessionCtx.createSession();
    const signal = vi.mocked(root.api.createSession).mock.calls.at(-1)![1]!;
    expect(signal.aborted).toBe(false);
    child.releaseConversation();
    expect(signal.aborted).toBe(true);
    vi.mocked(root.api.pollSessionAndHistory).mockClear();
    finish(response);
    await expect(pending).resolves.toBeNull();
    expect(child.sessionCtx.sessionState.get()).toEqual({
      session: null,
      isCreatingSession: false,
      isResolvingSession: false,
    });
    expect(onSessionCreated).not.toHaveBeenCalled();
    expect(root.api.pollSessionAndHistory).not.toHaveBeenCalled();
  });

  test('reset isolates a new creation from a canceled request finishing later', async () => {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, undefined);
    const root = await WidgetCtx.initialize({
      config: { token: 'test', user: { token: 'visitor' } },
    });
    const child = root.createConversation();
    const response = await root.api.createSession({});
    let finishOld!: (value: typeof response) => void;
    let finishNew!: (value: typeof response) => void;
    vi.mocked(root.api.createSession)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishNew = resolve;
        }),
      );
    const oldCreation = child.sessionCtx.createSession();
    child.resetChat();
    const newCreation = child.sessionCtx.createSession();
    finishOld(response);
    await expect(oldCreation).resolves.toBeNull();
    expect(child.sessionCtx.sessionState.get().isCreatingSession).toBe(true);
    finishNew(response);
    await expect(newCreation).resolves.toEqual(response.data);
    child.releaseConversation();
  });

  test('releasing a runtime also prevents an in-flight resolution from restoring its session', async () => {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, undefined);
    const root = await WidgetCtx.initialize({
      config: { token: 'test', user: { token: 'visitor' } },
    });
    const child = root.createConversation();
    await child.sessionCtx.createSession();
    const response = await root.api.resolveSession({ session_id: 'test' });
    let finish!: (value: typeof response) => void;
    vi.mocked(root.api.resolveSession).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = child.sessionCtx.resolveSession();
    const signal = vi.mocked(root.api.resolveSession).mock.calls.at(-1)![1]!;
    child.releaseConversation();
    expect(signal.aborted).toBe(true);
    finish(response);
    await expect(pending).resolves.toMatchObject({ success: false });
    expect(child.sessionCtx.sessionState.get().session).toBeNull();
  });

  test('shares authentication and history listing, but isolates sends, drafts and session state', async () => {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, undefined);
    const root = await WidgetCtx.initialize({
      config: { token: 'test', user: { token: 'visitor' } },
    });
    const fork = root.createConversation();
    expect(fork.api).toBe(root.api);
    expect(fork.contactCtx).toBe(root.contactCtx);
    expect(fork.sessionCtx.sessionsState).toBe(root.sessionCtx.sessionsState);
    expect(fork.messageCtx).not.toBe(root.messageCtx);
    expect(fork.sessionCtx.sessionState).not.toBe(root.sessionCtx.sessionState);
    expect(fork.uploadCtx).not.toBe(root.uploadCtx);
    root.messageCtx.draftState.setPartial({ text: 'First draft' });
    fork.messageCtx.draftState.setPartial({ text: 'Second draft' });
    root.messageCtx.state.setPartial({ isSendingMessage: true });
    fork.resetChat();
    expect(root.messageCtx.state.get().isSendingMessage).toBe(true);
    expect(root.messageCtx.draftState.get().text).toBe('First draft');
    expect(fork.messageCtx.draftState.get().text).toBe('');
    expect(fork.routerCtx.state.get().screen).toBe('chat');
  });
});
