import { afterEach, describe, expect, it } from 'vitest';
import {
  describeElement,
  computeUniqueSelector,
  identifyElementName,
  isWidgetOwned,
  elementAt,
  resolveElementByHint,
} from '../page-element';

afterEach(() => {
  document.body.innerHTML = '';
  document.getElementById('opencx-root')?.remove();
});

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('identifyElementName', () => {
  it('names buttons by text, aria-label, or bare', () => {
    mount(
      '<button id="a">Create Key</button><button id="b" aria-label="close"></button><button id="c"></button>',
    );
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#a')!),
    ).toBe('button "Create Key"');
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#b')!),
    ).toBe('button [close]');
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#c')!),
    ).toBe('button');
  });

  it('names role=button containers as buttons', () => {
    mount('<div id="a" role="button">Save changes</div>');
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#a')!),
    ).toBe('button "Save changes"');
  });

  it('names links by text or href', () => {
    mount(
      '<a id="a" href="/docs">Documentation</a><a id="b" href="/pricing"></a>',
    );
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#a')!),
    ).toBe('link "Documentation"');
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#b')!),
    ).toBe('link to /pricing');
  });

  it('names inputs by placeholder, aria-label, name, then type', () => {
    mount(
      '<input id="a" placeholder="Search everything…" />' +
        '<input id="b" name="email" />' +
        '<input id="c" type="checkbox" />' +
        '<textarea id="d" aria-label="Message body"></textarea>',
    );
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#a')!),
    ).toBe('input "Search everything…"');
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#b')!),
    ).toBe('input [email]');
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#c')!),
    ).toBe('checkbox input');
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#d')!),
    ).toBe('textarea [Message body]');
  });

  it('names headings and images by content, truncated', () => {
    mount(`<h2 id="a">${'x'.repeat(60)}</h2><img id="b" alt="Company logo" />`);
    const heading = identifyElementName(
      document.querySelector<HTMLElement>('#a')!,
    );
    expect(heading.startsWith('h2 "xxxx')).toBe(true);
    expect(heading.length).toBeLessThan(60);
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#b')!),
    ).toBe('image "Company logo"');
  });

  it('falls back to a meaningful class name, then to container/tag', () => {
    mount('<div id="a" class="px sidebar-nav"></div><div id="b"></div>');
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#a')!),
    ).toBe('sidebar-nav');
    expect(
      identifyElementName(document.querySelector<HTMLElement>('#b')!),
    ).toBe('container');
  });
});

describe('computeUniqueSelector', () => {
  it('prefers a unique #id', () => {
    mount('<button id="create-key">Create</button>');
    const el = document.querySelector<HTMLElement>('#create-key')!;
    expect(computeUniqueSelector(el)).toBe('#create-key');
    expect(document.querySelector(computeUniqueSelector(el))).toBe(el);
  });

  it('disambiguates siblings with :nth-of-type and resolves back to the element', () => {
    mount(
      '<div id="list"><button>one</button><button id="ignored-dup">two</button><button>three</button></div>',
    );
    const buttons = Array.from(
      document.querySelectorAll<HTMLElement>('#list > button'),
    );
    for (const el of buttons) {
      const selector = computeUniqueSelector(el);
      expect(document.querySelectorAll(selector)).toHaveLength(1);
      expect(document.querySelector(selector)).toBe(el);
    }
  });

  it('resolves deeply nested elements without any ids', () => {
    mount(
      '<main><section><div><p>a</p><p>b<em></em></p></div></section></main>',
    );
    const target = document.querySelectorAll<HTMLElement>('p')[1]!;
    const selector = computeUniqueSelector(target);
    expect(document.querySelector(selector)).toBe(target);
  });

  it('escapes ids that are not valid CSS identifiers (leading digit) instead of throwing', () => {
    // Unescaped, `#2fa` is a selector SyntaxError — `CSS.escape` must produce
    // a selector that parses AND resolves back to the element.
    mount('<button id="2fa">Enable 2FA</button>');
    const el = document.querySelector<HTMLElement>('[id="2fa"]')!;
    const selector = computeUniqueSelector(el);
    expect(document.querySelector(selector)).toBe(el);
  });
});

