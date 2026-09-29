import { afterEach, expect, it, vi } from 'vitest';
import { actOnPage } from '../act';
import { readPageControls } from '../read-controls';
import { resolveRef, resetRefsForTest } from '../control-ref';

afterEach(() => {
  document.body.innerHTML = '';
  resetRefsForTest();
});

it.each(['row text', 'ancestor identity', 'native destination', 'move'])(
  'rejects a reference whose %s changed, before and after a fresh reading',
  async (change) => {
    document.body.innerHTML =
      '<ul><li data-record="A"><span>Account A</span><a href="/delete/A">Delete</a></li><li data-record="B"><span>Account B</span></li></ul>';
    const link = document.querySelector('a')!;
    const clicked = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener('click', clicked);
    const original = readPageControls().controls[0]!.ref;
    if (change === 'row text')
      document.querySelector('span')!.textContent = 'Account B';
    if (change === 'ancestor identity')
      link.parentElement!.setAttribute('data-record', 'B');
    if (change === 'native destination') link.href = '/delete/B';
    if (change === 'move') document.querySelectorAll('li')[1]!.append(link);
    const result = await actOnPage({
      ref: original,
      action: 'click',
      settleMs: 20,
    });
    expect(clicked).not.toHaveBeenCalled();
    expect(result.outcome).toBe('gone');
    const next = readPageControls().controls[0]!.ref;
    expect(next).not.toBe(original);
    expect(resolveRef(original)).toBeNull();
    expect(resolveRef(next)).toBe(link);
  },
);

it('never revives a handle when a row changes A to B and back to A', () => {
  document.body.innerHTML =
    '<ul><li><span>Account A</span><button>Delete</button></li></ul>';
  const original = readPageControls().controls[0]!.ref;
  document.querySelector('span')!.textContent = 'Account B';
  document.querySelector('span')!.textContent = 'Account A';
  expect(resolveRef(original)).toBeNull();
  expect(readPageControls().controls[0]!.ref).not.toBe(original);
});

it.each([
  '<li><span>Order A</span><section><button>Delete</button></section></li>',
  '<li><span>Order A</span><ul><li><button>Delete</button></li></ul></li>',
])('binds nested controls to their containing record: %s', (html) => {
  document.body.innerHTML = `<ul>${html}</ul>`;
  const original = readPageControls().controls[0]!.ref;
  document.querySelector('span')!.textContent = 'Order B';
  expect(resolveRef(original)).toBeNull();
  expect(readPageControls().controls[0]!.ref).not.toBe(original);
});

it('preserves another unchanged row and ignores widget and presentation mutations', () => {
  document.body.innerHTML =
    '<ul><li><button>First</button></li><li><span>Account A</span><button>Second</button></li></ul>';
  const original = readPageControls().controls[0]!.ref;
  document.querySelector('span')!.textContent = 'Account B';
  const button = document.querySelector('button')!;
  button.className = 'hover';
  button.style.color = 'red';
  const overlay = document.createElement('div');
  overlay.id = 'opencx-root';
  document.body.append(overlay);
  overlay.textContent = 'Approve action';
  expect(resolveRef(original)).toBe(button);
  expect(readPageControls().controls[0]!.ref).toBe(original);
});
