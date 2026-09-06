import type { ModeComponent, ModeDto } from '@opencx/widget-core';
import { useWidget } from '../WidgetProvider';
import { useConfig } from './useConfig';
import { useSessions } from './useSessions';

export function useModes(): {
  modes: ModeDto[];
  modesComponents: ModeComponent[] | undefined;
  activeModeId: string | null | undefined;
  activeMode: ModeDto | undefined;
  Component: ModeComponent['component'] | undefined;
} {
  const { widgetCtx } = useWidget();
  const { modesComponents } = useConfig();
  const { sessionState } = useSessions();

  const modes = widgetCtx.modes;
  const activeModeId = sessionState.session?.modeId;
  const activeMode = modes.find((mode) => mode.id === activeModeId);

  const Component: ModeComponent['component'] | undefined =
    modesComponents?.find((modeComponent) =>
      [
        activeMode?.id || '',
        activeMode?.name?.toLowerCase() || '',
        activeMode?.slug?.toLowerCase() || '',
      ].includes(modeComponent.key.toLowerCase()),
    )?.component;

  return {
    modes,
    modesComponents,
    activeModeId,
    activeMode,
    Component,
  };
}
