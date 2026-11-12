import type { CandidateEducation, CandidateExperience } from '../models/candidate.models';

export function sortedEducation(entries: readonly CandidateEducation[]): CandidateEducation[] {
  return [...entries].sort((a, b) => (b.endYear ?? -Infinity) - (a.endYear ?? -Infinity));
}

export function sortedExperience(entries: readonly CandidateExperience[]): CandidateExperience[] {
  const date = (entry: CandidateExperience) =>
    (entry.isCurrent ? entry.startDate : entry.endDate || entry.startDate) ?? '';
  return [...entries].sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) ||
      date(b).localeCompare(date(a)) ||
      (b.startDate ?? '').localeCompare(a.startDate ?? ''),
  );
}
