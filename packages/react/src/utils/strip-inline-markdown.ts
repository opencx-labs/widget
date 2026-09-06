/**
 * Reasoning arrives as markdown, but the trace's one-line labels (the
 * collapsed breadcrumb, the vanishing current-step name, the row's truncated
 * preview) are plain text nodes — a single ellipsized line has nowhere to put
 * a heading or a list, so `**Clarifying profile check**` would render with its
 * asterisks showing. Flatten the inline syntax to the words it decorates and
 * drop the block markers.
 *
 * This is deliberately NOT a markdown parser: it runs on every stream delta
 * for a label that is about to be cut at 40 characters anyway. The expanded
 * body renders through `RichText`, which is where real markdown belongs.
 */

/** Emphasis, strong, strikethrough and inline code around a non-blank run. */
const INLINE_MARKS = /(\*\*\*|\*\*|\*|~~|`+)(?=\S)([\s\S]*?\S)\1/g;

/** Underscores get their own pass because, unlike `*`, they do NOT open
 *  emphasis inside a word — `get_ai_profile` and `snake_case` are identifiers,
 *  not markup, and CommonMark agrees. Both delimiters need a word boundary. */
const INLINE_UNDERSCORES = /(^|[^\w`])(___|__|_)(?=\S)([\s\S]*?\S)\2(?!\w)/g;

/** `**bold with *nested* emphasis**` needs one pass per nesting level. Three
 *  is past anything a model writes; the cap keeps this O(1) on pathological
 *  input rather than looping on it. */
const MAX_UNWRAP_PASSES = 3;

export function stripInlineMarkdown(text: string): string {
  let out = text
    // Fenced-code fences, then the heading / quote / list markers that only
    // ever lead a line.
    .replace(/^\s{0,3}(?:```+|~~~+)\S*\s*/, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, '')
    // Images before links, so `![alt](src)` keeps the alt and not a stray `!`.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  for (let pass = 0; pass < MAX_UNWRAP_PASSES; pass++) {
    const next = out
      .replace(INLINE_MARKS, '$2')
      .replace(INLINE_UNDERSCORES, '$1$3');
    if (next === out) break;
    out = next;
  }

  return out.trim();
}
