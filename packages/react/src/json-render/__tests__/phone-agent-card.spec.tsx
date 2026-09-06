import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WidgetUiAction } from '@opencx/widget-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The card reads `onUiAction` off the widget config; this file stubs a host
// that supplies one, so it can assert the button and the payload it sends.
const onUiAction = vi.fn<(action: WidgetUiAction) => void>();
vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ anchorTarget: '_blank', language: 'en', onUiAction }),
  useDocumentDir: () => ({ dir: 'ltr' }),
}));

import { SpecRenderer } from '../SpecRenderer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let roots: Root[] = [];

function render(model: string | null, agentId = 'agent-1'): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(
      <SpecRenderer
        spec={{
          root: 'el',
          elements: {
            el: {
              type: 'PhoneAgentCard',
              props: { agentId, agentName: 'Support line', model },
            },
          },
        }}
      />,
    ),
  );
  return container;
}

afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
  onUiAction.mockReset();
});

describe('PhoneAgentCard with a host handler', () => {
  it('offers "Test via web" and hands the host a typed test-phone-agent action', () => {
    const html = render('oppie-vox-livekit');
    const button = html.querySelector('button');
    expect(button?.textContent).toContain('Test via web');
    act(() => button?.click());
    expect(onUiAction).toHaveBeenCalledWith({
      type: 'test-phone-agent',
      payload: { agentId: 'agent-1', model: 'oppie-vox-livekit' },
    });
  });

  it('hides the action for an agent on a pipeline that cannot be tested from the web', () => {
    expect(render('oppie-vox').querySelector('button')).toBeNull();
    expect(render(null).querySelector('button')).toBeNull();
  });

  it('hides the action when the card carries no agent id', () => {
    expect(render('oppie-vox-livekit', '').querySelector('button')).toBeNull();
  });
});
