import { describe, expect, it } from 'vitest';
import { mapUiMessageToItems, type UiMessageLike } from '../agent-chat-stream';

describe('mapUiMessageToItems', () => {
  it('maps parts in order, folding consecutive activity into one steps group', () => {
    const message: UiMessageLike = {
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
      expect(items[1].steps).toEqual([
        {
          kind: 'reasoning',
          label: 'looking up the order',
          done: true,
        },
        { kind: 'tool', label: 'search_kb', done: true },
      ]);
    }
    expect(items[2]).toEqual({ kind: 'text', text: 'Here is what I found' });
  });

  it('marks still-streaming activity as not done', () => {
    const message: UiMessageLike = {
      parts: [
        { type: 'reasoning', text: 'thinking', state: 'streaming' },
        {
          type: 'tool-lookup',
          toolCallId: 'c2',
          state: 'input-available',
          input: {},
        },
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
    const message: UiMessageLike = {
      parts: [
        { type: 'text', text: '   \n ', state: 'done' },
        { type: 'text', text: 'real content', state: 'done' },
      ],
    };
    expect(mapUiMessageToItems(message)).toEqual([
      { kind: 'text', text: 'real content' },
    ]);
  });

  it('returns an empty list for a message with no renderable parts', () => {
    expect(mapUiMessageToItems({ parts: [] })).toEqual([]);
  });

  it('folds all data-spec parts into one spec item at the first patch', () => {
    const patch1 = {
      type: 'patch',
      patch: { op: 'add', path: '/root', value: 'main' },
    };
    const patch2 = {
      type: 'patch',
      patch: {
        op: 'add',
        path: '/elements/main',
        value: { type: 'Card', props: {}, children: [] },
      },
    };
    const items = mapUiMessageToItems({
      parts: [
        { type: 'text', text: 'Here is your summary:', state: 'done' },
        { type: 'data-spec', data: patch1 },
        { type: 'text', text: 'And a note after.', state: 'done' },
        { type: 'data-spec', data: patch2 },
      ],
    });

    expect(items).toEqual([
      { kind: 'text', text: 'Here is your summary:' },
      {
        kind: 'spec',
        parts: [
          { type: 'data-spec', data: patch1 },
          { type: 'data-spec', data: patch2 },
        ],
      },
      { kind: 'text', text: 'And a note after.' },
    ]);
  });

  it('spec parts do not break steps folding around them', () => {
    const items = mapUiMessageToItems({
      parts: [
        { type: 'reasoning', text: 'planning', state: 'done' },
        {
          type: 'data-spec',
          data: {
            type: 'patch',
            patch: { op: 'add', path: '/root', value: 'r' },
          },
        },
        { type: 'reasoning', text: 'rendering', state: 'done' },
      ],
    });
    expect(items.map((item) => item.kind)).toEqual(['steps', 'spec', 'steps']);
  });
});
