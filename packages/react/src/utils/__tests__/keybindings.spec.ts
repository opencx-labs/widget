import { describe, expect, it } from 'vitest';
import {
  formatBinding,
  matchesBinding,
  WIDGET_KEYBINDINGS,
} from '../keybindings';

const key = (
  k: string,
  mods: Partial<
    Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>
  > = {},
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('matchesBinding', () => {
  it('resolves Mod to ⌘ on Apple and Ctrl elsewhere', () => {
    const binding = 'Mod+Shift+F';
    expect(
      matchesBinding(
        key('f', { metaKey: true, shiftKey: true }),
        binding,
        true,
      ),
    ).toBe(true);
    expect(
      matchesBinding(
        key('f', { ctrlKey: true, shiftKey: true }),
        binding,
        true,
      ),
    ).toBe(false);
    expect(
      matchesBinding(
        key('f', { ctrlKey: true, shiftKey: true }),
        binding,
        false,
      ),
    ).toBe(true);
    expect(
      matchesBinding(
        key('f', { metaKey: true, shiftKey: true }),
        binding,
        false,
      ),
    ).toBe(false);
  });

  it('rejects extra held modifiers', () => {
    expect(
      matchesBinding(key('Escape', { shiftKey: true }), 'Escape', true),
    ).toBe(false);
    expect(matchesBinding(key('Escape'), 'Escape', true)).toBe(true);
  });

  it('matches keys case-insensitively (Shift uppercases event.key)', () => {
    expect(
      matchesBinding(
        key('F', { metaKey: true, shiftKey: true }),
        'Mod+Shift+F',
        true,
      ),
    ).toBe(true);
  });
});

describe('formatBinding', () => {
  it('renders Apple symbol chains without separators', () => {
    expect(formatBinding('Mod+Shift+F', true)).toBe('⌘⇧F');
    expect(formatBinding('Escape', true)).toBe('Esc');
    expect(formatBinding('Enter', true)).toBe('⏎');
  });

  it('renders spelled-out chords elsewhere', () => {
    expect(formatBinding('Mod+Shift+F', false)).toBe('Ctrl+Shift+F');
    expect(formatBinding('ArrowUp', false)).toBe('↑');
  });
});

describe('registry', () => {
  it('every binding formats on both platforms', () => {
    for (const binding of Object.values(WIDGET_KEYBINDINGS)) {
      expect(formatBinding(binding, true)).toBeTruthy();
      expect(formatBinding(binding, false)).toBeTruthy();
    }
  });
});
