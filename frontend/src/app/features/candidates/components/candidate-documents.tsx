import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SessionExpiredNotice } from '../../../core/auth/session-expired-notice';
import { useSessionRetry } from '../../../core/auth/use-session-retry';
import { usePermission, useServices } from '../../../core/di/services-context';
import { useErrorToast } from '../../../core/services/use-error-toast';
import { FormError } from '../../../shared/components/form-error';
import { formatDate } from '../../../core/i18n/format';
import { StatusChip } from '../../../shared/components/status-chip';
import {
  CloseIcon,
  DownloadIcon,
  FileIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from '../../../shared/components/icons';
import {
  ACCEPTED_FILES,
  canMarkPrimary,
  documentDetails,
  documentExplanationKey,
  documentStateChip,
  formatFileSize,
} from './candidate-documents.logic';
import type { Candidate, CandidateDocument } from '../models/candidate.models';
import './candidate-documents.css';

interface Props {
  candidate: Candidate | undefined;
  /**
   * Hides upload, primary and removal; the list and download stay. True unless the
   * Documentos panel is in edit mode (KTL-29); the component is not remounted between modes,
   * so scan polling carries on.
   */
  readOnly?: boolean;
  /** Reports a file selected and not yet uploaded. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function CandidateDocuments({ candidate, readOnly = false, onDirtyChange }: Props) {
  const { t } = useTranslation();
  const { documentService, toastService, confirmDialogService } = useServices();
  const notifyError = useErrorToast();
  const session = useSessionRetry();
  const [documents, setDocuments] = useState<CandidateDocument[]>(candidate?.documents ?? []);
  const [selectedFile, setSelectedFile] = useState<File | undefined>();
  const [isPrimary, setIsPrimary] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [pollingExhausted, setPollingExhausted] = useState(false);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);
  const polling = useRef(new Map<string, AbortController>());

  const canDownload = usePermission('documents.download');
  const mayUpload = usePermission('documents.upload');
  const canUpload = !readOnly && mayUpload;
  const dirty = canUpload && selectedFile !== undefined;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (canUpload) return;
    setSelectedFile(undefined);
    setUploadError(undefined);
  }, [canUpload]);

  const replaceDocument = useCallback((next: CandidateDocument) => {
    setDocuments((current) => current.map((item) => (item.id === next.id ? next : item)));
  }, []);

  const observe = useCallback(
    (document: CandidateDocument) => {
      if (
        !candidate ||
        document.availabilityState !== 'Pending' ||
        polling.current.has(document.id)
      )
        return;
      const controller = new AbortController();
      polling.current.set(document.id, controller);
      void documentService
        .observeUntilSettled(candidate.id, document.id, replaceDocument, controller.signal)
        .then((settled) => {
          if (!settled && !controller.signal.aborted) setPollingExhausted(true);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            notifyError(error, t('candidate.profile.documents.pollFailure'));
        })
        .finally(() => polling.current.delete(document.id));
    },
    [candidate, documentService, notifyError, replaceDocument, t],
  );

  const refresh = useCallback(async () => {
    if (!candidate) return;
    try {
      const current = await documentService.list(candidate.id);
      setDocuments(current);
      setPollingExhausted(false);
      current.forEach(observe);
    } catch (error) {
      notifyError(error, t('candidate.profile.documents.loadFailure'));
    }
  }, [candidate, documentService, notifyError, observe, t]);

  useEffect(() => {
    void refresh();
    const active = polling.current;
    return () => {
      active.forEach((controller) => controller.abort());
      active.clear();
    };
  }, [refresh]);

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>): void => {
    setSelectedFile(event.target.files?.[0]);
  };

  const upload = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!candidate || !selectedFile) return;
    setUploadError(undefined);
    try {
      const uploaded = await documentService.upload({
        candidateId: candidate.id,
        file: selectedFile,
        isPrimary,
      });
      setDocuments((current) => [
        uploaded,
        ...current.map((item) => (isPrimary ? { ...item, isPrimary: false } : item)),
      ]);
      setSelectedFile(undefined);
      setIsPrimary(true);
      if (fileInput.current) fileInput.current.value = '';
      toastService.show(t('candidate.profile.documents.uploaded'), 'success');
      observe(uploaded);
    } catch (error) {
      // KTL-46: a session that ended keeps the selected file for an upload after signing in.
      if (session.handle(error)) return;
      setUploadError(notifyError(error, t('candidate.profile.documents.uploadFailure')));
    }
  };

  const download = async (document: CandidateDocument): Promise<void> => {
    if (!candidate) return;
    try {
      await documentService.download(candidate.id, document.id, document.originalFilename);
    } catch (error) {
      notifyError(error, t('candidate.profile.documents.downloadFailure'));
    }
  };

  const markPrimary = async (documentId: string): Promise<void> => {
    if (!candidate) return;
    try {
      await documentService.setPrimary(candidate.id, documentId);
      await refresh();
      toastService.show(t('candidate.profile.documents.primaryUpdated'), 'success');
    } catch (error) {
      notifyError(error, t('candidate.profile.documents.primaryFailure'));
      await refresh();
    }
  };

  const remove = async (document: CandidateDocument): Promise<void> => {
    if (!candidate) return;
    const confirmed = await confirmDialogService.confirm({
      title: t('candidate.profile.documents.removeTitle'),
      message: t('candidate.profile.documents.removeMessage'),
      confirmText: t('candidate.profile.documents.removeTitle'),
      cancelText: t('candidate.detail.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await documentService.remove(candidate.id, document.id);
      polling.current.get(document.id)?.abort();
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      toastService.show(
        t(
          document.isPrimary
            ? 'candidate.profile.documents.removedPrimary'
            : 'candidate.profile.documents.removed',
        ),
        'success',
      );
    } catch (error) {
      notifyError(error, t('candidate.profile.documents.removeFailure'));
    }
  };

  return (
    <section className="section-block candidate-documents" data-testid="candidate-documents">
      <SessionExpiredNotice session={session} />
      {!documents.length ? (
        <p className="empty-state">{t('candidate.profile.documents.empty')}</p>
      ) : null}
      <ul className="document-list">
        {documents.map((document) => {
          const chip = documentStateChip(document.availabilityState);
          const explanation = documentExplanationKey(document.availabilityState);
          const details = documentDetails(document);
          const filename = document.originalFilename;
          const downloadLabel = t('candidate.profile.documents.action.download', { filename });
          const primaryLabel = t('candidate.profile.documents.action.markPrimary', { filename });
          const removeLabel = t('candidate.profile.documents.action.remove', { filename });
          return (
            <li className="document-row" key={document.id} data-testid="candidate-document">
              <span className="document-row__icon">
                <FileIcon />
              </span>
              <div className="document-row__main">
                <div className="document-row__heading">
                  <strong className="document-row__filename" title={filename}>
                    {filename}
                  </strong>
                  {document.isPrimary ? (
                    <span className="badge">{t('candidate.profile.documents.primary')}</span>
                  ) : null}
                </div>
                <div className="document-row__details">
                  {explanation
                    ? t(explanation)
                    : t(
                        details.type
                          ? 'candidate.profile.documents.detailsWithType'
                          : 'candidate.profile.documents.details',
                        {
                          format: details.format,
                          size: formatFileSize(details.sizeBytes),
                          date: formatDate(document.uploadedAt, { dateStyle: 'medium' }),
                          type: details.type,
                        },
                      )}
                  {pollingExhausted && document.availabilityState === 'Pending' ? (
                    <div>
                      {t('candidate.profile.documents.stillScanning')}{' '}
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={() => void refresh()}
                      >
                        {t('candidate.profile.documents.refresh')}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <span
                className="document-row__state"
                data-testid="document-availability"
                data-state={document.availabilityState ?? 'LegacyUnavailable'}
              >
                {chip ? <StatusChip tone={chip.tone}>{t(chip.labelKey)}</StatusChip> : null}
              </span>
              <div className="document-row__actions">
                {canDownload && document.availabilityState === 'Available' ? (
                  <button
                    className="button ghost icon-button"
                    type="button"
                    data-testid="document-download"
                    aria-label={downloadLabel}
                    title={downloadLabel}
                    onClick={() => void download(document)}
                  >
                    <DownloadIcon />
                  </button>
                ) : (
                  <span className="document-row__slot" aria-hidden="true" />
                )}
                {canUpload ? (
                  <>
                    {canMarkPrimary(document) ? (
                      <button
                        className="button ghost icon-button"
                        type="button"
                        data-testid="document-mark-primary"
                        aria-label={primaryLabel}
                        title={primaryLabel}
                        onClick={() => void markPrimary(document.id)}
                      >
                        <StarIcon />
                      </button>
                    ) : (
                      <span className="document-row__slot" aria-hidden="true" />
                    )}
                    <button
                      className="button ghost icon-button is-danger"
                      type="button"
                      data-testid="document-remove"
                      aria-label={removeLabel}
                      title={removeLabel}
                      onClick={() => void remove(document)}
                    >
                      <TrashIcon />
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {canUpload ? (
        <form
          className="section-block candidate-add-form document-upload"
          onSubmit={upload}
          noValidate
        >
          <h3>{t('candidate.profile.documents.upload.title')}</h3>
          <FormError message={uploadError} testId="document-upload-error" />
          <label className="visually-hidden" htmlFor="file">
            {t('candidate.profile.documents.upload.choose')}
          </label>
          <input
            className="visually-hidden"
            id="file"
            ref={fileInput}
            name="file"
            data-testid="document-file"
            type="file"
            accept={ACCEPTED_FILES}
            onChange={onFileSelected}
          />
          {!selectedFile ? (
            <div
              className={`document-drop-zone${isDragging ? ' is-dragging' : ''}`}
              data-testid="document-drop-zone"
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                setSelectedFile(event.dataTransfer.files[0]);
              }}
            >
              <UploadIcon />
              <p>{t('candidate.profile.documents.upload.drop')}</p>
              <p className="document-upload__hint">
                {t('candidate.profile.documents.upload.hint')}
              </p>
              <button
                className="button ghost"
                type="button"
                data-testid="document-choose"
                onClick={() => fileInput.current?.click()}
              >
                {t('candidate.profile.documents.upload.choose')}
              </button>
            </div>
          ) : (
            <div className="document-selected" data-testid="document-selected">
              <div className="document-selected__file">
                <FileIcon />
                <div className="document-row__main">
                  <strong className="document-row__filename" title={selectedFile.name}>
                    {selectedFile.name}
                  </strong>
                  <span className="document-row__details">{formatFileSize(selectedFile.size)}</span>
                </div>
                <button
                  className="button ghost icon-button"
                  type="button"
                  data-testid="document-clear"
                  aria-label={t('candidate.profile.documents.upload.clear')}
                  title={t('candidate.profile.documents.upload.clear')}
                  onClick={() => {
                    setSelectedFile(undefined);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="document-selected__controls">
                <label className="inline-check">
                  <input
                    name="isPrimary"
                    data-testid="document-is-primary"
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(event) => setIsPrimary(event.target.checked)}
                  />
                  {t('candidate.profile.documents.isPrimary')}
                </label>
                <button
                  className="button"
                  type="submit"
                  data-testid="document-upload"
                  disabled={!selectedFile}
                >
                  {t('candidate.profile.documents.upload.submit')}
                </button>
              </div>
            </div>
          )}
        </form>
      ) : null}
    </section>
  );
}
