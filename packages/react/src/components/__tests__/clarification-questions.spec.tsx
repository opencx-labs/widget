import type { AskQuestionsRequest } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const sendMessage = vi.fn();
const widgetCtx = { features: { pageContext: false } };

vi.mock('@opencx/widget-react-headless', () => ({
  useMessages: () => ({ sendMessage }),
  useWidget: () => ({ widgetCtx }),
  // The real formatter, so the message this card actually sends is asserted
  // rather than a stand-in.
  formatAskQuestionsAnswers: (
    request: AskQuestionsRequest,
    answers: ReadonlyMap<string, string>,
  ) =>
    request.questions
      .flatMap((question) => {
        const answer = answers.get(question.id);
        return answer && answer.trim()
          ? [`Q: ${question.prompt}\nA: ${answer.trim()}`]
          : [];
      })
      .join('\n\n'),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ClarificationQuestions } from '../ClarificationQuestions';

function request(
  overrides: Partial<AskQuestionsRequest['questions'][number]> = {},
): AskQuestionsRequest {
  return {
    request_id: 'req-1',
    questions: [
      {
        id: 'q0',
        prompt: 'Which order is this about?',
        selection: 'single',
        options: [
          { id: 'may', label: 'The May order' },
          { id: 'june', label: 'The June order' },
        ],
        ...overrides,
      },
    ],
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function render(node: React.ReactElement) {
  act(() => root.render(node));
}

function optionButtons() {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '[data-component="chat/clarification_questions/option"]',
    ),
  );
}

function button(name: string) {
  const el = container.querySelector<HTMLButtonElement>(
    `[data-component="chat/clarification_questions/${name}"]`,
  );
  if (!el) throw new Error(`no ${name} button rendered`);
  return el;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  sendMessage.mockClear();
  widgetCtx.features.pageContext = false;
  container = document.createElement('div');
  container.id = 'opencx-root';
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('clarification page context at submission', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    // jsdom has no layout. Native visibility/privacy behavior is covered by
    // send-context.browser.spec.ts; these cases exercise the answer send path.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 20),
    );
    host = document.createElement('div');
    host.innerHTML = '<button>Old screen</button>';
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it('sends fresh controls without stale controls, private fields or widget UI', () => {
    widgetCtx.features.pageContext = true;
    render(<ClarificationQuestions request={request()} />);
    click(optionButtons()[0]!);
    host.innerHTML = `
      <button>Open payments</button>
      <div data-opencx-private><button>PRIVATE_CONTROL</button></div>
      <input type="password" aria-label="Password" value="PRIVATE_PASSWORD">
      <input aria-label="Search" value="PRIVATE_FIELD_VALUE">
    `;
    click(button('send'));
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({
      content: 'Q: Which order is this about?\nA: The May order',
      clientContext: {
        page_controls: [
          { ref: expect.any(String), role: 'button', name: 'Open payments' },
          { ref: expect.any(String), role: 'textbox', name: 'Search' },
        ],
      },
    });
  });

  it('does not share the page when permission is revoked while answering', () => {
    widgetCtx.features.pageContext = true;
    render(<ClarificationQuestions request={request()} />);
    click(optionButtons()[0]!);
    widgetCtx.features.pageContext = false;
    click(button('send'));
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({
      content: 'Q: Which order is this about?\nA: The May order',
      clientContext: undefined,
    });
  });

  it('reads the current permission when sharing is enabled after the question appears', () => {
    render(<ClarificationQuestions request={request()} />);
    click(optionButtons()[0]!);
    widgetCtx.features.pageContext = true;
    click(button('send'));
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({
      content: 'Q: Which order is this about?\nA: The May order',
      clientContext: {
        page_controls: [
          { ref: expect.any(String), role: 'button', name: 'Old screen' },
        ],
      },
    });
  });
});

describe('ClarificationQuestions', () => {
  it('shows the question and its options, not the raw tool call', () => {
    render(<ClarificationQuestions request={request()} />);
    expect(container.textContent).toContain('Which order is this about?');
    expect(optionButtons().map((b) => b.textContent)).toEqual([
      'The May order',
      'The June order',
    ]);
    expect(container.textContent).not.toContain('ask_questions');
  });

  it('refuses to send until something is chosen', () => {
    render(<ClarificationQuestions request={request()} />);
    expect(button('send').disabled).toBe(true);
    click(button('send'));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends the chosen option as one Q/A message', () => {
    render(<ClarificationQuestions request={request()} />);
    click(optionButtons()[0]!);
    click(button('send'));
    expect(sendMessage).toHaveBeenCalledWith({
      content: 'Q: Which order is this about?\nA: The May order',
    });
  });

  it('replaces the choice on a single-selection question', () => {
    render(<ClarificationQuestions request={request()} />);
    click(optionButtons()[0]!);
    click(optionButtons()[1]!);
    expect(optionButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
    ]);
    click(button('send'));
    expect(sendMessage).toHaveBeenCalledWith({
      content: 'Q: Which order is this about?\nA: The June order',
    });
  });

  it('accumulates choices on a multiple-selection question', () => {
    render(
      <ClarificationQuestions request={request({ selection: 'multiple' })} />,
    );
    click(optionButtons()[0]!);
    click(optionButtons()[1]!);
    click(button('send'));
    expect(sendMessage).toHaveBeenCalledWith({
      content:
        'Q: Which order is this about?\nA: The May order, The June order',
    });
  });

  it('deselects a multiple-selection option that is clicked twice', () => {
    render(
      <ClarificationQuestions request={request({ selection: 'multiple' })} />,
    );
    click(optionButtons()[0]!);
    click(optionButtons()[0]!);
    expect(button('send').disabled).toBe(true);
  });

  it('lets the customer type an answer instead of choosing', () => {
    render(<ClarificationQuestions request={request()} />);
    click(button('type_it'));
    const input = container.querySelector<HTMLTextAreaElement>(
      '[data-component="chat/clarification_questions/manual_input"]',
    );
    if (!input) throw new Error('no manual input rendered');
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    act(() => {
      setter?.call(input, 'Neither — the April one');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(button('send'));
    expect(sendMessage).toHaveBeenCalledWith({
      content: 'Q: Which order is this about?\nA: Neither — the April one',
    });
  });

  it('does not send a whitespace-only typed answer', () => {
    render(<ClarificationQuestions request={request()} />);
    click(button('type_it'));
    click(button('send'));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends only once however often send is clicked', () => {
    render(<ClarificationQuestions request={request()} />);
    click(optionButtons()[0]!);
    click(button('send'));
    click(button('send'));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('walks a multi-question card and sends every answer together', () => {
    const multi: AskQuestionsRequest = {
      request_id: 'req-2',
      questions: [
        {
          id: 'q0',
          prompt: 'Which order?',
          selection: 'single',
          options: [{ id: 'may', label: 'May' }],
        },
        {
          id: 'q1',
          prompt: 'Refund or replace?',
          selection: 'single',
          options: [{ id: 'refund', label: 'Refund' }],
        },
      ],
    };
    render(<ClarificationQuestions request={multi} />);
    expect(container.textContent).toContain('1 / 2');
    click(optionButtons()[0]!);
    click(button('next'));
    expect(container.textContent).toContain('Refund or replace?');
    click(optionButtons()[0]!);
    click(button('send'));
    expect(sendMessage).toHaveBeenCalledWith({
      content: 'Q: Which order?\nA: May\n\nQ: Refund or replace?\nA: Refund',
    });
  });

  it('will not advance past an unanswered question', () => {
    const multi: AskQuestionsRequest = {
      request_id: 'req-3',
      questions: [
        {
          id: 'q0',
          prompt: 'First?',
          selection: 'single',
          options: [{ id: 'a', label: 'A' }],
        },
        {
          id: 'q1',
          prompt: 'Second?',
          selection: 'single',
          options: [{ id: 'b', label: 'B' }],
        },
      ],
    };
    render(<ClarificationQuestions request={multi} />);
    expect(button('next').disabled).toBe(true);
    click(button('next'));
    expect(container.textContent).toContain('First?');
  });

  it('renders nothing for a request that carries no questions', () => {
    render(
      <ClarificationQuestions request={{ request_id: 'r', questions: [] }} />,
    );
    expect(container.textContent).toBe('');
  });

  it('hides the counter on a single-question card', () => {
    render(<ClarificationQuestions request={request()} />);
    expect(container.textContent).not.toContain('1 / 1');
  });
});
