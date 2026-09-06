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
  it('scopes preferences by organization token', async () => {
    const { storage, values } = createStorage();
    const first = new StorageCtx({
      storage,
      config: { token: 'org-a' } as WidgetConfig,
    });
    const second = new StorageCtx({
      storage,
      config: { token: 'org-b' } as WidgetConfig,
    });

    await first.setCompanionPillOffsetX(42);
    await first.setCompanionSidebarWidth(480);

    expect(await first.getCompanionPillOffsetX()).toBe(42);
    expect(await first.getCompanionSidebarWidth()).toBe(480);
    expect(await second.getCompanionPillOffsetX()).toBeNull();
    expect(values.size).toBe(2);
    expect(Array.from(values.keys())).toEqual([
      'opencx-widget:org-token-org-a:companion-pill-offset-x',
      'opencx-widget:org-token-org-a:companion-sidebar-width',
    ]);
  });

  it('keys the active-session pointer by organization token only', async () => {
    const { storage, values } = createStorage();
    const ctx = new StorageCtx({
      storage,
      config: { token: 'org-a' } as WidgetConfig,
    });

    await ctx.setActiveSessionId('sess-1');
    expect(Array.from(values.keys())).toEqual([
      'opencx-widget:org-token-org-a:active-session',
    ]);
    expect(await ctx.getActiveSessionId()).toBe('sess-1');

    await ctx.clearActiveSessionId();
    expect(values.size).toBe(0);
  });

  it('remembers the resting layout per organization, rejecting anything else', async () => {
    const { storage, values } = createStorage();
    const ctx = new StorageCtx({
      storage,
      config: { token: 'org-a' } as WidgetConfig,
    });

    expect(await ctx.getCompanionLayout()).toBeNull();

    await ctx.setCompanionLayout('sidebar');
    expect(Array.from(values.keys())).toEqual([
      'opencx-widget:org-token-org-a:companion-layout',
    ]);
    expect(await ctx.getCompanionLayout()).toBe('sidebar');

    // A hand-edited or stale value must read as "no preference" rather than
    // reopening the panel in a layout the shell cannot rest in.
    values.set('opencx-widget:org-token-org-a:companion-layout', 'fullscreen');
    expect(await ctx.getCompanionLayout()).toBeNull();
    values.set('opencx-widget:org-token-org-a:companion-layout', 'wat');
    expect(await ctx.getCompanionLayout()).toBeNull();
  });

  it('ignores corrupt and non-finite values', async () => {
    const { storage, values } = createStorage();
    const ctx = new StorageCtx({
      storage,
      config: { token: 'org-a' } as WidgetConfig,
    });
    values.set(
      'opencx-widget:org-token-org-a:companion-sidebar-width',
      'not-a-number',
    );

    expect(await ctx.getCompanionSidebarWidth()).toBeNull();
    await ctx.setCompanionPillOffsetX(Number.NaN);
    expect(values.size).toBe(1);
  });
});
