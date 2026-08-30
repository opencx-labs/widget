import { describe, expect, it, vi } from 'vitest';
import { isApplePlatform } from '../../utils/keybindings';
import {
  handleCompanionFrameKeyDown,
  handleCompanionHostKeyDown,
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
    const onEscape = vi.fn();
    const onToggleFullscreen = vi.fn();

    handleCompanionFrameKeyDown(keyEvent('Escape'), {
      state: 'chat',
      onEscape,
      onToggleFullscreen,
    });
    expect(onEscape).toHaveBeenCalledOnce();

    const nestedTarget = document.createElement('button');
    const nestedScope = document.createElement('div');
    nestedScope.setAttribute('data-opencx-escape-scope', '');
    nestedScope.appendChild(nestedTarget);
    handleCompanionFrameKeyDown(keyEvent('Escape', { target: nestedTarget }), {
      state: 'chat',
      onEscape,
      onToggleFullscreen,
    });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('respects a nested dismissible that already prevented Escape', () => {
    const onEscape = vi.fn();
    handleCompanionFrameKeyDown(
      keyEvent('Escape', { defaultPrevented: true }),
      { state: 'chat', onEscape, onToggleFullscreen: vi.fn() },
    );
    expect(onEscape).not.toHaveBeenCalled();
  });
});
