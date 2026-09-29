import { afterEach, expect, it, vi } from 'vitest';
import { actOnPage } from '../act';
import { readPageControls } from '../read-controls';
import { resetRefsForTest, resolveRef } from '../control-ref';

afterEach(() => {
  vi.restoreAllMocks();
  resetRefsForTest();
  document.body.innerHTML = '';
});

it.each(['body', 'div', 'section'])(
  'clicks an unchanged control in %s after an unrelated region updates',
  async (container) => {
    const content = '<button>Save</button>';
    document.body.innerHTML =
      (container === 'body'
        ? content
        : `<${container}>${content}</${container}>`) + '<aside>12:00</aside>';
    const button = document.querySelector('button')!;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);
    const ref = readPageControls().controls[0]!.ref;
    document.querySelector('aside')!.textContent = '12:01';
    await actOnPage({
      ref,
      action: 'click',
      settleMs: 20,
      consentIsCurrent: () => resolveRef(ref) === button,
    });
    expect(clicked).toHaveBeenCalledOnce();
  },
);

it.each(['body', 'section', 'li'])(
  'finishes an approved click when hover inserts a tooltip in %s',
  async (container) => {
    document.body.innerHTML =
      container === 'body'
        ? '<button>Save</button>'
        : `<${container}><span>Account A</span><button>Save</button></${container}>`;
    const button = document.querySelector('button')!;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);
    const ref = readPageControls().controls[0]!.ref;
    button.addEventListener('pointerover', () => {
      const tooltip = document.createElement('div');
      tooltip.setAttribute('role', 'tooltip');
      tooltip.textContent = 'Save this account';
      button.parentElement!.append(tooltip);
    });
    await actOnPage({
      ref,
      action: 'click',
      settleMs: 20,
      consentIsCurrent: () => resolveRef(ref) === button,
    });
    expect(clicked).toHaveBeenCalledOnce();
    expect(resolveRef(ref)).toBe(button);
  },
);

it('does not scan retained controls for unrelated updates while idle', async () => {
  document.body.innerHTML =
    '<aside>12:00</aside><ul>' +
    Array.from(
      { length: 300 },
      (_, i) => `<li><button>Item ${i}</button></li>`,
    ).join('') +
    '</ul>';
  expect(readPageControls().controls).toHaveLength(300);
  const deref = vi.spyOn(WeakRef.prototype, 'deref');
  for (let i = 0; i < 5; i++) {
    document.querySelector('aside')!.textContent = `12:0${i}`;
    await Promise.resolve();
  }
  expect(deref.mock.calls.length).toBe(0);
});

it.each(['synchronous', 'delivered'])(
  'keeps A-to-B-to-A identity changes stale with %s mutations',
  async (delivery) => {
    document.body.innerHTML =
      '<div><span>Account A</span><button>Delete</button></div>';
    const ref = readPageControls().controls[0]!.ref;
    const label = document.querySelector('span')!;
    label.textContent = 'Account B';
    if (delivery === 'delivered') await Promise.resolve();
    label.textContent = 'Account A';
    if (delivery === 'delivered') await Promise.resolve();
    expect(resolveRef(ref)).toBeNull();
    expect(readPageControls().controls[0]!.ref).not.toBe(ref);
  },
);

it('preserves nested controls when a sibling record changes, but binds the containing record', () => {
  document.body.innerHTML =
    '<ul><li><span>Order A</span><ul><li><span>Item A</span><button>Delete</button></li><li id="other">Item B</li></ul></li></ul>';
  const button = document.querySelector('button')!;
  const ref = readPageControls().controls[0]!.ref;
  document.querySelector('#other')!.textContent = 'Item C';
  expect(resolveRef(ref)).toBe(button);
  document.querySelector('span')!.textContent = 'Order B';
  expect(resolveRef(ref)).toBeNull();
});

it('never revives a node moved into an ignored tooltip and back', async () => {
  document.body.innerHTML =
    '<div><span>Account A</span><button>Delete</button></div><div role="tooltip"></div>';
  const button = document.querySelector('button')!;
  const parent = button.parentElement!;
  const ref = readPageControls().controls[0]!.ref;
  document.querySelector('[role="tooltip"]')!.append(button);
  await Promise.resolve();
  parent.append(button);
  expect(resolveRef(ref)).toBeNull();
});

it('does not ignore record identity changes inside a live region', () => {
  document.body.innerHTML =
    '<div aria-live="polite"><span>Account A</span><button>Delete</button></div>';
  const ref = readPageControls().controls[0]!.ref;
  document.querySelector('span')!.textContent = 'Account B';
  expect(resolveRef(ref)).toBeNull();
});

