import { useUnreadViewing } from '@opencx/widget-react-headless';

/**
 * Reports which session is on screen, so the backend can clear its unread
 * mark. Each shell mounts one and says whether its transcript is showing.
 */
export function UnreadViewing({
  transcriptVisible = true,
}: {
  transcriptVisible?: boolean;
}) {
  useUnreadViewing({ transcriptVisible });
  return null;
}
