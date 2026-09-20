import { guardRef } from './guard';
import { setNativeValue } from './native-setter';
import { firePointerSequence } from './pointer-sequence';
import {
  NEVER_ACT_INPUT_TYPES,
  SETTLE_MS,
  type ActResult,
  type PageAction,
} from './act-types';

/**
 * Do one thing on the customer's page, wait for the page to settle, and
 * report what actually happened.
 *
 * The read-back is the part that matters. Anyone can fire a click; the
 * reason this returns `no_change` at all is that an agent which cannot tell
 * a click that worked from a click that went nowhere will confidently tell
 * a customer their subscription is cancelled when nothing happened. So
 * after acting we look: did the value take, did the page change, did the
 * control's own state move. If none of that happened, we say so.
 */

/** A cheap fingerprint of "has anything happened here". */
function pageFingerprint(doc: Document): string {
  return [
    doc.location.href,
    doc.body.childElementCount,
    doc.body.textContent?.length ?? 0,
  ].join('|');
}

/** Wait for the page to stop changing, or for the settle budget to run out. */
function waitForSettle(doc: Document, budgetMs: number): Promise<void> {
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      clearTimeout(quiet);
      clearTimeout(ceiling);
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(done, 100);
    });
    observer.observe(doc.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    // A page that never mutates settles at the first quiet window; a page
    // that never stops mutating settles at the ceiling. Either way bounded.
    quiet = setTimeout(done, 100);
    const ceiling = setTimeout(done, budgetMs);
  });
}

/** Everything the widget refuses to touch, whatever it has been asked. */
function refuseReason(el: HTMLElement): string | null {
  if (el.tagName.toLowerCase() === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (NEVER_ACT_INPUT_TYPES.has(type)) {
      return 'Password and file fields are never filled or clicked by the agent.';
    }
  }
  // A control inside a frame from another origin cannot be read back
  // honestly — we would be reporting on a page we cannot see.
  if (el.ownerDocument !== document) {
    return 'That control is inside another site embedded in this page.';
  }
  return null;
}

export async function actOnPage(input: {
  ref: string;
  action: PageAction;
  value?: string;
  settleMs?: number;
}): Promise<ActResult> {
  try {
    return await act(input);
  } catch (error) {
    // A turn is waiting on this. An exception must come back as an answer —
    // an unanswered call is silence, and silence is the one thing an agent
    // must never be left to fill in for itself.
    return {
      outcome: 'unsupported',
      detail:
        error instanceof Error && error.message
          ? `That could not be done on this page: ${error.message}`
          : 'That could not be done on this page.',
    };
  }
}

async function act({
  ref,
  action,
  value,
  settleMs = SETTLE_MS,
}: {
  ref: string;
  action: PageAction;
  value?: string;
  settleMs?: number;
}): Promise<ActResult> {
  const guarded = guardRef(ref);
  if (!guarded.ok) return { outcome: guarded.reason };

  const el = guarded.element;
  const refused = refuseReason(el);
  if (refused) return { outcome: 'unsupported', detail: refused };

  const doc = el.ownerDocument;
  const before = pageFingerprint(doc);

  switch (action) {
    case 'click': {
      firePointerSequence(el);
      break;
    }
    case 'fill': {
      if (value === undefined) {
        return {
          outcome: 'unsupported',
          detail: 'No value was given to type.',
        };
      }
      el.focus?.();
      if (!setNativeValue(el, value)) {
        return {
          outcome: 'unsupported',
          detail: 'That control is not something text can be typed into.',
        };
      }
      break;
    }
    case 'select': {
      if (!(el instanceof HTMLSelectElement)) {
        return {
          outcome: 'unsupported',
          detail: 'That control is not a dropdown.',
        };
      }
      if (value === undefined) {
        return {
          outcome: 'unsupported',
          detail: 'No option was given to choose.',
        };
      }
      const option = Array.from(el.options).find(
        (candidate) =>
          candidate.value === value ||
          candidate.label.trim().toLowerCase() === value.trim().toLowerCase(),
      );
      if (!option) {
        return {
          outcome: 'no_change',
          detail: 'That option is not in the list.',
        };
      }
      setNativeValue(el, option.value);
      break;
    }
    case 'check':
    case 'uncheck': {
      const wanted = action === 'check';
      const box =
        el instanceof HTMLInputElement &&
        (el.type === 'checkbox' || el.type === 'radio')
          ? el
          : null;
      const ariaState = el.getAttribute('aria-checked');
      if (!box && ariaState === null) {
        return {
          outcome: 'unsupported',
          detail: 'That control is not a checkbox or switch.',
        };
      }
      const already = box ? box.checked : ariaState === 'true';
      if (already === wanted) {
        return {
          outcome: 'no_change',
          detail: `It is already ${wanted ? 'on' : 'off'}.`,
        };
      }
      firePointerSequence(el);
      break;
    }
  }

  await waitForSettle(doc, settleMs);

  // Did it take? Ask the page, not the code that just ran.
  if (action === 'fill' || action === 'select') {
    const current =
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
        ? el.value
        : null;
    if (action === 'fill' && current !== value) {
      return {
        outcome: 'no_change',
        detail: 'The field did not keep what was typed.',
      };
    }
    if (action === 'select' && current === null) {
      return { outcome: 'no_change', detail: 'The dropdown did not move.' };
    }
    return { outcome: 'done' };
  }

  if (action === 'check' || action === 'uncheck') {
    const wanted = action === 'check';
    const box =
      el instanceof HTMLInputElement &&
      (el.type === 'checkbox' || el.type === 'radio')
        ? el
        : null;
    const now = box ? box.checked : el.getAttribute('aria-checked') === 'true';
    return now === wanted
      ? { outcome: 'done' }
      : { outcome: 'no_change', detail: 'It did not change.' };
  }

  // A click's only honest evidence is that something about the page moved.
  return pageFingerprint(doc) === before
    ? {
        outcome: 'no_change',
        detail: 'The control was clicked and nothing on the page changed.',
      }
    : { outcome: 'done' };
}
