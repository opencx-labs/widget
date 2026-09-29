import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { actOnPage } from '../act';
import { captureActionMeaning } from '../action-meaning';
import { beginSnapshot, resetRefsForTest } from '../control-ref';

beforeEach(() => {
  resetRefsForTest();
  document.body.style.margin = '0';
});
afterEach(() => {
  document.body.innerHTML = '';
});

function setup(html: string) {
  document.body.innerHTML = html;
  const element = document.querySelector<HTMLElement>('#target')!;
  element.style.cssText = 'display:block;width:180px;height:40px';
  const ref = beginSnapshot()(element);
  const clicked = vi.fn((event: Event) => event.preventDefault());
  element.addEventListener('click', clicked);
  return {
    element,
    ref,
    clicked,
    consentIsCurrent: captureActionMeaning(element),
  };
}

it.each(['consent wait', 'pointerdown', 'focus'])(
  'does not click a changed native link after %s',
  async (when) => {
    const fixture = setup('<a id="target" href="/approved">Continue</a>');
    const change = () => fixture.element.setAttribute('href', '/different');
    if (when === 'consent wait') {
      await Promise.resolve();
      change();
    } else fixture.element.addEventListener(when, change);
    const result = await actOnPage({ ...fixture, action: 'click' });
    expect(result.outcome).toBe('declined');
    expect(fixture.clicked).not.toHaveBeenCalled();
  },
);

it.each([
  'base',
  'submit override',
  'form owner',
  'form method',
  'form target',
])('binds native submission to its approved %s', async (change) => {
  const fixture = setup(
    '<base href="https://example.test/safe/"><form id="one" action="save"></form><form id="two" action="delete"></form><button id="target" form="one" formaction="preview">Continue</button>',
  );
  await Promise.resolve();
  if (change === 'base')
    document.querySelector('base')!.href = 'https://other.test/';
  if (change === 'submit override')
    fixture.element.setAttribute('formaction', 'commit');
  if (change === 'form owner') fixture.element.setAttribute('form', 'two');
  if (change === 'form method') document.querySelector('form')!.method = 'post';
  if (change === 'form target')
    document.querySelector('form')!.target = '_blank';
  const result = await actOnPage({ ...fixture, action: 'click' });
  expect(result.outcome).toBe('declined');
  expect(fixture.clicked).not.toHaveBeenCalled();
});

it.each([
  '<a id="target" href="/approved">Continue</a>',
  '<form action="/approved"><button id="target">Continue</button></form>',
])(
  'retains the complete pointer sequence for unchanged controls: %s',
  async (html) => {
    const fixture = setup(html);
    const events: string[] = [];
    for (const name of [
      'pointerdown',
      'mousedown',
      'focus',
      'pointerup',
      'mouseup',
      'click',
    ]) {
      fixture.element.addEventListener(name, () => events.push(name));
    }
    await actOnPage({ ...fixture, action: 'click', settleMs: 20 });
    expect(fixture.clicked).toHaveBeenCalledOnce();
    expect(events).toEqual([
      'pointerdown',
      'mousedown',
      'focus',
      'pointerup',
      'mouseup',
      'click',
    ]);
  },
);

it('does not fill a field moved to another form by its focus handler', async () => {
  const fixture = setup(
    '<form id="one"></form><form id="two"></form><input id="target" form="one" aria-label="Name">',
  );
  fixture.element.addEventListener('focus', () =>
    fixture.element.setAttribute('form', 'two'),
  );
  expect(
    (await actOnPage({ ...fixture, action: 'fill', value: 'Alice' })).outcome,
  ).toBe('declined');
  expect((fixture.element as HTMLInputElement).value).toBe('');
});

it.each([
  '<form action="/approved"><button><span id="target" role="button">Continue</span></button></form>',
  '<form action="/approved"><button id="submit">Continue</button></form><label id="target" role="button" for="submit">Continue</label>',
])('binds forwarded native activation to consent: %s', async (html) => {
  const fixture = setup(html);
  fixture.element.removeEventListener('click', fixture.clicked);
  const form = document.querySelector('form')!;
  const submitted = vi.fn((event: Event) => event.preventDefault());
  form.addEventListener('submit', submitted);
  form.action = '/different';
  expect(
    (await actOnPage({ ...fixture, action: 'click', settleMs: 20 })).outcome,
  ).toBe('declined');
  expect(submitted).not.toHaveBeenCalled();
  form.action = '/approved';
  await actOnPage({ ...fixture, action: 'click', settleMs: 20 });
  expect(submitted).toHaveBeenCalledOnce();
});

it('binds the submitter value even when the visible name stays the same', async () => {
  const fixture = setup(
    '<form action="/approved"><button id="target" name="operation" value="save">Continue</button></form>',
  );
  fixture.element.setAttribute('value', 'delete');
  expect((await actOnPage({ ...fixture, action: 'click' })).outcome).toBe(
    'declined',
  );
  expect(fixture.clicked).not.toHaveBeenCalled();
});
