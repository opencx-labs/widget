import { isWidgetOwned } from '../page-marks/page-element';
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

/**
 * Watch the page from BEFORE the action until it stops moving, and say
 * whether it moved.
 *
 * The observer is the evidence, and it has to be attached first. Two
 * earlier versions of this were wrong in opposite ways: comparing a cheap
 * fingerprint — url, child count, text length — missed a component-library
 * menu that opened by flipping one attribute, and attaching the observer
 * after the action missed every synchronous click handler, which is most of
 * them. Watch first, then act, then wait for quiet.
 */
function watchPage(doc: Document, budgetMs: number) {
  let mutated = false;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let finish: (() => void) | undefined;

  const observer = new MutationObserver((records) => {
    // Our own overlays must not count as the page reacting. A text node's
    // parent is what tells us whose subtree it belongs to.
    const pageMoved = records.some((record) => {
      const node =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      return node !== null && !isWidgetOwned(node);
    });
    if (pageMoved) mutated = true;
    clearTimeout(quiet);
    quiet = setTimeout(() => finish?.(), 100);
  });
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  return {
    /** Settle, then report. Bounded by the budget however busy the page is. */
    settle: () =>
      new Promise<{ mutated: boolean }>((resolve) => {
        const done = () => {
          clearTimeout(quiet);
          clearTimeout(ceiling);
          observer.disconnect();
          resolve({ mutated });
        };
        finish = done;
        // A page that never mutates settles at the first quiet window; one
        // that never stops settles at the ceiling.
        quiet = setTimeout(done, 100);
        const ceiling = setTimeout(done, budgetMs);
      }),
    /** Stop watching without waiting — for the paths that never act. */
    cancel: () => {
      clearTimeout(quiet);
      observer.disconnect();
    },
  };
}

/**
 * What `guardRef`'s shared list does not cover. The credential check is
 * duplicated there deliberately — two independent refusals on the one thing
 * that must never happen is cheap.
 */
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
  if (!guarded.ok) {
    // "Hands off" is a refusal, not a failure to find something.
    return guarded.reason === 'off-limits'
      ? { outcome: 'unsupported', detail: guarded.detail }
      : { outcome: guarded.reason };
  }

  const el = guarded.element;
  const refused = refuseReason(el);
  if (refused) return { outcome: 'unsupported', detail: refused };

  const doc = el.ownerDocument;
  const urlBefore = doc.location.href;
  // Started immediately before the page is touched and never before a
  // validation that might bail out — so nothing is watched that never acts,
  // and nothing acts that is not being watched.
  let watcher: ReturnType<typeof watchPage> | undefined;

  switch (action) {
    case 'click': {
      watcher = watchPage(doc, settleMs);
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
      watcher = watchPage(doc, settleMs);
      if (!setNativeValue(el, value)) {
        watcher.cancel();
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
      watcher = watchPage(doc, settleMs);
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
      watcher = watchPage(doc, settleMs);
      firePointerSequence(el);
      break;
    }
  }

  const { mutated } = (await watcher?.settle()) ?? { mutated: false };

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

  // A click's only honest evidence is that the page moved: a mutation
  // anywhere outside our own overlays, or a navigation.
  return mutated || doc.location.href !== urlBefore
    ? { outcome: 'done' }
    : {
        outcome: 'no_change',
        detail: 'The control was clicked and nothing on the page changed.',
      };
}
