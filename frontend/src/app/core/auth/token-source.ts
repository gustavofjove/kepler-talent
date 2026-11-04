import {
  BrowserCacheLocation,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';
import { TranslatableError } from '../i18n/translatable-error';
import type { AppConfig, AuthMode } from '../services/app-config.model';

export interface PasswordCredentials {
  userName: string;
  password: string;
}

export interface TokenSource {
  readonly mode: AuthMode;
  /** Only the password source reads `credentials`; the others ignore them. */
  signIn(credentials?: PasswordCredentials): Promise<string>;
  getToken(): Promise<string | null>;
  signOut(): Promise<void>;
  /** Drops the local token without a provider round trip, after the API refused it. */
  discard(): void;
}

export class DevelopmentTokenSource implements TokenSource {
  readonly mode = 'development' as const;
  private token: string | null = null;
  constructor(
    private readonly apiBaseUrl: string,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}
  async signIn(): Promise<string> {
    const response = await this.fetcher(`${this.apiBaseUrl}/dev/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        subject: 'dev-admin-oid',
        displayName: 'Administrador local',
        email: 'admin@kepler-talento.local',
      }),
    });
    if (!response.ok) throw new Error('Could not acquire a development token.');
    this.token = ((await response.json()) as { accessToken: string }).accessToken;
    return this.token;
  }
  getToken(): Promise<string | null> {
    return Promise.resolve(this.token);
  }
  signOut(): Promise<void> {
    this.discard();
    return Promise.resolve();
  }
  discard(): void {
    this.token = null;
  }
}

/** Where a password session lives: this tab only, like the MSAL cache (KTL-45 design D8). */
export const PASSWORD_SESSION_KEY = 'ktl.auth.session';

interface StoredSession {
  accessToken: string;
  expiresAt: number;
}

/**
 * Exchanges a user name and password at the API for its access token (KTL-45). The browser never
 * judges the credentials; it only relays them and keeps what the API returns.
 */
export class PasswordTokenSource implements TokenSource {
  readonly mode = 'password' as const;
  // Used only when sessionStorage throws (private mode, blocked site data): the session then
  // lasts until the page is reloaded.
  private memory: StoredSession | null = null;
  constructor(
    private readonly apiBaseUrl: string,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly storage: () => Storage = () => window.sessionStorage,
    private readonly now: () => number = Date.now,
  ) {}

  async signIn(credentials?: PasswordCredentials): Promise<string> {
    const response = await this.fetcher(`${this.apiBaseUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        userName: credentials?.userName ?? '',
        password: credentials?.password ?? '',
      }),
    });
    if (response.status === 429) throw new TranslatableError('auth.login.tooManyAttempts');
    // A 400 is an empty or oversized field; to the user it is the same wrong sign-in.
    if (response.status === 401 || response.status === 400) {
      throw new TranslatableError('auth.login.invalidCredentials');
    }
    if (!response.ok) throw new TranslatableError('auth.login.failed');
    const body = (await response.json()) as { accessToken: string; expiresInSeconds: number };
    this.write({
      accessToken: body.accessToken,
      expiresAt: this.now() + body.expiresInSeconds * 1000,
    });
    return body.accessToken;
  }

  getToken(): Promise<string | null> {
    const session = this.read();
    if (session && session.expiresAt > this.now()) return Promise.resolve(session.accessToken);
    if (session) this.discard();
    return Promise.resolve(null);
  }

  signOut(): Promise<void> {
    this.discard();
    return Promise.resolve();
  }

  discard(): void {
    this.memory = null;
    try {
      this.storage().removeItem(PASSWORD_SESSION_KEY);
    } catch {
      // Storage unavailable: the memory copy above was the only one.
    }
  }

  private read(): StoredSession | null {
    let raw: string | null;
    try {
      raw = this.storage().getItem(PASSWORD_SESSION_KEY);
    } catch {
      return this.memory;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      return typeof parsed.accessToken === 'string' && typeof parsed.expiresAt === 'number'
        ? { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt }
        : null;
    } catch {
      return null;
    }
  }

  private write(session: StoredSession): void {
    try {
      this.storage().setItem(PASSWORD_SESSION_KEY, JSON.stringify(session));
    } catch {
      this.memory = session;
    }
  }
}

export class MsalTokenSource implements TokenSource {
  readonly mode = 'entra' as const;
  private readonly client: PublicClientApplication;
  private account: AccountInfo | null = null;
  constructor(
    clientId: string,
    authority: string,
    private readonly scope: string,
  ) {
    this.client = new PublicClientApplication({
      auth: { clientId, authority, redirectUri: window.location.origin },
      cache: { cacheLocation: BrowserCacheLocation.SessionStorage },
    });
  }
  async signIn(): Promise<string> {
    await this.client.initialize();
    const result = await this.client.loginPopup({ scopes: [this.scope] });
    this.account = result.account;
    return result.accessToken;
  }
  async getToken(): Promise<string | null> {
    if (!this.account) return null;
    return (await this.client.acquireTokenSilent({ account: this.account, scopes: [this.scope] }))
      .accessToken;
  }
  async signOut(): Promise<void> {
    if (this.account) await this.client.logoutPopup({ account: this.account });
    this.account = null;
  }
  discard(): void {
    this.account = null;
  }
}

export function createTokenSource(config: AppConfig): TokenSource {
  switch (config.AUTH_MODE) {
    case 'development':
      return new DevelopmentTokenSource(config.API_BASE_URL);
    case 'password':
      return new PasswordTokenSource(config.API_BASE_URL);
    case 'entra':
      return new MsalTokenSource(
        config.ENTRA_CLIENT_ID,
        config.ENTRA_AUTHORITY,
        config.ENTRA_API_SCOPE,
      );
  }
}
