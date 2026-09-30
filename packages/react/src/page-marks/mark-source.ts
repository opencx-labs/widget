import type { PageMark } from './page-mark';
import { describeElement } from './page-element';
import {
  canCapturePageElement,
  isPageElementPrivate,
  PAGE_VALUE_SELECTOR,
  safePageUrl,
} from '../page-privacy';
import { copyThumbnail } from './mark-thumbnail';

// DOM identity stays local. A reused selector must not authorize an old mark.
const sources = new WeakMap<PageMark, readonly HTMLElement[]>();

export function registerPageMarkSources(
  mark: PageMark,
  elements: readonly HTMLElement[],
) {
  sources.set(mark, [...elements]);
}

export function isPageMarkShareable(mark: PageMark): boolean {
  const elements = sources.get(mark);
  return (
    elements !== undefined &&
    mark.pageUrl === safePageUrl(window.location.href) &&
    elements.every(
      (element) =>
        element.isConnected &&
        element.getRootNode() === document &&
        !isPageElementPrivate(element) &&
        !element.closest(PAGE_VALUE_SELECTOR),
    )
  );
}

/** Refresh both serialized mark representations from the original live nodes. */
export function pageMarkForSend(mark: PageMark): PageMark | null {
  const elements = sources.get(mark);
  if (!elements || !isPageMarkShareable(mark)) return null;
  const descriptions = elements.map(describeElement);
  const snapshotSafe =
    elements.length > 0 &&
    elements.every(canCapturePageElement) &&
    JSON.stringify(descriptions) === JSON.stringify(mark.elements);
  const copy = { ...mark, elements: descriptions };
  if (snapshotSafe) copyThumbnail(mark, copy);
  else delete copy.snapshotUrl;
  // Keep the captured payload independent of late snapshot completion.
  return copy;
}
