import { describe, expect, it } from 'vitest';
import { segmentContent } from '../segment-content';

/**
 * Fence-less spec output. The live stream's transform drains every
 * patch-shaped line into a `data-spec` part whether or not the model wrapped
 * it in a ` ```spec ` fence, so the customer watched a card — but the persisted
 * text (and a settle-time `ui_parts` snapshot, which is only transformed when
 * a fence marker exists) keeps the bare JSONL. Without these guards a reload
 * shows raw `{"op":"add",…}` lines where the card was.
 *
 * Guard 1: a run of consecutive bare patch lines is a spec block.
 * Guard 2: a cut-off patch line ending that run is its tail, not prose.
 * Both keep the segmenter's restore rule: consumed only when the patches
 * compile to renderable UI; otherwise the original text stays visible.
 */

const PATCH_ROOT = '{"op":"add","path":"/root","value":"main"}';
const PATCH_CARD =
  '{"op":"add","path":"/elements/main","value":{"type":"Card","props":{"title":"Order #1024"},"children":["m"]}}';
const PATCH_METRIC =
  '{"op":"add","path":"/elements/m","value":{"type":"Metric","props":{"label":"Total","value":"$42"}}}';
const CUT_LINE = '{"op":"add","path":"/elements/x","value":{"type":"Te';

function uiSpec(text: string, index = 0) {
  const segment = segmentContent(text)[index];
  if (segment?.type !== 'ui') {
    throw new Error(`expected ui segment at ${index}, got ${segment?.type}`);
  }
  return segment.spec;
}

describe('segmentContent — bare JSONL run (guard 1)', () => {
  it('compiles a bare run to the SAME spec the fenced form compiles to', () => {
    const bare = `${PATCH_ROOT}\n${PATCH_CARD}\n${PATCH_METRIC}`;
    const fenced = `\`\`\`spec\n${bare}\n\`\`\``;

    const bareSegments = segmentContent(bare);
    expect(bareSegments.map((s) => s.type)).toEqual(['ui']);
    // Positive control: the fenced form is unchanged and identical.
    expect(uiSpec(bare)).toEqual(uiSpec(fenced));
    expect(uiSpec(bare).root).toBe('main');
    expect(uiSpec(bare).elements.m?.type).toBe('Metric');
  });

  it('places a bare run between prose as markdown | ui | markdown', () => {
    const segments = segmentContent(
      `Here is your order:\n${PATCH_ROOT}\n${PATCH_CARD}\n${PATCH_METRIC}\nAnything else?`,
    );
    expect(segments).toEqual([
      { type: 'markdown', content: 'Here is your order:' },
      { type: 'ui', spec: expect.objectContaining({ root: 'main' }) },
      { type: 'markdown', content: 'Anything else?' },
    ]);
  });

  it('tolerates blank lines between the patches of one run', () => {
    const text = `${PATCH_ROOT}\n\n${PATCH_CARD}\n\n${PATCH_METRIC}`;
    expect(segmentContent(text).map((s) => s.type)).toEqual(['ui']);
    expect(Object.keys(uiSpec(text).elements)).toEqual(['main', 'm']);
  });

  it('restores a root-only bare line verbatim (a lone example patch in prose is not UI)', () => {
    const text = `To set the root, send:\n${PATCH_ROOT}\nThen add elements.`;
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
  });

  it('restores a bare run without a root verbatim (elements alone render nothing)', () => {
    const text = `${PATCH_CARD}\n${PATCH_METRIC}`;
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
    // Positive control on the same lines: with the root patch it is UI.
    expect(segmentContent(`${PATCH_ROOT}\n${text}`).map((s) => s.type)).toEqual(
      ['ui'],
    );
  });

  it('restores a bare run whose patches throw on compile (never erases the source)', () => {
    // RFC 6902 `test` with a mismatching value throws inside compileSpecStream.
    const text = `${PATCH_ROOT}\n${PATCH_CARD}\n{"op":"test","path":"/root","value":"other"}`;
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
  });

  it('keeps a bare run and an adjacent fence as two separate specs', () => {
    const text = `${PATCH_ROOT}\n${PATCH_CARD}\n\`\`\`spec\n${PATCH_ROOT}\n${PATCH_CARD}\n${PATCH_METRIC}\n\`\`\``;
    expect(segmentContent(text).map((s) => s.type)).toEqual(['ui', 'ui']);
    expect(Object.keys(uiSpec(text, 0).elements)).toEqual(['main']);
    expect(Object.keys(uiSpec(text, 1).elements)).toEqual(['main', 'm']);
  });

  it('a complete but non-patch JSON line ends the run and stays markdown', () => {
    const segments = segmentContent(
      `${PATCH_ROOT}\n${PATCH_CARD}\n{"op":"add"}`,
    );
    expect(segments).toEqual([
      { type: 'ui', spec: expect.objectContaining({ root: 'main' }) },
      { type: 'markdown', content: '{"op":"add"}' },
    ]);
  });

  it('leaves plain prose and non-spec code blocks untouched (fast path)', () => {
    const prose = 'Hello **there**, how can I help?';
    expect(segmentContent(prose)).toEqual([
      { type: 'markdown', content: prose },
    ]);
    const code = 'Use this:\n\n```js\nconsole.log({ op: 1 })\n```\n\nDone.';
    expect(segmentContent(code)).toEqual([{ type: 'markdown', content: code }]);
  });
});

