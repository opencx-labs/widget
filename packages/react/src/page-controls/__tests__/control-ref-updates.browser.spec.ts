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
    const content = '<button>Save</button><aside>12:00</aside>';
    document.body.innerHTML =
      container === 'body'
        ? content
        : `<${container}>${content}</${container}>`;
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
