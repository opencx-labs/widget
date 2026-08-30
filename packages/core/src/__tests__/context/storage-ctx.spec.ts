import { describe, expect, it } from 'vitest';
import { StorageCtx } from '../../context/storage.ctx';
import type { ExternalStorage } from '../../types/external-storage';
import type { WidgetConfig } from '../../types/widget-config';

function createStorage() {
  const values = new Map<string, string>();
  const storage: ExternalStorage = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
  return { storage, values };
}

describe('StorageCtx companion preferences', () => {
  it('scopes preferences by organization token and agent', async () => {
    const { storage, values } = createStorage();
    const first = new StorageCtx({
      storage,
      config: { token: 'org-a', agentId: 'agent-a' } as WidgetConfig,
    });
    const second = new StorageCtx({
      storage,
      config: { token: 'org-a', agentId: 'agent-b' } as WidgetConfig,
    });

    await first.setCompanionPillOffsetX(42);
    await first.setCompanionSidebarWidth(480);

    expect(await first.getCompanionPillOffsetX()).toBe(42);
    expect(await first.getCompanionSidebarWidth()).toBe(480);
    expect(await second.getCompanionPillOffsetX()).toBeNull();
    expect(values.size).toBe(2);
  });

  it('ignores corrupt and non-finite values', async () => {
    const { storage, values } = createStorage();
    const ctx = new StorageCtx({
      storage,
      config: { token: 'org-a' } as WidgetConfig,
    });
    values.set(
      'opencx-widget:org-token-org-a:agent-default:companion-sidebar-width',
      'not-a-number',
    );

    expect(await ctx.getCompanionSidebarWidth()).toBeNull();
    await ctx.setCompanionPillOffsetX(Number.NaN);
    expect(values.size).toBe(1);
  });
});
