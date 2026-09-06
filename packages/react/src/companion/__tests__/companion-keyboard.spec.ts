import { describe, expect, it, vi } from 'vitest';
import { isApplePlatform } from '../../utils/keybindings';
import {
  handleCompanionFrameKeyDown,
  handleCompanionHostKeyDown,
  resolveEscapeAction,
} from '../companion-keyboard';

function keyEvent(
  key: string,
  overrides: Partial<KeyboardEvent> = {},
): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: null,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent;
}

function fullscreenEvent(): KeyboardEvent {
  return keyEvent('f', {
    shiftKey: true,
    ...(isApplePlatform() ? { metaKey: true } : { ctrlKey: true }),
  });
}

describe('companion keyboard ownership', () => {
  it('never handles bare Escape on the host document', () => {
    const onToggleFullscreen = vi.fn();
    const event = keyEvent('Escape');

    handleCompanionHostKeyDown(event, {
      state: 'chat',
      onToggleFullscreen,
    });

    expect(onToggleFullscreen).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('keeps the modified fullscreen chord on the host while chat is open', () => {
    const onToggleFullscreen = vi.fn();
    const event = fullscreenEvent();

    handleCompanionHostKeyDown(event, {
      state: 'chat',
      onToggleFullscreen,
    });

    expect(onToggleFullscreen).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('handles Escape inside the frame only when no nested dismissal owns it', () => {
    const onDismiss = vi.fn();
    const onToggleFullscreen = vi.fn();

    handleCompanionFrameKeyDown(keyEvent('Escape'), {
      state: 'chat',
      onDismiss,
      onToggleFullscreen,
    });
    expect(onDismiss).toHaveBeenCalledOnce();

    const nestedTarget = document.createElement('button');
    const nestedScope = document.createElement('div');
    nestedScope.setAttribute('data-opencx-escape-scope', '');
    nestedScope.appendChild(nestedTarget);
    handleCompanionFrameKeyDown(keyEvent('Escape', { target: nestedTarget }), {
      state: 'chat',
      onDismiss,
      onToggleFullscreen,
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('respects a nested dismissible that already prevented Escape', () => {
    const onDismiss = vi.fn();
    handleCompanionFrameKeyDown(
      keyEvent('Escape', { defaultPrevented: true }),
      { state: 'chat', onDismiss, onToggleFullscreen: vi.fn() },
    );
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('resolveEscapeAction', () => {
  const allLayouts = ['compact', 'sidebar', 'fullscreen'] as const;

  it('leaves fullscreen for the layout the panel came from', () => {
    expect(
      resolveEscapeAction({
        panelLayout: 'fullscreen',
        previousLayout: 'sidebar',
        defaultLayout: 'compact',
        allowedLayouts: allLayouts,
      }),
    ).toEqual({ kind: 'layout', layout: 'sidebar' });
  });

  it('closes from every other layout — Escape dismisses, it does not minimize', () => {
    for (const panelLayout of ['compact', 'sidebar'] as const) {
      expect(
        resolveEscapeAction({
          panelLayout,
          previousLayout: panelLayout,
          defaultLayout: 'compact',
          allowedLayouts: allLayouts,
        }),
        panelLayout,
      ).toEqual({ kind: 'close' });
    }
  });

  it('falls back to the configured layout when the previous one is excluded', () => {
    expect(
      resolveEscapeAction({
        panelLayout: 'fullscreen',
        previousLayout: 'sidebar',
        defaultLayout: 'compact',
        allowedLayouts: ['compact', 'fullscreen'],
      }),
    ).toEqual({ kind: 'layout', layout: 'compact' });
  });

  it('falls back to any allowed layout when neither candidate survives', () => {
    expect(
      resolveEscapeAction({
        panelLayout: 'fullscreen',
        previousLayout: 'fullscreen',
        defaultLayout: 'fullscreen',
        allowedLayouts: ['sidebar', 'fullscreen'],
      }),
    ).toEqual({ kind: 'layout', layout: 'sidebar' });
  });

  it('closes a fullscreen-only embed: there is no mode to fall back to', () => {
    expect(
      resolveEscapeAction({
        panelLayout: 'fullscreen',
        previousLayout: 'fullscreen',
        defaultLayout: 'fullscreen',
        allowedLayouts: ['fullscreen'],
      }),
    ).toEqual({ kind: 'close' });
  });
});
