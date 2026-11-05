import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useBlocker, useLocation, useParams } from 'react-router';
import { usePermission, useServices } from '../../../core/di/services-context';
import { formatDate, formatElapsed, localDay } from '../../../core/i18n/format';
import { Breadcrumb, type BreadcrumbItem } from '../../../shared/components/breadcrumb';
import { useErrorToast } from '../../../core/services/use-error-toast';
import { CandidateAvailabilityBlock } from '../components/candidate-availability';
import { CandidateCvPreview } from '../components/candidate-cv-preview';
import { CandidateDocuments } from '../components/candidate-documents';
import { CandidateEducation } from '../components/candidate-education';
import { CandidateExperience } from '../components/candidate-experience';
import { CandidateMainPanel } from '../components/candidate-main-panel';
import { CandidateNotes } from '../components/candidate-notes';
import { CandidatePanel } from '../components/candidate-panel';
import { CandidatePipelineBadges } from '../components/candidate-pipeline-badges';
import { CandidatePositionsPanel } from '../components/candidate-positions-panel';
import type { PanelControl, PanelId } from '../components/candidate-panel.logic';
import { CandidateCompetencies } from '../components/candidate-competencies';
import { candidateFullName } from '../candidate-name';
import { readCandidateOrigin } from '../candidate-origin';
import { displayPhone, mailtoHref } from '../contact-links';
import { useCandidatePositions } from '../use-candidate-positions';
import { useCandidate } from '../use-candidates';
import './candidate-detail-page.css';

/** «30 sept 2026, 11:49» in the active language and the viewer's time zone (KTL-34). */
const AUDIT_DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/** The candidate page's name in the unsaved-changes registry (KTL-46). */
const UNSAVED_OWNER = 'candidate-page';

