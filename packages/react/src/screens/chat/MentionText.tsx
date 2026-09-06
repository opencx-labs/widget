import type { WidgetMention } from '@opencx/widget-core';
import React from 'react';
import { cn } from '../../components/lib/utils/cn';
import { dc } from '../../utils/data-component';
import { mentionText } from './useMentions';

/**
 * Text with its `@Title` mentions highlighted in place — the composer's
 * mirror layer and the sent bubble both read the same way, so a mention
 * looks like one thing from typing to transcript. Longer titles are matched
 * first so `@Ann` never claims the front of `@Anna Lee`. Text without
 * mentions comes back as-is.
 */
export function MentionText({
  text,
  mentions,
  tokenClassName,
}: {
  text: string;
  mentions: readonly WidgetMention[] | undefined;
  /** The token's look on this surface (ink on the composer, on primary in the bubble). */
  tokenClassName: string;
}) {
  if (!mentions || mentions.length === 0) return <>{text}</>;
  const tokens = Array.from(new Set(mentions.map(mentionText))).sort(
    (a, b) => b.length - a.length,
  );
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    let at = -1;
    let hit = '';
    for (const token of tokens) {
      const index = rest.indexOf(token);
      if (index !== -1 && (at === -1 || index < at)) {
        at = index;
        hit = token;
      }
    }
    if (at === -1) {
      nodes.push(rest);
      break;
    }
    if (at > 0) nodes.push(rest.slice(0, at));
    nodes.push(
      <span
        {...dc('chat/mention')}
        key={key++}
        className={cn('rounded-sm px-0.5 -mx-0.5', tokenClassName)}
      >
        {hit}
      </span>,
    );
    rest = rest.slice(at + hit.length);
  }
  return <>{nodes}</>;
}
