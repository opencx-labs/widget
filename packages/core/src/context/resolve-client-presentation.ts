import type { WidgetAgent } from './widget-agent';
import type { WidgetConfig } from '../types/widget-config';

/** The embed may hide more activity, but cannot reveal details the org hides. */
export function resolveClientPresentation(
  org: WidgetAgent['presentation'],
  client: WidgetConfig['presentation'],
): WidgetConfig['presentation'] {
  if (!org) return client;
  return {
    toolActivity:
      org.toolActivity === 'hidden' || client?.toolActivity === 'hidden'
        ? 'hidden'
        : org.toolActivity === 'status' || client?.toolActivity === 'status'
          ? 'status'
          : 'details',
    reasoning: org.reasoning && client?.reasoning !== false,
  };
}
