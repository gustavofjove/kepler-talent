import { validatedContacts } from '../../src/app/features/candidates/services/candidate-contact.rules';
import type { CandidateDraft } from '../../src/app/features/candidates/models/candidate.models';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../repo-root';

const draft = (email: string, phone: string) => ({ email, phone }) as CandidateDraft;

describe('candidate contacts', () => {
  it('matches the shared backend contact acceptance cases', () => {
    const cases = JSON.parse(
      readFileSync(resolve(repoRoot, 'backend/Tests/Fixtures/ktl-48/contact-cases.json'), 'utf8'),
    ) as { email: string; phone: string; accepted: boolean }[];
    for (const item of cases) {
      if (item.accepted)
        expect(() => validatedContacts(draft(item.email, item.phone))).not.toThrow();
      else expect(() => validatedContacts(draft(item.email, item.phone))).toThrow();
    }
  });
  it.each(['', '612345678', '+34 (612) 345 678'])('accepts optional or valid phone %s', (phone) => {
    expect(validatedContacts(draft('', phone)).phone).toBe(phone);
  });
  it.each(['61234567', '+(12) 345 678', '+++()', '612-345-678', '612.345.678', '612345678 ext 1'])(
    'rejects invalid phone %s',
    (phone) => {
      expect(() => validatedContacts(draft('', phone))).toThrow();
    },
  );
  it.each([
    'ana',
    'ana@',
    '@example.com',
    'ana@@example.com',
    'ana perez@example.com',
    'Ana <ana@example.com>',
  ])('rejects invalid email %s', (email) => {
    expect(() => validatedContacts(draft(email, ''))).toThrow();
  });
  it('trims contacts without mutating the draft', () => {
    const input = draft(' ana.perez+rrhh@example.com ', ' +34 (612) 345 678 ');
    const result = validatedContacts(input);
    expect(result.email).toBe('ana.perez+rrhh@example.com');
    expect(result.phone).toBe('+34 (612) 345 678');
    expect(input.phone).toBe(' +34 (612) 345 678 ');
  });
});
