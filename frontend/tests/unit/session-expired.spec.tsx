import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MockedObject } from 'vitest';
import { SessionExpiredDialog } from '../../src/app/core/auth/session-expired-dialog';
import { services, type Services } from '../../src/app/core/di/services';
import { ServicesProvider } from '../../src/app/core/di/services-context';
import { TranslatableError } from '../../src/app/core/i18n/translatable-error';
import { signal } from '../../src/app/core/state/signal';
import { CandidateExperience } from '../../src/app/features/candidates/components/candidate-experience';
import type { PanelControl } from '../../src/app/features/candidates/components/candidate-panel.logic';
import type { Candidate } from '../../src/app/features/candidates/models/candidate.models';
import type { CandidateRelationsService } from '../../src/app/features/candidates/services/candidate-relations.service';
import type { CatalogService } from '../../src/app/features/catalogs/services/catalog.service';
import { AppError } from '../../src/app/shared/models/error.models';
import { FakeCandidateApi } from './support/candidate-doubles';
import { loadedCatalogService } from './support/catalog-doubles';

/** The auth service surface the dialog and the panels use. */
function fakeAuth(mode: 'password' | 'development' | 'entra' = 'password') {
  return {
    signInMode: mode,
    profile: signal(null),
    hasPermission: vi.fn(() => true),
    sessionExpired: signal(true),
    signInPrompt: signal(true),
    promptSignIn: vi.fn().mockResolvedValue('same'),
    closeSignIn: vi.fn(),
    reauthenticate: vi.fn().mockResolvedValue('same'),
  };
}

