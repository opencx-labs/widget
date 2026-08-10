import { describe, expect, it } from 'vitest';
import { segmentContent } from '../segment-content';

/**
 * The history path re-derives specs from persisted assistant text — the v5
 * stream only transforms fences on the SSE, so stored rows keep the raw
 * ` ```spec ` fence. This locks the segmenter every reloaded transcript
 * depends on. Mirrors the dashboard companion's segment-content behavior.
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

  it('parses a direct spec object on a single fenced line', () => {
    const direct = JSON.stringify({
      root: 'r',
      elements: { r: { type: 'Text', props: { text: 'hi' }, children: [] } },
    });
    const segments = segmentContent(`\`\`\`spec\n${direct}\n\`\`\``);
    expect(segments).toHaveLength(1);
    const ui = segments[0];
    if (ui?.type !== 'ui') throw new Error('expected ui segment');
    expect(ui.spec.root).toBe('r');
  });

  it('compiles bare JSONL patch lines outside any fence (heuristic)', () => {
    const segments = segmentContent(`${PATCH_ROOT}\n${PATCH_CARD}`);
    expect(segments.map((s) => s.type)).toEqual(['ui']);
  });

  it('emits ui_partial for an unclosed fence (turn cut mid-stream)', () => {
    const segments = segmentContent(
      `Working on it\n\n\`\`\`spec\n${PATCH_ROOT}\n${PATCH_CARD}`,
    );
    expect(segments.map((s) => s.type)).toEqual(['markdown', 'ui', 'ui_partial']);
  });

  it('emits ui_partial for an incomplete trailing patch line inside a fence', () => {
    const segments = segmentContent(
      `\`\`\`spec\n${PATCH_ROOT}\n${PATCH_CARD}\n{"op":"add","pat`,
    );
    expect(segments.map((s) => s.type)).toEqual(['ui', 'ui_partial']);
  });

  it('a root-only spec (no elements yet) yields no ui segment — nothing renderable', () => {
    const segments = segmentContent(`\`\`\`spec\n${PATCH_ROOT}\n\`\`\``);
    expect(segments.filter((s) => s.type === 'ui')).toHaveLength(0);
  });

  it('drops an empty fence without emitting a ui segment', () => {
    const segments = segmentContent('```spec\n```\n\nSo, as I was saying.');
    expect(segments.map((s) => s.type)).toEqual(['markdown']);
  });

  it('does not treat regular fenced code blocks as specs', () => {
    const text = 'Use this:\n\n```js\nconsole.log(1)\n```\n\nDone.';
    const segments = segmentContent(text);
    expect(segments).toEqual([{ type: 'markdown', content: text }]);
  });

  it('ignores malformed JSON inside the fence rather than throwing', () => {
    const segments = segmentContent(`\`\`\`spec\nnot json at all\n${PATCH_ROOT}\n${PATCH_CARD}\n\`\`\``);
    expect(segments.map((s) => s.type)).toEqual(['ui']);
  });
});
