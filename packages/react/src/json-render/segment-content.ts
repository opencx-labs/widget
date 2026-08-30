import {
  compileSpecStream,
  isNonEmptySpec,
  parseSpecStreamLine,
  type Spec,
} from '@json-render/core';

type ContentSegment =
  | { type: 'markdown'; content: string }
  | { type: 'ui'; spec: Spec };

/**
 * Segment persisted AI output into markdown prose and compiled UI specs.
 *
 * The agent chat stream transforms ` ```spec ` fences into `data-spec` parts
 * ONLY on the client-facing SSE — the persisted assistant text keeps the raw
 * fence (persist raw, transform on serve). So the history path re-derives the
 * spec from the stored text here.
 *
 * There is exactly ONE spec format: JSONL patch lines inside a ` ```spec `
 * fence (what the prompt instructs the model to emit). Everything else is
 * markdown. A fence is consumed only after its patches compile to nonempty UI;
 * malformed, unsupported, empty, and incomplete-only fences remain visible as
 * their original fenced markdown. An unclosed fence (turn cut mid-stream)
 * still compiles when enough valid patches arrived.
 */
export function segmentContent(text: string): ContentSegment[] {
  if (!text) return [];

  const lines = text.split('\n');
  const segments: ContentSegment[] = [];

  let markdownLines: string[] = [];
  let patchLines: string[] = [];
  let fenceLines: string[] = [];
  let inFence = false;

  function flushMarkdown() {
    if (markdownLines.length === 0) return;
    const content = markdownLines.join('\n');
    if (content.trim()) {
      segments.push({ type: 'markdown', content });
    }
    markdownLines = [];
  }

  function flushSpecFence() {
    if (fenceLines.length === 0) return;

    let compiled: Spec | null = null;
    if (patchLines.length > 0) {
      try {
        compiled = compileSpecStream(patchLines.join('\n'), {
          root: '',
          elements: {},
        });
      } catch {
        // A syntactically parseable but unsupported patch must not erase the
        // agent's source. The raw fence is restored below.
      }
    }

    if (compiled && isNonEmptySpec(compiled)) {
      flushMarkdown();
      segments.push({ type: 'ui', spec: compiled });
    } else {
      markdownLines.push(...fenceLines);
    }

    patchLines = [];
    fenceLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // ```spec fence open
    if (!inFence && trimmed === '```spec') {
      inFence = true;
      fenceLines = [line];
      continue;
    }

    // ``` fence close
    if (inFence && trimmed === '```') {
      fenceLines.push(line);
      flushSpecFence();
      inFence = false;
      continue;
    }

    // Inside the fence: keep parseable patch lines, skip everything else
    // (malformed JSON, an incomplete trailing line mid-stream).
    if (inFence) {
      fenceLines.push(line);
      if (trimmed !== '' && parseSpecStreamLine(line)) {
        patchLines.push(line);
      }
      continue;
    }

    markdownLines.push(line);
  }

  // Unclosed fence (turn cut mid-stream): compile what arrived.
  flushSpecFence();
  flushMarkdown();

  return segments;
}
