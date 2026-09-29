import { isWidgetOwned } from '../page-marks/page-element';
import { isPageElementPrivate } from '../page-privacy';
import { guardRef } from './guard';
import { setNativeValue } from './native-setter';
import { firePointerSequence } from './pointer-sequence';
import { resolveSelectOption } from './select-option';
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
function watchPage(
  el: HTMLElement,
  budgetMs: number,
  isCurrent: () => boolean,
) {
  const doc = el.ownerDocument;
  // A background region that was already loading is not evidence about this
  // action. Keep busy ancestors/descendants and explicitly controlled regions.
  const controlled = (el.getAttribute('aria-controls') ?? '')
    .split(/\s+/)
    .map((id) => doc.getElementById(id))
    .filter((node) => node !== null);
  const unrelatedBusy = Array.from(
    doc.querySelectorAll('[aria-busy="true"]'),
  ).filter(
    (node) =>
      !isPageElementPrivate(node) &&
      !node.contains(el) &&
      !el.contains(node) &&
      !controlled.some(
        (region) => node.contains(region) || region.contains(node),
      ),
  );
  const isBackground = (node: Element) =>
    unrelatedBusy.some((region) => region.contains(node));
  let mutated = false;
  let lastMutation = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver((records) => {
    const pageMoved = records.some((record) => {
      const node =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      return node !== null && !isWidgetOwned(node) && !isBackground(node);
    });
    if (pageMoved) {
      mutated = true;
      lastMutation = performance.now();
    }
  });
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  const cancel = () => {
    clearTimeout(timer);
    observer.disconnect();
  };
  return {
    settle: () =>
      new Promise<{ mutated: boolean; loading: boolean }>((resolve) => {
        const deadline = performance.now() + budgetMs;
        const check = () => {
          // Permission or turn changes end observation without reading more DOM.
          if (!isCurrent()) {
            cancel();
            resolve({ mutated, loading: false });
            return;
          }
          const loading = Array.from(
            doc.querySelectorAll('[aria-busy="true"]'),
          ).some((node) => !isBackground(node) && !isPageElementPrivate(node));
          const now = performance.now();
          if (now >= deadline || (!loading && now - lastMutation >= 100)) {
            cancel();
            resolve({ mutated, loading });
          } else timer = setTimeout(check, Math.min(100, deadline - now));
        };
        timer = setTimeout(check, Math.min(100, budgetMs));
      }),
    cancel,
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
  consentIsCurrent?: () => boolean;
  observationIsCurrent?: () => boolean;
}): Promise<ActResult> {
  try {
    return await act(input);
  } catch {
    // A turn is waiting on this. An exception must come back as an answer —
    // an unanswered call is silence, and silence is the one thing an agent
    // must never be left to fill in for itself.
    return {
      outcome: 'unsupported',
      // Host code can throw private URLs, field values or account details.
      // Page replies are sent to the agent; never forward exception contents.
      detail: 'That could not be done on this page.',
    };
  }
}

async function act({
  ref,
  action,
  value,
  settleMs = SETTLE_MS,
  consentIsCurrent = () => true,
  observationIsCurrent = () => true,
}: {
  ref: string;
  action: PageAction;
  value?: string;
  settleMs?: number;
  consentIsCurrent?: () => boolean;
  observationIsCurrent?: () => boolean;
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
  if (!consentIsCurrent()) return { outcome: 'declined' };

  const doc = el.ownerDocument;
  const urlBefore = doc.location.href;
  // Started immediately before the page is touched and never before a
  // validation that might bail out — so nothing is watched that never acts,
  // and nothing acts that is not being watched.
  let watcher: ReturnType<typeof watchPage> | undefined;
  let selectedValue: string | undefined;
  let interrupted = false;

  try {
    switch (action) {
      case 'click': {
        watcher = watchPage(el, settleMs, observationIsCurrent);
        const sequence = firePointerSequence(el, consentIsCurrent);
        if (sequence === 'not-started') {
          watcher.cancel();
          return { outcome: 'declined' };
        }
        interrupted = sequence === 'interrupted';
        break;
      }
      case 'fill': {
        if (value === undefined) {
          return {
            outcome: 'unsupported',
            detail: 'No value was given to type.',
          };
        }
        watcher = watchPage(el, settleMs, observationIsCurrent);
        el.focus?.();
        if (!consentIsCurrent()) {
          // Focus/blur handlers may already have saved a value on the host.
          interrupted = true;
          break;
        }
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
        const option = resolveSelectOption(el, value);
        if (!option) {
          return {
            outcome: 'no_change',
            detail:
              'That option is not in the list or cannot be selected unambiguously.',
          };
        }
        watcher = watchPage(el, settleMs, observationIsCurrent);
        selectedValue = option.value;
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
        watcher = watchPage(el, settleMs, observationIsCurrent);
        const sequence = firePointerSequence(el, consentIsCurrent);
        if (sequence === 'not-started') {
          watcher.cancel();
          return { outcome: 'declined' };
        }
        interrupted = sequence === 'interrupted';
        break;
      }
    }

    const { mutated, loading } = (await watcher?.settle()) ?? {
      mutated: false,
      loading: false,
    };
    if (interrupted) {
      return {
        outcome:
          mutated || doc.location.href !== urlBefore ? 'done' : 'no_change',
        detail:
          'The action was interrupted after input events were dispatched. Its final result is unknown. Do not repeat it automatically.',
      };
    }
    const pendingDetail = loading
      ? 'The page is still loading. The action was dispatched; its final result is unknown. Do not repeat it automatically.'
      : undefined;

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
      if (action === 'select' && current !== selectedValue) {
        return {
          outcome: 'no_change',
          detail: 'The dropdown did not keep the selected option.',
        };
      }
      return {
        outcome: 'done',
        ...(pendingDetail ? { detail: pendingDetail } : {}),
      };
    }

    if (action === 'check' || action === 'uncheck') {
      const wanted = action === 'check';
      const box =
        el instanceof HTMLInputElement &&
        (el.type === 'checkbox' || el.type === 'radio')
          ? el
          : null;
      const now = box
        ? box.checked
        : el.getAttribute('aria-checked') === 'true';
      return now === wanted
        ? {
            outcome: 'done',
            ...(pendingDetail ? { detail: pendingDetail } : {}),
          }
        : { outcome: 'no_change', detail: 'It did not change.' };
    }

    // A click's only honest evidence is that the page moved: a mutation
    // anywhere outside our own overlays, or a navigation.
    return mutated || doc.location.href !== urlBefore
      ? { outcome: 'done', ...(pendingDetail ? { detail: pendingDetail } : {}) }
      : {
          outcome: 'no_change',
          detail:
            pendingDetail ??
            'The control was clicked and nothing on the page changed during observation. Its final result is unknown. Do not repeat it automatically.',
        };
  } finally {
    watcher?.cancel();
  }
}
