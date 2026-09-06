import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WidgetCompanionLayoutU } from '@opencx/widget-core';
import { vi } from 'vitest';
import { WidgetLayoutStateProvider, useWidgetLayout } from '../useWidgetLayout';

// Captures the ctx so tests can read `layout` and call `setLayout` directly.
let captured: ReturnType<typeof useWidgetLayout> | null = null;
function Probe() {
  captured = useWidgetLayout();
  return null;
}

function providerAt(
  configuredDefaultLayout: WidgetCompanionLayoutU,
  configuredLayouts?: readonly WidgetCompanionLayoutU[],
) {
  return (
    <WidgetLayoutStateProvider
      configuredDefaultLayout={configuredDefaultLayout}
      configuredLayouts={configuredLayouts}
      configuredSidebarSide="right"
      configuredSidebarMode="floating"
    >
      <Probe />
    </WidgetLayoutStateProvider>
  );
}

describe('WidgetLayoutStateProvider', () => {
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
  });

  it('initial layout is the configured default', () => {
    act(() => root.render(providerAt('fullscreen')));
    expect(captured?.layout).toBe('fullscreen');
  });

  it('uses the first allowed layout when the configured default is excluded', () => {
    act(() => root.render(providerAt('compact', ['fullscreen', 'sidebar'])));
    expect(captured?.layout).toBe('fullscreen');
    expect(captured?.defaultLayout).toBe('fullscreen');
  });

  it('exposes allowed layouts in configured order without duplicates', () => {
    act(() =>
      root.render(
        providerAt('sidebar', [
          'fullscreen',
          'sidebar',
          'fullscreen',
          'compact',
        ]),
      ),
    );
    expect(captured?.allowedLayouts).toEqual([
      'fullscreen',
      'sidebar',
      'compact',
    ]);
  });

  it('re-applies the default when the configured default changes after mount (live playground edits)', () => {
    act(() => root.render(providerAt('compact')));
    expect(captured?.layout).toBe('compact');

    act(() => root.render(providerAt('sidebar')));
    expect(captured?.layout).toBe('sidebar');

    act(() => root.render(providerAt('fullscreen')));
    expect(captured?.layout).toBe('fullscreen');
  });

  it('manual setLayout (header toggles) survives re-renders with an UNCHANGED default', () => {
    act(() => root.render(providerAt('compact')));
    act(() => captured?.setLayout('fullscreen'));
    expect(captured?.layout).toBe('fullscreen');

    // Unrelated re-render, same configured default → the user's choice wins.
    act(() => root.render(providerAt('compact')));
    expect(captured?.layout).toBe('fullscreen');
  });

  it('a CHANGED configured default overrides a prior manual toggle', () => {
    act(() => root.render(providerAt('compact')));
    act(() => captured?.setLayout('fullscreen'));
    expect(captured?.layout).toBe('fullscreen');

    act(() => root.render(providerAt('sidebar')));
    expect(captured?.layout).toBe('sidebar');
  });

  it('falls back when live config removes the current manual layout', () => {
    act(() => root.render(providerAt('compact')));
    act(() => captured?.setLayout('fullscreen'));

    act(() => root.render(providerAt('compact', ['sidebar', 'compact'])));
    expect(captured?.layout).toBe('compact');
  });

  it('ignores attempts to transition to an excluded layout', () => {
    act(() => root.render(providerAt('sidebar', ['sidebar'])));
    act(() => captured?.setLayout('compact'));
    expect(captured?.layout).toBe('sidebar');
  });

  it('preserves a valid manual layout when only picker order changes', () => {
    act(() => root.render(providerAt('compact', ['compact', 'sidebar'])));
    act(() => captured?.setLayout('sidebar'));

    act(() => root.render(providerAt('compact', ['sidebar', 'compact'])));
    expect(captured?.layout).toBe('sidebar');
    expect(captured?.allowedLayouts).toEqual(['sidebar', 'compact']);
  });

  it('changing the default to the CURRENT manual value then re-rendering does not thrash', () => {
    act(() => root.render(providerAt('compact')));
    act(() => captured?.setLayout('sidebar'));

    // Default becomes what the user already picked; layout stays put…
    act(() => root.render(providerAt('sidebar')));
    expect(captured?.layout).toBe('sidebar');

    // …and a further unrelated re-render still respects it.
    act(() => root.render(providerAt('sidebar')));
    expect(captured?.layout).toBe('sidebar');
  });

  describe('sidebar side + mode', () => {
    const storageWith = (
      side: 'left' | 'right' | null,
      mode: 'docked' | 'floating' | null,
    ) => ({
      getCompanionLayout: vi.fn(async () => null),
      setCompanionLayout: vi.fn(async () => {}),
      getCompanionSidebarSide: vi.fn(async () => side),
      setCompanionSidebarSide: vi.fn(async () => {}),
      getCompanionSidebarMode: vi.fn(async () => mode),
      setCompanionSidebarMode: vi.fn(async () => {}),
    });

    const sidebarProvider = (
      storage: ReturnType<typeof storageWith> | undefined,
      configuredSidebarSide: 'left' | 'right' = 'right',
      configuredSidebarMode: 'docked' | 'floating' = 'floating',
    ) => (
      <WidgetLayoutStateProvider
        configuredDefaultLayout="sidebar"
        configuredSidebarSide={configuredSidebarSide}
        configuredSidebarMode={configuredSidebarMode}
        storage={storage}
      >
        <Probe />
      </WidgetLayoutStateProvider>
    );

    it('seeds from config when the visitor has saved nothing', async () => {
      const storage = storageWith(null, null);
      await act(async () => {
        root.render(sidebarProvider(storage, 'left', 'docked'));
      });
      expect(captured?.sidebarSide).toBe('left');
      expect(captured?.sidebarMode).toBe('docked');
    });

    it("restores the visitor's saved pick over the configured value", async () => {
      const storage = storageWith('left', 'docked');
      await act(async () => {
        root.render(sidebarProvider(storage, 'right', 'floating'));
      });
      expect(captured?.sidebarSide).toBe('left');
      expect(captured?.sidebarMode).toBe('docked');
    });

    it('persists a pick made through the context', async () => {
      const storage = storageWith(null, null);
      await act(async () => {
        root.render(sidebarProvider(storage));
      });

      act(() => captured?.setSidebarSide('left'));
      act(() => captured?.setSidebarMode('docked'));

      expect(captured?.sidebarSide).toBe('left');
      expect(captured?.sidebarMode).toBe('docked');
      expect(storage.setCompanionSidebarSide).toHaveBeenCalledWith('left');
      expect(storage.setCompanionSidebarMode).toHaveBeenCalledWith('docked');
    });

    it('lets a later config change win over the visitor pick', async () => {
      const storage = storageWith(null, null);
      await act(async () => {
        root.render(sidebarProvider(storage, 'right', 'floating'));
      });
      act(() => captured?.setSidebarSide('left'));
      expect(captured?.sidebarSide).toBe('left');

      // An embedder explicitly moving the sidebar is a deliberate act.
      await act(async () => {
        root.render(sidebarProvider(storage, 'right', 'docked'));
      });
      expect(captured?.sidebarMode).toBe('docked');
      // The side was NOT part of that config change, so the pick survives.
      expect(captured?.sidebarSide).toBe('left');
    });

    it('works without storage (no persistence available)', async () => {
      await act(async () => {
        root.render(sidebarProvider(undefined, 'left', 'docked'));
      });
      expect(captured?.sidebarSide).toBe('left');
      act(() => captured?.setSidebarSide('right'));
      expect(captured?.sidebarSide).toBe('right');
    });
  });

  describe('remembered layout', () => {
    const layoutStorage = (saved: 'compact' | 'sidebar' | null) => ({
      getCompanionLayout: vi.fn(async () => saved),
      setCompanionLayout: vi.fn(async () => {}),
      getCompanionSidebarSide: vi.fn(async () => null),
      setCompanionSidebarSide: vi.fn(async () => {}),
      getCompanionSidebarMode: vi.fn(async () => null),
      setCompanionSidebarMode: vi.fn(async () => {}),
    });

    const layoutProvider = (
      storage: ReturnType<typeof layoutStorage> | undefined,
      configuredDefaultLayout: WidgetCompanionLayoutU = 'compact',
      configuredLayouts?: readonly WidgetCompanionLayoutU[],
    ) => (
      <WidgetLayoutStateProvider
        configuredDefaultLayout={configuredDefaultLayout}
        configuredLayouts={configuredLayouts}
        configuredSidebarSide="right"
        configuredSidebarMode="floating"
        storage={storage}
      >
        <Probe />
      </WidgetLayoutStateProvider>
    );

    it('opens in the layout the visitor last picked, not the configured default', async () => {
      await act(async () => {
        root.render(layoutProvider(layoutStorage('sidebar'), 'compact'));
      });
      expect(captured?.layout).toBe('sidebar');
    });

    it('keeps the configured default when the visitor never picked one', async () => {
      await act(async () => {
        root.render(layoutProvider(layoutStorage(null), 'compact'));
      });
      expect(captured?.layout).toBe('compact');
    });

    it('remembers a pick made in the layout menu', async () => {
      const storage = layoutStorage(null);
      await act(async () => {
        root.render(layoutProvider(storage, 'compact'));
      });

      act(() => captured?.setLayoutPreference('sidebar'));

      expect(captured?.layout).toBe('sidebar');
      expect(storage.setCompanionLayout).toHaveBeenCalledWith('sidebar');
    });

    it('does not let a trip through fullscreen rewrite the remembered layout', async () => {
      const storage = layoutStorage(null);
      await act(async () => {
        root.render(layoutProvider(storage, 'compact'));
      });
      act(() => captured?.setLayoutPreference('sidebar'));
      storage.setCompanionLayout.mockClear();

      act(() => captured?.setLayoutPreference('fullscreen'));

      expect(captured?.layout).toBe('fullscreen');
      expect(storage.setCompanionLayout).not.toHaveBeenCalled();
    });

    it('never persists a layout the embedder excluded', async () => {
      const storage = layoutStorage(null);
      await act(async () => {
        root.render(layoutProvider(storage, 'compact', ['compact']));
      });

      act(() => captured?.setLayoutPreference('sidebar'));

      expect(captured?.layout).toBe('compact');
      expect(storage.setCompanionLayout).not.toHaveBeenCalled();
    });

    it('ignores a saved layout the embedder has since excluded', async () => {
      await act(async () => {
        root.render(
          layoutProvider(layoutStorage('sidebar'), 'compact', ['compact']),
        );
      });
      expect(captured?.layout).toBe('compact');
    });

    it('lets the shell move the visitor without touching what is remembered', async () => {
      const storage = layoutStorage(null);
      await act(async () => {
        root.render(layoutProvider(storage, 'compact'));
      });

      // Leaving fullscreen, opening history: the shell relocating the panel.
      act(() => captured?.setLayout('sidebar'));

      expect(captured?.layout).toBe('sidebar');
      expect(storage.setCompanionLayout).not.toHaveBeenCalled();
    });

    it('works without storage (no persistence available)', async () => {
      await act(async () => {
        root.render(layoutProvider(undefined, 'compact'));
      });
      act(() => captured?.setLayoutPreference('sidebar'));
      expect(captured?.layout).toBe('sidebar');
    });
  });
});
