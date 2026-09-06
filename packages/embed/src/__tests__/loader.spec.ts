import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LOADER_STATE_KEY = '__openCXWidgetLoaderState__';

function loaderTag(src: string): HTMLScriptElement {
  const tag = document.createElement('script');
  tag.src = src;
  document.body.append(tag);
  Object.defineProperty(document, 'currentScript', {
    configurable: true,
    value: tag,
  });
  return tag;
}

async function evaluateLoader(src: string): Promise<HTMLScriptElement> {
  const tag = loaderTag(src);
  vi.resetModules();
  await import('../loader');
  return tag;
}

function moduleTags(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[type="module"]'),
  );
}

describe('classic embed loader', () => {
  beforeEach(() => {
    vi.stubGlobal('__WIDGET_VERSION__', '5.0.0-test');
    Reflect.deleteProperty(window, 'initOpenScript');
    Reflect.deleteProperty(window, 'openCXWidgetVersion');
    Reflect.deleteProperty(window, LOADER_STATE_KEY);
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'currentScript');
    Reflect.deleteProperty(window, 'initOpenScript');
    Reflect.deleteProperty(window, 'openCXWidgetVersion');
    Reflect.deleteProperty(window, LOADER_STATE_KEY);
  });

  it('shares one queue and module request across repeated evaluations', async () => {
    const firstTag = loaderTag(
      'https://cdn.example.com/custom/widget/script.js?release=5',
    );
    firstTag.nonce = 'csp-token';
    vi.resetModules();
    await import('../loader');

    const firstStub = window.initOpenScript;
    const firstCall = { token: 'first' } as Parameters<
      Window['initOpenScript']
    >[0];
    const secondCall = { token: 'second' } as Parameters<
      Window['initOpenScript']
    >[0];
    firstStub(firstCall);

    await evaluateLoader(
      'https://another.example.net/copied-assets/script.js?again=1',
    );
    expect(window.initOpenScript).toBe(firstStub);
    window.initOpenScript(secondCall);

    const [moduleTag] = moduleTags();
    expect(moduleTags()).toHaveLength(1);
    expect(moduleTag?.src).toBe(
      'https://cdn.example.com/custom/widget/widget.js',
    );
    expect(moduleTag?.nonce).toBe('csp-token');
    expect(window.openCXWidgetVersion).toBe('5.0.0-test');

    const realInit = vi.fn<Window['initOpenScript']>();
    window.initOpenScript = realInit;
    moduleTag?.dispatchEvent(new Event('load'));
    expect(realInit.mock.calls).toEqual([[firstCall], [secondCall]]);

    // The module registry executes widget.js only once. Evaluating script.js
    // again after that must leave the real implementation installed.
    await evaluateLoader(
      'https://cdn.example.com/custom/widget/script.js?third=1',
    );
    expect(window.initOpenScript).toBe(realInit);
    expect(moduleTags()).toHaveLength(1);
  });

  it('does not replace or reload an implementation installed before it', async () => {
    const realInit = vi.fn<Window['initOpenScript']>();
    window.initOpenScript = realInit;

    await evaluateLoader('https://cdn.example.com/assets/script.js');

    expect(window.initOpenScript).toBe(realInit);
    expect(window.openCXWidgetVersion).toBe('5.0.0-test');
    expect(moduleTags()).toHaveLength(0);
  });
});