describe('SessionExpiredDialog (KTL-46)', () => {
  const renderDialog = (auth: ReturnType<typeof fakeAuth>) =>
    render(
      <ServicesProvider value={{ ...services, authService: auth } as unknown as Services}>
        <SessionExpiredDialog />
      </ServicesProvider>,
    );

  it('asks for the user name and password in password mode and relays them', async () => {
    const auth = fakeAuth('password');
    renderDialog(auth);

    const dialog = screen.getByRole('dialog', { name: 'Vuelve a iniciar sesión' });
    expect(within(dialog).getByLabelText('Usuario')).toHaveFocus();
    await userEvent.type(within(dialog).getByLabelText('Usuario'), 'rrhh_user');
    await userEvent.type(within(dialog).getByLabelText('Contraseña'), 'secret-password');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }));

    expect(auth.reauthenticate).toHaveBeenCalledWith({
      userName: 'rrhh_user',
      password: 'secret-password',
    });
    expect(auth.closeSignIn).toHaveBeenCalledWith('same');
  });

  it('shows the generic refusal, keeps the user name and clears the password', async () => {
    const auth = fakeAuth('password');
    auth.reauthenticate.mockRejectedValueOnce(
      new TranslatableError('auth.login.invalidCredentials'),
    );
    renderDialog(auth);

    await userEvent.type(screen.getByLabelText('Usuario'), 'rrhh_user');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeInTheDocument();
    expect(screen.getByLabelText('Usuario')).toHaveValue('rrhh_user');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(auth.closeSignIn).not.toHaveBeenCalled();
  });

  it.each(['development', 'entra'] as const)(
    'offers a single sign-in button in %s mode',
    async (mode) => {
      const auth = fakeAuth(mode);
      renderDialog(auth);

      expect(screen.queryByLabelText('Usuario')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
      expect(auth.reauthenticate).toHaveBeenCalledWith(undefined);
    },
  );

  it('closes without signing in on Cancelar and on Escape', async () => {
    const auth = fakeAuth('password');
    renderDialog(auth);

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.keyboard('{Escape}');

    expect(auth.closeSignIn).toHaveBeenCalledTimes(2);
    expect(auth.closeSignIn).toHaveBeenCalledWith('cancelled');
    expect(auth.reauthenticate).not.toHaveBeenCalled();
  });

  it('renders nothing while no sign-in is asked for', () => {
    const auth = fakeAuth('password');
    auth.signInPrompt.set(false);
    renderDialog(auth);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// Staging three entries through userEvent takes a few seconds under a parallel run.
describe('A panel save when the session has ended (KTL-46)', { timeout: 20_000 }, () => {
  const candidate: Candidate = new FakeCandidateApi().seed({ id: 'c1', experience: [] });
  let relations: MockedObject<CandidateRelationsService>;
  let catalogService: CatalogService;
  let control: PanelControl;
  let auth: ReturnType<typeof fakeAuth>;

  beforeEach(async () => {
    catalogService = await loadedCatalogService();
    relations = {
      saveExperience: vi.fn(),
    } as unknown as MockedObject<CandidateRelationsService>;
    control = {
      editing: true,
      canEdit: true,
      onEdit: vi.fn(),
      onClose: vi.fn(),
      onDirtyChange: vi.fn(),
    };
    auth = fakeAuth('password');
  });

  const renderPanel = () =>
    render(
      <ServicesProvider
        value={
          {
            ...services,
            authService: auth,
            candidateRelationsService: relations,
            catalogService,
            toastService: { show: vi.fn() },
          } as unknown as Services
        }
      >
        <CandidateExperience candidate={candidate} control={control} />
      </ServicesProvider>,
    );

  // KTL-46 follow-up: «Añadir experiencia» writes at once; what a session end must keep is the form.
  const typeEntry = async () => {
    await userEvent.click(screen.getByTestId('experience-new'));
    await userEvent.type(screen.getByLabelText('Empresa'), 'Acme');
    await userEvent.type(screen.getByLabelText('Puesto'), 'Analista');
    await userEvent.selectOptions(screen.getByLabelText('Sector'), 'Servicios');
  };
  const add = () => userEvent.click(screen.getByRole('button', { name: 'Añadir experiencia' }));

  it('keeps the typed entry, offers to sign in again, and then saves it without retyping', async () => {
    relations.saveExperience
      .mockRejectedValueOnce(new AppError('UNAUTHENTICATED'))
      .mockResolvedValueOnce(undefined);
    renderPanel();
    await typeEntry();

    await add();

    expect(await screen.findByTestId('session-expired')).toHaveTextContent(
      'La sesión ha caducado. Vuelve a iniciar sesión para guardar los cambios.',
    );
    expect(screen.getByLabelText('Empresa')).toHaveValue('Acme');
    expect(screen.getByLabelText('Puesto')).toHaveValue('Analista');
    expect(screen.queryByText('Sesión no válida o expirada.')).toBeNull();

    await userEvent.click(screen.getByTestId('session-expired-sign-in'));

    await waitFor(() => expect(relations.saveExperience).toHaveBeenCalledTimes(2));
    expect(relations.saveExperience).toHaveBeenLastCalledWith('c1', [
      expect.objectContaining({ company: 'Acme', position: 'Analista' }),
    ]);
    // Written: the form closes back to «Nueva experiencia».
    await waitFor(() => expect(screen.queryByLabelText('Empresa')).toBeNull());
    expect(screen.queryByTestId('session-expired')).toBeNull();
  });

  it('retries once per sign-in: a second refusal shows the notice again instead of looping', async () => {
    relations.saveExperience.mockRejectedValue(new AppError('UNAUTHENTICATED'));
    renderPanel();
    await typeEntry();

    await add();
    await userEvent.click(await screen.findByTestId('session-expired-sign-in'));

    expect(await screen.findByTestId('session-expired')).toBeInTheDocument();
    expect(relations.saveExperience).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Empresa')).toHaveValue('Acme');
  });

  it('does nothing more when the dialog is cancelled, and keeps the typed entry', async () => {
    relations.saveExperience.mockRejectedValueOnce(new AppError('UNAUTHENTICATED'));
    auth.promptSignIn.mockResolvedValueOnce('cancelled');
    renderPanel();
    await typeEntry();

    await add();
    await userEvent.click(await screen.findByTestId('session-expired-sign-in'));

    expect(screen.getByTestId('session-expired')).toBeInTheDocument();
    expect(relations.saveExperience).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Empresa')).toHaveValue('Acme');
  });

  it('shows any other refusal as before', async () => {
    auth.sessionExpired.set(false);
    relations.saveExperience.mockRejectedValueOnce(new Error('El candidato ha cambiado.'));
    renderPanel();
    await typeEntry();

    await add();

    expect(await screen.findByText('El candidato ha cambiado.')).toBeInTheDocument();
    expect(screen.queryByTestId('session-expired')).toBeNull();
  });
});
