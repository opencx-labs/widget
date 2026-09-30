import { afterEach, expect, it } from 'vitest';
import { buildPageClientContext } from '../send-context';
import { elementAt } from '../../page-marks/page-element';
import {
  beginThumbnail,
  getThumbnail,
  beginSnapshotUpload,
  awaitSnapshotUrl,
} from '../../page-marks/mark-thumbnail';

afterEach(() => {
  document.body.innerHTML = '';
});

it('keeps private, hidden and editable values out of the browser send context', () => {
  document.body.innerHTML = `
    <button>Open <span data-opencx-private>SYNTHETIC_SECRET</span><span style="display:none">SYNTHETIC_SECRET</span></button>
    <span data-opencx-private id="private-label">SYNTHETIC_SECRET</span><button aria-labelledby="private-label">Help</button>
    <div contenteditable="true">SYNTHETIC_SECRET</div>
    <label>Notes<textarea>SYNTHETIC_SECRET</textarea></label>
    <input type="password" value="SYNTHETIC_SECRET">
    <input aria-label="Search" value="SYNTHETIC_SECRET">
  `;
  const context = JSON.stringify(
    buildPageClientContext({ marks: [], readsPage: true }),
  );
  expect(context).toContain('Open');
  expect(context).toContain('Search');
  expect(context).not.toContain('SYNTHETIC_SECRET');
});

it('refuses private hit targets and refuses to rasterize form-containing regions', async () => {
  document.body.innerHTML =
    '<section style="padding:20px"><button data-opencx-private>Secret</button><textarea>SYNTHETIC_SECRET</textarea></section>';
  const button = document.querySelector('button')!;
  const rect = button.getBoundingClientRect();
  expect(elementAt(rect.x + 2, rect.y + 2)).toBeNull();
  const mark = {};
  beginThumbnail(mark, document.querySelector('section')!);
  expect(await getThumbnail(mark)).toBeNull();
});

it('captures safe pixels locally and only uploads after the send path starts it', async () => {
  document.body.innerHTML =
    '<button style="width:100px;height:40px">Open</button>';
  const mark = {};
  beginThumbnail(mark, document.querySelector('button')!);
  expect(await getThumbnail(mark)).toMatch(/^data:image\/jpeg;base64,/);
  expect(await awaitSnapshotUrl(mark, 10)).toBeNull();
  let uploads = 0;
  beginSnapshotUpload(mark, async () => {
    uploads++;
    return 'https://example.invalid/mark.jpg';
  });
  expect(await awaitSnapshotUrl(mark, 100)).toBe(
    'https://example.invalid/mark.jpg',
  );
  expect(uploads).toBe(1);
});
