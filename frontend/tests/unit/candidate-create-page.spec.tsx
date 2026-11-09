import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { services, type Services } from '../../src/app/core/di/services';
import { ServicesProvider } from '../../src/app/core/di/services-context';
import { TranslatableError } from '../../src/app/core/i18n/translatable-error';
import { signal } from '../../src/app/core/state/signal';
import { CandidateCreatePage } from '../../src/app/features/candidates/pages/candidate-create-page';
import { createCandidateTestBed, type CandidateTestBed } from './support/candidate-doubles';
import { loadedCatalogService } from './support/catalog-doubles';

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

const SECTIONS = [
  'candidate-competencies',
  'candidate-education',
  'candidate-experience',
  'candidate-notes',
  'candidate-documents',
  'candidate-cv-preview',
];

describe('CandidateCreatePage (KTL-29)', () => {
  let bed: CandidateTestBed;
  let granted: Set<string>;
  let extract: ReturnType<typeof vi.fn>;
  let upload: ReturnType<typeof vi.fn>;
  let showToast: ReturnType<typeof vi.fn>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no object URLs; the read CV's preview (KTL-47) needs one for a PDF.
    createObjectURL = vi.fn(() => 'blob:held');
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    bed = createCandidateTestBed();
    granted = new Set(['candidates.read', 'candidates.create', 'candidates.update']);
    upload = vi.fn().mockResolvedValue({});
    showToast = vi.fn();
    extract = vi.fn().mockResolvedValue({
      draftId: 'd1',
      outcome: 'cv_draft.extracted',
      fields: {
        firstName: { value: 'Ana', confidence: 'high' },
        lastName: { value: 'Ruiz Gil', confidence: 'low' },
      },
    });
  });

  const renderPage = async () => {
    const catalogService = await loadedCatalogService();
    const authService = {
      profile: signal(null),
      hasPermission: vi.fn((permission: string) => granted.has(permission)),
    };
    render(
      <ServicesProvider
        value={
          {
            ...services,
            candidateService: bed.service,
            candidateDraftService: { extract },
            documentService: { upload },
            toastService: { show: showToast },
            catalogService,
            authService,
          } as unknown as Services
        }
      >
        <MemoryRouter initialEntries={['/app/candidates/new']}>
          <LocationProbe />
          <Routes>
            <Route path="/app/candidates/new" element={<CandidateCreatePage />} />
            <Route path="/app/candidates/:id" element={<p data-testid="candidate-page" />} />
          </Routes>
        </MemoryRouter>
      </ServicesProvider>,
    );
  };

  const trailText = () =>
    within(screen.getByTestId('breadcrumb'))
      .getAllByRole('listitem')
      .map((item) => item.textContent);

  it('shows only the CV picker, the core form and the post-save hint', async () => {
    await renderPage();

    expect(await screen.findByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByLabelText('Rellenar desde un CV')).toHaveAttribute('accept', '.pdf,.docx');
    for (const testId of SECTIONS) expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    expect(screen.getByTestId('candidate-create-hint')).toHaveTextContent(/Guarda el candidato/);
    expect(trailText()).toEqual(['Candidatos', 'Nuevo candidato']);
    expect(screen.getByText('Nuevo candidato')).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['may update', true],
    ['may not update', false],
  ])(
    'opens the new candidate’s page after the first save when the creator %s',
    async (_, update) => {
      if (!update) granted.delete('candidates.update');
      await renderPage();

      await userEvent.type(await screen.findByLabelText('Nombre'), 'Sara');
      await userEvent.type(screen.getByLabelText('Apellidos'), 'Pena');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByTestId('candidate-page')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId('location').textContent).toMatch(/^\/app\/candidates\/[^/]+$/),
      );
      expect([...bed.api.candidates.values()].map((item) => item.firstName)).toContain('Sara');
    },
  );

  it('renders «Candidatos» as text for a creator who may not read candidates', async () => {
    granted.delete('candidates.read');
    await renderPage();
    await screen.findByLabelText('Nombre');

    expect(within(screen.getByTestId('breadcrumb')).queryByRole('link')).not.toBeInTheDocument();
  });

  const pickCv = async (file = new File(['%PDF-test'], 'cv.pdf', { type: 'application/pdf' })) =>
    userEvent.upload(screen.getByTestId('cv-draft-file'), file);

  describe('CV draft (KTL-32)', () => {
    it('fills the empty fields, says how many, and saves nothing by itself', async () => {
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();

      expect(await screen.findByTestId('cv-draft-status')).toHaveTextContent(
        'Se han rellenado 2 campos a partir del CV',
      );
      expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
      expect(screen.getByLabelText('Apellidos')).toHaveValue('Ruiz Gil');
      expect(screen.getByTestId('lastName-suggested')).toHaveTextContent('Revisar');
      expect(extract).toHaveBeenCalledTimes(1);
      expect(bed.api.candidates.size).toBe(0);
    });

    it('keeps a value typed before the CV was picked', async () => {
      await renderPage();
      await userEvent.type(await screen.findByLabelText('Nombre'), 'Sara');

      await pickCv();

      expect(await screen.findByTestId('cv-draft-status')).toHaveTextContent(
        'Se ha rellenado 1 campo',
      );
      expect(screen.getByLabelText('Nombre')).toHaveValue('Sara');
      expect(screen.getByLabelText('Apellidos')).toHaveValue('Ruiz Gil');
    });

    it('asks for the form to be filled by hand when the CV has no text', async () => {
      extract.mockResolvedValue({ draftId: 'd1', outcome: 'cv_draft.no_text', fields: {} });
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();

      expect(await screen.findByTestId('cv-draft-status')).toHaveTextContent(
        /Rellena el formulario a mano/,
      );
      expect(screen.getByLabelText('Nombre')).toHaveValue('');
    });

    it('explains a refused CV without touching the form', async () => {
      extract.mockRejectedValue(new TranslatableError('candidate.cvDraft.error.scanner'));
      await renderPage();
      await userEvent.type(await screen.findByLabelText('Nombre'), 'Sara');

      await pickCv();

      await waitFor(() =>
        expect(screen.getByTestId('cv-draft-status')).toHaveTextContent(
          'No se puede analizar el archivo en este momento',
        ),
      );
      expect(screen.getByTestId('cv-draft-status')).toHaveClass('error');
      expect(screen.getByLabelText('Nombre')).toHaveValue('Sara');
    });

    it('shows a busy state while the CV is read and keeps the form usable', async () => {
      let resolve: (value: unknown) => void = () => undefined;
      extract.mockReturnValue(new Promise((done) => (resolve = done)));
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();

      expect(screen.getByTestId('cv-draft-status')).toHaveTextContent('Analizando el CV');
      expect(screen.getByTestId('cv-draft-file')).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Apellidos'), 'Pena');
      expect(screen.getByLabelText('Apellidos')).toHaveValue('Pena');

      resolve({ draftId: 'd1', outcome: 'cv_draft.extracted', fields: {} });
      expect(await screen.findByText(/no aporta datos/)).toBeInTheDocument();
      expect(screen.getByTestId('cv-draft-file')).toBeEnabled();
    });
  });

  describe('Attach the read CV on save (KTL-42)', () => {
    beforeEach(() => granted.add('documents.upload'));

    const saveForm = () => userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    const createdId = () => [...bed.api.candidates.keys()][0];

    it('offers no attach choice before a CV has been read', async () => {
      await renderPage();
      await screen.findByLabelText('Nombre');

      expect(screen.queryByTestId('cv-draft-attach')).not.toBeInTheDocument();
    });

    it.each([
      ['a draft with fields', undefined],
      ['an image-only CV', { draftId: 'd1', outcome: 'cv_draft.no_text', fields: {} }],
    ])('offers the choice, ticked, after %s', async (_, draft) => {
      if (draft) extract.mockResolvedValue(draft);
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();

      const choice = await screen.findByTestId('cv-draft-attach');
      expect(choice).toBeChecked();
      expect(choice).toHaveAccessibleName('Adjuntar este CV al candidato');
    });

    it('offers no choice for a refused CV, and attaches nothing', async () => {
      extract.mockRejectedValue(new TranslatableError('candidate.cvDraft.error.scanner'));
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();
      await waitFor(() => expect(screen.getByTestId('cv-draft-status')).toHaveClass('error'));
      await userEvent.type(screen.getByLabelText('Apellidos'), 'Pena');
      await userEvent.type(screen.getByLabelText('Nombre'), 'Sara');
      await saveForm();

      expect(await screen.findByTestId('candidate-page')).toBeInTheDocument();
      expect(screen.queryByTestId('cv-draft-attach')).not.toBeInTheDocument();
      expect(upload).not.toHaveBeenCalled();
    });

    it('offers no choice and uploads nothing without documents.upload', async () => {
      granted.delete('documents.upload');
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();
      await screen.findByText(/Se han rellenado 2 campos/);
      await saveForm();

      expect(await screen.findByTestId('candidate-page')).toBeInTheDocument();
      expect(screen.queryByTestId('cv-draft-attach')).not.toBeInTheDocument();
      expect(upload).not.toHaveBeenCalled();
    });

    it('uploads the read CV as the new candidate’s primary CV, then opens it', async () => {
      const cv = new File(['%PDF-test'], 'cv-ana.pdf', { type: 'application/pdf' });
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv(cv);
      await screen.findByTestId('cv-draft-attach');
      await saveForm();

      expect(await screen.findByTestId('candidate-page')).toBeInTheDocument();
      expect(upload).toHaveBeenCalledTimes(1);
      expect(upload).toHaveBeenCalledWith({
        candidateId: createdId(),
        file: cv,
        documentType: 'CV',
        isPrimary: true,
      });
      expect(showToast).not.toHaveBeenCalled();
    });

    it('attaches nothing when the user clears the choice', async () => {
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();
      await userEvent.click(await screen.findByTestId('cv-draft-attach'));
      expect(screen.getByTestId('cv-draft-attach')).not.toBeChecked();
      await saveForm();

      expect(await screen.findByTestId('candidate-page')).toBeInTheDocument();
      expect(upload).not.toHaveBeenCalled();
    });

    it('attaches only the latest CV, with the choice ticked again', async () => {
      const first = new File(['%PDF-1'], 'primero.pdf', { type: 'application/pdf' });
      const second = new File(['%PDF-2'], 'segundo.pdf', { type: 'application/pdf' });
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv(first);
      await userEvent.click(await screen.findByTestId('cv-draft-attach'));
      await pickCv(second);
      await waitFor(() => expect(screen.getByTestId('cv-draft-attach')).toBeChecked());
      await saveForm();

      expect(await screen.findByTestId('candidate-page')).toBeInTheDocument();
      expect(upload).toHaveBeenCalledTimes(1);
      expect(upload.mock.calls[0][0].file).toBe(second);
    });

    it('keeps the candidate and warns when the CV cannot be attached', async () => {
      upload.mockRejectedValue(new Error('scanner down'));
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();
      await screen.findByTestId('cv-draft-attach');
      await saveForm();

      expect(await screen.findByTestId('candidate-page')).toBeInTheDocument();
      expect(bed.api.candidates.size).toBe(1);
      expect(showToast).toHaveBeenCalledWith(
        'El candidato se ha guardado, pero el CV no se ha podido adjuntar. Súbelo desde la ficha del candidato.',
        'warning',
      );
    });

    it('uploads nothing when the candidate cannot be created, and keeps the choice', async () => {
      vi.spyOn(bed.service, 'create').mockRejectedValue(new Error('Conflicto'));
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();
      await screen.findByTestId('cv-draft-attach');
      await saveForm();

      await waitFor(() => expect(showToast).toHaveBeenCalledWith('Conflicto', 'error'));
      expect(upload).not.toHaveBeenCalled();
      expect(screen.getByTestId('location')).toHaveTextContent('/app/candidates/new');
      expect(screen.getByTestId('cv-draft-attach')).toBeChecked();
    });
  });

  describe('Preview of the read CV (KTL-47)', () => {
    const preview = () => screen.queryByTestId('held-cv-preview');

    it('shows no preview before a CV has been read', async () => {
      await renderPage();
      await screen.findByLabelText('Nombre');

      expect(preview()).not.toBeInTheDocument();
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('shows no preview while the draft request is in flight', async () => {
      extract.mockReturnValue(new Promise(() => undefined));
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();

      expect(screen.getByTestId('cv-draft-status')).toHaveTextContent('Analizando el CV');
      expect(preview()).not.toBeInTheDocument();
    });

    it.each([
      ['a draft with fields', undefined],
      ['an image-only CV', { draftId: 'd1', outcome: 'cv_draft.no_text', fields: {} }],
    ])('previews the PDF after %s', async (_, draft) => {
      if (draft) extract.mockResolvedValue(draft);
      const cv = new File(['%PDF-test'], 'cv-ana.pdf', { type: 'application/pdf' });
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv(cv);

      expect(await screen.findByTestId('held-cv-preview-viewer')).toBeInTheDocument();
      expect(createObjectURL).toHaveBeenCalledWith(cv);
    });

    it('shows no preview for a refused CV', async () => {
      extract.mockRejectedValue(new TranslatableError('candidate.cvDraft.error.scanner'));
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();

      await waitFor(() => expect(screen.getByTestId('cv-draft-status')).toHaveClass('error'));
      expect(preview()).not.toBeInTheDocument();
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('removes the preview as soon as another CV is picked', async () => {
      await renderPage();
      await screen.findByLabelText('Nombre');
      await pickCv();
      await screen.findByTestId('held-cv-preview');
      extract.mockReturnValue(new Promise(() => undefined));

      await pickCv(new File(['%PDF-2'], 'segundo.pdf', { type: 'application/pdf' }));

      expect(preview()).not.toBeInTheDocument();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:held');
    });

    it('keeps the preview when the attach choice is cleared', async () => {
      granted.add('documents.upload');
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();
      await userEvent.click(await screen.findByTestId('cv-draft-attach'));

      expect(screen.getByTestId('held-cv-preview')).toBeInTheDocument();
    });

    it('previews the CV for a creator without documents.upload', async () => {
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv();

      expect(await screen.findByTestId('held-cv-preview')).toBeInTheDocument();
      expect(screen.queryByTestId('cv-draft-attach')).not.toBeInTheDocument();
    });

    it('shows the PDF-only message for a DOCX', async () => {
      await renderPage();
      await screen.findByLabelText('Nombre');

      await pickCv(new File(['PK'], 'cv-ana.docx'));

      expect(await screen.findByTestId('held-cv-preview-unsupported')).toHaveTextContent(
        'cv-ana.docx',
      );
      expect(screen.queryByTestId('held-cv-preview-viewer')).not.toBeInTheDocument();
    });
  });
});
