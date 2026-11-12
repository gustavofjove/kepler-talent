import {
  sortedEducation,
  sortedExperience,
} from '../../src/app/features/candidates/components/candidate-history.logic';
import type {
  CandidateEducation,
  CandidateExperience,
} from '../../src/app/features/candidates/models/candidate.models';

describe('candidate history ordering', () => {
  it('sorts education newest first with stable ties and without mutating the source', () => {
    const entries = [
      { id: 'old', endYear: 2020 },
      { id: 'none' },
      { id: 'new-a', endYear: 2024 },
      { id: 'new-b', endYear: 2024 },
    ] as CandidateEducation[];
    expect(sortedEducation(entries).map((e) => e.id)).toEqual(['new-a', 'new-b', 'old', 'none']);
    expect(entries[0].id).toBe('old');
  });
  it('groups current roles first and uses end dates with start fallback and stable ties', () => {
    const entries = [
      { id: 'end', endDate: '2020-01-01' },
      { id: 'none' },
      { id: 'current-none', isCurrent: true },
      { id: 'current-old', isCurrent: true, startDate: '2022-01-01' },
      { id: 'current-new', isCurrent: true, startDate: '2024-01-01' },
      { id: 'start', startDate: '2021-01-01' },
      { id: 'recent', endDate: '2023-01-01' },
    ].map((e) => ({ isCurrent: false, ...e })) as CandidateExperience[];
    expect(sortedExperience(entries).map((e) => e.id)).toEqual([
      'current-new',
      'current-old',
      'current-none',
      'recent',
      'start',
      'end',
      'none',
    ]);
    expect(entries[0].id).toBe('end');
  });
});
