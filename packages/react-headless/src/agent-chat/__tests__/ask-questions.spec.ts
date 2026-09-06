import { describe, expect, it } from 'vitest';
import {
  formatAskQuestionsAnswers,
  isAskQuestionsToolName,
  parseAskQuestionsPayload,
} from '../ask-questions';
import { mapUiPartsToItems } from '../agent-chat-stream';

const QUESTION = {
  prompt: 'Which order is this about?',
  options: ['The May order', 'The June order'],
};

describe('isAskQuestionsToolName', () => {
  it('matches the bare name and the MCP-prefixed name', () => {
    expect(isAskQuestionsToolName('ask_questions')).toBe(true);
    expect(isAskQuestionsToolName('mcp__opencx__ask_questions')).toBe(true);
  });

  it('does not match another tool or a missing name', () => {
    expect(isAskQuestionsToolName('search_knowledge')).toBe(false);
    expect(isAskQuestionsToolName(undefined)).toBe(false);
  });
});

describe('parseAskQuestionsPayload', () => {
  it('normalises the loose model-emitted shape into stable ids', () => {
    const request = parseAskQuestionsPayload(
      { questions: [QUESTION] },
      'call-1',
    );
    expect(request).toEqual({
      request_id: 'call-1',
      questions: [
        {
          id: 'q0',
          prompt: 'Which order is this about?',
          selection: 'single',
          options: [
            { id: 'q0-o0', label: 'The May order' },
            { id: 'q0-o1', label: 'The June order' },
          ],
        },
      ],
    });
  });

  it('keeps the ids an MCP server supplied rather than generating its own', () => {
    const request = parseAskQuestionsPayload({
      request_id: 'req-7',
      questions: [
        {
          id: 'order',
          prompt: 'Which order?',
          selection: 'multiple',
          options: [{ id: 'may', label: 'May' }],
        },
      ],
    });
    expect(request?.request_id).toBe('req-7');
    expect(request?.questions[0]?.id).toBe('order');
    expect(request?.questions[0]?.selection).toBe('multiple');
    expect(request?.questions[0]?.options[0]).toEqual({
      id: 'may',
      label: 'May',
    });
  });

  it('reads a JSON string payload', () => {
    expect(
      parseAskQuestionsPayload(JSON.stringify({ questions: [QUESTION] })),
    ).not.toBeNull();
  });

  it('reads an MCP content-array payload', () => {
    const payload = [
      { type: 'text', text: JSON.stringify({ questions: [QUESTION] }) },
    ];
    expect(parseAskQuestionsPayload(payload)).not.toBeNull();
  });

  it('drops chips that merely restate the type-it-yourself escape', () => {
    const request = parseAskQuestionsPayload({
      questions: [
        {
          ...QUESTION,
          options: [...QUESTION.options, "I'll type it", 'Other'],
        },
      ],
    });
    expect(request?.questions[0]?.options.map((o) => o.label)).toEqual([
      'The May order',
      'The June order',
    ]);
  });

  it('keeps a specific option that merely starts with a dropped word', () => {
    const request = parseAskQuestionsPayload({
      questions: [{ ...QUESTION, options: ['Other reason'] }],
    });
    expect(request?.questions[0]?.options.map((o) => o.label)).toEqual([
      'Other reason',
    ]);
  });

  it.each([
    ['null', null],
    ['a non-JSON string', 'not json'],
    ['an unrelated object', { foo: 'bar' }],
    ['an empty question list', { questions: [] }],
    [
      'a question with no options',
      { questions: [{ prompt: 'Which?', options: [] }] },
    ],
    ['a question with no prompt', { questions: [{ options: ['a'] }] }],
  ])('returns null for %s rather than throwing', (_label, payload) => {
    expect(parseAskQuestionsPayload(payload)).toBeNull();
  });

  it('falls back to a stable request id when none was supplied', () => {
    expect(
      parseAskQuestionsPayload({ questions: [QUESTION] })?.request_id,
    ).toBe('req-clarification');
  });
});

