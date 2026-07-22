import { type Dto, type Endpoint, basicClient } from './client';
import type { WidgetConfig } from '../types/widget-config';
import type {
  ResolveSessionDto,
  SendMessageDto,
  VoteInputDto,
} from '../types/dtos';

export class ApiCaller {
  private client: ReturnType<typeof basicClient>;
  private config: WidgetConfig;
  private userToken: string | null = null;

  constructor({ config }: { config: WidgetConfig }) {
    this.config = config;
    this.userToken = config.user?.token || null;

    const { baseUrl, headers } = this.constructClientOptions(
      config.user?.token,
    );
    this.client = this.createOpenAPIClient({ baseUrl, headers });
  }

  private constructClientOptions = (token: string | null | undefined) => {
    const baseUrl =
      import.meta.env.MODE === 'test'
        ? 'http://localhost:8080'
        : this.config.apiUrl || 'https://api.open.cx';
    const headers = {
      'X-Bot-Token': this.config.token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: token ? `Bearer ${token}` : undefined,
    };

    return { baseUrl, headers };
  };

  private createOpenAPIClient = ({
    baseUrl,
    headers,
  }: ReturnType<typeof this.constructClientOptions>) => {
    return basicClient({
      baseUrl,
      onRequest: ({ request }) => {
        Object.entries(headers).forEach(([key, value]) => {
          if (value) {
            request.headers.set(key, value);
          }
        });
      },
    });
  };

  setAuthToken = (token: string) => {
    this.userToken = token;
    const { baseUrl, headers } = this.constructClientOptions(token);
    this.client = this.createOpenAPIClient({ baseUrl, headers });
  };

