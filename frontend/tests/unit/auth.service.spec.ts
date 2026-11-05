import { AuthService } from '../../src/app/core/auth/auth.service';
import { UnsavedChangesRegistry } from '../../src/app/core/state/unsaved-changes';

describe('AuthService', () => {
  const createService = (
    storedToken: string | null = 'token',
    unsavedChanges = new UnsavedChangesRegistry(),
  ) => {
    const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    const tokenSource = {
      mode: 'password' as const,
      signIn: vi.fn().mockResolvedValue('token'),
      getToken: vi.fn().mockResolvedValue(storedToken),
      signOut: vi.fn().mockResolvedValue(undefined),
      discard: vi.fn(),
    };
    const api = {
      request: vi.fn().mockResolvedValue({
        id: 'u-1',
        displayName: 'Test',
        email: 'test@example.com',
        roleName: 'readonly',
        roleLabel: 'Solo lectura',
        isActive: true,
        permissions: ['candidates.read'],
      }),
    };
    const service = new AuthService(
      tokenSource,
      api as unknown as ConstructorParameters<typeof AuthService>[1],
      router,
      unsavedChanges,
    );
    return { service, router, tokenSource, api, unsavedChanges };
  };

  it('starts without a browser-restored profile', () => {
    expect(createService().service.profile()).toBeNull();
  });

  it('reports the sign-in mode of its token source', () => {
    expect(createService().service.signInMode).toBe('password');
  });

  it('sign-in acquires a token and fills the profile from api me', async () => {
    const { service, tokenSource, api } = createService();
    await service.signIn();
    expect(tokenSource.signIn).toHaveBeenCalledOnce();
    expect(api.request).toHaveBeenCalledWith('/me');
    expect(service.profile()?.role).toBe('readonly');
    expect(service.hasPermission('candidates.read')).toBe(true);
  });

  it('passes password credentials through to the token source', async () => {
    const { service, tokenSource } = createService();
    await service.signIn({ userName: 'rrhh_user', password: 'secret-password' });
    expect(tokenSource.signIn).toHaveBeenCalledWith({
      userName: 'rrhh_user',
      password: 'secret-password',
    });
  });

  it('signs out of both sessions and redirects', async () => {
    const { service, tokenSource, router } = createService();
    await service.signIn();
    await service.signOut();
    expect(service.profile()).toBeNull();
    expect(tokenSource.signOut).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('a 401 notification clears the active session', async () => {
    const { service, router } = createService();
    await service.signIn();
    await service.handleUnauthorized();
    expect(service.profile()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('a 401 without a profile still discards the stored token', async () => {
    const { service, tokenSource, router } = createService();
    await service.handleUnauthorized();
    expect(tokenSource.discard).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('resumes a stored session by reading the profile', async () => {
    const { service, api } = createService('stored-token');
    await expect(service.resume()).resolves.toBe(true);
    expect(api.request).toHaveBeenCalledWith('/me');
    expect(service.profile()?.id).toBe('u-1');
  });

  it('does not resume when no token is stored', async () => {
    const { service, api } = createService(null);
    await expect(service.resume()).resolves.toBe(false);
    expect(api.request).not.toHaveBeenCalled();
  });

  it('discards a stored token the API refuses', async () => {
    const { service, api, tokenSource } = createService('stale-token');
    api.request.mockRejectedValueOnce(new Error('401'));
    await expect(service.resume()).resolves.toBe(false);
    expect(tokenSource.discard).toHaveBeenCalled();
    expect(service.profile()).toBeNull();
  });

  describe('session end with unsaved work (KTL-46)', () => {
    const profileOf = (id: string) => ({
      id,
      displayName: 'Test',
      email: `${id}@example.com`,
      roleName: 'rrhh_user',
      isActive: true,
      permissions: ['candidates.update'],
    });

    it('keeps the page and the profile, drops the token and flags the session', async () => {
      const { service, router, tokenSource, unsavedChanges } = createService();
      await service.signIn();
      unsavedChanges.set('candidate-page', true);

      await service.handleUnauthorized();

      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(service.profile()?.id).toBe('u-1');
      expect(tokenSource.discard).toHaveBeenCalledOnce();
      expect(tokenSource.signOut).not.toHaveBeenCalled();
      expect(service.sessionExpired()).toBe(true);
    });

    it('still signs out once nothing is unsaved', async () => {
      const { service, router, unsavedChanges } = createService();
      await service.signIn();
      unsavedChanges.set('candidate-page', true);
      unsavedChanges.set('candidate-page', false);

      await service.handleUnauthorized();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('signs the same user in again in place', async () => {
      const { service, router, tokenSource, unsavedChanges } = createService();
      await service.signIn();
      unsavedChanges.set('candidate-page', true);
      await service.handleUnauthorized();

      await expect(
        service.reauthenticate({ userName: 'rrhh_user', password: 'secret' }),
      ).resolves.toBe('same');

      expect(tokenSource.signIn).toHaveBeenLastCalledWith({
        userName: 'rrhh_user',
        password: 'secret',
      });
      expect(service.sessionExpired()).toBe(false);
      expect(unsavedChanges.hasAny()).toBe(true);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('treats another user as a fresh sign-in and gives the unsaved work up', async () => {
      const { service, router, api, unsavedChanges } = createService();
      await service.signIn();
      unsavedChanges.set('candidate-page', true);
      await service.handleUnauthorized();
      api.request.mockResolvedValueOnce(profileOf('u-2'));

      await expect(service.reauthenticate()).resolves.toBe('different');

      expect(service.profile()?.id).toBe('u-2');
      expect(unsavedChanges.hasAny()).toBe(false);
      expect(unsavedChanges.wasDiscarded()).toBe(true);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/app');
    });

    it('leaves everything as it was when the sign-in is refused', async () => {
      const { service, tokenSource, unsavedChanges } = createService();
      await service.signIn();
      unsavedChanges.set('candidate-page', true);
      await service.handleUnauthorized();
      tokenSource.signIn.mockRejectedValueOnce(new Error('Usuario o contraseña incorrectos.'));

      await expect(service.reauthenticate()).rejects.toThrow();

      expect(service.sessionExpired()).toBe(true);
      expect(service.profile()?.id).toBe('u-1');
    });

    it('resolves the prompt with how the dialog closed', async () => {
      const { service } = createService();

      const outcome = service.promptSignIn();
      expect(service.signInPrompt()).toBe(true);
      service.closeSignIn('same');

      await expect(outcome).resolves.toBe('same');
      expect(service.signInPrompt()).toBe(false);
    });

    it('cancels an open prompt on sign-out', async () => {
      const { service } = createService();
      await service.signIn();
      const outcome = service.promptSignIn();

      await service.signOut();

      await expect(outcome).resolves.toBe('cancelled');
      expect(service.sessionExpired()).toBe(false);
    });
  });
});
