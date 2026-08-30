import { describe, expect, it } from 'vitest';
import { segmentContent } from '../segment-content';

/**
 * The history path re-derives specs from persisted assistant text — the agent
 * chat stream only transforms fences on the SSE, so stored rows keep the raw
 * ` ```spec ` fence. This locks the segmenter every reloaded transcript
 * depends on: JSONL patches inside a ` ```spec ` fence are the ONE spec
 * format; everything else is markdown.
 */

const PATCH_ROOT = '{"op":"add","path":"/root","value":"main"}';
const PATCH_CARD =
  '{"op":"add","path":"/elements/main","value":{"type":"Card","props":{"title":"Hi"},"children":[]}}';

describe('segmentContent', () => {
  it('returns a single markdown segment for plain prose (fast path)', () => {
    const segments = segmentContent('Hello **there**, how can I help?');
    expect(segments).toEqual([
      { type: 'markdown', content: 'Hello **there**, how can I help?' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(segmentContent('')).toEqual([]);
  });

  it('compiles a fenced JSONL spec between prose into markdown | ui | markdown', () => {
    const text = `Here is the summary:\n\n\`\`\`spec\n${PATCH_ROOT}\n${PATCH_CARD}\n\`\`\`\n\nAnything else?`;
    const segments = segmentContent(text);

    expect(segments.map((s) => s.type)).toEqual(['markdown', 'ui', 'markdown']);
    const ui = segments[1];
    if (ui?.type !== 'ui') throw new Error('expected ui segment');
    expect(ui.spec.root).toBe('main');
    expect(ui.spec.elements.main?.type).toBe('Card');
  });

  it('preserves an unsupported direct spec object as visible fenced markdown', () => {
    // Only JSONL patch lines are a producer format — a `{ root, elements }`
    // object is not renderable, but the agent's source must remain visible.
    const direct = JSON.stringify({
      root: 'r',
      elements: { r: { type: 'Text', props: { text: 'hi' }, children: [] } },
    });
    const text = `\`\`\`spec\n${direct}\n\`\`\``;
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
  });

  it('preserves a malformed spec fence as visible fenced markdown', () => {
    const text = 'Before\n\n```spec\nnot json at all\n```\n\nAfter';
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
  });

  it('treats bare JSONL patch lines outside any fence as markdown', () => {
    const text = `${PATCH_ROOT}\n${PATCH_CARD}`;
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
  });

  it('compiles what arrived in an unclosed fence (turn cut mid-stream) — no placeholder segment', () => {
    const segments = segmentContent(
      `Working on it\n\n\`\`\`spec\n${PATCH_ROOT}\n${PATCH_CARD}`,
    );
    expect(segments.map((s) => s.type)).toEqual(['markdown', 'ui']);
  });

  it('skips an incomplete trailing patch line inside a fence', () => {
    const segments = segmentContent(
      `\`\`\`spec\n${PATCH_ROOT}\n${PATCH_CARD}\n{"op":"add","pat`,
    );
    expect(segments.map((s) => s.type)).toEqual(['ui']);
  });

  it('preserves a root-only spec when it cannot produce nonempty UI', () => {
    const text = `\`\`\`spec\n${PATCH_ROOT}\n\`\`\``;
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
  });

  it('preserves an empty spec fence with the surrounding prose', () => {
    const text = '```spec\n```\n\nSo, as I was saying.';
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
  });

  it('does not treat regular fenced code blocks as specs', () => {
    const text = 'Use this:\n\n```js\nconsole.log(1)\n```\n\nDone.';
    const segments = segmentContent(text);
    expect(segments).toEqual([{ type: 'markdown', content: text }]);
  });

  it('renders valid patches when malformed noise does not prevent nonempty UI', () => {
    const segments = segmentContent(
      `\`\`\`spec\nnot json at all\n${PATCH_ROOT}\n${PATCH_CARD}\n\`\`\``,
    );
    expect(segments.map((s) => s.type)).toEqual(['ui']);
  });
});
