import { usePrimitiveState } from './usePrimitiveState';
import { useWidget } from '../WidgetProvider';

/**
 * The chat composer's draft text, lifted into core state so it can be set
 * programmatically (e.g. the host-facing `prefill` trigger) as well as by the
 * input component. `setDraft` updates it without sending.
 */
export function useComposerDraft() {
  const { widgetCtx } = useWidget();
  const draft = usePrimitiveState(widgetCtx.composerDraft);

  return { draft, setDraft: widgetCtx.setComposerDraft };
}