describe('formatAskQuestionsAnswers', () => {
  const request = parseAskQuestionsPayload({
    questions: [
      QUESTION,
      { prompt: 'Refund or replace?', options: ['Refund'] },
    ],
  });

  it('writes one Q/A block per answered question', () => {
    if (!request) throw new Error('fixture failed to parse');
    const answers = new Map([
      ['q0', 'The May order'],
      ['q1', 'Refund'],
    ]);
    expect(formatAskQuestionsAnswers(request, answers)).toBe(
      'Q: Which order is this about?\nA: The May order\n\nQ: Refund or replace?\nA: Refund',
    );
  });

  it('skips unanswered and whitespace-only answers', () => {
    if (!request) throw new Error('fixture failed to parse');
    const answers = new Map([['q1', '   ']]);
    expect(formatAskQuestionsAnswers(request, answers)).toBe('');
  });
});

describe('mapUiPartsToItems — ask_questions', () => {
  it('renders the question instead of a tool step', () => {
    const items = mapUiPartsToItems([
      {
        type: 'tool-ask_questions',
        toolCallId: 'call-1',
        state: 'input-available',
        input: { questions: [QUESTION] },
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('questions');
    if (items[0]?.kind === 'questions') {
      expect(items[0].request.questions[0]?.prompt).toBe(
        'Which order is this about?',
      );
    }
  });

  it('handles the dynamic-tool part shape the MCP path produces', () => {
    const items = mapUiPartsToItems([
      {
        type: 'dynamic-tool',
        toolName: 'mcp__opencx__ask_questions',
        toolCallId: 'call-2',
        state: 'output-available',
        output: { questions: [QUESTION] },
      },
    ]);
    expect(items[0]?.kind).toBe('questions');
  });

  it('prefers the output over the input, because the server supplied real ids', () => {
    const items = mapUiPartsToItems([
      {
        type: 'tool-ask_questions',
        toolCallId: 'call-3',
        state: 'output-available',
        input: { questions: [{ prompt: 'from input', options: ['a'] }] },
        output: {
          request_id: 'server',
          questions: [{ prompt: 'from output', options: ['b'] }],
        },
      },
    ]);
    if (items[0]?.kind !== 'questions')
      throw new Error('expected a questions item');
    expect(items[0].request.request_id).toBe('server');
    expect(items[0].request.questions[0]?.prompt).toBe('from output');
  });

  it('renders nothing at all while the call is still streaming its arguments', () => {
    const items = mapUiPartsToItems([
      { type: 'tool-ask_questions', toolCallId: 'c', state: 'input-streaming' },
    ]);
    expect(items).toEqual([]);
  });

  it('renders nothing for a malformed payload — never the raw tool', () => {
    const items = mapUiPartsToItems([
      {
        type: 'tool-ask_questions',
        toolCallId: 'c',
        state: 'output-available',
        output: { nope: true },
      },
    ]);
    expect(items).toEqual([]);
  });

  it("keeps the turn's own text when the call itself renders nothing", () => {
    const items = mapUiPartsToItems([
      { type: 'text', text: 'I need the ticket number first.' },
      { type: 'tool-ask_questions', toolCallId: 'c', state: 'input-streaming' },
    ]);
    expect(items).toEqual([
      { kind: 'text', text: 'I need the ticket number first.' },
    ]);
  });

  it('keeps every questionnaire of a turn, in order', () => {
    const part = (id: string, prompt: string) => ({
      type: 'tool-ask_questions',
      toolCallId: id,
      state: 'output-available',
      output: { questions: [{ prompt, options: ['a'] }] },
    });
    const items = mapUiPartsToItems([
      part('c1', 'first'),
      part('c2', 'second'),
    ]);
    expect(
      items.map((item) =>
        item.kind === 'questions' ? item.request.questions[0]?.prompt : null,
      ),
    ).toEqual(['first', 'second']);
  });

  it('keeps its position in stream order between text and steps', () => {
    const items = mapUiPartsToItems([
      { type: 'text', text: 'Before I look' },
      {
        type: 'tool-ask_questions',
        toolCallId: 'c',
        state: 'output-available',
        output: { questions: [QUESTION] },
      },
      { type: 'reasoning', text: 'waiting', state: 'done' },
    ]);
    expect(items.map((item) => item.kind)).toEqual([
      'text',
      'questions',
      'steps',
    ]);
  });

  it('does not divert another tool whose name merely mentions questions', () => {
    const items = mapUiPartsToItems([
      {
        type: 'tool-search_faq',
        toolCallId: 'c',
        state: 'output-available',
        output: { questions: [QUESTION] },
      },
    ]);
    expect(items[0]?.kind).toBe('steps');
  });
});
