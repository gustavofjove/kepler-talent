import { signal } from '../../core/state/signal';
import type { Permission, UserProfile } from '../../shared/models/auth.models';
import type { AppNavigator } from '../routing/navigator';
import type { ApiTransport } from '../http/api-transport';
import type { AuthMode } from '../services/app-config.model';
import { UnsavedChangesRegistry } from '../state/unsaved-changes';
import type { PasswordCredentials, TokenSource } from './token-source';

/** How a sign-in again in place ended (KTL-46). */
export type ReauthOutcome = 'same' | 'different' | 'cancelled';

export class AuthService {
  readonly profile = signal<UserProfile | null>(null);
  /** The API refused the session while the page held unsaved work, which was kept (KTL-46). */
  readonly sessionExpired = signal(false);
  /** The sign-in dialog over the page is open. */
  readonly signInPrompt = signal(false);
  private resolvePrompt: ((outcome: ReauthOutcome) => void) | null = null;

  constructor(
    private readonly tokenSource: TokenSource,
    private readonly api: ApiTransport,
    private readonly router: AppNavigator,
    private readonly unsavedChanges: UnsavedChangesRegistry = new UnsavedChangesRegistry(),
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
    this.profile.set(await this.fetchProfile());
  }

  /**
   * Picks up a session the token source still holds, such as a password session after a
   * reload. Resolves whether one was resumed; a token the API refuses is discarded on the way.
   */
  async resume(): Promise<boolean> {
    if (this.profile() !== null) return true;
    if ((await this.tokenSource.getToken()) === null) return false;
    try {
      this.profile.set(await this.fetchProfile());
      return true;
    } catch {
      this.tokenSource.discard();
      return false;
    }
  }

  async signOut(): Promise<void> {
    this.closeSignIn('cancelled');
    this.sessionExpired.set(false);
    this.profile.set(null);
    await this.tokenSource.signOut();
    await this.router.navigateByUrl('/login');
  }

  /**
   * The API refused the session. With nothing unsaved the user is sent to sign-in, as always.
   * With unsaved work on the page (KTL-46) the page and its draft stay: the token is dropped, the
   * profile kept so the page stays mounted, and the panels offer to sign in again. The kept profile
   * authorises nothing; the API refuses every call until a new token arrives.
   */
  async handleUnauthorized(): Promise<void> {
    if (this.profile() !== null) {
      if (this.unsavedChanges.hasAny()) {
        this.tokenSource.discard();
        this.sessionExpired.set(true);
        return;
      }
      await this.signOut();
      return;
    }
    // No profile yet, e.g. a stored token refused while resuming: nothing to sign out of, but
    // the token must not be offered again.
    this.tokenSource.discard();
  }

  /** Opens the sign-in dialog over the page and resolves how it ended. */
  promptSignIn(): Promise<ReauthOutcome> {
    this.resolvePrompt?.('cancelled');
    this.signInPrompt.set(true);
    return new Promise((resolve) => {
      this.resolvePrompt = resolve;
    });
  }

  closeSignIn(outcome: ReauthOutcome): void {
    const resolve = this.resolvePrompt;
    this.resolvePrompt = null;
    this.signInPrompt.set(false);
    resolve?.(outcome);
  }

  /**
   * Signs in again without leaving the page. The same user keeps the page and its draft. Another
   * user's sign-in is a fresh one: the previous user's unsaved work is given up, not handed over.
   */
  async reauthenticate(credentials?: PasswordCredentials): Promise<'same' | 'different'> {
    const previous = this.profile();
    await this.tokenSource.signIn(credentials);
    const profile = await this.fetchProfile();
    this.sessionExpired.set(false);
    if (previous !== null && previous.id === profile.id) {
      this.profile.set(profile);
      return 'same';
    }
    this.unsavedChanges.discardAll();
    this.profile.set(profile);
    await this.router.navigateByUrl('/app');
    return 'different';
  }

  private async fetchProfile(): Promise<UserProfile> {
    const profile = await this.api.request<UserProfile & { roleName?: string }>('/me');
    return { ...profile, role: profile.roleName ?? profile.role };
  }
}
