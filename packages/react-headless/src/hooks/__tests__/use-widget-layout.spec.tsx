import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WidgetCompanionLayoutU } from '@opencx/widget-core';
import { WidgetLayoutStateProvider, useWidgetLayout } from '../useWidgetLayout';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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
});
