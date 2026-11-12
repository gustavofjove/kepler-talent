import { TranslatableError } from '../../../core/i18n/translatable-error';
import type { CandidateDraft } from '../models/candidate.models';
import { AppError } from '../../../shared/models/error.models';

export function contactError(error: unknown): never {
  if (error instanceof AppError) {
    const keys: Record<string, string> = {
      'candidate.email.invalid': 'candidate.contact.email',
      'candidate.phone.characters': 'candidate.contact.characters',
      'candidate.phone.too_short': 'candidate.contact.short',
    };
    const issues = error.details?.['errors'];
    const code = Array.isArray(issues) ? issues[0]?.code : error.backendCode;
    if (typeof code === 'string' && keys[code]) throw new TranslatableError(keys[code]);
  }
  throw error;
}

export function validatedContacts(draft: CandidateDraft): CandidateDraft {
  const email = draft.email.trim();
  const phone = draft.phone.trim();
  if (email.length > 255 || phone.length > 40) {
    throw new TranslatableError('candidate.contact.long');
  }
  if (email && !/^[^\s@<>,;]+@[^\s@<>,;]+$/.test(email)) {
    throw new TranslatableError('candidate.contact.email');
  }
  if (phone && !/^[0-9+()\p{White_Space}]+$/u.test(phone)) {
    throw new TranslatableError('candidate.contact.characters');
  }
  if (phone && (phone.match(/[0-9]/g)?.length ?? 0) < 9) {
    throw new TranslatableError('candidate.contact.short');
  }
  return { ...draft, email, phone };
}
