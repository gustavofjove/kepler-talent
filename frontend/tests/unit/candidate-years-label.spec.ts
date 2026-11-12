import { detailText } from '../../src/app/features/candidates/components/candidate-relation-section.logic';
import { i18n } from '../../src/app/core/i18n/i18n';
import type { PickerItem } from '../../src/app/features/catalogs/components/catalog-value-picker.logic';

describe('program duration labels', () => {
  it.each([undefined, null, '', 0])('omits missing and zero years: %s', (value) => {
    expect(
      detailText(
        'yearsExperience',
        {
          key: 'x',
          value: 'Program',
          level: '',
          details: { yearsExperience: value },
        } as unknown as PickerItem,
        i18n.t.bind(i18n),
      ),
    ).toBeUndefined();
  });
  it('keeps positive singular and plural labels', () => {
    expect(
      detailText(
        'yearsExperience',
        { key: 'x', value: 'Program', level: '', details: { yearsExperience: 1 } },
        i18n.t.bind(i18n),
      ),
    ).toBe('1 año');
    expect(
      detailText(
        'yearsExperience',
        { key: 'x', value: 'Program', level: '', details: { yearsExperience: 3 } },
        i18n.t.bind(i18n),
      ),
    ).toBe('3 años');
  });
});
