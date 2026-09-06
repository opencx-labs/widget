import { describe, expect, it } from 'vitest';
import { resolveHeaderTitle } from '../Header';

/**
 * The header is the ORGANIZATION'S name unless the embed overrides it per
 * screen — exactly as in v4. The agent's branding never leaks into the chrome.
 */
describe('resolveHeaderTitle', () => {
  it('defaults every screen to the org name', () => {
    expect(resolveHeaderTitle('chat', undefined, 'Acme')).toBe('Acme');
    expect(resolveHeaderTitle('sessions', undefined, 'Acme')).toBe('Acme');
    expect(resolveHeaderTitle('welcome', undefined, 'Acme')).toBe('Acme');
  });

  it('honors the per-screen textContent override', () => {
    const textContent = {
      chatScreen: { headerTitle: 'Support' },
      sessionsScreen: { headerTitle: 'Chats' },
    };
    expect(resolveHeaderTitle('chat', textContent, 'Acme')).toBe('Support');
    expect(resolveHeaderTitle('sessions', textContent, 'Acme')).toBe('Chats');
    expect(resolveHeaderTitle('welcome', textContent, 'Acme')).toBe('Acme');
  });
});
