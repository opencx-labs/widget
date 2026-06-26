import type { WidgetConfig } from '@opencx/widget-core';
import { Widget, type WidgetRef } from '@opencx/widget-react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { version } from '../package.json';
import { resolveTriggerAction } from './triggers';

const defaultRootId = 'opencx-root';

/**
 * Host-page controller for driving the widget from your own links/buttons.
 * Every method opens the widget as needed and is a no-op (with a warning) until
 * the widget has finished mounting.
 */
type OpenCXWidgetController = {
  /** Open the widget (no-op if already open — no remount). */
  open: () => void;
  /** Close the widget. */
  close: () => void;
  /** Toggle the widget open/closed. */
  toggle: () => void;
  /** Open the widget and pre-fill the composer with `message` WITHOUT sending. */
  prefill: (message: string) => void;
  /** Open the widget on a fresh chat and send `message` immediately. */
  ask: (message: string) => void;
  /** Open the widget on a fresh chat and show `message` as a canned AI bubble. */
  presentAnswer: (message: string) => void;
};

declare global {
  interface Window {
    initOpenScript: typeof initOpenScript;
    openCXWidgetVersion: string;
    opencxWidget: OpenCXWidgetController;
  }
}

const widgetRef = React.createRef<WidgetRef>();

function withWidget<A extends unknown[]>(
  fn: (ref: WidgetRef, ...args: A) => void,
): (...args: A) => void {
  return (...args: A) => {
    const ref = widgetRef.current;
    if (!ref) {
      console.warn(
        'opencxWidget: the widget is not ready yet — call this after initOpenScript() has mounted.',
      );
      return;
    }
    fn(ref, ...args);
  };
}

const controller: OpenCXWidgetController = {
  open: withWidget((ref) => ref.open()),
  close: withWidget((ref) => ref.close()),
  toggle: withWidget((ref) => ref.toggle()),
  prefill: withWidget((ref, message: string) => ref.prefill(message)),
  ask: withWidget((ref, message: string) => void ref.ask(message)),
  presentAnswer: withWidget((ref, message: string) =>
    ref.presentAnswer(message),
  ),
};

/**
 * Zero-JS triggers: any element carrying one of these data attributes drives the
 * widget on click.
 *   <a data-opencx-open>Chat</a>
 *   <a data-opencx-prefill="How do I...?">Ask</a>
 *   <a data-opencx-ask="What are your fees?">Fees</a>
 *   <a data-opencx-answer="Onboarding takes ~2 minutes...">Onboarding</a>
 */
function handleTriggerClick(event: MouseEvent) {
  const action = resolveTriggerAction(event.target);
  if (!action) return;

  event.preventDefault();

  switch (action.kind) {
    case 'prefill':
      controller.prefill(action.value);
      break;
    case 'ask':
      controller.ask(action.value);
      break;
    case 'answer':
      controller.presentAnswer(action.value);
      break;
    case 'open':
      controller.open();
      break;
  }
}

function initOpenScript(options: WidgetConfig) {
  render(defaultRootId, <Widget ref={widgetRef} options={options} />);
}

window.initOpenScript = initOpenScript;
window.openCXWidgetVersion = version;
window.opencxWidget = controller;
document.addEventListener('click', handleTriggerClick);

export function render(rootId: string, component: React.JSX.Element) {
  let rootElement = document.getElementById(rootId);
  if (!rootElement) {
    rootElement = document.createElement('div');
    rootElement.id = rootId;
    document.body.appendChild(rootElement);
  }

  return createRoot(rootElement).render(component);
}
