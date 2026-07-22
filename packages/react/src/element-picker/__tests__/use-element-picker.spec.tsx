import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElementPicker } from '../useElementPicker';
import type { PickedElement } from '../element-info';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Pick-mode lifecycle against a real (jsdom) host document: crosshair style
 * injection, hover tracking, click capture (pick + block the host page),
 * Esc cancel, and full listener/style cleanup.
 */

let container: HTMLDivElement;
let root: Root;
let picker: ReturnType<typeof useElementPicker>;
const onPick = vi.fn<(picked: PickedElement) => void>();

function Harness() {
  picker = useElementPicker({ onPick });
  return null;
}

beforeEach(() => {
  onPick.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<Harness />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

function pageButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = 'host-btn';
  btn.textContent = 'Create Key';
  document.body.appendChild(btn);
  // jsdom has no layout — make hit-testing land on the button.
  document.elementFromPoint = () => btn;
  return btn;
}

const pickerStyle = () => document.querySelector('style[data-opencx-picker-style]');

describe('useElementPicker', () => {
  it('starts inactive: no style injected, no listeners picking', () => {
    expect(picker.isActive).toBe(false);
    expect(pickerStyle()).toBeNull();
    pageButton();
    act(() => {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('activate injects the crosshair style; hover tracks the element under the cursor', () => {
    const btn = pageButton();
    act(() => picker.activate());
    expect(picker.isActive).toBe(true);
    expect(pickerStyle()?.textContent).toContain('crosshair');

    act(() => {
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }),
      );
    });
    expect(picker.hover?.name).toBe('button "Create Key"');

    // Hovering the widget's own chrome clears the highlight.
    const chrome = document.createElement('div');
    chrome.setAttribute('data-opencx-root', '');
    document.body.appendChild(chrome);
    document.elementFromPoint = () => chrome;
    act(() => {
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }),
      );
    });
    expect(picker.hover).toBeNull();
    void btn;
  });

  it('click captures the element, blocks the host page, and exits pick mode', () => {
    const btn = pageButton();
    const hostHandler = vi.fn();
    btn.addEventListener('click', hostHandler);

    act(() => picker.activate());
    let clickEvent: MouseEvent;
    act(() => {
      clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 5,
        clientY: 5,
      });
      btn.dispatchEvent(clickEvent);
    });

    expect(onPick).toHaveBeenCalledTimes(1);
    const picked = onPick.mock.calls[0]![0];
    expect(picked.name).toBe('button "Create Key"');
    expect(picked.selector).toBe('#host-btn');
    // The press never reaches the host page's own handler…
    expect(hostHandler).not.toHaveBeenCalled();
    // …and default behavior is cancelled.
    expect(clickEvent!.defaultPrevented).toBe(true);
    // Single-shot: picking exits pick mode.
    expect(picker.isActive).toBe(false);
    expect(pickerStyle()).toBeNull();
  });

  it('clicks on widget-owned chrome are ignored and stay interactive', () => {
    pageButton();
    const chrome = document.createElement('div');
    chrome.setAttribute('data-opencx-root', '');
    const chromeHandler = vi.fn();
    chrome.addEventListener('click', chromeHandler);
    document.body.appendChild(chrome);

    act(() => picker.activate());
    act(() => {
      chrome.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onPick).not.toHaveBeenCalled();
    expect(chromeHandler).toHaveBeenCalled();
    expect(picker.isActive).toBe(true);
  });

  it('Escape cancels pick mode and cleans everything up', () => {
    pageButton();
    act(() => picker.activate());
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(picker.isActive).toBe(false);
    expect(pickerStyle()).toBeNull();
    expect(picker.hover).toBeNull();

    // After cancel, clicks flow to the page again (listeners removed).
    act(() => {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('toggle flips pick mode on and off', () => {
    act(() => picker.toggle());
    expect(picker.isActive).toBe(true);
    act(() => picker.toggle());
    expect(picker.isActive).toBe(false);
  });
});
