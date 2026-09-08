import '../api-caller.mock';
import { ApiCaller } from '../../api/api-caller';
import { WidgetCtx } from '../../context/widget.ctx';
import { TestUtils } from '../test-utils';

suite('independent companion conversations', () => {
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
