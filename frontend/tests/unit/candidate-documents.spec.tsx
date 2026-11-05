import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { services, type Services } from '../../src/app/core/di/services';
import { ServicesProvider } from '../../src/app/core/di/services-context';
import { signal } from '../../src/app/core/state/signal';
import { CandidateDocuments } from '../../src/app/features/candidates/components/candidate-documents';
import type {
  Candidate,
  CandidateDocument,
} from '../../src/app/features/candidates/models/candidate.models';
import type { DocumentService } from '../../src/app/features/documents/services/document.service';

const document = (
  availabilityState: CandidateDocument['availabilityState'],
): CandidateDocument => ({
  id: `document-${availabilityState}`,
  documentType: 'CV',
  originalFilename: 'cv.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  isPrimary: false,
  uploadedAt: '2026-09-10T00:00:00Z',
  scanState: availabilityState === 'Available' ? 'Clean' : 'PendingScan',
  availabilityState,
});

const candidate: Candidate = {
  id: 'candidate-1',
  firstName: 'Ana',
  lastName: 'Gil',
  phone: '',
  email: '',
  location: '',
  province: '',
  country: 'España',
  availability: { state: 'unknown', checkedOn: '', until: '', checkedByDisplayName: null },
  source: 'Email',
  notes: '',
  receivedAt: '',
  consentAt: '',
  reviewDueAt: '',
  isActive: true,
  createdAt: '2026-09-10T00:00:00Z',
  updatedAt: '2026-09-10T00:00:00Z',
  version: 1,
  documentCount: 0,
  primaryDocumentId: null,
  languages: [],
  programs: [],
  education: [],
  experience: [],
  skills: [],
  tags: [],
  customNotes: [],
  documents: [],
};

