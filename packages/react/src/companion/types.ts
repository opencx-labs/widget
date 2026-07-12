/** Resting/open states of the companion shell. */
export type PanelState = 'pill' | 'input' | 'chat';

/**
 * Chat-panel layouts: bottom-center card or Linear-style fullscreen
 * (container transform — the same surface grows to fill the viewport).
 * The app-frame sidebar is its own display mode (WidgetSidebar), not a
 * companion layout.
 */
export type PanelLayout = 'compact' | 'fullscreen' | 'sidebar';
