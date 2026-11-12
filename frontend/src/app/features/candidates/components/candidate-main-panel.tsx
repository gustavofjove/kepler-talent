import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionRetry } from '../../../core/auth/use-session-retry';
import { useServices } from '../../../core/di/services-context';
import { formatDay } from '../../../core/i18n/format';
import { useErrorToast } from '../../../core/services/use-error-toast';
import { candidateLocation } from '../candidate-location';
import type { Candidate, CandidateDraft } from '../models/candidate.models';
import { useCandidates } from '../use-candidates';
import { CandidateForm } from './candidate-form';
import { CandidatePanel } from './candidate-panel';
import type { PanelControl } from './candidate-panel.logic';
import { reviewUrgency, showReception } from './candidate-main-panel.logic';
import './candidate-main-panel.css';

const FORM_ID = 'candidate-main-form';

interface Props {
  candidate: Candidate;
  control: PanelControl;
}

/** Datos principales: the core record, read as a property list and edited with the core form. */
export function CandidateMainPanel({ candidate, control }: Props) {
  const { t } = useTranslation();
  const { toastService } = useServices();
  const candidateService = useCandidates();
  const notifyError = useErrorToast();
  const session = useSessionRetry();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const urgency = reviewUrgency(candidate.reviewDueAt);

  const save = async (draft: CandidateDraft): Promise<void> => {
    setSaving(true);
    setSaveError('');
    try {
      // The version travels with the aggregate inside the service, so a panel opened before
      // someone else's edit is refused rather than overwriting it, and the draft is kept.
      await candidateService.update(candidate.id, draft);
      toastService.show(t('candidate.panel.saved.main'), 'success');
      control.onClose();
    } catch (error) {
      // KTL-46: a session that ended keeps the form; signing in again retries this save.
      if (!session.handle(error, () => save(draft))) {
        setSaveError(notifyError(error, t('candidate.edit.saveFailure')));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <CandidatePanel
      id="main"
      title={t('candidate.detail.mainData')}
      control={control}
      mode="form"
      formId={FORM_ID}
      saving={saving}
      session={session}
    >
      {control.editing ? (
        <CandidateForm
          candidate={candidate}
          saveError={saveError}
          formId={FORM_ID}
          onSave={(draft) => void save(draft)}
          onDirtyChange={control.onDirtyChange}
        />
      ) : (
        <>
          <dl className="prop-list">
            <dt>{t('candidate.detail.location')}</dt>
            <dd>{candidateLocation(candidate)}</dd>
            {showReception(candidate.receivedAt, candidate.createdAt) ? (
              <>
                <dt>{t('candidate.detail.receivedAt')}</dt>
                <dd>
                  {candidate.receivedAt
                    ? formatDay(candidate.receivedAt)
                    : t('candidate.detail.pending')}
                </dd>
              </>
            ) : null}
            <dt>{t('candidate.detail.reviewDueAt')}</dt>
            <dd>
              {candidate.reviewDueAt
                ? formatDay(candidate.reviewDueAt)
                : t('candidate.detail.pending')}
              {urgency ? (
                <>
                  {' '}
                  <span className={`candidate-review candidate-review--${urgency}`}>
                    {t(
                      urgency === 'overdue'
                        ? 'candidate.detail.reviewOverdue'
                        : 'candidate.detail.reviewDueSoon',
                    )}
                  </span>
                </>
              ) : null}
            </dd>
          </dl>
          {candidate.notes ? <p className="candidate-observations">{candidate.notes}</p> : null}
        </>
      )}
    </CandidatePanel>
  );
}
