import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FormError } from '../../shared/components/form-error';
import '../../shared/components/modal.css';
import { useServices } from '../di/services-context';
import { errorText, TranslatableError } from '../i18n/translatable-error';
import { useSignal } from '../state/use-signal';

const FOCUSABLE = 'input, button:not([disabled])';

/**
 * Signs in again over the page whose unsaved work the auth layer kept (KTL-46 design D8): the
 * login form's fields in password mode, a single button otherwise. It never judges credentials;
 * the API does, through the configured token source.
 */
export function SessionExpiredDialog() {
  const { authService } = useServices();
  const open = useSignal(authService.signInPrompt);
  return open ? <SignInAgain /> : null;
}

function SignInAgain() {
  const { t } = useTranslation();
  const { authService } = useServices();
  const passwordMode = authService.signInMode === 'password';
  const dialog = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(null);
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    // Back to the control that opened it, as the page is where the work continues.
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  const cancel = (): void => authService.closeSignIn('cancelled');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const outcome = await authService.reauthenticate(
        passwordMode ? { userName, password } : undefined,
      );
      authService.closeSignIn(outcome);
    } catch (err) {
      // As on the sign-in page: never say which field was wrong, keep the user name.
      setPassword('');
      setError(err instanceof TranslatableError ? errorText(err, t) : t('auth.login.failed'));
    } finally {
      setBusy(false);
    }
  };

  // Keeps Tab inside the dialog and closes it on Escape.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="overlay" data-testid="session-expired-overlay">
      <section
        ref={dialog}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        aria-describedby="session-expired-message"
        data-testid="session-expired-dialog"
        onKeyDown={onKeyDown}
      >
        <h2 id="session-expired-title">{t('auth.session.dialogTitle')}</h2>
        <p id="session-expired-message">{t('auth.session.dialogMessage')}</p>
        <form className="grid" onSubmit={(event) => void submit(event)} noValidate>
          <FormError message={error} testId="session-expired-error" />
          {passwordMode ? (
            <>
              <div className="field">
                <label htmlFor="session-username">{t('auth.login.username')}</label>
                <input
                  id="session-username"
                  name="username"
                  data-testid="session-username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="session-password">{t('auth.login.password')}</label>
                <input
                  id="session-password"
                  name="password"
                  data-testid="session-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          ) : null}
          <div className="actions">
            <button
              className="button ghost"
              type="button"
              data-testid="session-expired-cancel"
              onClick={cancel}
            >
              {t('auth.session.cancel')}
            </button>
            <button
              className="button"
              type="submit"
              disabled={busy}
              data-testid="session-expired-submit"
            >
              {t('auth.login.submit')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
