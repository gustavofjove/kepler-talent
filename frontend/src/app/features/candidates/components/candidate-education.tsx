import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices } from '../../../core/di/services-context';
import { errorText } from '../../../core/i18n/translatable-error';
import { FormError } from '../../../shared/components/form-error';
import { randomId } from '../../../shared/random-id';
import { useCatalogs } from '../../catalogs/use-catalogs';
import { CatalogStatusNotice } from '../../catalogs/components/catalog-status';
import { useCatalogStatus } from '../../catalogs/components/use-catalog-status';
import type { Candidate, CandidateEducation as EducationEntry } from '../models/candidate.models';
import { validateEducationEntry } from '../services/candidate-relations.service';
import {
  applyEntryDraft,
  formChanged,
  optionsWithCurrent,
  replaceEntry,
  sameEntry,
} from './candidate-entry-form.logic';
import { CandidatePanel } from './candidate-panel';
import type { PanelControl } from './candidate-panel.logic';
import { educationPeriod } from './candidate-period.logic';
import { useEntryFormDisclosure } from './use-entry-form-disclosure';
import { useEntryWrites } from './use-entry-writes';

interface Draft {
  educationType: string;
  degree: string;
  specialty: string;
  institution: string;
  endYear: number | undefined;
  status: string;
}

const EMPTY: Draft = {
  educationType: '',
  degree: '',
  specialty: '',
  institution: '',
  endYear: undefined,
  status: '',
};

const toDraft = (entry: EducationEntry): Draft => ({
  educationType: entry.educationType,
  degree: entry.degree,
  specialty: entry.specialty ?? '',
  institution: entry.institution,
  endYear: entry.endYear,
  status: entry.status,
});

interface Props {
  candidate: Candidate;
  control: PanelControl;
}

/**
 * Educación as a candidate page panel (KTL-29): read-only rows, or in edit mode a form whose
 * «Añadir formación» and «Actualizar formación» save at once, as «Quitar» does after a
 * confirmation (KTL-46 follow-up). «Editar» on a row loads it into the form; «Cancelar edición»
 * only empties the form. «Hecho» in the panel header closes the panel.
 */
