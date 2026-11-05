import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionRetry } from '../../../core/auth/use-session-retry';
import { useServices } from '../../../core/di/services-context';
import { errorText } from '../../../core/i18n/translatable-error';

/**
 * Writes an Educación or Experiencia list at once (KTL-46 follow-up): «Añadir», «Actualizar» and
 * «Quitar» each save, as Notas and Documentos do, so there is no staged draft to revert. A refusal
 * keeps the form as typed and shows its Spanish error; a session that ended keeps it too, and
 * signing in again repeats the write.
 */
export function useEntryWrites<T>(save: (entries: T[]) => Promise<void>, savedMessageKey: string) {
  const { t } = useTranslation();
  const { toastService } = useServices();
  const session = useSessionRetry();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const write = async (entries: T[], onWritten: () => void): Promise<void> => {
    setSaving(true);
    setError('');
    try {
      await save(entries);
      onWritten();
      toastService.show(t(savedMessageKey), 'success');
    } catch (err) {
      if (!session.handle(err, () => write(entries, onWritten))) setError(errorText(err, t));
    } finally {
      setSaving(false);
    }
  };

  return { write, saving, error, setError, session };
}
