import type { Language, WidgetConfig } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const submitCsat = vi.hoisted(() => vi.fn(async () => {}));
let csat: {
  isCsatRequested: boolean;
  isCsatSubmitted: boolean;
  submittedScore?: number;
  submittedFeedback?: string;
};
let config: {
  language: Language;
  translationOverrides: WidgetConfig['translationOverrides'];
};

vi.mock('@opencx/widget-react-headless', () => ({
  useCsat: () => ({ submitCsat, ...csat }),
  useConfig: () => config,
  useDocumentDir: () => ({ dir: 'ltr' }),
}));

import { CsatSurvey } from '../CsatSurvey';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  submitCsat.mockClear();
  csat = { isCsatRequested: true, isCsatSubmitted: false };
  config = { language: 'en', translationOverrides: undefined };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() => root.render(<CsatSurvey />));
}

function part(name: string) {
  return container.querySelector<HTMLElement>(
    `[data-component="chat/csat/${name}"]`,
  );
}

function rate(emoji: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === emoji,
  );
  if (!button) throw new Error(`missing ${emoji} rating`);
  act(() => button.click());
}

function type(textarea: HTMLTextAreaElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  if (!setValue) throw new Error('missing textarea value setter');
  act(() => {
    setValue.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('labels the feedback box and submits the rating and feedback with a text button', () => {
  render();
  rate('😊');

  const label = part('feedback_label');
  const feedback = part('feedback');
  const submit = part('submit');
  if (!(feedback instanceof HTMLTextAreaElement)) {
    throw new Error('missing feedback textarea');
  }
  expect(label?.textContent).toBe('Share your feedback');
  expect(label?.getAttribute('for')).toBe(feedback.id);
  expect(label?.classList.contains('sr-only')).toBe(false);
  expect(submit?.textContent).toBe('Send');

  type(feedback, 'Fast and friendly');
  act(() => submit?.click());

  expect(submitCsat).toHaveBeenCalledWith({
    score: 4,
    feedback: 'Fast and friendly',
  });
});

it('lets an embedder override the label and button copy', () => {
  config = {
    language: 'ar',
    translationOverrides: {
      ar: {
        csat_feedback_label: 'شاركنا رايك عن التجربة',
        csat_submit: 'أرسل تقييمك',
      },
    },
  };
  render();
  rate('😊');

  expect(part('feedback_label')?.textContent).toBe('شاركنا رايك عن التجربة');
  expect(part('submit')?.textContent).toBe('أرسل تقييمك');
});

it('keeps the submitted feedback named for screen readers without the submit button', () => {
  csat = {
    isCsatRequested: false,
    isCsatSubmitted: true,
    submittedScore: 4,
    submittedFeedback: 'Fast and friendly',
  };
  render();

  const feedback = part('feedback');
  if (!(feedback instanceof HTMLTextAreaElement)) {
    throw new Error('missing feedback textarea');
  }
  const label = part('feedback_label');
  expect(feedback.value).toBe('Fast and friendly');
  expect(label?.getAttribute('for')).toBe(feedback.id);
  expect(label?.classList.contains('sr-only')).toBe(true);
  expect(part('submit')).toBeNull();
});
