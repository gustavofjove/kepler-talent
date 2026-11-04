import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LoginPage } from '../../src/app/core/auth/login-page';
import { ServicesProvider } from '../../src/app/core/di/services-context';
import { services, type Services } from '../../src/app/core/di/services';
import { TranslatableError } from '../../src/app/core/i18n/translatable-error';
import type { AuthMode } from '../../src/app/core/services/app-config.model';
import es from '../../src/assets/i18n/es.json';

function renderLogin(
  mode: AuthMode,
  overrides: { signIn?: ReturnType<typeof vi.fn>; resume?: ReturnType<typeof vi.fn> } = {},
) {
  const authStub = {
    signInMode: mode,
    signIn: overrides.signIn ?? vi.fn().mockResolvedValue(undefined),
    resume: overrides.resume ?? vi.fn().mockResolvedValue(false),
  };
  const value = {
    ...services,
    authService: authStub as unknown as Services['authService'],
  } as Services;
  render(
    <ServicesProvider value={value}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<p data-testid="app-shell">app</p>} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );
  return authStub;
}

describe('LoginPage', () => {
  it('in password mode renders labelled fields and submits the credentials', async () => {
    const user = userEvent.setup();
    const auth = renderLogin('password');

    const userName = screen.getByLabelText(es['auth.login.username']);
    const password = screen.getByLabelText(es['auth.login.password']);
    expect(userName).toHaveAttribute('name', 'username');
    expect(userName).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByText(es['auth.login.passwordIntro'])).toBeInTheDocument();

    await user.type(userName, 'rrhh_user');
    await user.type(password, 'Correct-Password-1');
    await user.click(screen.getByTestId('sign-in'));

    expect(auth.signIn).toHaveBeenCalledWith({
      userName: 'rrhh_user',
      password: 'Correct-Password-1',
    });
    expect(await screen.findByTestId('app-shell')).toBeInTheDocument();
  });

  it('shows the generic refusal, keeps the user name and clears the password', async () => {
    const user = userEvent.setup();
    renderLogin('password', {
      signIn: vi.fn().mockRejectedValue(new TranslatableError('auth.login.invalidCredentials')),
    });

    await user.type(screen.getByTestId('login-username'), 'rrhh_user');
    await user.type(screen.getByTestId('login-password'), 'Wrong-Password-1');
    await user.click(screen.getByTestId('sign-in'));

    expect(await screen.findByRole('alert')).toHaveTextContent(es['auth.login.invalidCredentials']);
    expect(screen.getByTestId('login-username')).toHaveValue('rrhh_user');
    expect(screen.getByTestId('login-password')).toHaveValue('');
  });

  it('shows the rate-limit message', async () => {
    const user = userEvent.setup();
    renderLogin('password', {
      signIn: vi.fn().mockRejectedValue(new TranslatableError('auth.login.tooManyAttempts')),
    });

    await user.type(screen.getByTestId('login-username'), 'rrhh_user');
    await user.type(screen.getByTestId('login-password'), 'Any-Password-1');
    await user.click(screen.getByTestId('sign-in'));

    expect(await screen.findByRole('alert')).toHaveTextContent(es['auth.login.tooManyAttempts']);
  });

  it('falls back to the generic failure for an unexpected error', async () => {
    const user = userEvent.setup();
    renderLogin('password', { signIn: vi.fn().mockRejectedValue(new Error('Failed to fetch')) });

    await user.type(screen.getByTestId('login-username'), 'rrhh_user');
    await user.type(screen.getByTestId('login-password'), 'Any-Password-1');
    await user.click(screen.getByTestId('sign-in'));

    expect(await screen.findByRole('alert')).toHaveTextContent(es['auth.login.failed']);
  });

  it('resumes a stored session without showing the form again', async () => {
    const auth = renderLogin('password', { resume: vi.fn().mockResolvedValue(true) });

    expect(await screen.findByTestId('app-shell')).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('in development mode still shows only the sign-in button', async () => {
    const user = userEvent.setup();
    const auth = renderLogin('development');

    expect(screen.queryByTestId('login-username')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-password')).not.toBeInTheDocument();
    expect(screen.getByText(es['auth.login.intro'])).toBeInTheDocument();

    await user.click(screen.getByTestId('sign-in'));

    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith());
  });
});
