import {
  createTokenSource,
  DevelopmentTokenSource,
  MsalTokenSource,
  PASSWORD_SESSION_KEY,
  PasswordTokenSource,
} from '../../src/app/core/auth/token-source';
import { TranslatableError } from '../../src/app/core/i18n/translatable-error';
import {
  readAppConfig,
  resolveAuthMode,
  type AppConfig,
} from '../../src/app/core/services/app-config.model';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PasswordTokenSource', () => {
  let now = 1_000_000;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000_000;
    sessionStorage.clear();
  });

  it('posts the credentials to the API and stores the token for this tab', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { accessToken: 'tok-1', expiresInSeconds: 60 }));
    const source = new PasswordTokenSource('/api', fetcher, () => sessionStorage, clock);

    await expect(source.signIn({ userName: 'rrhh_user', password: 'pw-123456789' })).resolves.toBe(
      'tok-1',
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/token');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      userName: 'rrhh_user',
      password: 'pw-123456789',
    });
    const stored = JSON.parse(sessionStorage.getItem(PASSWORD_SESSION_KEY)!) as Record<
      string,
      unknown
    >;
    expect(stored).toEqual({ accessToken: 'tok-1', expiresAt: 1_060_000 });
    expect(JSON.stringify(stored)).not.toContain('pw-123456789');
    await expect(source.getToken()).resolves.toBe('tok-1');
  });

  it('forgets an expired token', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { accessToken: 'tok-1', expiresInSeconds: 60 }));
    const source = new PasswordTokenSource('/api', fetcher, () => sessionStorage, clock);
    await source.signIn({ userName: 'u', password: 'p' });

    now += 61_000;

    await expect(source.getToken()).resolves.toBeNull();
    expect(sessionStorage.getItem(PASSWORD_SESSION_KEY)).toBeNull();
  });

  it('removes the token on sign-out and on discard', async () => {
    // A fresh Response per call: a body can be read only once.
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { accessToken: 'tok-1', expiresInSeconds: 60 })),
      );
    const source = new PasswordTokenSource('/api', fetcher, () => sessionStorage, clock);
    await source.signIn({ userName: 'u', password: 'p' });
    await source.signOut();
    expect(sessionStorage.getItem(PASSWORD_SESSION_KEY)).toBeNull();

    await source.signIn({ userName: 'u', password: 'p' });
    source.discard();
    await expect(source.getToken()).resolves.toBeNull();
  });

  it.each([
    [401, 'auth.login.invalidCredentials'],
    [400, 'auth.login.invalidCredentials'],
    [429, 'auth.login.tooManyAttempts'],
    [500, 'auth.login.failed'],
  ])('maps HTTP %i to the %s message and stores nothing', async (status, key) => {
    const source = new PasswordTokenSource(
      '/api',
      vi.fn().mockResolvedValue(jsonResponse(status)),
      () => sessionStorage,
      clock,
    );

    const failure = await source.signIn({ userName: 'u', password: 'p' }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(TranslatableError);
    expect((failure as TranslatableError).key).toBe(key);
    expect(sessionStorage.getItem(PASSWORD_SESSION_KEY)).toBeNull();
  });

  it('keeps the session in memory when storage is unavailable', async () => {
    const broken = () => {
      throw new Error('SecurityError');
    };
    const source = new PasswordTokenSource(
      '/api',
      vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: 'tok-m', expiresInSeconds: 60 })),
      broken,
      clock,
    );

    await source.signIn({ userName: 'u', password: 'p' });
    await expect(source.getToken()).resolves.toBe('tok-m');
    source.discard();
    await expect(source.getToken()).resolves.toBeNull();
  });

  it('ignores a malformed stored session', async () => {
    sessionStorage.setItem(PASSWORD_SESSION_KEY, '{not json');
    const source = new PasswordTokenSource('/api', vi.fn(), () => sessionStorage, clock);
    await expect(source.getToken()).resolves.toBeNull();
  });
});

describe('createTokenSource', () => {
  const config = (mode: AppConfig['AUTH_MODE']): AppConfig => ({
    APP_ENV: 'development',
    APP_VERSION: '0.0.0',
    API_BASE_URL: '/api',
    AUTH_MODE: mode,
    ENTRA_CLIENT_ID: '00000000-0000-0000-0000-000000000000',
    ENTRA_AUTHORITY: 'https://login.microsoftonline.com/common',
    ENTRA_API_SCOPE: 'api://test/.default',
  });

  it.each([
    ['development', DevelopmentTokenSource],
    ['password', PasswordTokenSource],
    ['entra', MsalTokenSource],
  ] as const)('picks the %s source', (mode, type) => {
    const source = createTokenSource(config(mode));
    expect(source).toBeInstanceOf(type);
    expect(source.mode).toBe(mode);
  });
});

describe('AUTH_MODE resolution', () => {
  afterEach(() => {
    delete window.__APP_CONFIG__;
  });

  it.each([
    ['password', 'local', 'password'],
    ['entra', 'test', 'entra'],
    ['development', 'production', 'development'],
    [undefined, 'local', 'development'],
    [undefined, 'test', 'development'],
    [undefined, 'production', 'entra'],
    ['', 'test', 'development'],
    ['bogus', 'development', 'entra'],
  ])('AUTH_MODE %s with APP_ENV %s resolves to %s', (authMode, appEnv, expected) => {
    expect(resolveAuthMode(authMode, appEnv)).toBe(expected);
  });

  it('reads AUTH_MODE from the runtime configuration', () => {
    window.__APP_CONFIG__ = { APP_ENV: 'test', AUTH_MODE: 'password' };
    expect(readAppConfig().AUTH_MODE).toBe('password');
  });

  it('defaults to development locally when nothing is configured', () => {
    expect(readAppConfig().AUTH_MODE).toBe('development');
  });
});
