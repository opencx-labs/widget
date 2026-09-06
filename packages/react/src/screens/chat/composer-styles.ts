import { cn } from '../../components/lib/utils/cn';

/**
 * The composer's tool row. Every control in it — attach, dictate, mark page,
 * send, and whatever a shell slots in through `trailingActions` — is the same
 * round 32px button, so the row reads as one set of tools rather than as
 * buttons that happen to sit next to each other. `Button` already carries the
 * press scale and the transition, so this is only the shape.
 */
export const COMPOSER_TOOL_BUTTON =
  'rounded-full size-8 flex items-center justify-center p-0 overflow-hidden';

/**
 * A tool currently armed — dictation listening, mark mode waiting for a click.
 * Filled like the send button so the mode is unmistakable, and identical
 * across the tools so "armed" looks like one state, not two.
 */
export const COMPOSER_TOOL_ARMED =
  'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground';

/**
 * The remove (×) control on the page pill in the composer's attached-context
 * tray. Marks are tiles in the attachments row and carry their own overlay
 * control, like a file preview does.
 */
export const CONTEXT_CHIP_REMOVE = cn(
  'rounded-full p-0.5 text-muted-foreground',
  'hover:bg-muted hover:text-foreground',
  'transition-transform active:scale-90',
);
