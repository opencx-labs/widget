import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDropzone, type Accept, type FileRejection } from 'react-dropzone';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_FILE_ACCEPT,
  HANDED_OFF_FILE_ACCEPT,
  MAX_FILE_BYTES,
} from '../UploadPreview';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type DropResult = { accepted: File[]; rejected: FileRejection[] };

function Dropzone({
  accept,
  onResult,
}: {
  accept: Accept;
  onResult: (result: DropResult) => void;
}) {
  const { getRootProps, getInputProps } = useDropzone({
    accept,
    maxSize: MAX_FILE_BYTES,
    onDrop: (accepted, rejected) => onResult({ accepted, rejected }),
  });
  return (
    <div {...getRootProps()}>
      <input data-testid="input" {...getInputProps()} />
    </div>
  );
}

function fileOf({
  name,
  type,
  size = 1024,
}: {
  name: string;
  type: string;
  size?: number;
}) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function drop({
  accept,
  file,
}: {
  accept: Accept;
  file: File;
}): Promise<DropResult> {
  let result: DropResult | undefined;
  act(() => {
    root.render(<Dropzone accept={accept} onResult={(r) => (result = r)} />);
  });
  const input = container.querySelector('input');
  if (!input) throw new Error('dropzone input not rendered');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (!result) throw new Error('dropzone did not report a result');
  return result;
}

const FIFTY_MB = 50 * 1024 * 1024;

describe.each([
  ['AI chat', AI_FILE_ACCEPT],
  ['handed-off chat', HANDED_OFF_FILE_ACCEPT],
])('widget upload accept rules (%s)', (_label, accept) => {
  it.each([
    ['.mkv with the MIME browsers often leave empty', 'clip.mkv', ''],
    ['.mkv as video/x-matroska', 'clip.mkv', 'video/x-matroska'],
    ['.m4v as video/x-m4v', 'clip.m4v', 'video/x-m4v'],
    ['.3gp as video/3gpp', 'clip.3gp', 'video/3gpp'],
  ])('accepts %s', async (_case, name, type) => {
    const { accepted, rejected } = await drop({
      accept,
      file: fileOf({ name, type }),
    });
    expect(accepted.map((f) => f.name)).toEqual([name]);
    expect(rejected).toEqual([]);
  });

  it('rejects a video format still outside the list', async () => {
    const { accepted, rejected } = await drop({
      accept,
      file: fileOf({ name: 'clip.avi', type: 'video/x-msvideo' }),
    });
    expect(accepted).toEqual([]);
    expect(rejected.map((r) => r.errors[0]?.code)).toEqual([
      'file-invalid-type',
    ]);
  });

  it('accepts a video of exactly 50MB and rejects one byte more', async () => {
    const atCap = await drop({
      accept,
      file: fileOf({ name: 'max.mp4', type: 'video/mp4', size: FIFTY_MB }),
    });
    expect(atCap.accepted.map((f) => f.name)).toEqual(['max.mp4']);

    const overCap = await drop({
      accept,
      file: fileOf({ name: 'big.mp4', type: 'video/mp4', size: FIFTY_MB + 1 }),
    });
    expect(overCap.accepted).toEqual([]);
    expect(overCap.rejected.map((r) => r.errors[0]?.code)).toEqual([
      'file-too-large',
    ]);
  });
});
