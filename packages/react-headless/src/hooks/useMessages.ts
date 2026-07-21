import { usePrimitiveState } from './usePrimitiveState';
import { useWidget } from '../WidgetProvider';

export function useMessages() {
  const { widgetCtx } = useWidget();
  const messagesState = usePrimitiveState(widgetCtx.messageCtx.state);

  return {
    messagesState,
    sendMessage: widgetCtx.messageCtx.sendMessage,
    injectLocalAgentMessage: widgetCtx.messageCtx.injectLocalAgentMessage,
  };
}
