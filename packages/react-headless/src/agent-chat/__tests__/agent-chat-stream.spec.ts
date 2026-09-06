import { describe, expect, it } from 'vitest';
import { mapUiPartsToItems, type UiMessageLike } from '../agent-chat-stream';

describe('mapUiPartsToItems', () => {
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

    const items = mapUiPartsToItems(message.parts);

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
        // The call's arguments and result ride the step (the styled layer
        // shows them only behind `showStepToolIO`).
        { kind: 'tool', label: 'search_kb', done: true, input: {}, output: {} },
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
    const items = mapUiPartsToItems(message.parts);
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
    expect(mapUiPartsToItems(message.parts)).toEqual([
      { kind: 'text', text: 'real content' },
    ]);
  });

  it('returns an empty list for a message with no renderable parts', () => {
    expect(mapUiPartsToItems([])).toEqual([]);
  });

  it('a keepalive heartbeat renders nothing, before or between real parts', () => {
    // Transient on the wire (the SDK never adds it), but a persisted
    // `ui_parts` snapshot or an older backend might carry one.
    expect(
      mapUiPartsToItems([
        { type: 'data-keepalive', data: null, transient: true },
      ]),
    ).toEqual([]);
    expect(
      mapUiPartsToItems([
        { type: 'data-keepalive', data: null, transient: true },
        { type: 'text', text: 'hello', state: 'done' },
        { type: 'data-keepalive', data: null, transient: true },
      ]),
    ).toEqual([{ kind: 'text', text: 'hello' }]);
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
    const items = mapUiPartsToItems([
      { type: 'text', text: 'Here is your summary:', state: 'done' },
      { type: 'data-spec', data: patch1 },
      { type: 'text', text: 'And a note after.', state: 'done' },
      { type: 'data-spec', data: patch2 },
    ]);

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
    const items = mapUiPartsToItems([
      { type: 'reasoning', text: 'planning', state: 'done' },
      {
        type: 'data-spec',
        data: {
          type: 'patch',
          patch: { op: 'add', path: '/root', value: 'r' },
        },
      },
      { type: 'reasoning', text: 'rendering', state: 'done' },
    ]);
    expect(items.map((item) => item.kind)).toEqual(['steps', 'spec', 'steps']);
  });
});

describe('tool step arguments and result', () => {
  it('carries a tool part input/output onto its step', () => {
    const items = mapUiPartsToItems([
      {
        type: 'tool-search_knowledge_base',
        state: 'output-available',
        input: { query: 'refund policy' },
        output: { hits: 3 },
      },
      {
        type: 'dynamic-tool',
        toolName: 'highlight_element',
        state: 'output-available',
        input: { selector: '#save' },
        output: 'ok',
      },
    ]);

    expect(items).toEqual([
      {
        kind: 'steps',
        steps: [
          {
            kind: 'tool',
            label: 'search_knowledge_base',
            done: true,
            input: { query: 'refund policy' },
            output: { hits: 3 },
          },
          {
            kind: 'tool',
            label: 'highlight_element',
            done: true,
            input: { selector: '#save' },
            output: 'ok',
          },
        ],
      },
    ]);
  });

  it('omits what the part does not carry — a running call has no result yet', () => {
    const [item] = mapUiPartsToItems([
      {
        type: 'tool-search_knowledge_base',
        state: 'input-available',
        input: { q: 'x' },
      },
      { type: 'tool-noop', state: 'output-available' },
    ]);

    expect(item).toEqual({
      kind: 'steps',
      steps: [
        {
          kind: 'tool',
          label: 'search_knowledge_base',
          done: false,
          input: { q: 'x' },
        },
        { kind: 'tool', label: 'noop', done: true },
      ],
    });
  });
});