export function CandidateDetailPage() {
  const { t } = useTranslation();
  const { id: candidateId = '' } = useParams<{ id: string }>();
  const { confirmDialogService, unsavedChanges } = useServices();
  const timestampDetailsId = useId();
  const [showTimestampDetails, setShowTimestampDetails] = useState(false);
  const notifyError = useErrorToast();
  const candidateService = useCandidate(candidateId);
  const item = candidateService.find(candidateId);
  const canEdit = usePermission('candidates.update');
  const canUpload = usePermission('documents.upload');
  const aggregate = candidateService.aggregateStatus(candidateId);
  const canReadList = usePermission('candidates.read');
  const canReadPositions = usePermission('positions.read');
  // KTL-36 design D8: loaded once for the page, shared by «Posiciones» and the badges, and never
  // requested without positions.read.
  const positions = useCandidatePositions(candidateId, canReadPositions && item !== undefined);
  // KTL-44: opened from a position page, the trail leads back to that position. Links leaving this
  // page carry no origin, so the trail never grows beyond three segments.
  const origin = readCandidateOrigin(useLocation().state);
  // The parents are offered in every state, even while loading or after a failure; the name only
  // once the candidate has loaded.
  const trail: BreadcrumbItem[] = origin
    ? [
        {
          label: t('breadcrumb.positions'),
          to: canReadPositions ? '/app/positions' : undefined,
          testId: 'breadcrumb-positions',
        },
        {
          label: origin.positionTitle,
          to: canReadPositions ? `/app/positions/${origin.positionId}` : undefined,
          testId: 'breadcrumb-position',
        },
      ]
    : [
        {
          label: t('breadcrumb.candidates'),
          to: canReadList ? '/app/candidates' : undefined,
          testId: 'breadcrumb-candidates',
        },
      ];
  if (aggregate !== 'loading' && item)
    trail.push({ label: candidateFullName(item), current: true });

  // KTL-29: one page, one panel in edit mode at a time. Each panel reports whether it holds
  // unsaved changes; only the open panel's report counts (design D1, D6).
  const [requested, setRequested] = useState<PanelId | null>(null);
  const [dirtyPanels, setDirtyPanels] = useState<Partial<Record<PanelId, boolean>>>({});

  // Who may open each panel mirrors the API (D7). The API refuses relation and note writes on
  // a removed candidate, so those panels offer no «Editar» then; the core record and documents
  // keep following their permissions.
  const isActive = item?.isActive ?? false;
  const allowed: Record<PanelId, boolean> = {
    main: canEdit,
    competencies: canEdit && isActive,
    education: canEdit && isActive,
    experience: canEdit && isActive,
    notes: canEdit && isActive,
    documents: canUpload,
  };
  // A panel that stops being allowed while open (the candidate is removed, say) closes at
  // once, in the same render, so its editor never outlives the permission.
  const editing = requested !== null && allowed[requested] ? requested : null;
  const dirty = editing !== null && Boolean(dirtyPanels[editing]);
  useEffect(() => {
    if (requested !== null && editing === null) setRequested(null);
  }, [requested, editing]);

  const reportDirty = useMemo(() => {
    const report =
      (id: PanelId) =>
      (value: boolean): void =>
        setDirtyPanels((current) =>
          current[id] === value ? current : { ...current, [id]: value },
        );
    return {
      main: report('main'),
      competencies: report('competencies'),
      education: report('education'),
      experience: report('experience'),
      notes: report('notes'),
      documents: report('documents'),
    } satisfies Record<PanelId, (value: boolean) => void>;
  }, []);

  const confirmDiscard = useCallback(
    (leaving: boolean): Promise<boolean> =>
      confirmDialogService.confirm({
        title: t(leaving ? 'candidate.panel.leaveTitle' : 'candidate.panel.discardTitle'),
        message: t(leaving ? 'candidate.panel.leaveMessage' : 'candidate.panel.discardMessage'),
        confirmText: t('candidate.panel.discardConfirm'),
        cancelText: t('candidate.panel.keepEditing'),
        danger: true,
      }),
    [confirmDialogService, t],
  );

  const open = async (id: PanelId): Promise<void> => {
    if (editing === id) return;
    if (dirty && !(await confirmDiscard(false))) return;
    setRequested(id);
  };
  const close = useCallback(() => setRequested(null), []);

  // KTL-46: the auth layer keeps this page, rather than sending the user to sign-in, while it
  // holds unsaved work.
  useEffect(() => {
    unsavedChanges.set(UNSAVED_OWNER, dirty);
    return () => unsavedChanges.set(UNSAVED_OWNER, false);
  }, [dirty, unsavedChanges]);

  // Leaving the page with unsaved changes asks first: in-app navigation through the router,
  // reload and tab close through the browser's own prompt. Work another user's sign-in gave up
  // (KTL-46) no longer holds the page.
  const blocker = useBlocker(
    useCallback(() => dirty && !unsavedChanges.wasDiscarded(), [dirty, unsavedChanges]),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirmDiscard(true).then((leave) => (leave ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirmDiscard]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const control = (id: PanelId): PanelControl => ({
    editing: editing === id,
    canEdit: allowed[id],
    onEdit: () => void open(id),
    onClose: close,
    onDirtyChange: reportDirty[id],
  });

  const setActive = async (active: boolean): Promise<void> => {
    if (!item) return;
    const confirmed = await confirmDialogService.confirm({
      title: t(active ? 'candidate.detail.activateTitle' : 'candidate.detail.deactivateTitle'),
      message: t(
        active ? 'candidate.detail.activateMessage' : 'candidate.detail.deactivateMessage',
      ),
      confirmText: t(active ? 'candidate.detail.activate' : 'candidate.detail.deactivate'),
      cancelText: t('candidate.detail.cancel'),
      danger: !active,
    });
    if (!confirmed) return;
    try {
      if (active) await candidateService.reactivate(item.id);
      else await candidateService.deactivate(item.id);
    } catch (error) {
      notifyError(error, t('candidate.detail.stateFailure'));
    }
  };

  if (aggregate === 'loading')
    return (
      <>
        <Breadcrumb items={trail} />
        <section className="panel">
          <p className="empty-state">{t('candidate.detail.loading')}</p>
        </section>
      </>
    );
  if (aggregate === 'error')
    return (
      <>
        <Breadcrumb items={trail} />
        <section className="panel" data-testid="candidate-detail-error">
          <h1>{t('candidate.detail.loadFailure')}</h1>
          <p className="empty-state">
            {candidateService.error?.message ?? t('candidate.detail.tryLater')}
          </p>
          <Link className="button" to="/app/candidates">
            {t('candidate.detail.back')}
          </Link>
        </section>
      </>
    );
  if (!item)
    return (
      <>
        <Breadcrumb items={trail} />
        <section className="panel">
          <h1>{t('candidate.detail.notFound')}</h1>
          <Link className="button" to="/app/candidates">
            {t('candidate.detail.back')}
          </Link>
        </section>
      </>
    );

  return (
    <section className="page">
      <Breadcrumb items={trail} />
      <div className="toolbar candidate-detail__toolbar">
        <div className="page-header candidate-detail__heading">
          <h1>
            {item.isActive ? (
              candidateFullName(item)
            ) : (
              <Trans
                i18nKey="candidate.detail.inactiveSuffix"
                values={{ name: candidateFullName(item) }}
                components={{
                  inactive: (
                    <span className="candidate-detail__inactive" data-testid="candidate-inactive" />
                  ),
                }}
              />
            )}
            {canReadPositions ? <CandidatePipelineBadges links={positions.links} /> : null}
          </h1>
          <p className="muted contact-links" data-testid="candidate-contact">
            {item.email ? <a href={mailtoHref(item.email)}>{item.email}</a> : null}
            {item.email && item.phone ? ' · ' : null}
            {item.phone ? (
              <span data-testid="candidate-phone">{displayPhone(item.phone)}</span>
            ) : null}
          </p>
        </div>
        <div className="candidate-detail__status">
          {canEdit ? (
            <button
              className={item.isActive ? 'button danger' : 'button secondary'}
              type="button"
              onClick={() => void setActive(!item.isActive)}
            >
              {t(
                item.isActive
                  ? 'candidate.detail.logicalDeactivate'
                  : 'candidate.detail.logicalActivate',
              )}
            </button>
          ) : null}
          <div className="candidate-detail__timestamps" data-testid="candidate-timestamps">
            <span>
              {t('candidate.detail.updatedAgo', {
                elapsed: formatElapsed(localDay(new Date(item.updatedAt))),
              })}
            </span>
            <button
              className="candidate-detail__timestamp-info"
              type="button"
              aria-label={t('candidate.detail.showRecordDates')}
              aria-expanded={showTimestampDetails}
              aria-controls={timestampDetailsId}
              onClick={() => setShowTimestampDetails((current) => !current)}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 9v5M10 6v1" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
          <p
            id={timestampDetailsId}
            className="candidate-detail__exact-dates"
            hidden={!showTimestampDetails}
          >
            {t('candidate.detail.recordDates', {
              created: formatDate(item.createdAt, AUDIT_DATE_TIME),
              updated: formatDate(item.updatedAt, AUDIT_DATE_TIME),
            })}
          </p>
        </div>
      </div>
      {canEdit && !isActive ? (
        <p className="muted" data-testid="candidate-removed-hint">
          {t('candidate.detail.removedHint')}
        </p>
      ) : null}
      {/* One full-width panel per row, in reading order (KTL-27), except the main data and
          availability panels, which share a row while there is room (KTL-37); the main panel's editor
          takes the whole row. Each editable panel switches to its editor in place (KTL-29). The
          CV preview sits beside the panels on wide screens and after them otherwise (KTL-28). */}
      <div className="page-split">
        <div className="page-split__layout">
          <div className="page-split__main">
            <div className="grid">
              <div
                className={editing === 'main' ? 'grid' : 'grid two'}
                data-testid="candidate-summary-row"
              >
                <CandidateMainPanel candidate={item} control={control('main')} />
                <article className="panel">
                  <h2>{t('candidate.availability.title')}</h2>
                  {/* KTL-36: acts immediately, so it stays outside the edit-mode coordinator. */}
                  <CandidateAvailabilityBlock key={item.id} candidate={item} />
                </article>
              </div>
              <CandidateCompetencies candidate={item} control={control('competencies')} />
              <CandidateEducation candidate={item} control={control('education')} />
              <CandidateExperience candidate={item} control={control('experience')} />
              {/* KTL-30: acts immediately, so it stays outside the edit-mode coordinator. */}
              {canReadPositions ? (
                <CandidatePositionsPanel
                  candidateId={item.id}
                  candidateIsActive={isActive}
                  positions={positions}
                  onLinksChange={positions.setLinks}
                />
              ) : null}
              <CandidatePanel
                id="notes"
                title={t('candidate.profile.notes.title')}
                control={control('notes')}
                mode="actions"
              >
                <CandidateNotes
                  candidateId={item.id}
                  initialNotes={item.customNotes}
                  readOnly={editing !== 'notes'}
                  onDirtyChange={reportDirty.notes}
                />
              </CandidatePanel>
              <CandidatePanel
                id="documents"
                title={t('candidate.profile.documents.title')}
                control={control('documents')}
                mode="actions"
              >
                <CandidateDocuments
                  candidate={item}
                  readOnly={editing !== 'documents'}
                  onDirtyChange={reportDirty.documents}
                />
              </CandidatePanel>
            </div>
          </div>
          <aside className="page-split__aside">
            {/* KTL-35: only a previewable primary CV earns the preview column. */}
            <CandidateCvPreview
              candidateId={item.id}
              initialDocuments={item.documents}
              requirePreviewablePrimary
            />
          </aside>
        </div>
      </div>
    </section>
  );
}
