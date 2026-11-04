import { signal } from '../../core/state/signal';
import type { Permission, UserProfile } from '../../shared/models/auth.models';
import type { AppNavigator } from '../routing/navigator';
import type { ApiTransport } from '../http/api-transport';
import type { AuthMode } from '../services/app-config.model';
import type { PasswordCredentials, TokenSource } from './token-source';

export class AuthService {
  readonly profile = signal<UserProfile | null>(null);

  constructor(
    private readonly tokenSource: TokenSource,
    private readonly api: ApiTransport,
    private readonly router: AppNavigator,
  ) {}

  get isAuthenticated(): boolean {
    return this.profile() !== null;
  }

  /** Fixed for the life of the page: it comes from the runtime configuration. */
  get signInMode(): AuthMode {
    return this.tokenSource.mode;
  }

  hasPermission(permission: Permission): boolean {
    const profile = this.profile();
    return Boolean(profile?.isActive && profile.permissions.includes(permission));
  }

  async signIn(credentials?: PasswordCredentials): Promise<void> {
    await this.tokenSource.signIn(credentials);
    await this.loadProfile();
  }

  /**
   * Picks up a session the token source still holds, such as a password session after a
   * reload. Resolves whether one was resumed; a token the API refuses is discarded on the way.
   */
  async resume(): Promise<boolean> {
    if (this.profile() !== null) return true;
    if ((await this.tokenSource.getToken()) === null) return false;
    try {
      await this.loadProfile();
      return true;
    } catch {
      this.tokenSource.discard();
      return false;
    }
  }

  async signOut(): Promise<void> {
    this.profile.set(null);
    await this.tokenSource.signOut();
    await this.router.navigateByUrl('/login');
  }

  async handleUnauthorized(): Promise<void> {
    if (this.profile() !== null) {
      await this.signOut();
      return;
    }
    // No profile yet, e.g. a stored token refused while resuming: nothing to sign out of, but
    // the token must not be offered again.
    this.tokenSource.discard();
  }

  private async loadProfile(): Promise<void> {
    const profile = await this.api.request<UserProfile & { roleName?: string }>('/me');
    this.profile.set({ ...profile, role: profile.roleName ?? profile.role });
  }
}
