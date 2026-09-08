import { v4 } from 'uuid';
import type { ApiCaller } from '../api/api-caller';
import { PrimitiveState } from '../utils/PrimitiveState';

export interface FileWithProgress {
  status: 'pending' | 'uploading' | 'success' | 'error';
  id: string;
  file: File;
  fileUrl?: string;
  progress: number;
  error?: string;
}

/** Attachments belong to their conversation, not the mounted composer. */
export class UploadCtx {
  state = new PrimitiveState<FileWithProgress[]>([]);
  private controllers = new Map<string, AbortController>();
  constructor(private api: ApiCaller) {}

  appendFiles = (files: File[]) => {
    const pending = files.map(
      (file): FileWithProgress => ({
        file,
        id: v4(),
        status: 'pending',
        progress: 0,
      }),
    );
    this.state.set([...this.state.get(), ...pending]);
    pending.forEach((file) => void this.upload(file));
  };

  private update(id: string, update: Partial<FileWithProgress>) {
    this.state.set(
      this.state
        .get()
        .map((file) => (file.id === id ? { ...file, ...update } : file)),
    );
  }

  private async upload(file: FileWithProgress) {
    const controller = new AbortController();
    this.controllers.set(file.id, controller);
    this.update(file.id, { status: 'uploading' });
    try {
      const response = await this.api.uploadFile({
        file: file.file,
        abortSignal: controller.signal,
        onProgress: (progress) => this.update(file.id, { progress }),
      });
      this.update(file.id, {
        status: 'success',
        fileUrl: response.fileUrl,
        progress: 100,
      });
    } catch (error) {
      if (!controller.signal.aborted)
        this.update(file.id, {
          status: 'error',
          progress: 0,
          error: error instanceof Error ? error.message : 'Upload failed',
        });
    } finally {
      this.controllers.delete(file.id);
    }
  }

  cancel = (id: string) => {
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.state.set(this.state.get().filter((file) => file.id !== id));
  };

  reset = () => {
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
    this.state.reset();
  };
}