  /**
   * AUTH headers only (X-Bot-Token / Authorization), stripped of
   * content-type/accept. The transport sets its own Content-Type, and a second
   * (case-differing) copy gets COMBINED by the Headers init into
   * "application/json, application/json" — which the server rejects (415). Also
   * reused for the reconnect/stop control calls (empty-body POST/GET).
   */
  private getStreamAuthContext = (): {
    baseUrl: string;
    headers: Record<string, string>;
  } => {
    const { baseUrl, headers } = this.constructClientOptions(this.userToken);
    const definedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string') continue;
      if (['content-type', 'accept'].includes(key.toLowerCase())) continue;
      definedHeaders[key] = value;
    }
    return { baseUrl, headers: definedHeaders };
  };

  /**
   * Wiring for the v5 streaming transport (AI SDK `DefaultChatTransport`): the
   * send endpoint, the reconnect endpoint (a session-scoped GET the transport
   * hits via `prepareReconnectToStreamRequest`), and the shared auth headers.
   * Computed lazily so a later `setAuthToken` is always reflected.
   */
  getStreamTransportOptions = (): {
    api: string;
    reconnectApi: (sessionId: string) => string;
    headers: Record<string, string>;
  } => {
    const { baseUrl, headers } = this.getStreamAuthContext();
    return {
      api: `${baseUrl}/backend/widget/v5/chat/stream`,
      reconnectApi: (sessionId: string) =>
        `${baseUrl}/backend/widget/v5/chat/${sessionId}/stream`,
      headers,
    };
  };

  /**
   * Stop / interrupt the session's in-flight v5 turn. With resumable streams
   * on, a client abort is treated as a disconnect (the stream survives), so a
   * real "stop" is this explicit call — the backend cancels generation and
   * clears the resume pointer. Throws on failure — the caller (the v5 stop
   * path) decides how to react, so a failed cancel is never mistaken for an
   * ACKed one.
   */
  stopStream = async (sessionId: string): Promise<void> => {
    const { baseUrl, headers } = this.getStreamAuthContext();
    const res = await fetch(`${baseUrl}/backend/widget/v5/chat/${sessionId}/stop`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      throw new Error(`Failed to stop stream: ${res.status}`);
    }
  };

  getExternalWidgetConfig = async () => {
    return await this.client.GET('/backend/widget/v2/config', {
      params: {
        header: { 'x-bot-token': this.config.token },
        // Agents-platform binding: the backend resolves the agent's branding
        // into the config response (and 400s with a reason when unservable).
        query: this.config.agentId ? { agentId: this.config.agentId } : {},
      },
    });
  };

  sendMessage = async (body: SendMessageDto, abortSignal?: AbortSignal) => {
    return await this.client.POST('/backend/widget/v2/chat/send', {
      body,
      signal: abortSignal,
    });
  };

  createUnverifiedContact = async (body: Dto['CreateUnverifiedContactDto']) => {
    return await this.client.POST(
      '/backend/widget/v2/contact/create-unverified',
      {
        params: { header: { 'x-bot-token': this.config.token } },
        body,
      },
    );
  };

  createSession = async (body: Dto['CreateWidgetSessionDto']) => {
    return await this.client.POST('/backend/widget/v2/create-session', {
      body,
    });
  };

  pollSessionAndHistory = async ({
    sessionId,
    abortSignal,
  }: {
    sessionId: string;
    abortSignal: AbortSignal;
  }) => {
    return await this.client.GET('/backend/widget/v2/poll/{sessionId}', {
      params: { path: { sessionId } },
      signal: abortSignal,
    });
  };

  getSessions = async ({
    cursor,
    filters,
    abortSignal,
  }: {
    cursor: string | undefined;
    filters: Record<string, string>;
    abortSignal?: AbortSignal;
  }) => {
    return await this.client.GET('/backend/widget/v2/sessions', {
      params: {
        query: {
          cursor,
          filters: JSON.stringify(filters),
          // Agents-platform binding: scope the list to this agent's sessions.
          // The backend ignores it when absent (widget not agent-bound).
          ...(this.config.agentId ? { agentId: this.config.agentId } : {}),
        },
      },
      signal: abortSignal,
    });
  };

  /**
   * openapi-fetch usually works fine for file uploads, but this time around it parses the payload in a weird way and results in 413 errors (payload too large)
   * Anyway, good old XHR even does it better with progress events
   */
  uploadFile = async ({
    file,
    abortSignal,
    onProgress,
  }: {
    file: File;
    abortSignal: AbortSignal;
    onProgress?: (percentage: number) => void;
  }): Promise<Dto['UploadWidgetFileResponseDto']> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      // Set up abort functionality
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          xhr.abort();
          reject(new DOMException('Aborted', 'AbortError'));
        });

        // If already aborted, reject immediately
        if (abortSignal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
      }

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const percentage = Math.round((event.loaded / event.total) * 100);
          onProgress(percentage);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error}`));
          }
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error occurred'));
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timed out'));
      });

      const { baseUrl } = this.constructClientOptions(this.userToken);

      const path = '/backend/widget/v2/upload' satisfies Endpoint;
      const uploadUrl = `${baseUrl}${path}`;
      xhr.open('POST', uploadUrl);

      xhr.setRequestHeader('X-Bot-Token', this.config.token);
      const userToken = this.userToken ?? this.config.user?.token;
      if (userToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.userToken}`);
      } else {
        console.error('User token not set');
      }

      xhr.send(formData);
    });
  };

  vote = async (body: VoteInputDto) => {
    return await this.client.POST('/backend/widget/v2/chat/vote', { body });
  };

  resolveSession = async (
    body: ResolveSessionDto,
    abortSignal?: AbortSignal,
  ) => {
    return await this.client.POST('/backend/widget/v2/session/resolve', {
      body,
      signal: abortSignal,
    });
  };

  createStateCheckpoint = async (
    body: Dto['WidgetCreateStateCheckpointInputDto'],
  ) => {
    return await this.client.POST('/backend/widget/v2/checkpoint', {
      body,
    });
  };

  submitCsat = async (body: Dto['WidgetSubmitCsatInputDto']) => {
    return await this.client.POST('/backend/widget/v2/submit-csat', { body });
  };
}