export function CandidateEducation({ candidate, control }: Props) {
  const { t } = useTranslation();
  const { candidateRelationsService, confirmDialogService } = useServices();
  const catalogs = useCatalogs();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const form = useEntryFormDisclosure<HTMLSelectElement>();
  const education = candidate.education;
  const { write, saving, error, setError, session } = useEntryWrites<EducationEntry>(
    (entries) => candidateRelationsService.saveEducation(candidate.id, entries),
    'candidate.panel.saved.education',
  );
  const canEdit = control.editing;
  const editing = canEdit ? education.find((item) => item.id === editingId) : undefined;
  // Only what is typed in the open form is unsaved: every entry change is already written.
  const dirty = canEdit && form.open && formChanged(draft, editing ? toDraft(editing) : EMPTY);

  const { onDirtyChange } = control;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // The years column appears once any row has a year, and then on every row, to keep alignment.
  const showPeriods = education.some((item) => educationPeriod(item, t) !== undefined);

  const catalogStatus = useCatalogStatus();
  const typeOptions = optionsWithCurrent(
    catalogs.activeNames('education_type'),
    draft.educationType,
  );
  const statusOptions = optionsWithCurrent(catalogs.activeNames('education_status'), draft.status);

  /** Empties the form and hides it again behind «Nueva formación». */
  const clearForm = (): void => {
    setDraft(EMPTY);
    setEditingId(null);
    setError('');
    form.hide();
  };

  const startNew = (): void => {
    setDraft(EMPTY);
    setEditingId(null);
    setError('');
    form.show();
  };

  const startEdit = (entry: EducationEntry): void => {
    setDraft(toDraft(entry));
    setEditingId(entry.id);
    setError('');
    form.show();
  };

  // Leaving edit mode («Hecho», or opening another panel) drops what is typed, as in Notas.
  useEffect(() => {
    if (control.editing) return;
    setDraft(EMPTY);
    setEditingId(null);
    setError('');
    form.hide();
    // `form.hide` only sets state; listing it would rerun this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [control.editing, setError]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const entry = editing ? applyEntryDraft(editing, draft) : { ...draft, id: randomId() };
    try {
      validateEducationEntry(entry);
    } catch (err) {
      setError(errorText(err, t));
      return;
    }
    if (editing && sameEntry(entry, editing)) {
      clearForm();
      return;
    }
    void write(editing ? replaceEntry(education, entry) : [...education, entry], clearForm);
  };

  const remove = async (entry: EducationEntry): Promise<void> => {
    const confirmed = await confirmDialogService.confirm({
      title: t('candidate.profile.education.removeTitle'),
      message: t('candidate.profile.education.removeMessage', { degree: entry.degree }),
      confirmText: t('candidate.profile.action.remove'),
      cancelText: t('candidate.detail.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    await write(
      education.filter((item) => item.id !== entry.id),
      () => {
        if (entry.id === editingId) clearForm();
      },
    );
  };

  return (
    <CandidatePanel
      id="education"
      title={t('candidate.profile.education.title')}
      control={control}
      mode="actions"
      session={session}
    >
      <section className="section-block" data-testid="candidate-education">
        {!education.length ? (
          <p className="empty-state">{t('candidate.profile.education.empty')}</p>
        ) : null}
        <div className="item-list">
          {education.map((item) => (
            <div
              className={item.id === editing?.id ? 'item-row is-editing' : 'item-row'}
              key={item.id}
            >
              <p className="item-main">
                {showPeriods ? (
                  <span className="item-period" data-testid="education-period">
                    {educationPeriod(item, t)}
                  </span>
                ) : null}
                <span className="badge">{item.degree}</span> {item.institution} ({item.status})
              </p>
              {canEdit ? (
                <div className="item-actions">
                  <button
                    className="button secondary"
                    type="button"
                    data-testid="education-edit"
                    aria-label={t('candidate.profile.education.editLabel', {
                      degree: item.degree,
                    })}
                    onClick={() => startEdit(item)}
                  >
                    {t('candidate.profile.action.edit')}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={saving}
                    onClick={() => void remove(item)}
                  >
                    {t('candidate.profile.action.remove')}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {canEdit ? (
          // Under the rule: «Nueva formación» until the form is asked for (KTL-46 follow-up).
          <div className="candidate-add-form" data-testid="education-add-area">
            {!form.open ? (
              <>
                {/* A refused «Quitar» still needs its message while the form is hidden. */}
                <FormError message={error} />
                <button
                  ref={form.opener}
                  className="button secondary"
                  type="button"
                  data-testid="education-new"
                  onClick={startNew}
                >
                  {t('candidate.profile.education.newTitle')}
                </button>
              </>
            ) : (
              <form
                className="section-block candidate-entry-form"
                aria-labelledby="education-add-title"
                data-testid="education-add-form"
                onSubmit={submit}
                noValidate
              >
                <h3 id="education-add-title">
                  {editing
                    ? t('candidate.profile.education.editTitle')
                    : t('candidate.profile.education.newTitle')}
                </h3>
                <FormError message={error} />
                <CatalogStatusNotice status={catalogStatus} />
                <div className="grid two">
                  <div className="field">
                    <label htmlFor="educationType">{t('candidate.profile.education.type')}</label>
                    <select
                      ref={form.firstField}
                      id="educationType"
                      name="educationType"
                      value={draft.educationType}
                      onChange={(e) => setDraft({ ...draft, educationType: e.target.value })}
                      required
                    >
                      <option value="" disabled>
                        {t('candidate.profile.option.select')}
                      </option>
                      {typeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="degree">{t('candidate.profile.education.degree')}</label>
                    <input
                      id="degree"
                      name="degree"
                      value={draft.degree}
                      onChange={(e) => setDraft({ ...draft, degree: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="specialty">{t('candidate.profile.education.specialty')}</label>
                    <input
                      id="specialty"
                      name="specialty"
                      value={draft.specialty}
                      onChange={(e) => setDraft({ ...draft, specialty: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="institution">
                      {t('candidate.profile.education.institution')}
                    </label>
                    <input
                      id="institution"
                      name="institution"
                      value={draft.institution}
                      onChange={(e) => setDraft({ ...draft, institution: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="endYear">{t('candidate.profile.education.endYear')}</label>
                    <input
                      id="endYear"
                      name="endYear"
                      type="number"
                      value={draft.endYear ?? ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          endYear: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="education-status">
                      {t('candidate.profile.education.status')}
                    </label>
                    <select
                      id="education-status"
                      name="status"
                      value={draft.status}
                      onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                      required
                    >
                      <option value="" disabled>
                        {t('candidate.profile.option.select')}
                      </option>
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button
                    className="button"
                    type="submit"
                    disabled={saving || !!catalogStatus.message}
                    aria-busy={saving}
                  >
                    {editing
                      ? t('candidate.profile.education.update')
                      : t('candidate.profile.education.add')}
                  </button>
                  <button className="button secondary" type="button" onClick={clearForm}>
                    {editing
                      ? t('candidate.profile.action.cancelEdit')
                      : t('candidate.profile.action.cancelNew')}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}
      </section>
    </CandidatePanel>
  );
}