it('binds record labels even when they are wrapped in a sibling section', () => {
  document.body.innerHTML =
    '<ul><li><section><span>Account A</span></section><button>Delete</button></li></ul>';
  const ref = readPageControls().controls[0]!.ref;
  document.querySelector('span')!.textContent = 'Account B';
  expect(resolveRef(ref)).toBeNull();
});

it('preserves a row control when a different row is removed from the same screen', async () => {
  document.body.innerHTML =
    '<section><ul><li id="other">Other account</li><li><span>Account A</span><button>Delete</button></li></ul></section>';
  const button = document.querySelector('button')!;
  const clicked = vi.fn();
  button.addEventListener('click', clicked);
  const ref = readPageControls().controls[0]!.ref;
  document.querySelector('#other')!.remove();
  await actOnPage({
    ref,
    action: 'click',
    settleMs: 20,
    consentIsCurrent: () => resolveRef(ref) === button,
  });
  expect(clicked).toHaveBeenCalledOnce();
});

it.each([
  ['section', '<section><span>Account A</span></section>'],
  ['form', '<form><span>Account A</span></form>'],
  ['fieldset', '<fieldset><legend>Account A</legend></fieldset>'],
  ['group', '<div role="group"><span>Account A</span></div>'],
  ['region', '<div role="region"><span>Account A</span></div>'],
  ['aside', '<aside><span>Account A</span></aside>'],
  ['nav', '<nav><span>Account A</span></nav>'],
  ['header', '<header><span>Account A</span></header>'],
  ['footer', '<footer><span>Account A</span></footer>'],
  ['main', '<main><span>Account A</span></main>'],
  ['article', '<article><span>Account A</span></article>'],
  ['list item', '<ul><li><span>Account A</span></li></ul>'],
  ['row', '<div role="row"><span>Account A</span></div>'],
])(
  'revokes approval when an item label in a nested %s changes',
  async (_, label) => {
    document.body.innerHTML = `<section>${label}<button>Delete</button></section>`;
    const button = document.querySelector('button')!;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);
    const ref = readPageControls().controls.find(
      (item) => item.name === 'Delete',
    )!.ref;
    document.querySelector('span,legend')!.textContent = 'Account B';
    await actOnPage({
      ref,
      action: 'click',
      settleMs: 20,
      consentIsCurrent: () => resolveRef(ref) === button,
    });
    expect(clicked).not.toHaveBeenCalled();
    expect(resolveRef(ref)).toBeNull();
    const fresh = readPageControls().controls.find(
      (item) => item.name === 'Delete',
    )!.ref;
    expect(fresh).not.toBe(ref);
  },
);

it.each(['div', 'section'])(
  'requires fresh approval when content inside the same %s changes',
  (container) => {
    document.body.innerHTML = `<${container}><button>Delete</button><aside>Account A</aside></${container}>`;
    const ref = readPageControls().controls[0]!.ref;
    document.querySelector('aside')!.textContent = 'Account B';
    expect(resolveRef(ref)).toBeNull();
  },
);

it('stops an approved click if hover repurposes the nested item label', async () => {
  document.body.innerHTML =
    '<section><section><span>Account A</span></section><button>Delete</button></section>';
  const button = document.querySelector('button')!;
  const clicked = vi.fn();
  button.addEventListener('click', clicked);
  const ref = readPageControls().controls[0]!.ref;
  button.addEventListener('pointerover', () => {
    document.querySelector('span')!.textContent = 'Account B';
  });
  const result = await actOnPage({
    ref,
    action: 'click',
    settleMs: 20,
    consentIsCurrent: () => resolveRef(ref) === button,
  });
  expect(clicked).not.toHaveBeenCalled();
  expect(result.outcome).toBe('no_change');
  expect(result.detail).toContain('interrupted');
  expect(resolveRef(ref)).toBeNull();
});

it.each(['section', 'div role="group"'])(
  'binds the outer item label when the control itself is nested in %s',
  (wrapper) => {
    const closingTag = wrapper.split(' ')[0];
    document.body.innerHTML = `<section><span>Account A</span><${wrapper}><button>Delete</button></${closingTag}></section>`;
    const ref = readPageControls().controls[0]!.ref;
    document.querySelector('span')!.textContent = 'Account B';
    expect(resolveRef(ref)).toBeNull();
  },
);
