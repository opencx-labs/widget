import {
  pickedElementsFromMarks,
  type PageMark,
} from '../page-marks/page-mark';
import { readPageControls } from './read-controls';

/**
 * Everything about the customer's page that rides with one message.
 *
 * Two different things, sent together because they answer two different
 * questions. The marks are what the visitor pointed at — deliberate, a
 * gesture. The controls are what is simply THERE, read fresh at send time,
 * so the agent can answer "where do I turn that off" without the visitor
 * having to find and circle the switch first.
 *
 * Only the names go on the wire; the elements behind the references stay in
 * the page (`control-ref.ts`). Reading happens at send time and nowhere
 * else, which is what keeps a page turn free of an extra round trip.
 */
export function buildPageClientContext({
  marks,
  readsPage,
}: {
  marks: PageMark[];
  /** The org's page-context feature as the embed narrowed it. */
  readsPage: boolean;
}): Record<string, unknown> | undefined {
  if (!readsPage) return undefined;

  const context: Record<string, unknown> = {};

  if (marks.length > 0) {
    // `page_marks` is the rich payload for THIS turn; `picked_elements` is
    // the key the backend persists and re-surfaces on later turns.
    context['page_marks'] = marks;
    context['picked_elements'] = pickedElementsFromMarks(marks);
  }

  const { controls, truncated } = readPageControls();
  if (controls.length > 0) {
    context['page_controls'] = controls;
    if (truncated) context['page_controls_truncated'] = true;
  }

  return Object.keys(context).length > 0 ? context : undefined;
}
