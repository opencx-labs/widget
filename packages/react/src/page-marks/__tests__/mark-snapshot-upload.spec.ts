import { describe, expect, it, vi } from 'vitest';
import {
  awaitSnapshotUrl,
  beginSnapshotUpload,
  beginThumbnail,
  fileFromDataUrl,
} from '../mark-thumbnail';

/**
 * The persisted half of a mark's picture: the thumbnail goes up as a message
 * file as soon as it lands and its URL is written onto the mark, so the send
 * carries it and a reload shows pixels, not tag names. A send never hangs on
 * it — a slow or failed upload costs the picture, not the message.
 */

vi.mock('html-to-image', () => ({
  toJpeg: vi.fn(async () => 'data:image/jpeg;base64,/9j/4AAQ'),
}));

function hostElement(): HTMLElement {
  const el = document.createElement('button');
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 120, height: 32 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe('fileFromDataUrl', () => {
  it('decodes a base64 data URL into a typed File', () => {
    const file = fileFromDataUrl('data:image/jpeg;base64,aGVsbG8=', 'm.jpg');
    expect(file?.name).toBe('m.jpg');
    expect(file?.type).toBe('image/jpeg');
    expect(file?.size).toBe(5);
  });

  it('returns null for anything that is not a base64 data URL', () => {
    expect(fileFromDataUrl('https://x.test/a.jpg', 'm.jpg')).toBeNull();
    expect(fileFromDataUrl('data:image/jpeg,raw', 'm.jpg')).toBeNull();
    expect(fileFromDataUrl('data:image/jpeg;base64,***', 'm.jpg')).toBeNull();
  });
});

describe('beginSnapshotUpload', () => {
  it('uploads the settled thumbnail and writes the URL onto the mark', async () => {
    const mark: { snapshotUrl?: string } = {};
    beginThumbnail(mark, hostElement());
    const upload = vi.fn(async (file: File) => {
      expect(file.type).toBe('image/jpeg');
      return 'https://storage.test/marks/1.jpg';
    });
    beginSnapshotUpload(mark, upload);

    expect(await awaitSnapshotUrl(mark, 1000)).toBe(
      'https://storage.test/marks/1.jpg',
    );
    expect(mark.snapshotUrl).toBe('https://storage.test/marks/1.jpg');
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('leaves the mark bare when the upload fails or rejects', async () => {
    const failed: { snapshotUrl?: string } = {};
    beginThumbnail(failed, hostElement());
    beginSnapshotUpload(failed, async () => null);
    expect(await awaitSnapshotUrl(failed, 1000)).toBeNull();
    expect(failed.snapshotUrl).toBeUndefined();

    const rejected: { snapshotUrl?: string } = {};
    beginThumbnail(rejected, hostElement());
    beginSnapshotUpload(rejected, async () => {
      throw new Error('boom');
    });
    expect(await awaitSnapshotUrl(rejected, 1000)).toBeNull();
    expect(rejected.snapshotUrl).toBeUndefined();
  });

  it('does nothing for a mark that never had a thumbnail', async () => {
    const mark: { snapshotUrl?: string } = {};
    const upload = vi.fn(async () => 'https://storage.test/x.jpg');
    beginSnapshotUpload(mark, upload);
    expect(await awaitSnapshotUrl(mark, 10)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('awaitSnapshotUrl', () => {
  it('gives up after the grace period while the upload is still in flight', async () => {
    const mark: { snapshotUrl?: string } = {};
    beginThumbnail(mark, hostElement());
    let release: (url: string) => void = () => undefined;
    beginSnapshotUpload(
      mark,
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    expect(await awaitSnapshotUrl(mark, 20)).toBeNull();
    // The straggler still lands on the object, for whatever reads it next.
    release('https://storage.test/late.jpg');
    await new Promise((r) => setTimeout(r, 0));
    expect(mark.snapshotUrl).toBe('https://storage.test/late.jpg');
  });

  it('answers immediately from a mark that already carries its URL', async () => {
    expect(
      await awaitSnapshotUrl({ snapshotUrl: 'https://s.test/a.jpg' }, 0),
    ).toBe('https://s.test/a.jpg');
  });
});
