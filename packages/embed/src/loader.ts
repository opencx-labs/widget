/**
 * The public embed entry — `dist-embed/script.js`, the URL every customer's
 * `<script src>` points at.
 *
 * It exists so the widget itself can be a code-split ES module: a classic
 * `iife` bundle cannot split, so shipping the widget directly as `script.js`
 * inlined every lazy chunk (recharts + its d3 deps, ~600kB of source) into the
 * initial payload of every page view, chart or no chart. This loader stays
 * tiny, injects `widget.js` as a module, and lets the real lazy boundaries do
 * their job.
 *
 * The contract it must not break: `window.initOpenScript` and
 * `window.openCXWidgetVersion` are installed SYNCHRONOUSLY by the classic
 * script. Embedders call the former from DOMContentLoaded handlers and
 * framework effects — some with `?.()`, which would silently do nothing
 * against a missing global. Calls made before the module runs are queued and
 * replayed into the real implementation.
 */

declare const __WIDGET_VERSION__: string;

type Init = Window['initOpenScript'];
type InitOptions = Parameters<Init>[0];

type LoaderState = {
  queue: InitOptions[];
  stub: Init;
  moduleRequested: boolean;
};

type LoaderWindow = Window & {
  /** Shared by every evaluation of the classic loader on this page. */
  __openCXWidgetLoaderState__?: LoaderState;
};

const loaderWindow = window as LoaderWindow;
const loaderScript = document.currentScript as HTMLScriptElement | null;

/** Resolve the module beside the actual loader URL, wherever it is hosted. */
function resolveModuleUrl(): string | null {
  if (!loaderScript?.src) return null;
  try {
    return new URL('widget.js', loaderScript.src).href;
  } catch {
    return null;
  }
}

function flushQueue(state: LoaderState, init: Init): void {
  for (const options of state.queue.splice(0)) init(options);
}

// Kept synchronous: embedders read it when reporting the widget version.
window.openCXWidgetVersion = __WIDGET_VERSION__;

let state = loaderWindow.__openCXWidgetLoaderState__;
const installedInit = window.initOpenScript;
const hasRealInit =
  typeof installedInit === 'function' &&
  (!state || installedInit !== state.stub);

if (hasRealInit) {
  // A repeated script.js evaluation after widget.js has run must never replace
  // the real implementation with a fresh stub. If it landed between module
  // evaluation and the injected tag's load event, drain the shared queue now.
  if (state) flushQueue(state, installedInit);
} else {
  if (!state) {
    const queue: InitOptions[] = [];
    const stub: Init = (options) => queue.push(options);
    state = { queue, stub, moduleRequested: false };
    loaderWindow.__openCXWidgetLoaderState__ = state;
  }
  const activeState = state;

  // Restore the one shared stub if host code cleared the global while the
  // module was still loading. Never manufacture a new queue per evaluation.
  if (window.initOpenScript !== activeState.stub) {
    window.initOpenScript = activeState.stub;
  }

  if (!activeState.moduleRequested) {
    const moduleUrl = resolveModuleUrl();
    if (!moduleUrl) {
      console.error(
        '[opencx] could not resolve the widget module URL from this script tag; the widget will not load',
      );
    } else {
      activeState.moduleRequested = true;
      const tag = document.createElement('script');
      tag.type = 'module';
      tag.src = moduleUrl;
      // Under a nonce-based CSP an injected script needs the same nonce as the
      // tag that injected it, or it is blocked.
      const nonce = loaderScript?.nonce;
      if (nonce) tag.nonce = nonce;
      tag.onload = () => {
        const realInit = window.initOpenScript;
        // widget.js installs the implementation during module evaluation,
        // before this load event. If it somehow did not, retain the queue.
        if (realInit === activeState.stub || typeof realInit !== 'function') {
          return;
        }
        flushQueue(activeState, realInit);
      };
      tag.onerror = () => {
        // A later explicit script.js evaluation may retry a failed request.
        activeState.moduleRequested = false;
        console.error(
          '[opencx] failed to load the widget module from',
          moduleUrl,
        );
      };
      (document.head || document.documentElement).append(tag);
    }
  }
}

// Make this file an ES module for isolated source-level tests. Rollup still
// emits the public entry as the configured classic IIFE.
export {};
