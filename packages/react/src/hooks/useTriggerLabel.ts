import { useConfig } from '@opencx/widget-react-headless';

/**
 * Accessible label for the widget launcher — the popover trigger button and
 * the companion resting pill share this one default.
 */
export function useTriggerLabel(): string {
  const { accessibility } = useConfig();
  return accessibility?.widgetTriggerButton?.label ?? 'Chat with us';
}
