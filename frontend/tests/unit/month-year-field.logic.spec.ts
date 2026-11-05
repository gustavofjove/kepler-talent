import {
  FIRST_YEAR,
  joinMonthYear,
  splitMonthYear,
  yearOptions,
} from '../../src/app/features/candidates/components/month-year-field.logic';

describe('month and year of an experience date', () => {
  it('reads the month and year of a stored date and ignores its day', () => {
    expect(splitMonthYear('2019-03-15')).toEqual({ month: '3', year: '2019' });
    expect(splitMonthYear('')).toEqual({ month: '', year: '' });
    expect(splitMonthYear(undefined)).toEqual({ month: '', year: '' });
  });

  it('writes the first day of the month, and nothing until both parts are chosen', () => {
    expect(joinMonthYear('3', '2019')).toBe('2019-03-01');
    expect(joinMonthYear('12', '2023')).toBe('2023-12-01');
    expect(joinMonthYear('3', '')).toBe('');
    expect(joinMonthYear('', '2019')).toBe('');
  });

  it('offers this year down to the first year, keeping an older stored year', () => {
    const years = yearOptions(new Date(2026, 10, 5), '');
    // An experience date cannot be in the future, so no later year is offered.
    expect(years[0]).toBe('2026');
    expect(years.at(-1)).toBe(String(FIRST_YEAR));
    expect(yearOptions(new Date(2026, 10, 5), '1948')[0]).toBe('1948');
  });
});
