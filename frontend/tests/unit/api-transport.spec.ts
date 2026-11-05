import { ApiTransport, safeDownloadFileName } from '../../src/app/core/http/api-transport';
import { AppError } from '../../src/app/shared/models/error.models';

describe('ApiTransport', () => {
  it('attaches the bearer token to every request', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    await new ApiTransport(
      '/api',
      async () => 'signed-token',
      () => undefined,
      1_000,
      fetcher,
    ).request('/me');
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer signed-token');
  });

  it('sends no request when the session has no token, and reports it as a 401 would', async () => {
    const fetcher = vi.fn();
    const onUnauthorized = vi.fn();
    await expect(
      new ApiTransport('/api', async () => null, onUnauthorized, 1_000, fetcher).request('/me'),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(fetcher).not.toHaveBeenCalled();
    // KTL-46: an expired session the browser already knows of takes the same path as the API's 401.
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('notifies the session on a 401', async () => {
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      new ApiTransport('/api', async () => 'token', onUnauthorized, 1_000, fetcher).request('/me'),
    ).rejects.toBeInstanceOf(AppError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
  it('uses the shared base path and preserves a problem correlation identifier', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 404,
          code: 'candidate.not_found',
          detail: 'No existe.',
          correlationId: 'corr-1',
        }),
        { status: 404, headers: { 'content-type': 'application/problem+json' } },
      ),
    );
    const transport = new ApiTransport(
      '/api',
      async () => 'test-token',
      () => undefined,
      1_000,
      fetcher,
    );
    const error = await transport
      .request('/reference/candidates/missing')
      .catch((value: unknown) => value);
    expect(fetcher).toHaveBeenCalledWith('/api/reference/candidates/missing', expect.any(Object));
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      backendCode: 'candidate.not_found',
      correlationId: 'corr-1',
    });
  });

  it('returns a safe generic error for malformed non-problem content', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('<html>private path</html>', { status: 500 }));
    const error = await new ApiTransport(
      '/api',
      async () => 'test-token',
      () => undefined,
      1_000,
      fetcher,
    )
      .request('/broken')
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect((error as Error).message).not.toContain('private path');
  });

  it('distinguishes timeout from caller cancellation', async () => {
    const fetcher = vi.fn(
      (_input, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    );
    await expect(
      new ApiTransport(
        '/api',
        async () => 'test-token',
        () => undefined,
        1,
        fetcher,
      ).request('/slow'),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    const controller = new AbortController();
    const request = new ApiTransport(
      '/api',
      async () => 'test-token',
      () => undefined,
      1_000,
      fetcher,
    ).request('/cancelled', {
      signal: controller.signal,
    });
    controller.abort();
    await expect(request).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('downloads with a safe attachment filename and content type', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Blob(['cv']), {
        headers: {
          'content-disposition': 'attachment; filename="..\\candidate.pdf"',
          'content-type': 'application/pdf',
        },
      }),
    );
    const result = await new ApiTransport(
      '/api',
      async () => 'test-token',
      () => undefined,
      1_000,
      fetcher,
    ).download('/documents/1', 'documento.pdf');
    expect(result.fileName).toBe('_candidate.pdf');
    expect(result.contentType).toBe('application/pdf');
  });
});

describe('safeDownloadFileName', () => {
  it('supports RFC 5987 and rejects traversal/control characters', () => {
    expect(safeDownloadFileName("attachment; filename*=UTF-8''curr%C3%ADculum.pdf", 'cv.pdf')).toBe(
      'currículum.pdf',
    );
    expect(safeDownloadFileName('attachment; filename="../../secret.txt"', 'cv.txt')).toBe(
      '_.._secret.txt',
    );
  });
});
