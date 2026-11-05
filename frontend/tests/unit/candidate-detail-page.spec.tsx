import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation, type DataRouter } from 'react-router';
import { services, type Services } from '../../src/app/core/di/services';
import { ServicesProvider } from '../../src/app/core/di/services-context';
import { signal } from '../../src/app/core/state/signal';
import { CandidateDetailPage } from '../../src/app/features/candidates/pages/candidate-detail-page';
import { CandidateEditRedirect } from '../../src/app/features/candidates/pages/candidate-edit-redirect';
import { CandidateNotesService } from '../../src/app/features/candidates/services/candidate-notes.service';
import { CandidateRelationsService } from '../../src/app/features/candidates/services/candidate-relations.service';
import type { CandidateDocument } from '../../src/app/features/candidates/models/candidate.models';
import type { DocumentService } from '../../src/app/features/documents/services/document.service';
import { createCandidateTestBed, type CandidateTestBed } from './support/candidate-doubles';
import { loadedCatalogService } from './support/catalog-doubles';
import { localDay } from '../../src/app/core/i18n/format';

/** Stands in for a destination page and shows the location state it was reached with. */
function LocationProbe({ testId }: { testId: string }) {
  const { pathname, state } = useLocation();
  return <p data-testid={testId} data-path={pathname} data-state={JSON.stringify(state)} />;
}

const EDITABLE = ['main', 'competencies', 'education', 'experience', 'notes', 'documents'];
const editButton = (panel: string) => screen.queryByTestId(`candidate-panel-${panel}-edit`);

