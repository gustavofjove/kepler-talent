import { i18n } from '../../src/app/core/i18n/i18n';
import { formatDate, formatDay, formatNumber } from '../../src/app/core/i18n/format';
import { errorText, TranslatableError } from '../../src/app/core/i18n/translatable-error';
import { catalogLabel } from '../../src/app/features/catalogs/catalog-label';

describe('i18n foundation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps Spanish active when the browser prefers English', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');

    expect(i18n.language).toBe('es');
    expect(i18n.t('candidate.profile.languages.title')).toBe('Idiomas');
  });

  it('interpolates values', () => {
    expect(i18n.t('candidate.profile.yearsCount', { count: 3, years: 3 })).toBe('3 años');
    expect(i18n.t('candidate.profile.yearsCount', { count: 1, years: 1 })).toBe('1 año');
  });

  it('resolves every CV preview message', () => {
    for (const key of [
      'title',
      'document',
      'loading',
      'unsupported',
      'pending',
      'error',
      'refused',
      'legacyUnavailable',
      'failure',
      'retry',
      'download',
      'viewerLabel',
      'fallback',
    ]) {
      expect(i18n.t(`candidate.profile.preview.${key}`)).not.toContain('candidate.profile.preview');
    }
  });

  // KTL-22: these keys are built at runtime, so a typo would only surface on the screen.
  it('resolves every candidate document state and availability key', () => {
    for (const key of [
      'state.pending',
      'state.refused',
      'state.error',
      'state.legacy',
      'explanation.error',
      'explanation.refused',
      'explanation.legacy',
    ]) {
      expect(i18n.t(`candidate.profile.documents.${key}`)).not.toContain('candidate.profile');
    }
    for (const state of ['unknown', 'available', 'unavailable']) {
      expect(i18n.t(`candidate.availability.state.${state}`)).not.toContain(
        'candidate.availability',
      );
    }
    for (const key of ['titleNew', 'newHint']) {
      expect(i18n.t(`candidate.edit.${key}`)).not.toContain('candidate.edit');
    }
    for (const key of [
      'edit',
      'save',
      'cancel',
      'done',
      'doneAria',
      'saved.main',
      'discardTitle',
      'leaveTitle',
    ]) {
      expect(i18n.t(`candidate.panel.${key}`)).not.toContain('candidate.panel');
    }
    for (const key of [
      'ariaLabel',
      'candidates',
      'positions',
      'admin',
      'presets',
      'edit',
      'newCandidate',
      'newPosition',
      'newPreset',
    ]) {
      expect(i18n.t(`breadcrumb.${key}`)).not.toContain('breadcrumb.');
    }
  });

  // KTL-24: the picker's add labels are reached through the criteria and relation tables.
  it('resolves every catalog picker key', () => {
    for (const kind of ['skill', 'language', 'program', 'tag']) {
      expect(i18n.t(`catalogPicker.add.${kind}`)).toMatch(/^Añadir .+…$/);
    }
    for (const key of ['noResults', 'level', 'pending', 'retry']) {
      expect(i18n.t(`catalogPicker.${key}`)).not.toContain('catalogPicker');
    }
    expect(i18n.t('catalogPicker.remove', { value: 'Inglés' })).toBe('Quitar Inglés');
    expect(i18n.t('search.criteria.mode.label', { label: 'Idiomas' })).toBe(
      'Coincidencia de Idiomas',
    );
  });

  it('fails the test run on a missing key, naming it', () => {
    expect(() => i18n.t('candidate.profile.does.not.exist')).toThrow(
      /candidate\.profile\.does\.not\.exist/,
    );
  });

  describe('TranslatableError', () => {
    it('exposes its key and the Spanish message', () => {
      const error = new TranslatableError('candidate.profile.languages.duplicate');

      expect(error).toBeInstanceOf(Error);
      expect(error.key).toBe('candidate.profile.languages.duplicate');
      expect(error.message).toBe('El candidato ya tiene este idioma registrado.');
    });
  });

  describe('errorText', () => {
    it('resolves a keyed error through the translation function', () => {
      const error = new TranslatableError('candidate.profile.yearsCount', { count: 2, years: 2 });

      expect(errorText(error, i18n.t)).toBe('2 años');
    });

    it('falls back to the message of a plain error', () => {
      expect(errorText(new Error('Fallo de red'), i18n.t)).toBe('Fallo de red');
    });
  });

  it('labels catalog values with the Spanish name', () => {
    expect(catalogLabel({ nameEs: 'Inglés', nameEn: 'English' })).toBe('Inglés');
  });

  it('formats dates and numbers with the active language', () => {
    expect(
      formatDate('2024-06-01T12:00:00Z', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }),
    ).toBe('1 de junio de 2024');
    expect(formatNumber(12345.5)).toBe('12.345,5');
  });

  it('formats a calendar day in Spanish without shifting it by time zone (KTL-34)', () => {
    expect(formatDay('2026-09-01')).toBe('1 sept 2026');
    expect(formatDay('2026-09-01', { dateStyle: 'short' })).toBe('1/9/26');
    // A malformed or impossible value is shown as stored instead of throwing.
    expect(formatDay('01/09/2026')).toBe('01/09/2026');
    expect(formatDay('2026-13-45')).toBe('2026-13-45');
  });

  it('keeps an impossible day as stored instead of rolling it over (KTL-34)', () => {
    // V8 parses these as 2 March, 1 March and 1 May; they must not show as another date.
    for (const value of ['2026-02-30', '2025-02-29', '2026-04-31', '2026-06-00'])
      expect(formatDay(value)).toBe(value);
    // A real 29 February still formats.
    expect(formatDay('2024-02-29')).toBe('29 feb 2024');
  });
});
