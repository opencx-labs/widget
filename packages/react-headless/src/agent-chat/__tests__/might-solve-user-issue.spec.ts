import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { readMightSolveUserIssue } from '../might-solve-user-issue';

const assistant = (metadata: unknown): UIMessage => ({
  id: 'a1',
  role: 'assistant',
  metadata,
  parts: [{ type: 'text', text: 'Your refund was issued on Monday.' }],
});

describe('readMightSolveUserIssue', () => {
  it('reads true and false off the finished assistant message', () => {
    expect(
      readMightSolveUserIssue(assistant({ mightSolveUserIssue: true })),
    ).toBe(true);
    expect(
      readMightSolveUserIssue(assistant({ mightSolveUserIssue: false })),
    ).toBe(false);
  });

  it.each([
    ['no metadata', undefined],
    ['other metadata only', { turn: 1 }],
    ['a non-boolean value', { mightSolveUserIssue: 'true' }],
  ])('is false for %s', (_label, metadata) => {
    expect(readMightSolveUserIssue(assistant(metadata))).toBe(false);
  });

  it('ignores a message that is not the assistant reply', () => {
    // Same metadata that reads true on the assistant message above.
    const user: UIMessage = {
      id: 'u1',
      role: 'user',
      metadata: { mightSolveUserIssue: true },
      parts: [{ type: 'text', text: 'where is my refund?' }],
    };
    expect(readMightSolveUserIssue(user)).toBe(false);
  });
});
