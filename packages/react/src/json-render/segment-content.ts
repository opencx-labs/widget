import {
  compileSpecStream,
  isNonEmptySpec,
  parseSpecStreamLine,
  type Spec,
} from '@json-render/core';

export type ContentSegment =
  | { type: 'markdown'; content: string }
  | { type: 'ui'; spec: Spec }
  | { type: 'ui_partial' };

/**
 * Segment persisted AI output into markdown prose and compiled UI specs.
 *
 * The v5 stream transforms ` ```spec ` fences into `data-spec` parts ONLY on
 * the client-facing SSE — the persisted assistant text keeps the raw fence
 * (persist raw, transform on serve). So the history path re-derives the spec
 * from the stored text here. Mirrors the dashboard companion's
 * `segment-content.ts` (same three formats):
 *
 * 1. JSONL patches inside a ` ```spec ` fence — the model's normal output
 * 2. A direct spec object (`{ root, elements }`) on a single fenced line
 * 3. Heuristic: bare JSONL patch lines outside any fence
 *
 * Everything else is markdown. An incomplete trailing patch produces a
 * `ui_partial` segment (only meaningful while text is still streaming).
 */
export function segmentContent(text: string): ContentSegment[] {
  if (!text) return [];

  const lines = text.split('\n');
  const segments: ContentSegment[] = [];

  let markdownLines: string[] = [];
  let patchLines: string[] = [];
  let inFence = false;

  function flushMarkdown() {
    if (markdownLines.length === 0) return;
    const content = markdownLines.join('\n');
    if (content.trim()) {
      segments.push({ type: 'markdown', content });
    }
    markdownLines = [];
  }

  function flushPatches() {
    if (patchLines.length === 0) return;
    const compiled = compileSpecStream(patchLines.join('\n'), { root: '', elements: {} });
    if (isNonEmptySpec(compiled)) {
      segments.push({ type: 'ui', spec: compiled });
    }
    patchLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    const isLast = i === lines.length - 1;

    // ```spec fence open
    if (trimmed === '```spec') {
      flushMarkdown();
      inFence = true;
      continue;
    }

    // ``` fence close
    if (inFence && trimmed === '```') {
      flushPatches();
      inFence = false;
      continue;
    }

    // Inside a fence: all lines are patches
    if (inFence) {
      if (trimmed === '') continue;
      // Direct spec object on one line: { root, elements } (not a patch)
      if (trimmed.startsWith('{')) {
        try {
          const parsed: unknown = JSON.parse(trimmed);
          if (isNonEmptySpec(parsed)) {
            flushPatches();
            segments.push({ type: 'ui', spec: parsed });
            continue;
          }
        } catch {
          // fall through to patch parsing
        }
      }
      const patch = parseSpecStreamLine(line);
      if (patch) {
        patchLines.push(line);
      } else if (isLast && trimmed.startsWith('{')) {
        // Streaming: incomplete patch line at the end of the fence. Flush what
        // compiled so far — the unclosed-fence handler below emits the
        // trailing `ui_partial`.
        flushPatches();
      }
      continue;
    }

    // Outside any fence: heuristic mode

    // Empty lines: flush pending patches, accumulate as markdown
    if (trimmed === '') {
      if (patchLines.length > 0) {
        flushPatches();
      }
      markdownLines.push(line);
      continue;
    }

    // Try to parse as a bare JSONL patch
    const patch = parseSpecStreamLine(line);

    if (patch) {
      flushMarkdown();
      patchLines.push(line);
    } else if (isLast && trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      // Last line starts with { but isn't complete — likely still streaming
      flushMarkdown();
      flushPatches();
      segments.push({ type: 'ui_partial' });
    } else {
      flushPatches();
      markdownLines.push(line);
    }
  }

  // Unclosed fence (turn cut mid-stream)
  if (inFence && patchLines.length > 0) {
    flushPatches();
    segments.push({ type: 'ui_partial' });
  } else if (inFence) {
    segments.push({ type: 'ui_partial' });
  }

  flushPatches();
  flushMarkdown();

  return segments;
}