describe('describeElement', () => {
  it('captures exactly what the AI needs: name, unique selector, tag, text', () => {
    document.body.innerHTML = `
      <div class="toolbar"><button id="save">Save changes</button></div>
    `;
    const described = describeElement(
      document.querySelector<HTMLElement>('#save')!,
    );
    expect(described).toEqual({
      name: 'button "Save changes"',
      selector: '#save',
      tag: 'button',
      text: 'Save changes',
    });
    // JSON-safe: it rides clientContext verbatim.
    expect(() => JSON.stringify(described)).not.toThrow();
  });

  it('omits text when the element has none', () => {
    document.body.innerHTML = `<img id="logo" alt="Acme" />`;
    const described = describeElement(
      document.querySelector<HTMLElement>('#logo')!,
    );
    expect(described.text).toBeUndefined();
    expect(described.name).toBe('image "Acme"');
  });
});

describe('isWidgetOwned / elementAt', () => {
  it('flags nodes inside the embed root and host-portaled chrome as widget-owned', () => {
    const embedRoot = document.createElement('div');
    embedRoot.id = 'opencx-root';
    embedRoot.innerHTML = '<span id="inside-embed"></span>';
    document.body.appendChild(embedRoot);

    mount(
      '<div data-opencx-root=""><span id="inside-chrome"></span></div>' +
        '<div data-opencx-overlay=""><span id="inside-overlay"></span></div>' +
        '<button id="host-btn">host</button>',
    );
    document.body.appendChild(embedRoot);

    expect(isWidgetOwned(document.querySelector('#inside-embed')!)).toBe(true);
    expect(isWidgetOwned(document.querySelector('#inside-chrome')!)).toBe(true);
    expect(isWidgetOwned(document.querySelector('#inside-overlay')!)).toBe(
      true,
    );
    expect(isWidgetOwned(document.querySelector('#host-btn')!)).toBe(false);
  });

  it('elementAt refuses widget-owned nodes and html/body', () => {
    mount('<button id="target">pick me</button>');
    const target = document.querySelector<HTMLElement>('#target')!;

    // jsdom has no layout — stub hit-testing.
    document.elementFromPoint = () => target;
    expect(elementAt(10, 10)).toBe(target);

    document.elementFromPoint = () => document.body;
    expect(elementAt(10, 10)).toBeNull();

    const owned = document.createElement('div');
    owned.setAttribute('data-opencx-root', '');
    document.body.appendChild(owned);
    document.elementFromPoint = () => owned;
    expect(elementAt(10, 10)).toBeNull();
  });

  it('normalizes an SVG child hit to its semantic HTML control', () => {
    mount(
      '<button id="save"><svg><path id="icon-path"></path></svg>Save</button>',
    );
    const button = document.querySelector<HTMLElement>('#save')!;
    const path = document.querySelector<SVGPathElement>('#icon-path')!;
    document.elementFromPoint = () => path;

    expect(elementAt(10, 10)).toBe(button);
  });

  it('keeps shadow-DOM hits at the resolvable host', () => {
    const host = document.createElement('div');
    host.id = 'settings-card';
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('button');
    inner.textContent = 'Delete account';
    shadow.appendChild(inner);
    document.body.appendChild(host);
    document.elementFromPoint = () => inner;

    expect(elementAt(10, 10)).toBe(host);
    expect(document.querySelector(computeUniqueSelector(host))).toBe(host);
  });
});

describe('resolveElementByHint', () => {
  it('resolves by selector first', () => {
    mount('<button id="create-key">Create Key</button>');
    expect(resolveElementByHint({ selector: '#create-key' })?.id).toBe(
      'create-key',
    );
  });

  it('survives an invalid model-authored selector and falls back to text', () => {
    mount('<div><button>Create Key</button></div>');
    const el = resolveElementByHint({
      selector: ':::garbage(((',
      text: 'create key',
    });
    expect(el?.tagName.toLowerCase()).toBe('button');
  });

  it('picks the SMALLEST element containing the text (deepest match, not body)', () => {
    mount(
      '<main>lots of surrounding content <section>more text <button>Create Key</button></section></main>',
    );
    const el = resolveElementByHint({ text: 'Create Key' });
    expect(el?.tagName.toLowerCase()).toBe('button');
  });

  it('never resolves to widget-owned elements, and returns null when nothing matches', () => {
    mount('<div data-opencx-root=""><button>Create Key</button></div>');
    expect(resolveElementByHint({ text: 'Create Key' })).toBeNull();
    expect(resolveElementByHint({ text: 'no such text anywhere' })).toBeNull();
    expect(resolveElementByHint({})).toBeNull();
  });
});
