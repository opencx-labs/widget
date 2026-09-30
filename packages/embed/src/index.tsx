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
    __opencxEmbedRuntime?: {
      init: typeof initOpenScript;
      version: string;
    };
  }
}

// One React root per page. A host may call initOpenScript again with new options; a
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

// Retain the initializer as well as its root: a repeated IIFE carries another
// React/Widget copy. Rendering that copy through the old root can reset state
// or mix React runtimes. The first loaded runtime owns this page until reload.
const runtime = (window.__opencxEmbedRuntime ??= {
  init: initOpenScript,
  version,
});

// Available synchronously once the classic script tag has finished loading.
window.initOpenScript = runtime.init;
window.openCXWidgetVersion = runtime.version;
