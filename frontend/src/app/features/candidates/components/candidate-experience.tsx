import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices } from '../../../core/di/services-context';
import { formatNumber } from '../../../core/i18n/format';
import { errorText } from '../../../core/i18n/translatable-error';
import { FormError } from '../../../shared/components/form-error';
import { RichTextEditor, RichTextView } from '../../../shared/components/rich-text-editor';
import { EXPERIENCE_FUNCTIONS_FORMATS } from '../../../shared/components/rich-text-editor.logic';
import { randomId } from '../../../shared/random-id';
import { useCatalogs } from '../../catalogs/use-catalogs';
import { CatalogStatusNotice } from '../../catalogs/components/catalog-status';
import { useCatalogStatus } from '../../catalogs/components/use-catalog-status';
import type { Candidate, CandidateExperience as ExperienceEntry } from '../models/candidate.models';
import {
  normalizeExperience,
  validateExperienceEntry,
} from '../services/candidate-relations.service';
import {
  applyEntryDraft,
  formChanged,
  optionsWithCurrent,
  replaceEntry,
  sameEntry,
} from './candidate-entry-form.logic';
import { CandidatePanel } from './candidate-panel';
import type { PanelControl } from './candidate-panel.logic';
import {
  experiencePeriod,
  experienceYears,
  shownExperienceYears,
  todayIso,
} from './candidate-period.logic';
import { MonthYearField } from './month-year-field';
import { useEntryFormDisclosure } from './use-entry-form-disclosure';
import { useEntryWrites } from './use-entry-writes';

interface Draft {
  company: string;
  position: string;
  sector: string;
  startDate: string;
  endDate: string;
  yearsExperience: number | undefined;
  isCurrent: boolean;
  functions: string;
}

const EMPTY: Draft = {
  company: '',
  position: '',
  sector: '',
  startDate: '',
  endDate: '',
  yearsExperience: undefined,
  isCurrent: false,
  functions: '',
};

const toDraft = (entry: ExperienceEntry): Draft => ({
  company: entry.company,
  position: entry.position,
  sector: entry.sector ?? '',
  startDate: entry.startDate ?? '',
  endDate: entry.endDate ?? '',
  yearsExperience: entry.yearsExperience ?? undefined,
  isCurrent: entry.isCurrent,
  functions: entry.functions ?? '',
});

/** At most one decimal, and none for a whole number: `5,3`, `10`. */
const UP_TO_ONE_DECIMAL = { maximumFractionDigits: 1 };

interface Props {
  candidate: Candidate;
  control: PanelControl;
}

/**
 * Experiencia as a candidate page panel (KTL-29): read-only rows, or in edit mode a form whose
 * «Añadir experiencia» and «Actualizar experiencia» save at once, as «Quitar» does after a
 * confirmation (KTL-46 follow-up). «Editar» on a row loads it into the form; «Cancelar edición»
 * only empties the form. «Hecho» in the panel header closes the panel. Since KTL-46 each entry carries a
 * rich-text description, shown read-only as an accordion row, and its years are worked out from
 * the dates when they determine them.
 */
