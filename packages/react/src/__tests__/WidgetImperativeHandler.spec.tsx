import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  WidgetImperativeHandler,
  type WidgetRef,
} from '../WidgetImperativeHandler';

const navigate = vi.fn();
const open = vi.fn();
vi.mock('@opencx/widget-react-headless', () => ({
  useContact: () => ({ contactState: { contact: { token: 'visitor' } } }),
  useWidgetRouter: () => ({ toChatScreen: navigate }),
  useWidgetTrigger: () => ({ setIsOpen: open }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('imperative new conversation', () => {
  it('sends only to the runtime returned by navigation and never sends after rejection', async () => {
    const send = vi.fn();
    const ref = React.createRef<WidgetRef>();
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<WidgetImperativeHandler widgetRef={ref} />));
    navigate.mockReturnValue({ messageCtx: { sendMessage: send } });
    await act(async () => ref.current!.newChat({ message: 'First message' }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ content: 'First message' });
    navigate.mockReturnValue(undefined);
    await act(async () =>
      ref.current!.newChat({ message: 'Rejected new chat' }),
    );
    expect(send).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
