import type { WidgetConfig } from '@opencx/widget-core';

type TriggerOffsetConfig = NonNullable<
  NonNullable<NonNullable<WidgetConfig['theme']>['widgetTrigger']>['offset']
>;

export type TriggerSide = 'left' | 'right';

/**
 * Resolves which horizontal side the whole widget (trigger button, popover
 * anchor, and content alignment) lives on.
 *
 * An explicit numeric offset in the user config wins over the host document
 * direction, so `offset: { right: 20 }` pins the widget to the right even on
 * an RTL page. When both or neither side is numeric, the host document
 * direction decides (LTR → right, RTL → left).
 */
export function resolveTriggerSide(
  offset: TriggerOffsetConfig | undefined,
  dir: string,
): TriggerSide {
  const rightIsNumber = typeof offset?.right === 'number';
  const leftIsNumber = typeof offset?.left === 'number';
  if (rightIsNumber && !leftIsNumber) return 'right';
  if (leftIsNumber && !rightIsNumber) return 'left';
  return dir === 'rtl' ? 'left' : 'right';
}
