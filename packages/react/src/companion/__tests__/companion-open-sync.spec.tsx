import React, { act, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useCompanionOpenSync } from '../useCompanionOpenSync';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('opens a different conversation from the collapsed launcher without reversing its open state', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let renders = 0;
  function Harness() {
    if (++renders > 30) throw new Error('Companion open/close sync loops');
    const [isOpen, setIsOpen] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);
    const [conversation, setConversation] = useState(1);
    // Like openPanel, this callback reads the selected conversation runtime.
    const onOpen = useCallback(() => {
      if (conversation) setPanelOpen(true);
    }, [conversation]);
    const onClose = useCallback(() => setPanelOpen(false), []);
    useCompanionOpenSync({ panelOpen, isOpen, setIsOpen, onOpen, onClose });
    return (
      <>
        <button
          onClick={() => {
            setConversation(2);
            setPanelOpen(true);
          }}
        >
          New conversation
        </button>
        <button onClick={() => setIsOpen(false)}>External close</button>
        <button onClick={() => setIsOpen(true)}>External open</button>
        <output>
          {conversation}:{String(panelOpen)}:{String(isOpen)}
        </output>
      </>
    );
  }
  try {
    act(() => root.render(<Harness />));
    act(() => host.querySelectorAll('button')[0]!.click());
    expect(host.querySelector('output')?.textContent).toBe('2:true:true');
    act(() => host.querySelectorAll('button')[1]!.click());
    expect(host.querySelector('output')?.textContent).toBe('2:false:false');
    act(() => host.querySelectorAll('button')[2]!.click());
    expect(host.querySelector('output')?.textContent).toBe('2:true:true');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
