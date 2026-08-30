import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const layoutState = vi.hoisted(() => ({
  allowedLayouts: ['fullscreen', 'compact', 'sidebar'],
}));

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ disableTooltips: true, language: 'en' }),
  useDocumentDir: () => ({ dir: 'ltr' }),
  useWidgetLayout: () => ({ allowedLayouts: layoutState.allowedLayouts }),
}));

// The unit under test is option construction/order, not Radix's disclosure
// behavior. Render its structural wrappers inline so the menu is inspectable.
vi.mock('@radix-ui/react-popover', async () => {
  const { Fragment, createElement } = await import('react');
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    createElement(Fragment, null, children);
  return {
    Root: Passthrough,
    Trigger: Passthrough,
    Content: Passthrough,
    Close: Passthrough,
  };
});

import { LayoutPicker } from '../LayoutPicker';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('LayoutPicker', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders options in normalized configured order', () => {
    act(() =>
      root.render(<LayoutPicker current="fullscreen" onSelect={() => {}} />),
    );

    const labels = Array.from(
      container.querySelectorAll(
        '[data-component="companion/layout_picker/option"]',
      ),
      (option) => option.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Fullscreen', 'Floating', 'Sidebar']);
  });
});
