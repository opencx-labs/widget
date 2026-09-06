import type { WidgetConfig } from '@opencx/widget-core';
import { Widget } from '@opencx/widget-react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { version } from '../package.json';

/** Host page container the widget renders into; created on first init. */
const ROOT_ID = 'opencx-root';

declare global {
  interface Window {
    initOpenScript: typeof initOpenScript;
    openCXWidgetVersion: string;
  }
}

// One React root per page. The classic loader replays every queued
// `initOpenScript` call, and a host may call it again with new options; a
// second `createRoot` on the same container would leave two roots fighting
// over it.
let root: Root | undefined;

function initOpenScript(options: WidgetConfig) {
  if (!root) {
    let container = document.getElementById(ROOT_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = ROOT_ID;
      document.body.appendChild(container);
    }
    root = createRoot(container);
  }
  root.render(<Widget options={options} />);
}

// Installed during module evaluation: the loader replays its queue on the
// injected module tag's load event, which fires after.
window.initOpenScript = initOpenScript;
window.openCXWidgetVersion = version;