describe('segmentContent — trailing cut-off patch line (guard 2)', () => {
  it('folds a cut last line into a compiling bare run instead of showing it as prose', () => {
    const segments = segmentContent(
      `${PATCH_ROOT}\n${PATCH_CARD}\n${PATCH_METRIC}\n${CUT_LINE}`,
    );
    expect(segments.map((s) => s.type)).toEqual(['ui']);
    expect(JSON.stringify(segments)).not.toContain('"Te');
    // Positive control: a complete last line is applied, not swallowed.
    const complete = uiSpec(
      `${PATCH_ROOT}\n${PATCH_CARD}\n${PATCH_METRIC}\n{"op":"add","path":"/elements/x","value":{"type":"Text","props":{"text":"done"}}}`,
    );
    expect(complete.elements.x?.type).toBe('Text');
  });

  it('restores the cut line together with a run that does not compile', () => {
    const text = `${PATCH_ROOT}\n${CUT_LINE}`;
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
  });

  it('consumes only a LAST-line cut: a cut line followed by prose is markdown', () => {
    const segments = segmentContent(
      `${PATCH_ROOT}\n${PATCH_CARD}\n${CUT_LINE}\nMore text`,
    );
    expect(segments).toEqual([
      { type: 'ui', spec: expect.objectContaining({ root: 'main' }) },
      { type: 'markdown', content: `${CUT_LINE}\nMore text` },
    ]);
  });

  it('keeps a cut line with no run before it as the visible source', () => {
    const text = `Here you go:\n${CUT_LINE}`;
    expect(segmentContent(text)).toEqual([{ type: 'markdown', content: text }]);
  });

  it('keeps a trailing fragment that was never going to be a patch', () => {
    // The model started a different object on its own line. It is the agent's
    // text, not the run's tail, so the card renders AND the text survives.
    const segments = segmentContent(
      `${PATCH_ROOT}\n${PATCH_CARD}\n${PATCH_METRIC}\n{"explanation":`,
    );
    expect(segments).toEqual([
      { type: 'ui', spec: expect.objectContaining({ root: 'main' }) },
      { type: 'markdown', content: '{"explanation":' },
    ]);
    // Positive control on the same shape: a cut PATCH line is still the tail.
    expect(
      segmentContent(
        `${PATCH_ROOT}\n${PATCH_CARD}\n${PATCH_METRIC}\n${CUT_LINE}`,
      ).map((s) => s.type),
    ).toEqual(['ui']);
  });

  it('still skips a cut line inside an unclosed fence (existing rule unchanged)', () => {
    const segments = segmentContent(
      `\`\`\`spec\n${PATCH_ROOT}\n${PATCH_CARD}\n${CUT_LINE}`,
    );
    expect(segments.map((s) => s.type)).toEqual(['ui']);
    expect(JSON.stringify(segments)).not.toContain('"Te');
  });
});
