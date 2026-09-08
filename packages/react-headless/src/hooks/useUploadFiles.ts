import { useMemo } from 'react';
import { useWidget } from '../WidgetProvider';
import { usePrimitiveState } from './usePrimitiveState';

export type { FileWithProgress } from '@opencx/widget-core';

export function useUploadFiles() {
  const {
    widgetCtx: { uploadCtx },
  } = useWidget();
  const files = usePrimitiveState(uploadCtx.state);
  const successFiles = useMemo(
    () => files.filter((file) => file.status === 'success' && file.fileUrl),
    [files],
  );
  return {
    allFiles: files,
    appendFiles: uploadCtx.appendFiles,
    handleCancelUpload: uploadCtx.cancel,
    successFiles,
    emptyTheFiles: uploadCtx.reset,
    getFileById: (id: string) => files.find((file) => file.id === id),
    getUploadProgress: (id: string) =>
      files.find((file) => file.id === id)?.progress ?? 0,
    getUploadStatus: (id: string) =>
      files.find((file) => file.id === id)?.status,
    hasErrors: files.some((file) => file.status === 'error'),
    isUploading: files.some((file) => file.status === 'uploading'),
  };
}
