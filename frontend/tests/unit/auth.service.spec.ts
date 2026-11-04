import { AuthService } from '../../src/app/core/auth/auth.service';

describe('AuthService', () => {
  const createService = (storedToken: string | null = 'token') => {
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
    );
    return { service, router, tokenSource, api };
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
});
