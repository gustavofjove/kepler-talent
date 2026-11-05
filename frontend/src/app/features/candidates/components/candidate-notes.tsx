import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SessionExpiredNotice } from '../../../core/auth/session-expired-notice';
import { useSessionRetry } from '../../../core/auth/use-session-retry';
import { usePermission, useServices } from '../../../core/di/services-context';
import { formatDate } from '../../../core/i18n/format';
import { errorText } from '../../../core/i18n/translatable-error';
import { useErrorToast } from '../../../core/services/use-error-toast';
import { FormError } from '../../../shared/components/form-error';
import type { CandidateNote } from '../models/candidate.models';
import { useCandidateNotes } from '../use-candidate-notes';
import './candidate-notes.css';

interface Props {
  candidateId: string;
  initialNotes: CandidateNote[];
  /** True unless the Notas panel is in edit mode (KTL-29); the actions still apply at once. */
  readOnly?: boolean;
  /** Reports unsaved input: a new note being typed or a note being edited. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function CandidateNotes({
  candidateId,
  initialNotes,
  readOnly = false,
  onDirtyChange,
}: Props) {
  const { t } = useTranslation();
  const { confirmDialogService } = useServices();
  const canUpdate = usePermission('candidates.update');
  const canEdit = !readOnly && canUpdate;
  const notesService = useCandidateNotes();
  const notifyError = useErrorToast();
  const session = useSessionRetry();
  const notes = notesService.list(candidateId);
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [error, setError] = useState('');
  const dirty = canEdit && (body.trim() !== '' || editing !== null);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Leaving edit mode drops unsaved input, as closing the panel and a confirmed discard both mean.
  useEffect(() => {
    if (canEdit) return;
    setBody('');
    setEditing(null);
    setError('');
  }, [canEdit]);

  useEffect(
    () => notesService.hydrate(candidateId, initialNotes),
    [candidateId, initialNotes, notesService],
  );

  const report = (cause: unknown): void => {
    // KTL-46: a session that ended keeps the typed note; the user repeats the action after
    // signing in again.
    if (session.handle(cause)) {
      setError('');
      return;
    }
    const message = errorText(cause, t);
    setError(message);
    notifyError(cause, message);
  };

  const add = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    try {
      await notesService.add(candidateId, body);
      setBody('');
      setError('');
    } catch (cause) {
      report(cause);
    }
  };

  const save = async (noteId: string): Promise<void> => {
    try {
      await notesService.update(candidateId, noteId, editBody);
      setEditing(null);
      setError('');
    } catch (cause) {
      report(cause);
    }
  };

  const retire = async (noteId: string): Promise<void> => {
    const confirmed = await confirmDialogService.confirm({
      title: t('candidate.profile.notes.retireTitle'),
      message: t('candidate.profile.notes.retireMessage'),
      confirmText: t('candidate.profile.notes.retire'),
      cancelText: t('candidate.detail.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await notesService.retire(candidateId, noteId);
      setError('');
    } catch (cause) {
      report(cause);
    }
  };

  return (
    <section className="section-block candidate-notes" data-testid="candidate-notes">
      <SessionExpiredNotice session={session} />
      <FormError message={error} />
      {!notes.length ? <p className="empty-state">{t('candidate.profile.notes.empty')}</p> : null}
      <div className="item-list">
        {notes.map((note) => (
          <article className="item-row candidate-note" key={note.id}>
            {editing === note.id ? (
              <textarea
                name="noteEditBody"
                data-testid={`candidate-note-edit-${note.id}`}
                rows={4}
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
              />
            ) : (
              <p className="candidate-note-body">{note.body}</p>
            )}
            <p className="muted">
              {t('candidate.profile.notes.author', {
                author: note.authorDisplayName || t('candidate.profile.notes.unknownAuthor'),
                date: formatDate(note.createdAt, { dateStyle: 'short', timeStyle: 'short' }),
              })}
            </p>
            {canEdit ? (
              <div className="toolbar">
                {editing === note.id ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void save(note.id)}
                  >
                    {t('candidate.profile.notes.save')}
                  </button>
                ) : (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      setEditing(note.id);
                      setEditBody(note.body);
                    }}
                  >
                    {t('candidate.profile.notes.edit')}
                  </button>
                )}
                <button
                  className="button danger"
                  type="button"
                  onClick={() => void retire(note.id)}
                >
                  {t('candidate.profile.notes.retire')}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {canEdit ? (
        <form onSubmit={add} noValidate>
          <label htmlFor="candidate-note-body">{t('candidate.profile.notes.body')}</label>
          <textarea
            id="candidate-note-body"
            name="noteBody"
            data-testid="candidate-note-body"
            rows={4}
            maxLength={4000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button className="button" type="submit">
            {t('candidate.profile.notes.add')}
          </button>
        </form>
      ) : null}
    </section>
  );
}
