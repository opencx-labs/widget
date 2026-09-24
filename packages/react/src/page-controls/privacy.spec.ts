import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPageClientContext } from './send-context';
import { describeElement, elementAt } from '../page-marks/page-element';
import {
  beginThumbnail,
  getThumbnail,
  beginSnapshotUpload,
  awaitSnapshotUrl,
} from '../page-marks/mark-thumbnail';
import { safePageUrl } from '../page-privacy';
import { toJpeg } from 'html-to-image';
vi.mock('html-to-image', () => ({
  toJpeg: vi.fn(async () => 'data:image/jpeg;base64,WA=='),
}));
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    top: 0,
    left: 0,
    right: 100,
    bottom: 40,
    toJSON() {},
  });
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
});
for (const [name, html] of [
  [
    'private descendant',
    '<button>Open <span data-opencx-private>SYNTHETIC_SECRET</span></button>',
  ],
  [
    'private referenced label',
    '<span data-opencx-private id="secret">SYNTHETIC_SECRET</span><button aria-labelledby="secret">Open</button>',
  ],
  ['editable value', '<div contenteditable="true">SYNTHETIC_SECRET</div>'],
  [
    'hidden descendant',
    '<button>Open <span style="display:none">SYNTHETIC_SECRET</span></button>',
  ],
] as const) {
  it(`excludes ${name} from outgoing context`, () => {
    document.body.innerHTML = html;
    expect(
      JSON.stringify(
        buildPageClientContext({ marks: [], readsPage: true }) ?? {},
      ),
    ).not.toContain('SYNTHETIC_SECRET');
    expect(
      buildPageClientContext({ marks: [], readsPage: false }),
    ).toBeUndefined();
  });
}
it('rejects direct marking of a private region', () => {
  document.body.innerHTML = '<div data-opencx-private>SYNTHETIC_SECRET</div>';
  const el = document.body.firstElementChild as HTMLElement;
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => el,
  });
  expect(elementAt(1, 1)).toBeNull();
  expect(JSON.stringify(describeElement(el))).not.toContain('SYNTHETIC_SECRET');
});
it('does not capture or upload regions containing private text or form fields', async () => {
  for (const html of [
    '<span data-opencx-private>SYNTHETIC_SECRET</span>',
    '<input type="password" value="SYNTHETIC_SECRET">',
    '<textarea>SYNTHETIC_SECRET</textarea>',
    '<div contenteditable="true">SYNTHETIC_SECRET</div>',
  ]) {
    document.body.innerHTML = `<section>${html}</section>`;
    vi.mocked(toJpeg).mockClear();
    const mark = {};
    beginThumbnail(mark, document.body.firstElementChild as HTMLElement);
    expect(await getThumbnail(mark)).toBeNull();
    const upload = vi.fn(async () => 'https://example.invalid/snapshot.jpg');
    beginSnapshotUpload(mark, upload);
    await awaitSnapshotUrl(mark, 10);
    expect(toJpeg).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  }
});
it('keeps safe names and does not upload a preview until Send starts upload', async () => {
  document.body.innerHTML = '<button>Open account</button>';
  expect(
    JSON.stringify(
      buildPageClientContext({ marks: [], readsPage: true }) ?? {},
    ),
  ).toContain('Open account');
  const mark = {};
  beginThumbnail(mark, document.body.firstElementChild as HTMLElement);
  expect(await getThumbnail(mark)).toBeTruthy();
  expect(await awaitSnapshotUrl(mark, 10)).toBeNull();
  const upload = vi.fn(async () => 'https://example.invalid/snapshot.jpg');
  beginSnapshotUpload(mark, upload);
  beginSnapshotUpload(mark, upload);
  expect(await awaitSnapshotUrl(mark, 10)).toBe(
    'https://example.invalid/snapshot.jpg',
  );
  expect(upload).toHaveBeenCalledOnce();
});
it('removes credentials, queries and fragments from page URLs', () => {
  expect(
    safePageUrl(
      'https://user:password@example.com/orders?token=SYNTHETIC_SECRET#SYNTHETIC_SECRET',
    ),
  ).toBe('https://example.com/orders');
  expect(safePageUrl('javascript:SYNTHETIC_SECRET')).toBe('');
});

it('does not upload a region marked private after its preview was captured', async () => {
  document.body.innerHTML = '<button>Open</button>';
  const el = document.querySelector('button')!;
  const mark = {};
  beginThumbnail(mark, el);
  await getThumbnail(mark);
  el.setAttribute('data-opencx-private', '');
  const upload = vi.fn(async () => 'https://example.invalid/mark.jpg');
  beginSnapshotUpload(mark, upload);
  expect(await awaitSnapshotUrl(mark, 10)).toBeNull();
  expect(upload).not.toHaveBeenCalled();
});
