import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { mapUiMessageToItems } from '../agent-chat-stream';

/**
 * The v5 live-turn renderer derives its ordered items straight from useChat's
 * assistant message parts. This locks the mapping: text blocks in order,
 * consecutive reasoning/tool parts folded into one steps group at their true
 * position, whitespace-only text dropped.
 */
describe('mapUiMessageToItems', () => {
  it('maps parts in order, folding consecutive activity into one steps group', () => {
    const message: UIMessage = {
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Let me check that', state: 'done' },
        { type: 'reasoning', text: 'looking up the order', state: 'done' },
        {
          type: 'tool-search_kb',
          toolCallId: 'c1',
          state: 'output-available',
          input: {},
          output: {},
        },
        { type: 'text', text: 'Here is what I found', state: 'done' },
      ],
    };

    const items = mapUiMessageToItems(message);

    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ kind: 'text', text: 'Let me check that' });
    expect(items[1]?.kind).toBe('steps');
    if (items[1]?.kind === 'steps') {
      expect(items[1].steps).toHaveLength(2);
      expect(items[1].steps[0]).toEqual({ kind: 'reasoning', label: 'looking up the order', done: true });
      expect(items[1].steps[1]).toEqual({ kind: 'tool', label: 'search_kb', done: true });
    }
    expect(items[2]).toEqual({ kind: 'text', text: 'Here is what I found' });
  });

  it('marks still-streaming activity as not done', () => {
    const message: UIMessage = {
      id: 'm2',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'thinking', state: 'streaming' },
        { type: 'tool-lookup', toolCallId: 'c2', state: 'input-available', input: {} },
      ],
    };
    const items = mapUiMessageToItems(message);
    expect(items).toHaveLength(1);
    if (items[0]?.kind === 'steps') {
      expect(items[0].steps[0]?.done).toBe(false);
      expect(items[0].steps[1]?.done).toBe(false);
    }
  });

  it('drops whitespace-only text parts', () => {
    const message: UIMessage = {
      id: 'm3',
      role: 'assistant',
      parts: [
        { type: 'text', text: '   \n ', state: 'done' },
        { type: 'text', text: 'real content', state: 'done' },
      ],
    };
    const items = mapUiMessageToItems(message);
    expect(items).toEqual([{ kind: 'text', text: 'real content' }]);
  });

  it('returns an empty list for a message with no renderable parts', () => {
    const message: UIMessage = { id: 'm4', role: 'assistant', parts: [] };
    expect(mapUiMessageToItems(message)).toEqual([]);
  });

  it('folds all data-spec parts into ONE spec item anchored at the first patch', () => {
    const patch1 = { type: 'patch', patch: { op: 'add', path: '/root', value: 'main' } };
    const patch2 = {
      type: 'patch',
      patch: {
        op: 'add',
        path: '/elements/main',
        value: { type: 'Card', props: {}, children: [] },
      },
    };
    const message: UIMessage = {
      id: 'm5',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Here is your summary:', state: 'done' },
        { type: 'data-spec', data: patch1 },
        { type: 'text', text: 'And a note after.', state: 'done' },
        { type: 'data-spec', data: patch2 },
      ],
    };

    const items = mapUiMessageToItems(message);

    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ kind: 'text', text: 'Here is your summary:' });
    // The spec item sits where the FIRST patch appeared…
    expect(items[1]).toEqual({
      kind: 'spec',
      parts: [
        { type: 'data-spec', data: patch1 },
        { type: 'data-spec', data: patch2 },
      ],
    });
    // …and later patches grew it in place instead of adding a second item.
    expect(items[2]).toEqual({ kind: 'text', text: 'And a note after.' });
    expect(items.filter((i) => i.kind === 'spec')).toHaveLength(1);
  });

  it('spec parts do not break steps folding around them', () => {
    const message: UIMessage = {
      id: 'm6',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'planning', state: 'done' },
        { type: 'data-spec', data: { type: 'patch', patch: { op: 'add', path: '/root', value: 'r' } } },
        { type: 'reasoning', text: 'rendering', state: 'done' },
      ],
    };
    const items = mapUiMessageToItems(message);
    // reasoning | spec | reasoning — the spec splits the steps groups (true
    // chronological position), each group keeps its own steps.
    expect(items.map((i) => i.kind)).toEqual(['steps', 'spec', 'steps']);
  });
});
