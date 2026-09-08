import React from 'react';
import { useCompanionChats } from '@opencx/widget-react-headless';
import { ChevronsUpDownIcon, LoaderCircleIcon } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { ChatPicker, ChatPickerTrigger } from './ChatPicker';
import { useChatPicker } from './useChatPicker';
import { useHostPortal } from './useHostPortal';
import { useSessionIdentity } from './useSessionIdentity';

/** Uses the existing title slot so switching never adds another row to the panel. */
export function ConversationTitle() {
  const { chats, openChats, activeId } = useCompanionChats();
  const chat = chats.find((item) => item.id === activeId)!;
  const identity = useSessionIdentity(chat);
  const { t } = useTranslation();
  const picker = useChatPicker();
  const portalTarget = useHostPortal();
  const title = identity.title;
  const otherSessions = openChats.filter((item) => item.id !== activeId);
  const otherWorkingCount = otherSessions.filter((item) => item.working).length;
  const otherSessionsLabel = `${t('companion_other_sessions', { count: otherSessions.length })}${otherWorkingCount ? ` · ${t('companion_working_chats', { count: otherWorkingCount })}` : ''}`;
  const switchLabel = `${t('companion_switch_chat')}: ${title}${otherSessions.length ? ` · ${otherSessionsLabel}` : ''}`;
  return (
    <>
      <ChatPickerTrigger
        picker={picker}
        data-companion-conversation-title=""
        className="flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-md px-1 text-[13px] leading-5 text-start hover:bg-muted aria-expanded:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={switchLabel}
      >
        {chat.working && (
          <LoaderCircleIcon
            aria-label={t('companion_working')}
            className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          />
        )}
        <span className="truncate font-medium">{title}</span>
        {otherSessions.length > 0 && (
          <span
            data-other-session-count=""
            role="status"
            aria-atomic="true"
            className="flex shrink-0 items-center gap-1 text-[11px] font-normal text-muted-foreground"
          >
            <span className="sr-only">{otherSessionsLabel}</span>
            {otherWorkingCount > 0 && (
              <LoaderCircleIcon
                data-other-sessions-working=""
                aria-hidden
                className="size-3 animate-spin motion-reduce:animate-none"
              />
            )}
            <span aria-hidden className="tabular-nums">
              +{otherSessions.length}
            </span>
          </span>
        )}
        <ChevronsUpDownIcon
          aria-hidden
          className="size-3 shrink-0 text-muted-foreground"
        />
      </ChatPickerTrigger>
      {picker.anchor && portalTarget && (
        <ChatPicker
          picker={picker}
          portalTarget={portalTarget}
          placement="below"
        />
      )}
    </>
  );
}