export function CandidateExperience({ candidate, control }: Props) {
  const { t } = useTranslation();
  const { candidateRelationsService, confirmDialogService } = useServices();
  const catalogs = useCatalogs();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  // A new key loads another value into the description editor, which reads its value once.
  const [formKey, setFormKey] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const ids = useId();
  const experience = candidate.experience;
  const { write, saving, error, setError, session } = useEntryWrites<ExperienceEntry>(
    (entries) => candidateRelationsService.saveExperience(candidate.id, entries),
    'candidate.panel.saved.experience',
  );
  const form = useEntryFormDisclosure<HTMLInputElement>();
  const canEdit = control.editing;
  const editing = canEdit ? experience.find((item) => item.id === editingId) : undefined;
  // Only what is typed in the open form is unsaved: every entry change is already written.
  const dirty = canEdit && form.open && formChanged(draft, editing ? toDraft(editing) : EMPTY);
  const { onDirtyChange } = control;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const today = todayIso();
  const workedOutYears = experienceYears(draft, today);

  // Entering or leaving edit mode collapses the rows again, and leaving it («Hecho», or opening
  // another panel) drops what is typed, as in Notas.
  useEffect(() => {
    setExpanded(new Set());
    if (control.editing) return;
    setDraft(EMPTY);
    setEditingId(null);
    setError('');
    form.hide();
    // `form.hide` only sets state; listing it would rerun this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [control.editing, setError]);

  const catalogStatus = useCatalogStatus();
  const sectorOptions = optionsWithCurrent(catalogs.activeNames('sector'), draft.sector);

  const loadForm = (next: Draft, id: string | null): void => {
    setDraft(next);
    setEditingId(id);
    setFormKey((key) => key + 1);
    setError('');
  };

  /** Empties the form and hides it again behind «Nueva experiencia». */
  const clearForm = (): void => {
    loadForm(EMPTY, null);
    form.hide();
  };

  const startNew = (): void => {
    loadForm(EMPTY, null);
    form.show();
  };

  const startEdit = (entry: ExperienceEntry): void => {
    loadForm(toDraft(entry), entry.id);
    form.show();
  };

  const toggle = (id: string): void =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const entry = normalizeExperience(
      editing ? applyEntryDraft(editing, draft) : { ...draft, id: randomId() },
    );
    try {
      validateExperienceEntry(entry);
    } catch (err) {
      setError(errorText(err, t));
      return;
    }
    if (editing && sameEntry(entry, editing)) {
      clearForm();
      return;
    }
    void write(editing ? replaceEntry(experience, entry) : [...experience, entry], clearForm);
  };

  const remove = async (entry: ExperienceEntry): Promise<void> => {
    const confirmed = await confirmDialogService.confirm({
      title: t('candidate.profile.experience.removeTitle'),
      message: t('candidate.profile.experience.removeMessage', {
        position: entry.position,
        company: entry.company,
      }),
      confirmText: t('candidate.profile.action.remove'),
      cancelText: t('candidate.detail.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    await write(
      experience.filter((item) => item.id !== entry.id),
      () => {
        if (entry.id === editingId) clearForm();
      },
    );
  };

  // Read-only rows line up with the arrowed ones whenever any row can expand.
  const anyExpandable = experience.some((item) => item.functions);

  const summary = (item: ExperienceEntry, spacer = false) => {
    const period = experiencePeriod(item, t);
    const years = shownExperienceYears(item, today);
    return (
      <p className="item-main">
        {spacer ? <span className="item-toggle__spacer" aria-hidden="true" /> : null}
        {/* No column is reserved: a row without dates starts at the left (KTL-46 follow-up). */}
        {period ? (
          <span className="item-period item-period--months" data-testid="experience-period">
            {period}
          </span>
        ) : null}
        <span className="badge">{item.position}</span> {item.company}
        {item.sector ? ` (${item.sector})` : ''}
        {/* A current role with a period already reads «2019–actualidad». */}
        {item.isCurrent && !period ? ` · ${t('candidate.profile.experience.currentBadge')}` : ''}
        {years !== undefined
          ? ` · ${t('candidate.profile.yearsCount', { count: years, years: formatNumber(years, UP_TO_ONE_DECIMAL) })}`
          : ''}
      </p>
    );
  };

  return (
    <CandidatePanel
      id="experience"
      title={t('candidate.profile.experience.title')}
      control={control}
      mode="actions"
      session={session}
    >
      <section className="section-block" data-testid="candidate-experience">
        {!experience.length ? (
          <p className="empty-state">{t('candidate.profile.experience.empty')}</p>
        ) : null}
        <div className="item-list">
          {experience.map((item) => {
            if (canEdit) {
              return (
                <div
                  className={item.id === editing?.id ? 'item-row is-editing' : 'item-row'}
                  key={item.id}
                >
                  {summary(item)}
                  <div className="item-actions">
                    <button
                      className="button secondary"
                      type="button"
                      data-testid="experience-edit"
                      aria-label={t('candidate.profile.experience.editLabel', {
                        position: item.position,
                        company: item.company,
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
                </div>
              );
            }
            if (!item.functions) {
              return (
                <div className="item-row" key={item.id}>
                  {summary(item, anyExpandable)}
                </div>
              );
            }
            const open = expanded.has(item.id);
            const regionId = `${ids}-description-${item.id}`;
            return (
              <div className="item-row item-row--disclosure" key={item.id}>
                <button
                  className="item-toggle"
                  type="button"
                  data-testid="experience-toggle"
                  aria-expanded={open}
                  aria-controls={regionId}
                  onClick={() => toggle(item.id)}
                >
                  {/* Before the title: points right, and down once expanded. */}
                  <span className="item-toggle__chevron" aria-hidden="true" />
                  {summary(item)}
                </button>
                {open ? (
                  <RichTextView
                    id={regionId}
                    html={item.functions}
                    testId="experience-description"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        {canEdit ? (
          // Under the rule: «Nueva experiencia» until the form is asked for (KTL-46 follow-up).
          <div className="candidate-add-form" data-testid="experience-add-area">
            {!form.open ? (
              <>
                {/* A refused «Quitar» still needs its message while the form is hidden. */}
                <FormError message={error} />
                <button
                  ref={form.opener}
                  className="button secondary"
                  type="button"
                  data-testid="experience-new"
                  onClick={startNew}
                >
                  {t('candidate.profile.experience.newTitle')}
                </button>
              </>
            ) : (
              <form
                className="section-block candidate-entry-form"
                aria-labelledby="experience-add-title"
                data-testid="experience-add-form"
                onSubmit={submit}
                noValidate
              >
                <h3 id="experience-add-title">
                  {editing
                    ? t('candidate.profile.experience.editTitle')
                    : t('candidate.profile.experience.newTitle')}
                </h3>
                <FormError message={error} />
                <CatalogStatusNotice status={catalogStatus} />
                <div className="grid three">
                  <div className="field">
                    <label htmlFor="company">{t('candidate.profile.experience.company')}</label>
                    <input
                      ref={form.firstField}
                      id="company"
                      name="company"
                      value={draft.company}
                      onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="position">{t('candidate.profile.experience.position')}</label>
                    <input
                      id="position"
                      name="position"
                      value={draft.position}
                      onChange={(e) => setDraft({ ...draft, position: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="sector">{t('candidate.profile.experience.sector')}</label>
                    <select
                      id="sector"
                      name="sector"
                      value={draft.sector}
                      onChange={(e) => setDraft({ ...draft, sector: e.target.value })}
                    >
                      {/* Optional since the KTL-46 follow-up: the empty option clears it. */}
                      <option value="">{t('candidate.profile.experience.sectorNone')}</option>
                      {sectorOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Month and year only (KTL-46 follow-up); stored as the month's first day. */}
                  <div className="field" data-testid="experience-start-date">
                    <MonthYearField
                      key={`start-${formKey}`}
                      legend={t('candidate.profile.experience.startDate')}
                      name="startDate"
                      value={draft.startDate}
                      onChange={(value) =>
                        setDraft((current) => ({ ...current, startDate: value }))
                      }
                    />
                  </div>
                  <div className="field" data-testid="experience-end-date">
                    {/* Remounted when «Puesto actual» changes, so the cleared date stays cleared. */}
                    <MonthYearField
                      key={`end-${formKey}-${draft.isCurrent}`}
                      legend={t('candidate.profile.experience.endDate')}
                      name="endDate"
                      value={draft.endDate}
                      disabled={draft.isCurrent}
                      onChange={(value) => setDraft((current) => ({ ...current, endDate: value }))}
                    />
                    {/* Under the date it governs: a current role has no end date. */}
                    <label className="inline-check experience-current">
                      <input
                        name="isCurrent"
                        type="checkbox"
                        checked={draft.isCurrent}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            isCurrent: e.target.checked,
                            endDate: e.target.checked ? '' : draft.endDate,
                          })
                        }
                      />
                      {t('candidate.profile.experience.current')}
                    </label>
                  </div>
                  <div className="field">
                    <label htmlFor="experience-years">
                      {t('candidate.profile.experience.yearsExperience')}
                    </label>
                    {workedOutYears !== undefined ? (
                      <>
                        <input
                          id="experience-years"
                          name="yearsExperience"
                          readOnly
                          aria-describedby="experience-years-hint"
                          value={formatNumber(workedOutYears, UP_TO_ONE_DECIMAL)}
                        />
                        <span id="experience-years-hint" className="field-hint muted">
                          {t('candidate.profile.experience.yearsCalculated')}
                        </span>
                      </>
                    ) : (
                      <input
                        id="experience-years"
                        name="yearsExperience"
                        type="number"
                        min="0"
                        step="0.1"
                        value={draft.yearsExperience ?? ''}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            yearsExperience:
                              e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    )}
                  </div>
                  <div className="field span-all">
                    <span className="field-label" id="experience-functions-label">
                      {t('candidate.profile.experience.functions')}
                    </span>
                    <RichTextEditor
                      key={formKey}
                      value={draft.functions}
                      onChange={(html) => setDraft((current) => ({ ...current, functions: html }))}
                      formats={EXPERIENCE_FUNCTIONS_FORMATS}
                      name="functions"
                      ariaLabel={t('candidate.profile.experience.functions')}
                      placeholder={t('candidate.profile.experience.functionsPlaceholder')}
                      testId="experience-functions-editor"
                      namespace="ExperienceFunctions"
                      resizable
                    />
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
                      ? t('candidate.profile.experience.update')
                      : t('candidate.profile.experience.add')}
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
