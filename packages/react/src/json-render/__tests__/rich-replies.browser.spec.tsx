import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { buildSpec, HostedSpecRenderer, segmentContent } from '../index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

const patches = [
  { op: 'add', path: '/root', value: 'card' },
  {
    op: 'add',
    path: '/elements/card',
    value: {
      type: 'Card',
      props: { title: 'Order summary' },
      children: ['table', 'links'],
    },
  },
  {
    op: 'add',
    path: '/elements/table',
    value: {
      type: 'Table',
      props: { columns: ['Item', 'Status'], rows: [['Order 42', 'Shipped']] },
    },
  },
  {
    op: 'add',
    path: '/elements/links',
    value: {
      type: 'List',
      props: {
        items: [
          { label: 'Safe documentation', href: 'https://example.invalid/docs' },
          { label: 'Untrusted link', href: 'javascript:alert(1)' },
          { label: '<img src=x onerror=alert(1)>' },
        ],
      },
    },
  },
];

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  return container;
}

it('renders incremental cards and tables identically after history reload, with safe links', async () => {
  const container = mount();
  // Each incremental revision travels through the same render seam as SSE parts.
  for (let count = 1; count <= patches.length; count++) {
    const spec = buildSpec(
      patches.slice(0, count).map((patch) => ({
        type: 'data-spec',
        data: { type: 'patch', patch },
      })),
    );
    await act(async () =>
      root?.render(<HostedSpecRenderer spec={spec} anchorTarget="_blank" />),
    );
  }
  const liveText = container.textContent;
  expect(liveText).toContain('Order summary');
  expect(liveText).toContain('Shipped');
  expect(container.querySelectorAll('table')).toHaveLength(1);
  expect(container.querySelectorAll('a')).toHaveLength(1);
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    'https://example.invalid/docs',
  );
  expect(container.querySelector('a')?.getAttribute('target')).toBe('_blank');
  expect(container.querySelector('img')).toBeNull();
  expect(liveText).toContain('<img src=x onerror=alert(1)>');

  const stored =
    '```spec\n' +
    patches.map((patch) => JSON.stringify(patch)).join('\n') +
    '\n```';
  const history = segmentContent(stored).find(
    (segment) => segment.type === 'ui',
  );
  if (history?.type !== 'ui') throw new Error('history did not produce a card');
  await act(async () =>
    root?.render(
      <HostedSpecRenderer spec={history.spec} anchorTarget="_blank" />,
    ),
  );
  expect(container.textContent).toBe(liveText);
  expect(container.querySelectorAll('a')).toHaveLength(1);
});

it('keeps text visible around a malformed card and accepts the next valid revision', async () => {
  const container = mount();
  const malformed = buildSpec([
    {
      type: 'data-spec',
      data: {
        type: 'patch',
        patch: { op: 'add', path: '/root', value: 'bad' },
      },
    },
    {
      type: 'data-spec',
      data: {
        type: 'patch',
        patch: { op: 'add', path: '/elements/bad', value: null },
      },
    },
  ]);
  await act(async () =>
    root?.render(
      <>
        <p>Answer remains visible</p>
        <HostedSpecRenderer spec={malformed} />
      </>,
    ),
  );
  expect(container.textContent).toContain('Answer remains visible');
  const recovered = buildSpec(
    patches.map((patch) => ({
      type: 'data-spec',
      data: { type: 'patch', patch },
    })),
  );
  await act(async () =>
    root?.render(
      <>
        <p>Answer remains visible</p>
        <HostedSpecRenderer spec={recovered} />
      </>,
    ),
  );
  expect(container.textContent).toContain('Shipped');
});
