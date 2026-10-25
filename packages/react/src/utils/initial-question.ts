import type { WidgetConfig } from '@opencx/widget-core';

export type InitialQuestion = NonNullable<
  WidgetConfig['initialQuestions']
>[number];

export function initialQuestionText(question: InitialQuestion): string {
  return typeof question === 'string' ? question : question.text;
}
