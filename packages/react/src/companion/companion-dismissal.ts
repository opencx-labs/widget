import type {
  WidgetCompanionLayoutU,
  WidgetSidebarModeU,
} from '@opencx/widget-core';
import type { PanelState } from './types';

/**
 * Whether a click on the host page dismisses the open panel.
 *
 * The DOCKED sidebar is the one layout that coexists with the page — the host
 * is inset beside it and nothing sits underneath — so page clicks belong to
 * the page, and only its × / Escape close it. A FLOATING sidebar overlays the
 * page edge exactly like the compact panel, so it dismisses the same way.
 *
 * Mark mode is the other exemption: while it is armed, host-page interactions
 * ARE the feature (placing/moving marks, the host-rendered note card), and
 * closing the panel would unmount the composer and destroy the draft mark.
 */
export function pageClickDismisses({
  state,
  layout,
  sidebarMode,
  isPageMarkModeArmed,
}: {
  state: PanelState;
  layout: WidgetCompanionLayoutU;
  sidebarMode: WidgetSidebarModeU;
  isPageMarkModeArmed: boolean;
}): boolean {
  if (state === 'pill' || isPageMarkModeArmed) return false;
  return !(layout === 'sidebar' && sidebarMode === 'docked');
}
