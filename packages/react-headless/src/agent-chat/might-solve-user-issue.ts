import type { UIMessage } from 'ai';
import { z } from 'zod';

const turnOutcomeMetadataSchema = z.object({
  mightSolveUserIssue: z.boolean(),
});

/**
 * The finished turn's `mightSolveUserIssue`, which the v5 stream carries on
 * its `finish` chunk and `useChat` lands on the message `metadata`. False
 * when it is missing: a withheld reply (assist draft), a stopped turn, or a
 * backend that predates it.
 */
export function readMightSolveUserIssue(message: UIMessage): boolean {
  if (message.role !== 'assistant') return false;
  const parsed = turnOutcomeMetadataSchema.safeParse(message.metadata);
  return parsed.success && parsed.data.mightSolveUserIssue;
}
