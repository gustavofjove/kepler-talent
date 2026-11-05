import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../core/i18n/format';
import { joinMonthYear, splitMonthYear, yearOptions } from './month-year-field.logic';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

interface Props {
  /** `fieldset` legend, e.g. «Fecha inicio». */
  legend: string;
  /** Prefix of the selects' `name=`: `${name}Month`, `${name}Year`. */
  name: string;
  /** A `YYYY-MM-DD` date; only its month and year are shown. */
  value: string;
  /** Receives `YYYY-MM-01` once both parts are chosen, `''` when either is cleared. */
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * An experience date as a month and a year (KTL-46 follow-up): two selects rather than a native
 * month picker, which desktop Firefox and Safari render as a plain text box. A half-chosen date is
 * kept here and reported as empty. It reads `value` once: remount it with a new `key` to load
 * another value or to clear it.
 */
export function MonthYearField({ legend, name, value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const [parts, setParts] = useState(() => splitMonthYear(value));

  const change = (next: { month: string; year: string }): void => {
    setParts(next);
    onChange(joinMonthYear(next.month, next.year));
  };

  return (
    <fieldset className="month-year-field" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="month-year-field__controls">
        <select
          name={`${name}Month`}
          aria-label={t('candidate.profile.experience.month')}
          value={parts.month}
          onChange={(e) => change({ ...parts, month: e.target.value })}
        >
          <option value="">{t('candidate.profile.experience.month')}</option>
          {MONTHS.map((month) => (
            <option key={month} value={String(month)}>
              {formatDate(new Date(2000, month - 1, 1), { month: 'long' })}
            </option>
          ))}
        </select>
        <select
          name={`${name}Year`}
          aria-label={t('candidate.profile.experience.year')}
          value={parts.year}
          onChange={(e) => change({ ...parts, year: e.target.value })}
        >
          <option value="">{t('candidate.profile.experience.year')}</option>
          {yearOptions(new Date(), parts.year).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
