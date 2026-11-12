import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { usePermission, useServices } from '../../../core/di/services-context';
import { errorText, TranslatableError } from '../../../core/i18n/translatable-error';
import { useErrorToast } from '../../../core/services/use-error-toast';
import { Breadcrumb, type BreadcrumbItem } from '../../../shared/components/breadcrumb';
import { useCandidates } from '../use-candidates';
import { CandidateForm } from '../components/candidate-form';
import { CvDraftPicker, type CvDraftStatus } from '../components/cv-draft-picker';
import { HeldCvPreview } from '../components/held-cv-preview';
import type { Candidate, CandidateDraft } from '../models/candidate.models';
import type { CvDraftSuggestion } from '../models/candidate-draft.models';

/**
 * The create page: the core record only. Once saved, the candidate opens on its own page,
 * where every other section is a panel edited in place (KTL-29). A CV can pre-fill the empty
 * fields of the form; nothing is saved until the user submits it (KTL-32). The last CV read is
 * held in page memory only and, unless the user opts out, uploaded as the new candidate's primary
 * CV through the ordinary document upload once the candidate exists (KTL-42).
 */
export function CandidateCreatePage() {
  const { t } = useTranslation();
  const candidateService = useCandidates();
  const { candidateDraftService, documentService, toastService } = useServices();
  const canRead = usePermission('candidates.read');
  const canUpload = usePermission('documents.upload');
  const notifyError = useErrorToast();
  const navigate = useNavigate();
  const [suggestion, setSuggestion] = useState<CvDraftSuggestion>();
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftStatus, setDraftStatus] = useState<CvDraftStatus | null>(null);
  const [heldCv, setHeldCv] = useState<File>();
  const [attachCv, setAttachCv] = useState(true);
  const [saveError, setSaveError] = useState('');
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  const trail: BreadcrumbItem[] = [
    {
      label: t('breadcrumb.candidates'),
      to: canRead ? '/app/candidates' : undefined,
      testId: 'breadcrumb-candidates',
    },
    { label: t('breadcrumb.newCandidate'), current: true },
  ];

  const save = async (draft: CandidateDraft): Promise<void> => {
    setSaveError('');
    let created: Candidate;
    try {
      created = await candidateService.create(draft);
    } catch (error) {
      setSaveError(notifyError(error, t('candidate.edit.saveFailure')));
      return;
    }
    if (heldCv && attachCv && canUpload) {
      try {
        await documentService.upload({
          candidateId: created.id,
          file: heldCv,
          documentType: 'CV',
          isPrimary: true,
        });
      } catch {
        // The candidate stays: the CV can be uploaded again from its page.
        toastService.show(t('candidate.cvDraft.attachFailed'), 'warning');
      }
    }
    await navigate(`/app/candidates/${created.id}`);
  };

  const readCv = async (file: File): Promise<void> => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setDraftBusy(true);
    setDraftStatus(null);
    setHeldCv(undefined);
    try {
      const draft = await candidateDraftService.extract(file, controller.signal);
      if (controller.signal.aborted) return;
      setHeldCv(file);
      setAttachCv(true);
      if (draft.outcome === 'cv_draft.no_text') {
        setDraftStatus({ tone: 'info', text: t('candidate.cvDraft.noText') });
      } else {
        setSuggestion((current) => ({ nonce: (current?.nonce ?? 0) + 1, fields: draft.fields }));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof TranslatableError) {
        setDraftStatus({ tone: 'error', text: errorText(error, t) });
      } else {
        const message = notifyError(error, t('candidate.cvDraft.error.generic'));
        setDraftStatus({ tone: 'error', text: message });
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setDraftBusy(false);
      }
    }
  };

  const suggestionApplied = useCallback(
    (filled: number) =>
      setDraftStatus({
        tone: 'info',
        text:
          filled > 0
            ? t('candidate.cvDraft.filled', { count: filled })
            : t('candidate.cvDraft.nothingFilled'),
      }),
    [t],
  );

  return (
    <section className="page">
      <Breadcrumb items={trail} />
      <div className="toolbar">
        <div className="page-header">
          <h1>{t('candidate.edit.titleNew')}</h1>
          <p className="muted" data-testid="candidate-create-hint">
            {t('candidate.edit.newHint')}
          </p>
        </div>
      </div>
      {/* KTL-47: the CV just read sits beside the form from a 1024 px content area, and after it
          below that. The aside is empty, and collapses, until a draft has returned. */}
      <div className="page-split page-split--create">
        <div className="page-split__layout">
          <div className="page-split__main">
            <article className="panel">
              <h2>{t('candidate.edit.mainData')}</h2>
              <CvDraftPicker
                busy={draftBusy}
                status={draftStatus}
                onPick={(file) => void readCv(file)}
                attach={
                  heldCv && canUpload ? { checked: attachCv, onChange: setAttachCv } : undefined
                }
              />
              <CandidateForm
                saveError={saveError}
                onSave={(draft) => void save(draft)}
                suggestion={suggestion}
                onSuggestionApplied={suggestionApplied}
              />
            </article>
          </div>
          <aside className="page-split__aside">
            {heldCv ? <HeldCvPreview file={heldCv} /> : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
