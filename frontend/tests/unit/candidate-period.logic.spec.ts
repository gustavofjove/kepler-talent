import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { i18n } from '../../src/app/core/i18n/i18n';
import {
  educationPeriod,
  experiencePeriod,
  experienceYears,
  shownExperienceYears,
  todayIso,
} from '../../src/app/features/candidates/components/candidate-period.logic';
import type {
  CandidateEducation,
  CandidateExperience,
} from '../../src/app/features/candidates/models/candidate.models';
import { repoRoot } from '../repo-root';

/** The cases the API's `ExperienceYearsTests` reads too (KTL-46 design D4). */
interface YearsCase {
  name: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  today: string;
  years: number | null;
}
const yearsCases = JSON.parse(
  readFileSync(
    resolve(repoRoot, 'backend/Tests/Fixtures/ktl-46/experience-years-cases.json'),
    'utf8',
  ),
) as YearsCase[];

const t = i18n.t.bind(i18n);

const experience = (overrides: Partial<CandidateExperience> = {}): CandidateExperience => ({
  id: 'x1',
  company: 'Kepler',
  position: 'Técnico',
  sector: 'Industria',
  isCurrent: false,
  ...overrides,
});

const education = (endYear?: number): CandidateEducation => ({
  id: 'e1',
  educationType: 'Grado',
  degree: 'Grado en ADE',
  institution: 'UCM',
  status: 'Finalizada',
  endYear,
});

describe('candidate periods', () => {
  it('spans an experience from its start month to its end month', () => {
    expect(
      experiencePeriod(experience({ startDate: '2019-03-01', endDate: '2024-06-30' }), t),
    ).toBe('2019 (mar) – 2024 (jun)');
    expect(
      experiencePeriod(experience({ startDate: '2020-01-01', endDate: '2020-12-01' }), t),
    ).toBe('2020 (ene) – 2020 (dic)');
  });

  it('shows a single month when only one is known or both are the same', () => {
    expect(experiencePeriod(experience({ startDate: '2019-03-01' }), t)).toBe('2019 (mar)');
    expect(experiencePeriod(experience({ endDate: '2024-06-30' }), t)).toBe('2024 (jun)');
    expect(
      experiencePeriod(experience({ startDate: '2024-06-01', endDate: '2024-06-30' }), t),
    ).toBe('2024 (jun)');
  });

  it('runs a current role to the present, and has no period without dates', () => {
    expect(
      experiencePeriod(
        experience({ startDate: '2020-01-01', endDate: '2023-01-01', isCurrent: true }),
        t,
      ),
    ).toBe('2020 (ene) – actualidad');
    expect(experiencePeriod(experience({ isCurrent: true }), t)).toBeUndefined();
    expect(experiencePeriod(experience(), t)).toBeUndefined();
  });

  it('gives education its end year, when it has one', () => {
    expect(educationPeriod(education(2020), t)).toBe('2020');
    expect(educationPeriod(education(), t)).toBeUndefined();
  });
});

describe('experience years', () => {
  it.each(yearsCases.map((item) => [item.name, item] as const))(
    'works out %s as the API does',
    (_name, item) => {
      expect(
        experienceYears(
          {
            startDate: item.startDate ?? undefined,
            endDate: item.endDate ?? undefined,
            isCurrent: item.isCurrent,
          },
          item.today,
        ),
      ).toBe(item.years ?? undefined);
    },
  );

  it('shows the years the dates determine, whatever value the entry holds', () => {
    const current = experience({ startDate: '2024-12-01', isCurrent: true, yearsExperience: 0.5 });
    // A value typed before the dates were filled in, as the user reported.
    const typedFirst = experience({
      startDate: '2023-01-01',
      endDate: '2023-12-01',
      yearsExperience: 6,
    });
    const typedOnly = experience({ endDate: '2024-06-30', yearsExperience: 3.5 });

    expect(shownExperienceYears(current, '2026-11-04')).toBe(2);
    expect(shownExperienceYears(typedFirst, '2026-11-04')).toBe(1);
    expect(shownExperienceYears(typedOnly, '2026-11-04')).toBe(3.5);
    expect(shownExperienceYears(experience(), '2026-11-04')).toBeUndefined();
  });

  it('reads today in the user’s own calendar', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
