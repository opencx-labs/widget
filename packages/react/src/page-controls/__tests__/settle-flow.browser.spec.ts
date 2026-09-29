import { afterEach, expect, it } from 'vitest';
import { actOnPage } from '../act';
import { readPageControls } from '../read-controls';

const timers = new Set<ReturnType<typeof setTimeout>>();
const later = (callback: () => void, ms: number) => {
  timers.add(setTimeout(callback, ms));
};
afterEach(() => {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  document.body.innerHTML = '';
});

it('finishes a delayed three-screen flow with one click per screen', async () => {
  const host = document.createElement('main');
  document.body.append(host);
  let clicks = 0;
  const screen = (name: string, next?: string) => {
    host.innerHTML = '';
    const button = document.createElement('button');
    button.textContent = name;
    host.append(button);
    button.onclick = () => {
      clicks++;
      host.setAttribute('aria-busy', 'true');
      host.innerHTML = '<span>Loading</span>';
      later(() => {
        if (next)
          screen(next, next === 'Review order' ? 'Confirm order' : undefined);
        else host.textContent = 'Order confirmed';
        host.setAttribute('aria-busy', 'false');
      }, 700);
    };
  };
  screen('Open order', 'Review order');
  for (const name of ['Open order', 'Review order', 'Confirm order']) {
    const control = readPageControls().controls.find(
      (row) => row.name === name,
    );
    expect(control, `next screen must contain ${name}`).toBeDefined();
    if (!control) throw new Error('Missing next screen');
    const result = await actOnPage({
      ref: control.ref,
      action: 'click',
      settleMs: 1500,
    });
    expect(result.outcome).toBe('done');
    expect(host.getAttribute('aria-busy')).toBe('false');
  }
  expect(clicks).toBe(3);
  expect(host.textContent).toBe('Order confirmed');
});

it('reports an unfinished loading screen honestly without clicking again', async () => {
  document.body.innerHTML = '<main><button>Open order</button></main>';
  const host = document.querySelector('main');
  const button = document.querySelector('button');
  if (!host || !button) throw new Error('Missing fixture');
  let clicks = 0;
  button.onclick = () => {
    clicks++;
    host.setAttribute('aria-busy', 'true');
  };
  const control = readPageControls().controls.find(
    (row) => row.name === 'Open order',
  );
  if (!control) throw new Error('Missing control');
  const started = performance.now();
  const result = await actOnPage({
    ref: control.ref,
    action: 'click',
    settleMs: 300,
  });
  expect(performance.now() - started).toBeGreaterThanOrEqual(250);
  expect(result.detail).toContain('still loading');
  expect(result.detail).toContain('Do not repeat');
  expect(clicks).toBe(1);
});

it('does not extend observation for hidden, private or widget-owned busy indicators', async () => {
  document.body.innerHTML =
    '<main><button>Open order</button></main><aside hidden aria-busy="true"></aside><aside data-opencx-private aria-busy="true"></aside><div id="opencx-root" aria-busy="true"></div>';
  const button = document.querySelector('button');
  if (!button) throw new Error('Missing fixture');
  button.onclick = () => button.setAttribute('data-opened', 'yes');
  const control = readPageControls().controls.find(
    (row) => row.name === 'Open order',
  );
  if (!control) throw new Error('Missing control');
  const started = performance.now();
  const result = await actOnPage({
    ref: control.ref,
    action: 'click',
    settleMs: 1500,
  });
  expect(result.outcome).toBe('done');
  expect(result.detail).toBeUndefined();
  expect(performance.now() - started).toBeLessThan(1000);
});

it('ends observation after revocation without repeating the dispatched action', async () => {
  document.body.innerHTML = '<main><button>Open order</button></main>';
  const host = document.querySelector('main');
  const button = document.querySelector('button');
  if (!host || !button) throw new Error('Missing fixture');
  let current = true;
  let clicks = 0;
  button.onclick = () => {
    clicks++;
    host.setAttribute('aria-busy', 'true');
    later(() => {
      current = false;
    }, 150);
  };
  const control = readPageControls().controls.find(
    (row) => row.name === 'Open order',
  );
  if (!control) throw new Error('Missing control');
  const started = performance.now();
  const result = await actOnPage({
    ref: control.ref,
    action: 'click',
    settleMs: 1500,
    observationIsCurrent: () => current,
  });
  expect(result.outcome).toBe('done');
  expect(performance.now() - started).toBeLessThan(1000);
  expect(current).toBe(false);
  expect(clicks).toBe(1);
});

it('ignores a pre-existing unrelated busy region, including its ongoing mutations', async () => {
  document.body.innerHTML =
    '<main><button>Open details</button><output></output></main><aside aria-busy="true">Loading news</aside>';
  const button = document.querySelector('button');
  const output = document.querySelector('output');
  const aside = document.querySelector('aside');
  if (!button || !output || !aside) throw new Error('Missing fixture');
  button.onclick = () => {
    output.textContent = 'Details opened';
  };
  const ref = readPageControls().controls.find(
    (row) => row.name === 'Open details',
  )?.ref;
  if (!ref) throw new Error('Missing reference');
  const interval = setInterval(() => {
    aside.textContent += '.';
  }, 40);
  try {
    const started = performance.now();
    const result = await actOnPage({ ref, action: 'click', settleMs: 1000 });
    expect(result.outcome).toBe('done');
    expect(result.detail).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(650);
  } finally {
    clearInterval(interval);
  }
});

it('retains original refs through three unchanged actions and fresh readings', async () => {
  document.body.innerHTML =
    '<button>First</button><button>Second</button><button>Third</button>';
  const original = readPageControls().controls;
  let clicks = 0;
  document
    .querySelectorAll('button')
    .forEach((button) => button.addEventListener('click', () => clicks++));
  for (const control of original) {
    expect(
      (await actOnPage({ ref: control.ref, action: 'click', settleMs: 30 }))
        .outcome,
    ).toBe('no_change');
    readPageControls();
  }
  expect(clicks).toBe(3);
});

it('still waits for a pre-existing busy region explicitly controlled by the target', async () => {
  document.body.innerHTML =
    '<button aria-controls="details">Open details</button><section id="details" aria-busy="true">Loading</section>';
  const button = document.querySelector('button');
  const details = document.getElementById('details');
  if (!button || !details) throw new Error('Missing fixture');
  button.onclick = () =>
    later(() => {
      details.textContent = 'Ready';
      details.setAttribute('aria-busy', 'false');
    }, 350);
  const ref = readPageControls().controls.find(
    (row) => row.name === 'Open details',
  )?.ref;
  if (!ref) throw new Error('Missing ref');
  const result = await actOnPage({ ref, action: 'click', settleMs: 1000 });
  expect(result.outcome).toBe('done');
  expect(details.textContent).toBe('Ready');
  expect(result.detail).toBeUndefined();
});
