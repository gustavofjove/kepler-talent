import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { FormError } from '../../shared/components/form-error';
import { useServices } from '../di/services-context';
import { errorText, TranslatableError } from '../i18n/translatable-error';
import { useErrorToast } from '../services/use-error-toast';
import './login-page.css';

export function LoginPage() {
  const { t } = useTranslation();
  const { authService } = useServices();
  const navigate = useNavigate();
  const notifyError = useErrorToast();
  const passwordMode = authService.signInMode === 'password';

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');

  // A password session survives a reload in the same tab (KTL-45); pick it up instead of
  // asking for the password again.
  useEffect(() => {
    let cancelled = false;
    void authService.resume().then((resumed) => {
      if (resumed && !cancelled) void navigate('/app');
    });
    return () => {
      cancelled = true;
    };
  }, [authService, navigate]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    try {
      setBusy(true);
      setError('');
      if (passwordMode) {
        await authService.signIn({ userName, password });
      } else {
        await authService.signIn();
      }
      await navigate('/app');
    } catch (err) {
      if (passwordMode) {
        // The refusal never says which field was wrong, so keep the user name for a retry and
        // clear only the password.
        setPassword('');
        setError(err instanceof TranslatableError ? errorText(err, t) : t('auth.login.failed'));
      } else {
        setError(notifyError(err, t('auth.login.failed')));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="login">
      <form className="panel box" onSubmit={submit} noValidate={passwordMode}>
        <h1>{t('app.title')}</h1>
        <p className="muted">{t(passwordMode ? 'auth.login.passwordIntro' : 'auth.login.intro')}</p>
        <div className="grid">
          <FormError message={error} testId="login-error" />
          {passwordMode && (
            <>
              <div className="field">
                <label htmlFor="login-username">{t('auth.login.username')}</label>
                <input
                  id="login-username"
                  name="username"
                  data-testid="login-username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="login-password">{t('auth.login.password')}</label>
                <input
                  id="login-password"
                  name="password"
                  data-testid="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          )}
          <button className="button" type="submit" disabled={busy} data-testid="sign-in">
            {t('auth.login.submit')}
          </button>
        </div>
      </form>
    </section>
  );
}
