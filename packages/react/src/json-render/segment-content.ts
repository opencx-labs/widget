import {
  compileSpecStream,
  isNonEmptySpec,
  parseSpecStreamLine,
  type Spec,
} from '@json-render/core';

export type ContentSegment =
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
 * There is exactly ONE spec format: JSONL patch lines — what the prompt
 * instructs the model to emit inside a ` ```spec ` fence and what every tool
 * that hands back a card emits. A model that forgets the fence still emits the
 * same lines, and the live stream renders them as UI regardless (its transform
 * drains every patch-shaped line, fenced or not), so a run of consecutive bare
 * patch lines outside any fence is a spec block too — otherwise a reloaded
 * transcript shows raw JSON where the customer watched a card.
 *
 * Everything else is markdown. A spec block (fenced or bare) is consumed only
 * after its patches compile to renderable UI; malformed, unsupported, empty,
 * and incomplete-only blocks remain visible as their original text. An
 * unclosed fence (turn cut mid-stream) still compiles when enough valid
 * patches arrived, and a cut-off patch line ending a bare run at the very end
 * of the text is the run's tail, never a stray `{"op":...` bubble.
 */
export function segmentContent(text: string): ContentSegment[] {
  if (!text) return [];

  const lines = text.split('\n');
  const segments: ContentSegment[] = [];

  let markdownLines: string[] = [];
  // The spec block being gathered (a fence or a bare run): every raw line it
  // covers, restored verbatim when it does not compile, and the subset that
  // parsed as patches.
  let blockLines: string[] = [];
  let patchLines: string[] = [];
  let inFence = false;
  let inBareRun = false;

  function flushMarkdown() {
    if (markdownLines.length === 0) return;
    const content = markdownLines.join('\n');
    if (content.trim()) {
      segments.push({ type: 'markdown', content });
    }
    markdownLines = [];
  }

  function flushSpecBlock() {
    if (blockLines.length === 0) return;

    let compiled: Spec | null = null;
    if (patchLines.length > 0) {
      try {
        compiled = compileSpecStream(patchLines.join('\n'), {
          root: '',
          elements: {},
        });
      } catch {
        // A syntactically parseable but unsupported patch must not erase the
        // agent's source. The raw block is restored below.
      }
    }

    if (compiled && isRenderableSpec(compiled)) {
      flushMarkdown();
      segments.push({ type: 'ui', spec: compiled });
    } else {
      markdownLines.push(...blockLines);
    }

    patchLines = [];
    blockLines = [];
  }

  function endBareRun() {
    if (!inBareRun) return;
    flushSpecBlock();
    inBareRun = false;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    const isLast = index === lines.length - 1;

    // ```spec fence open
    if (!inFence && trimmed === '```spec') {
      endBareRun();
      inFence = true;
      blockLines = [line];
      continue;
    }

    // ``` fence close
    if (inFence && trimmed === '```') {
      blockLines.push(line);
      flushSpecBlock();
      inFence = false;
      continue;
    }

    // Inside the fence: keep parseable patch lines, skip everything else
    // (malformed JSON, an incomplete trailing line mid-stream).
    if (inFence) {
      blockLines.push(line);
      if (trimmed !== '' && parseSpecStreamLine(line)) {
        patchLines.push(line);
      }
      continue;
    }

    // Outside any fence: a patch-shaped line starts or extends a bare run.
    if (trimmed !== '' && parseSpecStreamLine(line)) {
      inBareRun = true;
      blockLines.push(line);
      patchLines.push(line);
      continue;
    }

    if (inBareRun) {
      // Blank lines between patches stay in the run (the fence path skips
      // them the same way); a cut-off patch line at the very end of the text
      // is the run's tail. Both restore with the run when it does not compile.
      if (trimmed === '' || (isLast && isCutPatchLine(trimmed))) {
        blockLines.push(line);
        continue;
      }
      endBareRun();
    }

    markdownLines.push(line);
  }

  // Unclosed fence or trailing bare run (turn cut mid-stream): compile what
  // arrived.
  flushSpecBlock();
  flushMarkdown();

  return segments;
}

/**
 * A spec the renderer can actually paint: nonempty AND its root element
 * present. A block that compiles to elements without a root (or a root whose
 * element never arrived) would be consumed and then render nothing — the
 * agent's source must stay visible instead.
 */
function isRenderableSpec(spec: Spec): boolean {
  return isNonEmptySpec(spec) && spec.elements[spec.root] !== undefined;
}

/** A JSON line the stream cut before its closing brace. */
function isCutPatchLine(trimmed: string): boolean {
  return trimmed.startsWith('{') && !trimmed.endsWith('}');
}
