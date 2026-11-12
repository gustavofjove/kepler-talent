import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FormError } from '../../../shared/components/form-error';
import type { Candidate, CandidateDraft } from '../models/candidate.models';
import type {
  CvDraftField,
  CvDraftFields,
  CvDraftSuggestion,
} from '../models/candidate-draft.models';
import { applySuggestion, toDraft } from './candidate-form.logic';
import { validatedContacts } from '../services/candidate-contact.rules';
import { errorText } from '../../../core/i18n/translatable-error';

interface CandidateFormProps {
  saveError?: string;
  candidate?: Candidate;
  onSave: (draft: CandidateDraft) => void;
  /**
   * Set when the form is a candidate page panel (KTL-29): the panel's «Guardar» submits it by
   * this id, so the form renders no button of its own.
   */
  formId?: string;
  onDirtyChange?: (dirty: boolean) => void;
  /** Values read from a CV (KTL-32). Applied to empty fields only, each time `nonce` changes. */
  suggestion?: CvDraftSuggestion;
  /** Called after a suggestion is applied with how many fields it filled. */
  onSuggestionApplied?: (filled: number) => void;
}

/** The core record only; the other sections are panels of their own on the candidate page. */
export function CandidateForm({
  saveError,
  candidate,
  onSave,
  formId,
  onDirtyChange,
  suggestion,
  onSuggestionApplied,
}: CandidateFormProps) {
  const { t } = useTranslation();
  // Initialiser only. The parent passes `key` so switching candidate remounts
  // and resets the draft, which is what the Angular input setter did.
  const [draft, setDraft] = useState<CandidateDraft>(() => toDraft(candidate));
  const [suggested, setSuggested] = useState<CvDraftFields>({});
  const [error, setError] = useState('');
  const initial = useMemo(() => JSON.stringify(toDraft(candidate)), [candidate]);
  const dirty = JSON.stringify(draft) !== initial;

  // The latest committed draft, so a suggestion is merged against what the user has typed by now
  // rather than what they had typed when the CV was picked.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const appliedRef = useRef(onSuggestionApplied);
  appliedRef.current = onSuggestionApplied;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!suggestion) return;
    const { draft: next, filled } = applySuggestion(draftRef.current, suggestion.fields);
    setDraft(next);
    setSuggested((current) => ({ ...current, ...filled }));
    appliedRef.current?.(Object.keys(filled).length);
  }, [suggestion]);

  const set =
    (key: keyof CandidateDraft) =>
    (event: { target: { value: string } }): void => {
      setDraft((current) => ({ ...current, [key]: event.target.value }));
      // The first edit makes the value the user's: retyping the suggestion later must not mark
      // it as coming from the CV again.
      setSuggested((current) => {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key as CvDraftField];
        return next;
      });
    };

  /** A field is marked from the moment a suggestion fills it until the user first edits it. */
  const markOf = (key: CvDraftField) => suggested[key];

  const suggestedProps = (key: CvDraftField) => {
    const mark = markOf(key);
    return mark
      ? { className: 'suggested', 'aria-describedby': `${key}-suggested` }
      : { className: undefined, 'aria-describedby': undefined };
  };

  const suggestionBadge = (key: CvDraftField) => {
    const mark = markOf(key);
    if (!mark) return null;
    return (
      <span
        id={`${key}-suggested`}
        className={
          mark.confidence === 'low' ? 'badge suggestion-badge review' : 'badge suggestion-badge'
        }
        data-testid={`${key}-suggested`}
      >
        {mark.confidence === 'low'
          ? t('candidate.cvDraft.badgeReview')
          : t('candidate.cvDraft.badgeSuggested')}
      </span>
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError(t('candidate.form.nameRequired'));
      return;
    }
    setError('');
    try {
      onSave(validatedContacts(draft));
    } catch (error) {
      setError(errorText(error, t));
    }
  };

  return (
    // noValidate: the browser must not block submit, so the Spanish message at the top is
    // what users (and the e2e spec) see.
    <form id={formId} className="section-block" onSubmit={submit} noValidate>
      <FormError message={error || saveError || ''} />
      <div className="grid two">
        <div className="field">
          <label htmlFor="firstName">{t('candidate.form.firstName')}</label>
          <input
            id="firstName"
            name="firstName"
            value={draft.firstName}
            onChange={set('firstName')}
            required
            {...suggestedProps('firstName')}
          />
          {suggestionBadge('firstName')}
        </div>
        <div className="field">
          <label htmlFor="lastName">{t('candidate.form.lastName')}</label>
          <input
            id="lastName"
            name="lastName"
            value={draft.lastName}
            onChange={set('lastName')}
            required
            {...suggestedProps('lastName')}
          />
          {suggestionBadge('lastName')}
        </div>
        <div className="field">
          <label htmlFor="phone">{t('candidate.form.phone')}</label>
          <input
            id="phone"
            name="phone"
            value={draft.phone}
            onChange={set('phone')}
            {...suggestedProps('phone')}
          />
          {suggestionBadge('phone')}
        </div>
        <div className="field">
          <label htmlFor="email">{t('candidate.form.email')}</label>
          <input
            id="email"
            name="email"
            type="email"
            value={draft.email}
            onChange={set('email')}
            {...suggestedProps('email')}
          />
          {suggestionBadge('email')}
        </div>
        <div className="field">
          <label htmlFor="location">{t('candidate.form.location')}</label>
          <input
            id="location"
            name="location"
            value={draft.location}
            onChange={set('location')}
            {...suggestedProps('location')}
          />
          {suggestionBadge('location')}
        </div>
        <div className="field">
          <label htmlFor="province">{t('candidate.form.province')}</label>
          <input
            id="province"
            name="province"
            value={draft.province}
            onChange={set('province')}
            {...suggestedProps('province')}
          />
          {suggestionBadge('province')}
        </div>
        <div className="field">
          <label htmlFor="receivedAt">{t('candidate.form.receivedAt')}</label>
          <input
            id="receivedAt"
            name="receivedAt"
            type="date"
            value={draft.receivedAt}
            onChange={set('receivedAt')}
          />
        </div>
        <div className="field">
          <label htmlFor="reviewDueAt">{t('candidate.form.reviewDueAt')}</label>
          <input
            id="reviewDueAt"
            name="reviewDueAt"
            type="date"
            aria-describedby="reviewDueAt-hint"
            value={draft.reviewDueAt}
            onChange={set('reviewDueAt')}
          />
          <p id="reviewDueAt-hint" className="muted">
            {t('candidate.form.reviewDueAtHint')}
          </p>
        </div>
      </div>
      <div className="field">
        <label htmlFor="notes">{t('candidate.form.notes')}</label>
        <textarea id="notes" name="notes" rows={4} value={draft.notes} onChange={set('notes')} />
      </div>
      {formId ? null : (
        <div className="form-actions">
          <button className="button" type="submit">
            {t('candidate.form.save')}
          </button>
        </div>
      )}
    </form>
  );
}
