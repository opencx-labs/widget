/** Resting/open states of the companion shell. */
export type PanelState = 'pill' | 'input' | 'chat';

/**
 * Chat-panel layouts, all rendered by the one companion shell (WidgetCompanion)
 * so switching morphs the rect in place: the bottom-center `compact` card,
 * Linear-style `fullscreen` (grows to fill the viewport), and the app-frame
 * `sidebar` (a docked, resizable panel at the inline-end edge that insets the
 * host page).
 */
export type PanelLayout = 'compact' | 'fullscreen' | 'sidebar';