describe('CandidateDetailPage', () => {
  let bed: CandidateTestBed;
  let granted: Set<string>;
  let listed: CandidateDocument[];
  let router: DataRouter;
  const toastService = { show: vi.fn() };
  const confirm = vi.fn();
  const positionService = { listForCandidate: vi.fn(), changeStage: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    listed = [];
    bed = createCandidateTestBed();
    bed.api.seed({ id: 'c1', firstName: 'Ona', lastName: 'Marti' });
    granted = new Set(['candidates.read']);
    confirm.mockResolvedValue(true);
    positionService.listForCandidate.mockResolvedValue([]);
  });

  const renderAt = async (path: string, state?: unknown) => {
    const catalogService = await loadedCatalogService();
    const documentService = {
      list: vi.fn().mockResolvedValue(listed),
      observeUntilSettled: vi.fn(),
      // Never settles: the specs only look at where the preview is placed.
      openPreview: vi.fn(() => new Promise(() => {})),
    } as unknown as DocumentService;
    const authService = {
      profile: signal(null),
      hasPermission: vi.fn((permission: string) => granted.has(permission)),
    };
    // A data router: the page guards leaving with unsaved changes through `useBlocker`.
    router = createMemoryRouter(
      [
        { path: '/app/candidates', element: <p data-testid="list-page" /> },
        { path: '/app/candidates/:id', element: <CandidateDetailPage /> },
        { path: '/app/candidates/:id/edit', element: <CandidateEditRedirect /> },
        { path: '/app/positions', element: <p data-testid="position-list-page" /> },
        { path: '/app/positions/:id', element: <LocationProbe testId="position-page" /> },
      ],
      { initialEntries: [{ pathname: path, state }] },
    );
    render(
      <ServicesProvider
        value={
          {
            ...services,
            candidateService: bed.service,
            candidateRelationsService: new CandidateRelationsService(bed.service),
            candidateNotesService: new CandidateNotesService(bed.api),
            catalogService,
            documentService,
            toastService,
            confirmDialogService: { confirm },
            positionService,
            authService,
          } as unknown as Services
        }
      >
        <RouterProvider router={router} />
      </ServicesProvider>,
    );
  };

  const loaded = () => screen.findByRole('heading', { level: 1, name: 'Ona Marti' });
  const asEditor = () =>
    ['candidates.update', 'documents.upload'].forEach((permission) => granted.add(permission));

  it('shows the header phone as plain text and the e-mail as a mail link (KTL-31)', async () => {
    bed.api.seed({
      id: 'c2',
      firstName: 'Ona',
      lastName: 'Marti',
      email: 'ona@example.test',
      phone: '+34 600 111 222',
    });
    await renderAt('/app/candidates/c2');
    await loaded();

    const contact = within(screen.getByTestId('candidate-contact'));
    // KTL-34: the Spanish prefix is not shown.
    expect(contact.getByTestId('candidate-phone')).toHaveTextContent(/^600 111 222$/);
    expect(contact.getByTestId('candidate-phone').closest('a')).toBeNull();
    expect(contact.getByRole('link', { name: 'ona@example.test' })).toHaveAttribute(
      'href',
      'mailto:ona@example.test',
    );
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });

  describe('breadcrumb (KTL-23)', () => {
    const trail = () => within(screen.getByTestId('breadcrumb'));
    const trailText = () =>
      trail()
        .getAllByRole('listitem')
        .map((item) => item.textContent);

    it('reads «Candidatos › name» with the name as the current page', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();

      expect(trailText()).toEqual(['Candidatos', 'Ona Marti']);
      expect(trail().getByRole('link', { name: 'Candidatos' })).toHaveAttribute(
        'href',
        '/app/candidates',
      );
      expect(trail().getByText('Ona Marti')).toHaveAttribute('aria-current', 'page');
      expect(trail().getAllByRole('link')).toHaveLength(1);
    });

    it('shows the stored name, not an unsaved draft', async () => {
      asEditor();
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('main')!);
      const firstName = screen.getByLabelText('Nombre');
      await userEvent.clear(firstName);
      await userEvent.type(firstName, 'Borrador');

      expect(trailText()).toEqual(['Candidatos', 'Ona Marti']);
    });

    it('offers only the list while the candidate loads', async () => {
      vi.spyOn(bed.api, 'get').mockReturnValue(new Promise(() => {}));
      await renderAt('/app/candidates/c1');

      expect(await screen.findByText('Cargando candidato…')).toBeInTheDocument();
      expect(trailText()).toEqual(['Candidatos']);
      expect(trail().getByRole('link', { name: 'Candidatos' })).toBeInTheDocument();
    });

    it('keeps the way back when the candidate fails to load', async () => {
      bed.api.failure = new Error('Servicio no disponible');
      await renderAt('/app/candidates/c1');

      expect(await screen.findByTestId('candidate-detail-error')).toBeInTheDocument();
      expect(trailText()).toEqual(['Candidatos']);
    });

    it('keeps the way back when the candidate does not exist', async () => {
      await renderAt('/app/candidates/missing');

      expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Ona');
      expect(screen.queryByTestId('candidate-detail-error')).not.toBeInTheDocument();
      expect(trailText()).toEqual(['Candidatos']);
    });
  });

  describe('breadcrumb from a position (KTL-44)', () => {
    const fromPosition = {
      candidateOrigin: { kind: 'position', positionId: 'p-9', positionTitle: 'Analista de datos' },
    };
    const trail = () => within(screen.getByTestId('breadcrumb'));
    const trailText = () =>
      trail()
        .getAllByRole('listitem')
        .map((item) => item.textContent);

    beforeEach(() => granted.add('positions.read'));

    it('reads «Posiciones › position › name» and leads back to the position', async () => {
      await renderAt('/app/candidates/c1', fromPosition);
      await loaded();

      expect(trailText()).toEqual(['Posiciones', 'Analista de datos', 'Ona Marti']);
      expect(trail().getByTestId('breadcrumb-positions')).toHaveAttribute('href', '/app/positions');
      expect(trail().getByTestId('breadcrumb-position')).toHaveAttribute(
        'href',
        '/app/positions/p-9',
      );
      expect(trail().getByText('Ona Marti')).toHaveAttribute('aria-current', 'page');
      expect(trail().queryByTestId('breadcrumb-candidates')).toBeNull();

      await userEvent.click(trail().getByTestId('breadcrumb-position'));
      expect(await screen.findByTestId('position-page')).toHaveAttribute(
        'data-path',
        '/app/positions/p-9',
      );
    });

    it('falls back to «Candidatos › name» for a malformed origin', async () => {
      await renderAt('/app/candidates/c1', {
        candidateOrigin: { kind: 'position', positionId: 'p-9' },
      });
      await loaded();

      expect(trailText()).toEqual(['Candidatos', 'Ona Marti']);
    });

    it('offers the position segments while the candidate loads', async () => {
      vi.spyOn(bed.api, 'get').mockReturnValue(new Promise(() => {}));
      await renderAt('/app/candidates/c1', fromPosition);

      expect(await screen.findByText('Cargando candidato…')).toBeInTheDocument();
      expect(trailText()).toEqual(['Posiciones', 'Analista de datos']);
      expect(trail().getAllByRole('link')).toHaveLength(2);
    });

    it('keeps the way back to the position when the candidate fails to load', async () => {
      bed.api.failure = new Error('Servicio no disponible');
      await renderAt('/app/candidates/c1', fromPosition);

      expect(await screen.findByTestId('candidate-detail-error')).toBeInTheDocument();
      expect(trailText()).toEqual(['Posiciones', 'Analista de datos']);
      expect(trail().getAllByRole('link')).toHaveLength(2);
    });

    it('renders the position segments as plain text without positions.read', async () => {
      granted.delete('positions.read');
      await renderAt('/app/candidates/c1', fromPosition);
      await loaded();

      expect(trailText()).toEqual(['Posiciones', 'Analista de datos', 'Ona Marti']);
      expect(trail().queryAllByRole('link')).toHaveLength(0);
    });

    it('does not carry the origin to the candidate’s own positions', async () => {
      positionService.listForCandidate.mockResolvedValue([
        {
          positionId: 'p-1',
          title: 'Backend',
          positionStatus: 'open',
          stage: 'new',
          addedAtUtc: '2026-09-20T09:00:00Z',
          updatedAtUtc: '2026-09-20T09:00:00Z',
          version: 2,
        },
      ]);
      await renderAt('/app/candidates/c1', fromPosition);
      await loaded();

      await userEvent.click(
        within(screen.getByTestId('candidate-positions')).getByRole('link', { name: 'Backend' }),
      );
      const page = await screen.findByTestId('position-page');
      expect(page).toHaveAttribute('data-path', '/app/positions/p-1');
      expect(page).toHaveAttribute('data-state', 'null');
    });
  });

  it('stacks every panel full width, with a read-only Competencias panel (KTL-27)', async () => {
    await renderAt('/app/candidates/c1');
    await loaded();

    const order = [
      'Datos principales',
      'Disponibilidad',
      'Competencias',
      'Formación',
      'Experiencia',
      'Notas personalizadas',
      'Documentos',
    ];
    const headings = screen
      .getAllByRole('heading')
      .map((heading) => heading.textContent)
      .filter((text) => order.includes(text ?? ''));
    expect(headings).toEqual(order);
    expect(screen.getByTestId('candidate-competencies').parentElement).not.toHaveClass('two');

    const panel = within(screen.getByTestId('candidate-competencies'));
    expect(panel.queryByRole('button')).toBeNull();
    expect(panel.getByText('Sin programas asociados.')).toBeInTheDocument();
  });

  it('puts Datos principales and Disponibilidad side by side, and gives the editor the whole row (KTL-37)', async () => {
    asEditor();
    await renderAt('/app/candidates/c1');
    await loaded();

    const row = screen.getByTestId('candidate-summary-row');
    expect(row).toHaveClass('grid', 'two');
    expect(row.children).toHaveLength(2);
    expect(within(row).getByRole('heading', { name: 'Disponibilidad' })).toBeInTheDocument();
    expect(within(row).getByTestId('candidate-availability')).toBeInTheDocument();
    expect(within(row).getByTestId('candidate-availability-chip')).toHaveAttribute(
      'data-tone',
      'neutral',
    );
    expect(screen.queryByTestId('candidate-audit')).toBeNull();
    expect(
      within(screen.getByTestId('candidate-contact')).queryByTestId('candidate-availability'),
    ).toBeNull();
    expect(within(row).getByRole('heading', { name: 'Datos principales' })).toBeInTheDocument();

    await userEvent.click(editButton('main')!);
    expect(row).not.toHaveClass('two');

    await userEvent.click(editButton('education')!);
    expect(row).toHaveClass('two');
  });

  it('shows a relative update line and reveals exact record times by keyboard', async () => {
    bed.api.seed({
      id: 'c1',
      firstName: 'Ona',
      lastName: 'Marti',
      createdAt: '2026-09-29T09:49:00Z',
      updatedAt: '2026-09-30T08:10:00Z',
    });
    await renderAt('/app/candidates/c1');
    await loaded();

    expect(screen.queryByRole('button', { name: 'Baja lógica' })).toBeNull();
    const timestamps = screen.getByTestId('candidate-timestamps');
    expect(timestamps).toHaveTextContent('Actualizado');
    expect(timestamps).not.toHaveTextContent(/^Actualizado\s*$/);
    const info = within(timestamps).getByRole('button', { name: 'Ver fechas del registro' });
    info.focus();
    await userEvent.keyboard('{Enter}');
    expect(info).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(info.getAttribute('aria-controls')!)).toHaveTextContent(
      /Creado .* · Actualizado .*\d{1,2}:\d{2}/,
    );
  });

  it('marks a due LOPD review, hides matching reception, and explains the form field', async () => {
    asEditor();
    const today = localDay();
    bed.api.seed({
      id: 'c1',
      firstName: 'Ona',
      lastName: 'Marti',
      receivedAt: today,
      createdAt: new Date().toISOString(),
      reviewDueAt: today,
    });
    await renderAt('/app/candidates/c1');
    await loaded();

    const main = within(
      screen.getByRole('heading', { name: 'Datos principales' }).closest('article')!,
    );
    expect(main.queryByText('Recepción')).toBeNull();
    expect(main.getByText('Revisión LOPD')).toBeInTheDocument();
    expect(main.getByText('(próxima)')).toBeInTheDocument();

    await userEvent.click(editButton('main')!);
    expect(main.getByLabelText('Fecha recepción')).toBeInTheDocument();
    const review = main.getByLabelText('Fecha de revisión LOPD');
    const hint = document.getElementById(review.getAttribute('aria-describedby')!);
    expect(hint).toHaveTextContent('Fecha en la que revisar');
  });

  describe('CV preview (KTL-28)', () => {
    it('places the preview in the aside, after the panels', async () => {
      granted.add('documents.download');
      listed = [
        {
          id: 'd1',
          documentType: 'CV',
          originalFilename: 'cv.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          isPrimary: true,
          uploadedAt: '2026-01-01T00:00:00Z',
          availabilityState: 'Available',
        },
      ];
      asEditor();
      await renderAt('/app/candidates/c1');

      const preview = await screen.findByTestId('candidate-cv-preview');
      expect(preview.parentElement).toHaveClass('page-split__aside');
      expect(preview.closest('.page-split__layout')?.firstElementChild).toHaveClass(
        'page-split__main',
      );
      // And it stays there while a panel is edited.
      await userEvent.click(editButton('main')!);
      expect(screen.getByTestId('candidate-cv-preview')).toBe(preview);
    });

    it('leaves the aside empty without the download permission', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();

      expect(screen.queryByTestId('candidate-cv-preview')).not.toBeInTheDocument();
      expect(document.querySelector('.page-split__aside')).toBeEmptyDOMElement();
    });
  });

  describe('who may edit (KTL-29)', () => {
    it('offers no «Editar» and no form to a reader', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();

      for (const panel of EDITABLE) expect(editButton(panel)).toBeNull();
      expect(document.querySelector('form')).toBeNull();
      expect(screen.queryByRole('button', { name: /baja lógica/i })).toBeNull();
    });

    it('offers «Editar» on every editable panel to an editor, never on Auditoría', async () => {
      asEditor();
      await renderAt('/app/candidates/c1');
      await loaded();

      for (const panel of EDITABLE) expect(editButton(panel)).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^Editar / })).toHaveLength(EDITABLE.length);
      expect(screen.getByRole('button', { name: 'Editar Formación' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Editar' })).toBeNull();
      expect(document.querySelector('form')).toBeNull();
    });

    it('keeps Documentos read-only for an editor without the upload permission', async () => {
      granted.add('candidates.update');
      await renderAt('/app/candidates/c1');
      await loaded();

      expect(editButton('documents')).toBeNull();
      expect(editButton('education')).toBeInTheDocument();
      expect(screen.getByTestId('candidate-documents')).toBeInTheDocument();
    });

    it('offers only Documentos to an uploader who may not update candidates', async () => {
      granted.add('documents.upload');
      await renderAt('/app/candidates/c1');
      await loaded();

      expect(EDITABLE.filter((panel) => editButton(panel))).toEqual(['documents']);
    });

    it('offers no relation or note editing on a removed candidate, and says why', async () => {
      bed.api.seed({ id: 'c9', firstName: 'Ida', lastName: 'Baja', isActive: false });
      asEditor();
      await renderAt('/app/candidates/c9');
      await screen.findByRole('heading', { level: 1, name: 'Ida Baja (Inactivo)' });

      expect(EDITABLE.filter((panel) => editButton(panel))).toEqual(['main', 'documents']);
      expect(screen.getByTestId('candidate-inactive')).toHaveTextContent('(Inactivo)');
      expect(screen.getByTestId('candidate-removed-hint')).toHaveTextContent(/reactívalo/);
    });
  });

  describe('panel edit mode (KTL-29)', () => {
    beforeEach(asEditor);

    it('switches a panel to its editor in place and moves focus into it', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();

      await userEvent.click(editButton('education')!);

      // KTL-46 follow-up: the entry form waits behind «Nueva formación», which takes focus.
      const education = screen.getByTestId('candidate-education');
      expect(within(education).getByTestId('education-new')).toHaveFocus();
      expect(within(education).queryByLabelText('Tipo')).toBeNull();
      // Each entry is written at once, so the panel only closes.
      expect(screen.getByTestId('candidate-panel-education-done')).toBeInTheDocument();
      expect(screen.queryByTestId('candidate-panel-education-save')).toBeNull();
      expect(screen.queryByTestId('candidate-panel-education-cancel')).toBeNull();
      // No form anywhere until one is asked for.
      expect(document.querySelectorAll('form')).toHaveLength(0);
      expect(editButton('education')).toBeNull();

      await userEvent.click(within(education).getByTestId('education-new'));
      expect(within(education).getByLabelText('Tipo')).toHaveFocus();
    });

    it('titles the add forms and sets them apart after the entries (KTL-34)', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();

      for (const [panel, title] of [
        ['education', 'Nueva formación'],
        ['experience', 'Nueva experiencia'],
      ] as const) {
        await userEvent.click(editButton(panel)!);
        const section = screen.getByTestId(`candidate-${panel}`);
        // After the entries, not before them: the area under the rule.
        const area = screen.getByTestId(`${panel}-add-area`);
        expect(area).toHaveClass('candidate-add-form');
        expect(section.lastElementChild).toBe(area);
        // KTL-46 follow-up: «Hecho» closes the panel from its header, as in every action panel.
        const done = screen.getByTestId(`candidate-panel-${panel}-done`);
        expect(done.closest('.candidate-panel__header')).not.toBeNull();
        expect(area).not.toContainElement(done);
        await userEvent.click(within(area).getByRole('button', { name: title }));
        const form = within(area).getByRole('form', { name: title });
        expect(within(form).getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
        await userEvent.click(done);
      }
    });

    it('writes an added entry at once and stays open until closed', async () => {
      const setEducation = vi.spyOn(bed.api, 'setEducation');
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('education')!);

      const education = within(screen.getByTestId('candidate-education'));
      await userEvent.click(education.getByTestId('education-new'));
      await userEvent.selectOptions(education.getByLabelText('Tipo'), 'Grado');
      await userEvent.type(education.getByLabelText('Titulación'), 'Grado en ADE');
      await userEvent.type(education.getByLabelText('Centro'), 'UCM');
      await userEvent.selectOptions(education.getByLabelText('Estado'), 'Finalizada');
      await userEvent.click(education.getByRole('button', { name: 'Añadir formación' }));

      await waitFor(() => expect(setEducation).toHaveBeenCalledTimes(1));
      expect(bed.api.candidates.get('c1')?.education).toEqual([
        expect.objectContaining({ degree: 'Grado en ADE' }),
      ]);
      expect(toastService.show).toHaveBeenCalledWith('Formación guardada.', 'success');
      expect(await education.findByText('Grado en ADE')).toBeInTheDocument();
      // Back to «Nueva formación» for the next entry.
      expect(education.queryByLabelText('Titulación')).toBeNull();
      expect(education.getByTestId('education-new')).toHaveFocus();

      await userEvent.click(screen.getByTestId('candidate-panel-education-done'));

      await waitFor(() => expect(editButton('education')).toHaveFocus());
      expect(setEducation).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('candidate-education')).toHaveTextContent('Grado en ADE');
    });

    it('refuses an invalid entry before it joins the draft', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('education')!);

      const education = within(screen.getByTestId('candidate-education'));
      await userEvent.click(education.getByTestId('education-new'));
      await userEvent.click(education.getByRole('button', { name: 'Añadir formación' }));

      expect(education.getByText('El tipo de formación es obligatorio.')).toBeInTheDocument();
      expect(education.getByText('Sin formación registrada.')).toBeInTheDocument();
    });

    it('removes an entry at once after confirming, and keeps it when declined', async () => {
      bed.api.seed({
        id: 'c2',
        firstName: 'Eva',
        lastName: 'Sanz',
        experience: [
          {
            id: 'x1',
            company: 'Acme',
            position: 'Analista',
            sector: 'Servicios',
            isCurrent: false,
          },
        ],
      });
      const setExperience = vi.spyOn(bed.api, 'setExperience');
      await renderAt('/app/candidates/c2');
      await screen.findByRole('heading', { level: 1, name: 'Eva Sanz' });
      await userEvent.click(editButton('experience')!);

      const experience = within(screen.getByTestId('candidate-experience'));
      confirm.mockResolvedValueOnce(false);
      await userEvent.click(experience.getByRole('button', { name: 'Quitar' }));
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Quitar experiencia', danger: true }),
      );
      expect(setExperience).not.toHaveBeenCalled();
      expect(experience.getByText('Analista')).toBeInTheDocument();

      await userEvent.click(experience.getByRole('button', { name: 'Quitar' }));

      await waitFor(() => expect(setExperience).toHaveBeenCalledTimes(1));
      expect(bed.api.candidates.get('c2')?.experience).toEqual([]);
      await waitFor(() => expect(experience.queryByText('Analista')).toBeNull());
    });

    it('saves the core record, updates the header and announces it', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('main')!);

      const email = screen.getByLabelText('Email');
      await userEvent.clear(email);
      await userEvent.type(email, 'ona@example.com');
      await userEvent.click(screen.getByTestId('candidate-panel-main-save'));

      await waitFor(() =>
        expect(toastService.show).toHaveBeenCalledWith('Datos principales guardados.', 'success'),
      );
      expect(bed.api.candidates.get('c1')?.email).toBe('ona@example.com');
      expect(screen.getByRole('link', { name: 'ona@example.com' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Email')).toBeNull();
    });

    it('writes nothing when the core record has no name', async () => {
      const update = vi.spyOn(bed.api, 'update');
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('main')!);

      await userEvent.clear(screen.getByLabelText('Nombre'));
      await userEvent.click(screen.getByTestId('candidate-panel-main-save'));

      expect(await screen.findByText(/nombre y apellidos/i)).toBeInTheDocument();
      expect(update).not.toHaveBeenCalled();

      // KTL-34: shown in red at the top of the form, before its first field.
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('form-error');
      expect(alert.closest('form')?.firstElementChild).toBe(alert);
      expect(
        alert.compareDocumentPosition(screen.getByLabelText('Nombre')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('keeps the draft when someone else changed the candidate', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('main')!);
      const lastName = screen.getByLabelText('Apellidos');
      await userEvent.clear(lastName);
      await userEvent.type(lastName, 'Martí');

      // Another user's write advances the stored version behind the page's back.
      bed.api.candidates.get('c1')!.version += 1;
      await userEvent.click(screen.getByTestId('candidate-panel-main-save'));

      await waitFor(() =>
        expect(toastService.show).toHaveBeenCalledWith(expect.any(String), 'error'),
      );
      expect(screen.getByLabelText('Apellidos')).toHaveValue('Martí');
      expect(bed.api.candidates.get('c1')?.lastName).toBe('Marti');
    });

    it('saves panels in turn without conflicting with itself', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();

      await userEvent.click(editButton('competencies')!);
      await userEvent.click(screen.getByTestId('candidate-skill-add'));
      await userEvent.type(screen.getByTestId('candidate-skill-input'), 'compr');
      await userEvent.keyboard('{ArrowDown}{Enter}');
      await userEvent.click(screen.getByTestId('candidate-panel-competencies-save'));
      await waitFor(() => expect(editButton('competencies')).toBeInTheDocument());

      await userEvent.click(editButton('main')!);
      const lastName = screen.getByLabelText('Apellidos');
      await userEvent.clear(lastName);
      await userEvent.type(lastName, 'Martí');
      await userEvent.click(screen.getByTestId('candidate-panel-main-save'));

      await waitFor(() => expect(bed.api.candidates.get('c1')?.lastName).toBe('Martí'));
      expect(bed.api.candidates.get('c1')?.skills.map((item) => item.skill)).toEqual(['Compras']);
    });
  });

  describe('availability while another panel is edited (KTL-36)', () => {
    beforeEach(asEditor);

    it('records «Sigue igual» mid-edit, then saves Datos principales without a prompt or conflict', async () => {
      bed.api.seed({
        id: 'c1',
        firstName: 'Ona',
        lastName: 'Marti',
        availability: {
          state: 'available',
          checkedOn: '2026-03-12',
          until: '',
          checkedByDisplayName: 'Marta G.',
        },
      });
      await renderAt('/app/candidates/c1');
      await loaded();

      await userEvent.click(editButton('main')!);
      const lastName = screen.getByLabelText('Apellidos');
      await userEvent.clear(lastName);
      await userEvent.type(lastName, 'Martí');

      // The block stays usable while the panel holds unsaved changes.
      await userEvent.click(screen.getByTestId('availability-reconfirm'));
      await waitFor(() => expect(screen.getByTestId('availability-undo')).toBeInTheDocument());
      expect(bed.api.candidates.get('c1')?.availability.checkedOn).not.toBe('2026-03-12');
      // The editor kept its draft: the check never reset or closed it.
      expect(screen.getByLabelText('Apellidos')).toHaveValue('Martí');

      await userEvent.click(screen.getByTestId('candidate-panel-main-save'));

      await waitFor(() => expect(bed.api.candidates.get('c1')?.lastName).toBe('Martí'));
      expect(confirm).not.toHaveBeenCalled();
      expect(toastService.show).not.toHaveBeenCalledWith(expect.any(String), 'error');
      // The general save left the check it followed alone.
      expect(bed.api.candidates.get('c1')?.availability.state).toBe('available');
      expect(bed.api.candidates.get('c1')?.availability.checkedOn).not.toBe('2026-03-12');
    });
  });

  describe('Competencias (KTL-29)', () => {
    beforeEach(asEditor);

    // Through the real relations service and the fake API, not a service double.
    it('stages a language at the lowest level and saves it with the chosen level', async () => {
      const setLanguages = vi.spyOn(bed.api, 'setLanguages');
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('competencies')!);

      await userEvent.click(screen.getByTestId('candidate-language-add'));
      await userEvent.type(screen.getByTestId('candidate-language-input'), 'ingl');
      await userEvent.keyboard('{ArrowDown}{Enter}');
      expect(screen.getByTestId('candidate-language-chip')).toHaveTextContent('A1');

      await userEvent.click(screen.getByTestId('candidate-language-chip'));
      const editor = await screen.findByTestId('candidate-language-editor');
      await userEvent.click(within(editor).getByRole('radio', { name: 'C1' }));
      expect(setLanguages).not.toHaveBeenCalled();

      await userEvent.click(screen.getByTestId('candidate-panel-competencies-save'));

      await waitFor(() => expect(setLanguages).toHaveBeenCalledTimes(1));
      expect(bed.api.candidates.get('c1')?.languages).toEqual([
        expect.objectContaining({ language: 'Inglés', level: 'C1' }),
      ]);
      expect(toastService.show).toHaveBeenCalledWith('Competencias guardadas.', 'success');
    });

    it('writes only the families that changed', async () => {
      const setSkills = vi.spyOn(bed.api, 'setSkills');
      const setLanguages = vi.spyOn(bed.api, 'setLanguages');
      const setPrograms = vi.spyOn(bed.api, 'setPrograms');
      const setTags = vi.spyOn(bed.api, 'setTags');
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('competencies')!);

      await userEvent.click(screen.getByTestId('candidate-skill-add'));
      await userEvent.type(screen.getByTestId('candidate-skill-input'), 'compr');
      await userEvent.keyboard('{ArrowDown}{Enter}');
      await userEvent.click(screen.getByTestId('candidate-panel-competencies-save'));

      await waitFor(() => expect(setSkills).toHaveBeenCalledTimes(1));
      expect(setLanguages).not.toHaveBeenCalled();
      expect(setPrograms).not.toHaveBeenCalled();
      expect(setTags).not.toHaveBeenCalled();
    });

    it('keeps a refused family in the draft and retries only it', async () => {
      const setSkills = vi.spyOn(bed.api, 'setSkills');
      const setLanguages = vi
        .spyOn(bed.api, 'setLanguages')
        .mockRejectedValueOnce(new Error('Idioma rechazado.'));
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('competencies')!);

      await userEvent.click(screen.getByTestId('candidate-skill-add'));
      await userEvent.type(screen.getByTestId('candidate-skill-input'), 'compr');
      await userEvent.keyboard('{ArrowDown}{Enter}');
      await userEvent.click(screen.getByTestId('candidate-language-add'));
      await userEvent.type(screen.getByTestId('candidate-language-input'), 'ingl');
      await userEvent.keyboard('{ArrowDown}{Enter}');
      await userEvent.click(screen.getByTestId('candidate-panel-competencies-save'));

      expect(await screen.findByTestId('candidate-language-error')).toHaveTextContent(
        'Idioma rechazado.',
      );
      expect(bed.api.candidates.get('c1')?.skills).toHaveLength(1);
      expect(screen.getByTestId('candidate-panel-competencies-save')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('candidate-panel-competencies-save'));

      await waitFor(() => expect(editButton('competencies')).toBeInTheDocument());
      expect(setSkills).toHaveBeenCalledTimes(1);
      expect(setLanguages).toHaveBeenCalledTimes(2);
      expect(bed.api.candidates.get('c1')?.languages).toHaveLength(1);
    });

    it('refuses a duplicate value in the draft', async () => {
      bed.api.seed({
        id: 'c3',
        firstName: 'Ana',
        lastName: 'Ruiz',
        skills: [{ id: 's1', skill: 'Compras', level: 'Medio' }],
      });
      await renderAt('/app/candidates/c3');
      await screen.findByRole('heading', { level: 1, name: 'Ana Ruiz' });
      await userEvent.click(editButton('competencies')!);

      // The picker offers only values not held, so a duplicate can only arrive by change;
      // the per-entry validator is covered by the service spec, and the picker's filter here.
      await userEvent.click(screen.getByTestId('candidate-skill-add'));
      await userEvent.type(screen.getByTestId('candidate-skill-input'), 'compras');
      expect(screen.queryByRole('option', { name: 'Compras' })).toBeNull();
    });
  });

  describe('one panel at a time and unsaved changes (KTL-29)', () => {
    beforeEach(asEditor);

    // KTL-46 follow-up: entries are written at once, so what is unsaved is the form as typed.
    const dirtyEducation = async () => {
      await userEvent.click(editButton('education')!);
      const education = within(screen.getByTestId('candidate-education'));
      await userEvent.click(education.getByTestId('education-new'));
      await userEvent.selectOptions(education.getByLabelText('Tipo'), 'Grado');
      await userEvent.type(education.getByLabelText('Titulación'), 'Grado en ADE');
    };
    const typedDegree = () =>
      within(screen.getByTestId('candidate-education')).queryByLabelText('Titulación');

    it('keeps focus in the panel being opened, not the one closing (review)', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();

      // Opening an earlier panel from a later one: the closing panel must not pull focus back.
      await userEvent.click(editButton('experience')!);
      await userEvent.click(editButton('education')!);

      expect(
        within(screen.getByTestId('candidate-education')).getByTestId('education-new'),
      ).toHaveFocus();
    });

    it('closes an open relation panel when the candidate is removed (review)', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('competencies')!);

      await userEvent.click(screen.getByRole('button', { name: 'Baja lógica' }));

      await waitFor(() =>
        expect(screen.getByTestId('candidate-inactive')).toHaveTextContent('(Inactivo)'),
      );
      expect(screen.queryByTestId('candidate-panel-competencies-save')).toBeNull();
      expect(screen.queryByTestId('candidate-skill-add')).toBeNull();
      expect(editButton('competencies')).toBeNull();
      // Reactivating does not reopen the panel that was closed.
      await userEvent.click(screen.getByRole('button', { name: 'Alta lógica' }));
      await waitFor(() => expect(screen.queryByTestId('candidate-inactive')).toBeNull());
      expect(screen.queryByTestId('candidate-panel-competencies-save')).toBeNull();
    });

    it('closes a clean panel when another one opens', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();

      await userEvent.click(editButton('education')!);
      await userEvent.click(editButton('experience')!);

      expect(confirm).not.toHaveBeenCalled();
      expect(editButton('education')).toBeInTheDocument();
      expect(screen.getByTestId('candidate-panel-experience-done')).toBeInTheDocument();
    });

    it('asks before discarding unsaved changes, and keeps them when declined', async () => {
      confirm.mockResolvedValue(false);
      await renderAt('/app/candidates/c1');
      await loaded();
      await dirtyEducation();

      await userEvent.click(editButton('experience')!);

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Descartar cambios' }));
      expect(screen.getByTestId('candidate-panel-education-done')).toBeInTheDocument();
      expect(typedDegree()).toHaveValue('Grado en ADE');
    });

    it('discards unsaved changes when confirmed and opens the other panel', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      await dirtyEducation();

      await userEvent.click(editButton('experience')!);

      await waitFor(() =>
        expect(screen.getByTestId('candidate-panel-experience-done')).toBeInTheDocument(),
      );
      expect(typedDegree()).toBeNull();
      expect(screen.getByTestId('candidate-education')).not.toHaveTextContent('Grado en ADE');
    });

    it('asks before leaving the page with unsaved changes', async () => {
      confirm.mockResolvedValue(false);
      await renderAt('/app/candidates/c1');
      await loaded();
      await dirtyEducation();

      await act(() => router.navigate('/app/candidates'));

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Salir sin guardar' }));
      expect(router.state.location.pathname).toBe('/app/candidates/c1');
      expect(typedDegree()).toHaveValue('Grado en ADE');
    });

    it('leaves when confirmed', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      await dirtyEducation();

      await act(() => router.navigate('/app/candidates'));

      expect(await screen.findByTestId('list-page')).toBeInTheDocument();
    });

    it('leaves without asking when nothing is unsaved', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('education')!);

      await act(() => router.navigate('/app/candidates'));

      expect(confirm).not.toHaveBeenCalled();
      expect(await screen.findByTestId('list-page')).toBeInTheDocument();
    });

    it('arms the browser prompt only while a panel is dirty', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);

      await dirtyEducation();
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });

    it('counts typed note text as unsaved', async () => {
      confirm.mockResolvedValue(false);
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('notes')!);
      await userEvent.type(screen.getByTestId('candidate-note-body'), 'Llamar el lunes');

      await userEvent.click(editButton('main')!);

      expect(confirm).toHaveBeenCalled();
      expect(screen.getByTestId('candidate-panel-notes-done')).toBeInTheDocument();
    });

    it('closes an action panel with «Hecho» in its header, and tints the panel being edited', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      const panel = screen.getByTestId('candidate-documents').closest('.candidate-panel')!;
      expect(panel).not.toHaveClass('is-editing');
      await userEvent.click(editButton('documents')!);
      expect(screen.getByTestId('document-file')).toBeInTheDocument();
      expect(panel).toHaveClass('is-editing');

      // KTL-46 follow-up: «Hecho» where «Editar» was, named for the panel, and no footer.
      const done = screen.getByRole('button', { name: 'Terminar la edición de Documentos' });
      expect(done).toBe(screen.getByTestId('candidate-panel-documents-done'));
      expect(done).toHaveTextContent('Hecho');
      expect(done.closest('.candidate-panel__header')).not.toBeNull();
      expect(document.querySelector('.candidate-panel__footer')).toBeNull();

      await userEvent.click(done);

      expect(screen.queryByTestId('document-file')).toBeNull();
      expect(panel).not.toHaveClass('is-editing');
      expect(editButton('documents')).toHaveFocus();
    });
  });

  describe('positions panel (KTL-30)', () => {
    const stored = {
      positionId: 'p-1',
      title: 'Backend',
      positionStatus: 'open',
      stage: 'new',
      addedAtUtc: '2026-09-20T09:00:00Z',
      updatedAtUtc: '2026-09-20T09:00:00Z',
      version: 2,
    } as const;

    it('hides «Posiciones» and requests nothing without positions.read', async () => {
      await renderAt('/app/candidates/c1');
      await loaded();
      expect(screen.queryByTestId('candidate-positions')).toBeNull();
      expect(screen.queryByTestId('candidate-pipeline-badges')).toBeNull();
      expect(positionService.listForCandidate).not.toHaveBeenCalled();
    });

    it('lists the candidate’s positions after Experiencia and before Notas', async () => {
      granted.add('positions.read');
      positionService.listForCandidate.mockResolvedValue([stored]);
      await renderAt('/app/candidates/c1');
      await loaded();

      expect(await screen.findByRole('link', { name: 'Backend' })).toBeVisible();
      expect(screen.getByTestId('candidate-pipeline-inProcess')).toHaveTextContent('En proceso');
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings.indexOf('Posiciones')).toBe(headings.indexOf('Experiencia') + 1);
      expect(headings.indexOf('Notas personalizadas')).toBe(headings.indexOf('Posiciones') + 1);
      expect(positionService.listForCandidate).toHaveBeenCalledWith('c1');
      expect(positionService.listForCandidate).toHaveBeenCalledTimes(1);
    });

    it('changes a stage without disturbing a panel in edit mode', async () => {
      asEditor();
      granted.add('positions.read');
      granted.add('positions.manage');
      positionService.listForCandidate.mockResolvedValue([stored]);
      positionService.changeStage.mockResolvedValue({ ...stored, stage: 'hired', version: 3 });
      await renderAt('/app/candidates/c1');
      await loaded();
      await userEvent.click(editButton('main')!);
      const firstName = screen.getByLabelText('Nombre');
      await userEvent.type(firstName, 'x');

      await userEvent.selectOptions(
        await screen.findByRole('combobox', { name: 'Estado en Backend' }),
        'hired',
      );

      await waitFor(() =>
        expect(positionService.changeStage).toHaveBeenCalledWith('p-1', 'c1', 'hired', 2),
      );
      expect(screen.getByTestId('candidate-pipeline-hired')).toHaveTextContent('Contratado');
      expect(screen.queryByTestId('candidate-pipeline-inProcess')).toBeNull();
      expect(confirm).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Nombre')).toHaveValue('Onax');
      expect(screen.getByTestId('candidate-panel-main-save')).toBeInTheDocument();
    });
  });

  it('redirects the former edit address to the candidate page (KTL-29)', async () => {
    await renderAt('/app/candidates/c1/edit');

    await loaded();
    expect(router.state.location.pathname).toBe('/app/candidates/c1');
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
