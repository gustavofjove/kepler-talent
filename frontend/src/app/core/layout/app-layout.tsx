import { Outlet } from 'react-router';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { SessionExpiredDialog } from '../auth/session-expired-dialog';
import { useServices } from '../di/services-context';
import { useSignal } from '../state/use-signal';
import { PrimaryNav } from './primary-nav';
import './app-layout.css';

export function AppLayout() {
  const { authService, toastService } = useServices();
  const profile = useSignal(authService.profile);
  const messages = useSignal(toastService.messages);

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido principal
      </a>
      <header>
        <div className="brand">
          <strong>Kepler Talento</strong>
          <span className="muted">Gestión interna de candidatos del ecosistema Kepler</span>
        </div>
        <PrimaryNav />
        <div className="user">
          <span className="badge">{profile?.role}</span>
          <button
            className="button secondary"
            type="button"
            data-testid="sign-out"
            onClick={() => authService.signOut()}
          >
            Salir
          </button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <div className="toasts" role="region" aria-label="Notificaciones">
        {messages.map((message) => (
          <article className="toast" role="status" aria-live="polite" key={message.id}>
            <div>{message.text}</div>
            <button
              className="button ghost dismiss"
              type="button"
              onClick={() => toastService.dismiss(message.id)}
            >
              Cerrar
            </button>
          </article>
        ))}
      </div>
      <ConfirmDialog />
      <SessionExpiredDialog />
    </div>
  );
}