describe('CandidateDocuments', () => {
  const renderDocuments = (
    listed: CandidateDocument[],
    observe = vi.fn().mockResolvedValue(undefined),
    readOnly = false,
    permissions = ['documents.download', 'documents.upload'],
    onDirtyChange = vi.fn(),
  ) => {
    const documentService = {
      list: vi.fn().mockResolvedValue(listed),
      observeUntilSettled: observe,
      download: vi.fn(),
      upload: vi.fn(),
      setPrimary: vi.fn(),
      remove: vi.fn(),
    } as unknown as DocumentService;
    const authService = {
      profile: signal(null),
      hasPermission: vi.fn((permission: string) => permissions.includes(permission)),
    };
    const view = render(
      <ServicesProvider
        value={{ ...services, documentService, authService } as unknown as Services}
      >
        <CandidateDocuments
          candidate={candidate}
          readOnly={readOnly}
          onDirtyChange={onDirtyChange}
        />
      </ServicesProvider>,
    );
    return { ...view, documentService, onDirtyChange };
  };

  it('renders every Spanish availability state and hides non-clean downloads', async () => {
    renderDocuments([
      document('Pending'),
      { ...document('Refused'), id: 'refused' },
      { ...document('Error'), id: 'error' },
      { ...document('LegacyUnavailable'), id: 'legacy' },
      { ...document('Available'), id: 'available' },
    ]);

    expect(await screen.findByText('En análisis')).toBeInTheDocument();
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
    expect(screen.getByText('Sin archivo')).toBeInTheDocument();
    expect(screen.getByText('Error de análisis')).toBeInTheDocument();
    const available = screen
      .getAllByTestId('document-availability')
      .find((cell) => cell.dataset['state'] === 'Available')!;
    expect(available).toBeEmptyDOMElement();
    expect(screen.getByText('En análisis')).toHaveAttribute('data-tone', 'neutral');
    expect(screen.getByText('Rechazado')).toHaveAttribute('data-tone', 'danger');
    expect(
      screen.getByText('El archivo no ha superado el análisis de seguridad.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Documento heredado sin archivo asociado.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Descargar cv.pdf' })).toHaveLength(1);
    expect(screen.getAllByTestId('document-mark-primary')).toHaveLength(1);
    expect(screen.getAllByTestId('document-remove')).toHaveLength(5);
    for (const row of screen.getAllByTestId('candidate-document')) {
      expect(row.querySelector('.document-row__actions')?.children).toHaveLength(3);
    }
  });

  it('shows the upload failure inside the documents section', async () => {
    const { documentService } = renderDocuments([]);
    vi.mocked(documentService.upload).mockRejectedValue(new Error(''));
    await screen.findByText('Sin CV adjunto.');

    fireEvent.change(screen.getByTestId('document-file'), {
      target: { files: [new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByTestId('document-upload'));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo subir el documento.');
    expect(screen.getByTestId('document-selected').closest('form')).toContainElement(
      screen.getByTestId('document-upload-error'),
    );
  });

  it('keeps download but offers no upload, primary or removal when read-only', async () => {
    renderDocuments(
      [{ ...document('Available'), id: 'available' }],
      vi.fn().mockResolvedValue(undefined),
      true,
    );

    expect(await screen.findByRole('button', { name: 'Descargar cv.pdf' })).toBeInTheDocument();
    expect(screen.queryByTestId('document-mark-primary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('document-remove')).not.toBeInTheDocument();
    expect(screen.queryByTestId('document-file')).not.toBeInTheDocument();
    expect(screen.queryByTestId('document-upload')).not.toBeInTheDocument();
  });

  it('offers upload, primary and removal when editable with the upload permission', async () => {
    renderDocuments([{ ...document('Available'), id: 'available' }]);

    expect(
      await screen.findByRole('button', { name: 'Marcar cv.pdf como CV principal' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar cv.pdf' })).toBeInTheDocument();
    expect(screen.getByTestId('document-file')).toBeInTheDocument();
  });

  it('shows no downloads or management without their permissions', async () => {
    renderDocuments([document('Available')], vi.fn().mockResolvedValue(undefined), false, []);
    await screen.findByTestId('candidate-document');
    expect(screen.queryByTestId('document-download')).not.toBeInTheDocument();
    expect(screen.queryByTestId('document-mark-primary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('document-remove')).not.toBeInTheDocument();
    expect(screen.queryByTestId('document-file')).not.toBeInTheDocument();
  });

  it('keeps the primary badge beside the filename and does not offer its star', async () => {
    renderDocuments([{ ...document('Available'), isPrimary: true }]);
    const row = await screen.findByTestId('candidate-document');
    expect(within(row).getByText('Principal')).toBeInTheDocument();
    expect(within(row).getByText('cv.pdf')).toHaveAttribute('title', 'cv.pdf');
    expect(screen.queryByTestId('document-mark-primary')).not.toBeInTheDocument();
    expect(row).toHaveTextContent('PDF');
    expect(row.tagName).toBe('LI');
  });

  it('refreshes the list and shows the API message when primary designation is refused', async () => {
    const { documentService } = renderDocuments([document('Available')]);
    await screen.findByTestId('document-mark-primary');
    const toast = vi.spyOn(services.toastService, 'show');
    vi.mocked(documentService.setPrimary).mockRejectedValue(new Error('Documento no disponible.'));
    vi.mocked(documentService.list).mockResolvedValue([document('Refused')]);
    fireEvent.click(screen.getByTestId('document-mark-primary'));
    await screen.findByText('Rechazado');
    expect(toast).toHaveBeenCalledWith('Documento no disponible.', 'error');
    expect(documentService.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('document-mark-primary')).not.toBeInTheDocument();
    toast.mockRestore();
  });

  it('chooses, clears and drops the first file and reports the unsaved selection', async () => {
    const { onDirtyChange } = renderDocuments([]);
    await screen.findByTestId('document-drop-zone');
    const input = screen.getByTestId('document-file');
    expect(input).toHaveClass('visually-hidden');
    const picker = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByTestId('document-choose'));
    expect(picker).toHaveBeenCalledOnce();
    const file = new File(['test'], 'first.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByTestId('document-selected')).toHaveTextContent('first.pdf');
    expect(screen.getByTestId('document-is-primary')).toBeChecked();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByTestId('document-clear'));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const dropZone = screen.getByTestId('document-drop-zone');
    fireEvent.dragOver(dropZone);
    expect(dropZone).toHaveClass('is-dragging');
    fireEvent.dragLeave(dropZone);
    expect(dropZone).not.toHaveClass('is-dragging');
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file, new File(['other'], 'second.pdf')] },
    });
    expect(screen.getByTestId('document-selected')).toHaveTextContent('first.pdf');
    expect(screen.queryByText('second.pdf')).not.toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('uploads the selected file as primary and returns to the drop area', async () => {
    const { documentService, onDirtyChange } = renderDocuments([]);
    await screen.findByTestId('document-drop-zone');
    const file = new File(['test'], 'cv.pdf', { type: 'application/pdf' });
    vi.mocked(documentService.upload).mockResolvedValue({
      ...document('Pending'),
      isPrimary: true,
    });
    fireEvent.change(screen.getByTestId('document-file'), { target: { files: [file] } });
    fireEvent.click(screen.getByTestId('document-upload'));
    expect(await screen.findByText('Principal')).toBeInTheDocument();
    expect(documentService.upload).toHaveBeenCalledWith({
      candidateId: candidate.id,
      file,
      isPrimary: true,
    });
    // The drop area and the clean report follow the upload's own render and effect; under a
    // loaded parallel run they can land a tick after the badge, so wait for them.
    expect(await screen.findByTestId('document-drop-zone')).toBeInTheDocument();
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it('shows exhausted observation and refresh inside the pending row only', async () => {
    renderDocuments([document('Pending'), document('Available')]);
    const refresh = await screen.findByRole('button', { name: 'Actualizar' });
    expect(refresh.closest('li')).toContainElement(screen.getByText('En análisis'));
  });

  it('aborts pending observation when the view unmounts', async () => {
    let observedSignal: AbortSignal | undefined;
    const observe = vi.fn((_: string, __: string, ___: unknown, signal: AbortSignal) => {
      observedSignal = signal;
      return new Promise(() => undefined);
    });
    const view = renderDocuments([document('Pending')], observe);
    await waitFor(() => expect(observe).toHaveBeenCalledOnce());

    view.unmount();

    expect(observedSignal?.aborted).toBe(true);
  });
});
