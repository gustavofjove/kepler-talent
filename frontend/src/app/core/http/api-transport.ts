import { AppError, type AppErrorCode } from '../../shared/models/error.models';

interface ApiProblem {
  title?: string;
  detail?: string;
  status?: number;
  code?: string;
  correlationId?: string;
  errors?: unknown;
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

export interface ApiDownload {
  blob: Blob;
  fileName: string;
  contentType: string;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type TokenProvider = () => Promise<string | null>;

export class ApiTransport {
  constructor(
    private readonly baseUrl = '/api',
    private readonly tokenProvider: TokenProvider,
    private readonly onUnauthorized: () => void | Promise<void> = () => undefined,
    private readonly defaultTimeoutMs = 15_000,
    private readonly fetcher: FetchLike = globalThis.fetch.bind(globalThis),
  ) {}

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const response = await this.send(path, options);
    if (response.status === 204) return undefined as T;
    if (!this.isJson(response)) {
      throw new AppError(
        'INTERNAL_ERROR',
        'El servidor ha devuelto una respuesta inesperada.',
        undefined,
        this.correlationFrom(response),
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new AppError(
        'INTERNAL_ERROR',
        'El servidor ha devuelto una respuesta no válida.',
        undefined,
        this.correlationFrom(response),
      );
    }
  }

  async download(
    path: string,
    fallbackFileName: string,
    options: ApiRequestOptions = {},
  ): Promise<ApiDownload> {
    const response = await this.send(path, options);
    const contentType =
      response.headers.get('content-type')?.split(';')[0].trim() || 'application/octet-stream';
    return {
      blob: await response.blob(),
      fileName: safeDownloadFileName(response.headers.get('content-disposition'), fallbackFileName),
      contentType,
    };
  }

  private async send(path: string, options: ApiRequestOptions): Promise<Response> {
    const token = await this.tokenProvider();
    if (!token) {
      // A session the browser already knows has ended is the same refusal as the API's 401, and
      // takes the same path (KTL-46): sign-in, or the sign-in in place when work is unsaved.
      await this.onUnauthorized();
      throw new AppError('UNAUTHENTICATED');
    }
    const controller = new AbortController();
    const callerSignal = options.signal;
    let callerCancelled = callerSignal?.aborted ?? false;
    const cancelFromCaller = () => {
      callerCancelled = true;
      controller.abort(callerSignal?.reason);
    };
    callerSignal?.addEventListener('abort', cancelFromCaller, { once: true });
    const timeout = setTimeout(
      () => controller.abort('timeout'),
      options.timeoutMs ?? this.defaultTimeoutMs,
    );
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json, application/problem+json');
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('X-Correlation-ID')) headers.set('X-Correlation-ID', createCorrelationId());
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    try {
      const response = await this.fetcher(this.resolve(path), {
        ...options,
        headers,
        signal: controller.signal,
      });
      if (response.status === 401) await this.onUnauthorized();
      if (!response.ok) throw await this.toProblemError(response);
      return response;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) throw new AppError(callerCancelled ? 'CANCELLED' : 'TIMEOUT');
      throw new AppError('INTERNAL_ERROR', 'No se ha podido conectar con el servidor.');
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', cancelFromCaller);
    }
  }

  private async toProblemError(response: Response): Promise<AppError> {
    const headerCorrelation = this.correlationFrom(response);
    if (!this.isJson(response))
      return new AppError(mapStatus(response.status), undefined, undefined, headerCorrelation);
    try {
      const problem = (await response.json()) as ApiProblem;
      return new AppError(
        mapStatus(problem.status ?? response.status),
        problem.detail || problem.title,
        problem.errors === undefined ? undefined : { errors: problem.errors },
        problem.correlationId || headerCorrelation,
        problem.code,
      );
    } catch {
      return new AppError(mapStatus(response.status), undefined, undefined, headerCorrelation);
    }
  }

  private resolve(path: string): string {
    return `${this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private isJson(response: Response): boolean {
    const type = response.headers.get('content-type')?.toLowerCase() ?? '';
    return type.includes('application/json') || type.includes('application/problem+json');
  }

  private correlationFrom(response: Response): string | undefined {
    return response.headers.get('X-Correlation-ID') ?? undefined;
  }
}

function mapStatus(status: number): AppErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 400 || status === 422) return 'VALIDATION_ERROR';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}

function createCorrelationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function safeDownloadFileName(contentDisposition: string | null, fallback: string): string {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = contentDisposition?.match(/filename="([^"]+)"/i)?.[1];
  const plain = contentDisposition?.match(/filename=([^;]+)/i)?.[1];
  let candidate = fallback;
  try {
    candidate = encoded ? decodeURIComponent(encoded) : (quoted ?? plain ?? fallback).trim();
  } catch {
    candidate = fallback;
  }
  candidate = [...candidate]
    .map((character) => {
      const code = character.charCodeAt(0);
      return character === '/' || character === '\\' || code < 32 || code === 127 ? '_' : character;
    })
    .join('')
    .replace(/^\.+/, '')
    .trim();
  if (!candidate || candidate === '.' || candidate === '..') candidate = fallback;
  return candidate.slice(0, 180);
}
