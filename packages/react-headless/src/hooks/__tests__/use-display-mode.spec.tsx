import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WidgetCtx,
  type WidgetAgent,
  type WidgetConfig,
} from '@opencx/widget-core';
import { WidgetProvider } from '../../WidgetProvider';
import type { WidgetComponentType } from '../../types/components';
import { useDisplayMode } from '../useDisplayMode';

// The provider's ComponentRegistry requires a fallback component to exist.
const TEST_COMPONENTS: WidgetComponentType[] = [
  { key: 'fallback', component: () => null },
];

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// This unit only exercises display-mode resolution. Agent engine ownership is
// covered through the real WidgetProvider in WidgetProvider.agent-chat.spec.
vi.mock('../../agent-chat/AgentChatContext', () => ({
  AgentChatProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Captures the hook result so tests assert the resolved mode directly.
let captured: ReturnType<typeof useDisplayMode> | null = null;
function Probe() {
  captured = useDisplayMode();
  return null;
}

/**
 * Minimal instanceof-correct ctx: the provider only stores it, and
 * `useDisplayMode` reads nothing from it — the engine the server picked
 * (`agent.streaming`) must NOT influence the shell.
 */
function fakeCtx(agent: WidgetAgent): WidgetCtx {
  const ctx: WidgetCtx = Object.create(WidgetCtx.prototype);
  return Object.assign(ctx, { agent });
}

const STREAMING: WidgetAgent = {
  name: 'Agent Two',
  avatarUrl: null,
  streaming: true,
  features: {
    dictation: false,
    attachments: false,
    pageContext: false,
    clientTools: false,
  },
};
const BLOCKING: WidgetAgent = { ...STREAMING, streaming: false };

describe('useDisplayMode', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    captured = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function mount(config: WidgetConfig, ctx: WidgetCtx) {
    vi.spyOn(WidgetCtx, 'initialize').mockResolvedValue(ctx);
    await act(async () =>
      root.render(
        <WidgetProvider options={config} components={TEST_COMPONENTS}>
          <Probe />
        </WidgetProvider>,
      ),
    );
  }

  it('defaults to the popover shell for a streaming org', async () => {
    await mount({ token: '' }, fakeCtx(STREAMING));
    expect(captured).toBe('popover');
  });

  it('defaults to the popover shell for a non-streaming org', async () => {
    await mount({ token: '' }, fakeCtx(BLOCKING));
    expect(captured).toBe('popover');
  });

  it('explicit companion wins regardless of engine', async () => {
    await mount({ token: '', displayMode: 'companion' }, fakeCtx(BLOCKING));
    expect(captured).toBe('companion');
  });

  it('explicit popover is honored on a streaming org', async () => {
    await mount({ token: '', displayMode: 'popover' }, fakeCtx(STREAMING));
    expect(captured).toBe('popover');
  });
});
