import { describe, expect, it } from 'vitest';
import { stripInlineMarkdown } from '../strip-inline-markdown';

/**
 * The trace's one-line labels are plain text nodes, so reasoning that opens
 * with `**Clarifying profile check**` used to show its asterisks in the
 * collapsed breadcrumb. These are the shapes models actually emit.
 */
describe('stripInlineMarkdown', () => {
  it('unwraps strong, emphasis, strikethrough and inline code', () => {
    expect(stripInlineMarkdown('**Clarifying profile check**')).toBe(
      'Clarifying profile check',
    );
    expect(stripInlineMarkdown('*checking*')).toBe('checking');
    expect(stripInlineMarkdown('_checking_')).toBe('checking');
    expect(stripInlineMarkdown('~~dropped~~')).toBe('dropped');
    expect(stripInlineMarkdown('call `get_ai_profile`')).toBe(
      'call get_ai_profile',
    );
  });

  it('unwraps nesting', () => {
    expect(stripInlineMarkdown('***both***')).toBe('both');
    expect(stripInlineMarkdown('**bold with *emphasis* inside**')).toBe(
      'bold with emphasis inside',
    );
  });

  it('drops leading block markers', () => {
    expect(stripInlineMarkdown('## Plan')).toBe('Plan');
    expect(stripInlineMarkdown('- first step')).toBe('first step');
    expect(stripInlineMarkdown('1. first step')).toBe('first step');
    expect(stripInlineMarkdown('> quoted')).toBe('quoted');
    expect(stripInlineMarkdown('```ts')).toBe('');
  });

  it('keeps link and image text, not their targets', () => {
    expect(stripInlineMarkdown('see [the docs](https://x.dev/a)')).toBe(
      'see the docs',
    );
    expect(stripInlineMarkdown('![a chart](chart.png)')).toBe('a chart');
  });

  it('leaves plain prose and lone punctuation alone', () => {
    expect(stripInlineMarkdown('Looking up the profile now.')).toBe(
      'Looking up the profile now.',
    );
    // Unpaired markers are just characters — 2 * 3 is not emphasis.
    expect(stripInlineMarkdown('2 * 3 = 6')).toBe('2 * 3 = 6');
    expect(stripInlineMarkdown('a_b_c snake_case')).toBe('a_b_c snake_case');
  });
});
