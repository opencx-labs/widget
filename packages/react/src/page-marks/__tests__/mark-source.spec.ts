import { afterEach, expect, it, vi } from 'vitest';
import { describeElement } from '../page-element';
import type { PageMark } from '../page-mark';
import { registerPageMarkSources, pageMarkForSend } from '../mark-source';
import {
  beginThumbnail,
  beginSnapshotUpload,
  awaitSnapshotUrl,
  getThumbnail,
} from '../mark-thumbnail';
import { safePageUrl } from '../../page-privacy';

vi.mock('html-to-image', () => ({
  toJpeg: vi.fn(async () => 'data:image/jpeg;base64,WA=='),
}));
afterEach(() => {
  document.body.innerHTML = '';
});

function fixture() {
  const source = document.createElement('button');
  source.textContent = 'Safe';
  source.getBoundingClientRect = () => new DOMRect(0, 0, 100, 40);
  document.body.appendChild(source);
  const mark: PageMark = {
    shape: 'box',
    pageUrl: safePageUrl(window.location.href),
    rect: { x: 0, y: 0, width: 100, height: 40 },
    elements: [describeElement(source)],
  };
  return { source, mark };
}

it('rejects untracked marks but preserves a deliberately empty region note', () => {
  const { mark } = fixture();
  expect(pageMarkForSend(mark)).toBeNull();
  mark.elements = [];
  mark.note = 'My question about this empty space';
  registerPageMarkSources(mark, []);
  expect(pageMarkForSend(mark)).toEqual(mark);
});

it('rechecks every source, including a non-thumbnail element', () => {
  const { source, mark } = fixture();
  const secondary = document.createElement('span');
  secondary.textContent = 'SECONDARY_SECRET';
  document.body.appendChild(secondary);
  mark.elements.push(describeElement(secondary));
  registerPageMarkSources(mark, [source, secondary]);
  expect(pageMarkForSend(mark)?.elements).toHaveLength(2);
  secondary.setAttribute('data-opencx-private', '');
  expect(pageMarkForSend(mark)).toBeNull();
});

it('rejects a source moved into a private shadow tree before sending or uploading', async () => {
  const { source, mark } = fixture();
  registerPageMarkSources(mark, [source]);
  beginThumbnail(mark, source);
  await getThumbnail(mark);
  const host = document.createElement('div');
  host.setAttribute('data-opencx-private', '');
  document.body.appendChild(host);
  host.attachShadow({ mode: 'open' }).appendChild(source);
  expect(source.isConnected).toBe(true);
  expect(pageMarkForSend(mark)).toBeNull();
  const upload = vi.fn(async () => 'https://files.test/secret.jpg');
  beginSnapshotUpload(mark, upload);
  expect(await awaitSnapshotUrl(mark, 100)).toBeNull();
  expect(upload).not.toHaveBeenCalled();
});

it('keeps the safe local preview on an independent send payload', async () => {
  const { source, mark } = fixture();
  registerPageMarkSources(mark, [source]);
  beginThumbnail(mark, source);
  const copy = pageMarkForSend(mark);
  if (!copy) throw new Error('safe mark was rejected');
  expect(copy).not.toBe(mark);
  expect(await getThumbnail(copy)).toBe('data:image/jpeg;base64,WA==');
  mark.snapshotUrl = 'https://files.test/late.jpg';
  expect(copy.snapshotUrl).toBeUndefined();
});

it('removes an old snapshot when a child becomes private', async () => {
  const { source, mark } = fixture();
  source.innerHTML = 'Safe <span>SECRET</span>';
  mark.elements = [describeElement(source)];
  mark.snapshotUrl = 'https://files.test/old.jpg';
  registerPageMarkSources(mark, [source]);
  beginThumbnail(mark, source);
  await getThumbnail(mark);
  source.querySelector('span')?.setAttribute('data-opencx-private', '');
  const copy = pageMarkForSend(mark);
  expect(copy?.elements[0]?.text).toBe('Safe');
  expect(copy?.snapshotUrl).toBeUndefined();
  expect(copy && getThumbnail(copy)).toBeUndefined();
});

it('does not restore a snapshot URL when the source becomes private during upload', async () => {
  const { source, mark } = fixture();
  registerPageMarkSources(mark, [source]);
  beginThumbnail(mark, source);
  let complete: (value: string) => void = () => {};
  const upload = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
  );
  beginSnapshotUpload(mark, upload);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
  source.setAttribute('data-opencx-private', '');
  complete('https://files.test/late.jpg');
  expect(await awaitSnapshotUrl(mark, 100)).toBeNull();
  expect(mark.snapshotUrl).toBeUndefined();
  expect(pageMarkForSend(mark)).toBeNull();
});
