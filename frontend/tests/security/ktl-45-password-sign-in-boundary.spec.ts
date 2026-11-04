// @vitest-environment jsdom
// The behavioural cases need sessionStorage; the security project otherwise runs in Node.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuthService } from '../../src/app/core/auth/auth.service';
import { PASSWORD_SESSION_KEY, PasswordTokenSource } from '../../src/app/core/auth/token-source';
import { ApiTransport } from '../../src/app/core/http/api-transport';
import { repoRoot } from '../repo-root';

const read = (relative: string): string => readFileSync(join(repoRoot, relative), 'utf8');

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('KTL-45 password sign-in security boundary', () => {
  beforeEach(() => sessionStorage.clear());

  it('the runtime configuration the browser receives carries no secret', () => {
    const template = read('frontend/public/env.template.js');
    const local = read('frontend/public/env.js');

    // Only these settings may reach the browser; a credential would need a key of its own.
    const allowed = [
      'API_BASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'APP_ENV',
      'AUTH_MODE',
      'APP_VERSION',
    ];
    for (const config of [template, local]) {
      const keys = [...config.matchAll(/^\s*([A-Z_]+):/gm)].map((match) => match[1]);
      expect(keys.every((key) => allowed.includes(key))).toBe(true);
      expect(config).not.toMatch(/signing|secret|pbkdf2|KeplerLocal/i);
    }
    expect(template).toContain("AUTH_MODE: '${AUTH_MODE}'");
    expect(local).toContain("AUTH_MODE: 'password'");
  });

  it('the shared server overlay disables the development issuer and takes secrets only from the environment', () => {
    const overlay = read('deploy/lan/docker-compose.lan.yml');

    expect(overlay).toMatch(/Authentication__DevelopmentIssuer__Enabled: 'false'/);
    expect(overlay).toMatch(/\$\{KTL_AUTH_SIGNING_KEY:\?/);
    expect(overlay).toMatch(/\$\{KTL_RRHH_ADMIN_PASSWORD:\?/);
    expect(overlay).toMatch(/\$\{KTL_RRHH_USER_PASSWORD:\?/);
    expect(overlay).not.toContain('KeplerLocal-');
    expect(overlay).not.toContain('KTL_DEV_SIGNING_KEY');
    expect(overlay).toMatch(/AUTH_MODE: password/);
  });

  it('every development-only credential committed to compose is refused in Production', () => {
    const compose = read('docker-compose.yml');
    const defaults = read('backend/Web/Identity/AuthenticationOptions.cs');
    const committed = [
      ...compose.matchAll(
        /Authentication__LocalAccounts__(?:SigningKey|Seed__\d+__Password): (\S+)/g,
      ),
    ].map((match) => match[1]);

    expect(committed.length).toBe(3);
    for (const value of committed) {
      expect(defaults).toContain(`"${value}"`);
    }
  });

  it('the sign-in endpoint is rate-limited, anonymous only by necessity, and mapped only when enabled', () => {
    const program = read('backend/Web/Program.cs');
    const endpoints = read('backend/Web/Features/Identity/PasswordSignInEndpoints.cs');
    const handler = read('backend/Application/Features/Identity/SignInWithPassword.cs');

    expect(endpoints).toContain('.RequireRateLimiting(RateLimitPolicy)');
    expect(endpoints).toContain('.AllowAnonymous()');
    expect(endpoints).not.toMatch(/MapDelete|MapPut/);
    expect(program).toMatch(/if \(localAccountsEnabled\)\s*\{[^}]*MapPasswordSignInEndpoints\(\)/);
    expect(program).toContain('app.UseRateLimiter()');
    // The result the endpoint can return holds neither the hash nor a role.
    expect(handler).toMatch(
      /record SignedInUser\(Guid Id, string ExternalSubject, string DisplayName, string Email\)/,
    );
  });

  it('a token is never sent to the API without being the one the API issued', async () => {
    const source = new PasswordTokenSource(
      '/api',
      vi.fn().mockResolvedValue(json(401, { code: 'auth.invalid_credentials' })),
    );

    await expect(source.signIn({ userName: 'rrhh_user', password: 'guess' })).rejects.toThrow();

    expect(await source.getToken()).toBeNull();
    expect(sessionStorage.getItem(PASSWORD_SESSION_KEY)).toBeNull();
  });

  it('a 401 from the API clears the stored session and returns to sign-in', async () => {
    const signInFetch = vi
      .fn()
      .mockResolvedValue(json(200, { accessToken: 'issued-token', expiresInSeconds: 3600 }));
    const source = new PasswordTokenSource('/api', signInFetch);
    const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    const authRef: { current: AuthService | null } = { current: null };
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, {
          id: 'u-1',
          displayName: 'RRHH',
          email: 'rrhh@kepler-talento.local',
          roleName: 'rrhh_user',
          isActive: true,
          permissions: ['candidates.read'],
        }),
      )
      .mockResolvedValueOnce(json(401, { code: 'authentication.required' }));
    const api = new ApiTransport(
      '/api',
      () => source.getToken(),
      () => authRef.current?.handleUnauthorized(),
      15_000,
      apiFetch,
    );
    const auth = new AuthService(source, api, router);
    authRef.current = auth;

    await auth.signIn({ userName: 'rrhh_user', password: 'Correct-Password-1' });
    expect(sessionStorage.getItem(PASSWORD_SESSION_KEY)).not.toBeNull();
    const [, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer issued-token');

    await expect(api.request('/candidates')).rejects.toThrow();

    expect(sessionStorage.getItem(PASSWORD_SESSION_KEY)).toBeNull();
    expect(auth.profile()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
