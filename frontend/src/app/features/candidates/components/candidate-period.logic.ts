import type { TFunction } from 'i18next';
import type { CandidateEducation, CandidateExperience } from '../models/candidate.models';

/** «2019–2024», or the one year known (also when both are the same); undefined without either. */
function yearRange(t: TFunction, start?: number, end?: number): string | undefined {
  if (start !== undefined && end !== undefined && start !== end) {
    return t('candidate.profile.period.range', { start, end });
  }
  const only = end ?? start;
  return only === undefined ? undefined : String(only);
}

/** Education keeps only an end year, so its period is that year. */
export function educationPeriod(entry: CandidateEducation, t: TFunction): string | undefined {
  return yearRange(t, undefined, entry.endYear);
}

const MAX_EXPERIENCE_YEARS = 100;

/** Year × 12 + month of a `YYYY-MM…` date; its day, if any, does not count. */
function monthNumber(date: string | undefined | null): number | undefined {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? '');
  if (!match) return undefined;
  return Number(match[1]) * 12 + Number(match[2]);
}

/** Today as `YYYY-MM-DD` in the user's own calendar. */
export function todayIso(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The years an experience's dates determine (KTL-46 design D4): the months from the start month to
 * the end month, both included, / 12, rounded to one decimal; a current role runs to `today`'s
 * month. Undefined when the dates do not determine them, and the years are then typed by hand.
 * Mirrors `ExperienceYears.From` in the API; both are tested on
 * `backend/Tests/Fixtures/ktl-46/experience-years-cases.json`.
 */
export function experienceYears(
  entry: Pick<CandidateExperience, 'startDate' | 'endDate' | 'isCurrent'>,
  today: string,
): number | undefined {
  const start = monthNumber(entry.startDate);
  const end = monthNumber(entry.isCurrent ? today : entry.endDate);
  if (start === undefined || end === undefined || end < start) return undefined;
  return Math.min(Math.round(((end - start + 1) / 12) * 10) / 10, MAX_EXPERIENCE_YEARS);
}

/**
 * The years a row shows. Whenever the dates determine them they are worked out, as the API will
 * store them: a staged entry may still hold a value typed before its dates were filled in, and a
 * current role's years grow every day. Only an entry whose dates do not determine them shows the
 * value typed by hand.
 */
export function shownExperienceYears(
  entry: CandidateExperience,
  today: string,
): number | undefined {
  return experienceYears(entry, today) ?? entry.yearsExperience ?? undefined;
}

/** «2020 (ene)» for a `YYYY-MM…` date; undefined without a usable year and month. */
function monthYear(date: string | undefined | null, t: TFunction): string | undefined {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? '');
  const month = Number(match?.[2]);
  if (!match || Number(match[1]) <= 0 || month < 1 || month > 12) return undefined;
  return t('candidate.profile.period.monthYear', {
    year: match[1],
    month: t(`candidate.profile.month.${month}`),
  });
}

/**
 * The months an experience spans, from its dates (KTL-46 follow-up): «2020 (ene) – 2020 (dic)»,
 * the one month known (also when both are the same), or «2019 (mar) – actualidad» for a current
 * role. One with no start date has no period, and its row keeps the «Actual» marker instead.
 */
export function experiencePeriod(entry: CandidateExperience, t: TFunction): string | undefined {
  const start = monthYear(entry.startDate, t);
  if (entry.isCurrent) {
    return start === undefined ? undefined : t('candidate.profile.period.current', { start });
  }
  const end = monthYear(entry.endDate, t);
  if (start !== undefined && end !== undefined && start !== end) {
    return t('candidate.profile.period.range', { start, end });
  }
  return end ?? start;
}
