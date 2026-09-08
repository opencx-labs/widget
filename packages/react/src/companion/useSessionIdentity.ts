import {
  usePrimitiveState,
  type useCompanionChats,
} from '@opencx/widget-react-headless';
import { useTranslation } from '../hooks/useTranslation';

/** The same conversation name and preview wherever a session is selected. */
export function useSessionIdentity(
  chat: ReturnType<typeof useCompanionChats>['chats'][number],
) {
  const { t } = useTranslation();
  const { session } = usePrimitiveState(chat.ctx.sessionCtx.sessionState);
  const { messages } = usePrimitiveState(chat.ctx.messageCtx.state);
  const draft = usePrimitiveState(chat.ctx.messageCtx.draftState);
  const title =
    chat.title ||
    session?.title ||
    t('companion_chat_number', { count: chat.id });
  let preview = session?.lastMessage ?? draft.text ?? '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    const text =
      message.type === 'USER'
        ? message.content
        : message.type === 'SYSTEM'
          ? ''
          : message.data.message;
    if (text.trim()) {
      preview = text;
      break;
    }
  }
  const status = chat.working
    ? t('companion_working')
    : session?.isOpened
      ? t('companion_open')
      : session
        ? t('companion_closed')
        : t('companion_draft');
  const empty =
    !chat.hasDraft &&
    !chat.hasSession &&
    !chat.working &&
    !session &&
    !chat.title &&
    !messages.length &&
    !draft.text &&
    !draft.mentions.length;
  return {
    title: empty ? t('new_conversation') : title,
    preview: preview.replace(/\s+/g, ' ').trim(),
    status,
  };
}
