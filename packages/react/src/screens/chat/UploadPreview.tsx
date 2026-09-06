import { log } from '@opencx/widget-core';
import type { FileWithProgress } from '@opencx/widget-react-headless';
import {
  AlertCircle,
  FileAudio2Icon,
  FileIcon,
  FileSpreadsheet,
  FileText,
  FileVideo2Icon,
  Loader2,
  XIcon,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { Accept } from 'react-dropzone';
import { Tooltippy } from '../../components/lib/tooltip';
import { cn } from '../../components/lib/utils/cn';
import { useTranslation } from '../../hooks/useTranslation';
import {
  getSpreadsheet,
  SPREADSHEET_ACCEPT,
  VIDEO_ACCEPT,
} from '../../utils/attachment-kind';

// Mirrors the server-side MAX_WIDGET_UPLOAD_BYTES cap on /widget/v2/upload.
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Attachment formats every chat accepts, regardless of assignee.
export const BASE_FILE_ACCEPT = {
  'application/pdf': ['.pdf'],
  ...SPREADSHEET_ACCEPT,
  ...VIDEO_ACCEPT,
} satisfies Accept;

export const HANDED_OFF_FILE_ACCEPT = {
  'text/*': ['.txt'],
  'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
  ...BASE_FILE_ACCEPT,
} satisfies Accept;

export const AI_FILE_ACCEPT = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  ...BASE_FILE_ACCEPT,
} satisfies Accept;

function UploadStatusIcon({ status }: { status: FileWithProgress['status'] }) {
  switch (status) {
    case 'uploading':
      return <Loader2 className="size-4 animate-spin" />;
    case 'error':
      return <AlertCircle className="size-4 text-destructive" />;
    default:
      return null;
  }
}

function UploadFileContent({
  file,
  fileContent,
}: {
  file: File;
  fileContent: string | ArrayBuffer | null;
}) {
  const fileType = file.type.split('/')[0];

  if (fileType === 'image' && fileContent) {
    return (
      <img
        src={typeof fileContent === 'string' ? fileContent : ''}
        className="object-cover bg-secondary size-full"
        alt={file.name}
      />
    );
  }
  if (fileType === 'audio') {
    return <FileAudio2Icon className="size-4 text-muted-foreground" />;
  }
  if (fileType === 'video') {
    return <FileVideo2Icon className="size-4 text-muted-foreground" />;
  }
  if (file.type === 'application/pdf') {
    return <FileText className="size-4 text-muted-foreground" />;
  }
  if (getSpreadsheet({ type: file.type, name: file.name })) {
    return <FileSpreadsheet className="size-4 text-muted-foreground" />;
  }
  return <FileIcon className="size-4 text-muted-foreground" />;
}

export function UploadPreview({
  file: { status, file, error },
  onCancel,
}: {
  file: FileWithProgress;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [fileContent, setFileContent] = useState<string | ArrayBuffer | null>(
    null,
  );

  useEffect(() => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => setFileContent(reader.result as string);
    reader.onerror = () => log.error('failed to read file for preview');
    reader.readAsDataURL(file);

    return () => reader.abort();
  }, [file]);

  return (
    <Tooltippy
      side="bottom"
      content={
        status === 'error' ? (
          <span className="text-destructive">
            {t('upload_failed', { error: error ?? '' })}
          </span>
        ) : (
          file.name
        )
      }
    >
      <div
        className={cn(
          status === 'uploading' && 'opacity-50',
          'group',
          'size-12 border rounded-2xl overflow-hidden relative',
          'flex items-center justify-center shrink-0',
        )}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <UploadStatusIcon status={status} />
        </div>
        <button
          type="button"
          className={cn(
            'absolute bg-foreground/50 inset-0 size-full z-10',
            'flex items-center justify-center',
            'opacity-0 group-hover:opacity-100 transition',
          )}
          onClick={onCancel}
          aria-label={t('remove_attachment')}
        >
          <XIcon className="size-4 text-primary-foreground" />
        </button>
        <UploadFileContent file={file} fileContent={fileContent} />
      </div>
    </Tooltippy>
  );
}
