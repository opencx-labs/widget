import { deriveCsatState } from '@opencx/widget-core';
import { useMemo } from 'react';
import { useMessages } from './useMessages';
import { useWidget } from '../WidgetProvider';

export function useCsat() {
  const { widgetCtx } = useWidget();
  const {
    messagesState: { messages },
  } = useMessages();

  const csatState = useMemo(() => deriveCsatState(messages), [messages]);

  return {
    submitCsat: widgetCtx.csatCtx.submitCsat,
    ...csatState,
  };
}
