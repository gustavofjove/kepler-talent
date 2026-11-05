import { useTranslation } from 'react-i18next';
import '../../shared/components/form-error.css';
import './session-expired-notice.css';
import type { SessionRetry } from './use-session-retry';

/**
 * Says the session ended and the unsaved work was kept, and offers to sign in again (KTL-46). In
 * the error style, announced as an alert; nothing renders while the session is fine.
 */
export function SessionExpiredNotice({ session }: { session: SessionRetry }) {
  const { t } = useTranslation();
  if (!session.expired) return null;
  return (
    <div className="form-error session-expired" role="alert" data-testid="session-expired">
      <span>{t('auth.session.expired')}</span>
      <button
        className="button secondary"
        type="button"
        data-testid="session-expired-sign-in"
        onClick={() => void session.signIn()}
      >
        {t('auth.session.signInAgain')}
      </button>
    </div>
  );
}
