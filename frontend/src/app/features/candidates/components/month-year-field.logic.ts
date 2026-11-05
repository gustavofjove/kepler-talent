/** The earliest year an experience date offers. */
export const FIRST_YEAR = 1950;

/** The month (1–12) and year of a `YYYY-MM…` date, or blanks. */
export function splitMonthYear(value: string | undefined | null): { month: string; year: string } {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? '');
  return match ? { month: String(Number(match[2])), year: match[1] } : { month: '', year: '' };
}

/** The first day of that month as `YYYY-MM-01`, or `''` until both parts are chosen. */
export function joinMonthYear(month: string, year: string): string {
  return month && year ? `${year}-${month.padStart(2, '0')}-01` : '';
}

/**
 * Years from this year down to {@link FIRST_YEAR}, plus `current` when it falls outside them.
 * An experience cannot start or end in the future (KTL-46 follow-up), so no later year is offered.
 */
export function yearOptions(now: Date, current: string): string[] {
  const years: string[] = [];
  for (let year = now.getFullYear(); year >= FIRST_YEAR; year--) years.push(String(year));
  return current && !years.includes(current) ? [current, ...years] : years;
}
