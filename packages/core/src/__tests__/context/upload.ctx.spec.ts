import { describe, expect, it, vi } from 'vitest';
import type { ApiCaller } from '../../api/api-caller';
import { UploadCtx } from '../../context/upload.ctx';

describe('conversation attachments', () => {
  it('cancels only its own uploads and ignores responses for removed files', async () => {
    const pending: Array<{
      signal: AbortSignal;
      resolve: (value: { fileUrl: string }) => void;
    }> = [];
    const api = {
      uploadFile: vi.fn(
        ({ abortSignal }) =>
          new Promise((resolve) => {
            pending.push({ signal: abortSignal, resolve });
          }),
      ),
    } as unknown as ApiCaller;
    const first = new UploadCtx(api);
    const second = new UploadCtx(api);
    first.appendFiles([new File(['a'], 'first.txt')]);
    second.appendFiles([new File(['b'], 'second.txt')]);
    first.reset();
    expect(pending[0]!.signal.aborted).toBe(true);
    expect(pending[1]!.signal.aborted).toBe(false);
    pending[0]!.resolve({ fileUrl: '/first.txt' });
    pending[1]!.resolve({ fileUrl: '/second.txt' });
    await Promise.resolve();
    expect(first.state.get()).toEqual([]);
    expect(second.state.get()[0]).toMatchObject({
      fileUrl: '/second.txt',
      status: 'success',
      progress: 100,
    });
  });
});
