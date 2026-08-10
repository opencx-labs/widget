import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetCtx, type WidgetConfig } from '@opencx/widget-core';
import { WidgetProvider } from '../../WidgetProvider';
import type { WidgetComponentType } from '../../types/components';
import { useDisplayMode } from '../useDisplayMode';

// The provider's ComponentRegistry requires a fallback component to exist.
const TEST_COMPONENTS: WidgetComponentType[] = [
  { key: 'fallback', component: () => null },
];

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Captures the hook result so tests assert the resolved mode directly.
let captured: ReturnType<typeof useDisplayMode> | null = null;
function Probe() {
  captured = useDisplayMode();
  return null;
}

/**
 * Minimal instanceof-correct ctx: the provider only stores it, and
 * `useDisplayMode` reads nothing beyond `agent` — no network, no timers.
 */
function fakeCtx(agent?: {
  id: string;
  name: string;
  avatarUrl: string | null;
}): WidgetCtx {
  const ctx: WidgetCtx = Object.create(WidgetCtx.prototype);
  return Object.assign(ctx, { agent });
}

const AGENT = {
  id: 'e82b4a75-20d6-4258-ac1f-000000000001',
  name: 'Agent Two',
  avatarUrl: null,
};

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

  it('agent-bound embed defaults to the companion shell (agent v3 pairs with the new UI)', async () => {
    await mount({ token: '', agentId: AGENT.id }, fakeCtx(AGENT));
    expect(captured).toBe('companion');
  });

  it('unbound embed keeps the classic popover', async () => {
    await mount({ token: '' }, fakeCtx());
    expect(captured).toBe('popover');
  });

  it('explicit displayMode wins over the agent-bound default', async () => {
    await mount(
      { token: '', agentId: AGENT.id, displayMode: 'popover' },
      fakeCtx(AGENT),
    );
    expect(captured).toBe('popover');
  });

  it('explicit companion still works without an agent (pre-v5 behavior preserved)', async () => {
    await mount({ token: '', displayMode: 'companion' }, fakeCtx());
    expect(captured).toBe('companion');
  });
});
