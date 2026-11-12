import type { TFunction } from 'i18next';
import type { PickerItem } from '../../catalogs/components/catalog-value-picker.logic';
import type { CatalogFamily } from '../../catalogs/models/catalog.models';
import { randomId } from '../../../shared/random-id';
import type { Candidate } from '../models/candidate.models';
import {
  type CandidateRelationsService,
  validateLanguageEntry,
  validateProgramEntry,
  validateSkillEntry,
  validateTagEntry,
} from '../services/candidate-relations.service';

export type RelationKind = 'language' | 'skill' | 'program' | 'tag';

/** The detail field a relation family edits on its chip, besides the level. */
export type RelationDetail = 'certification' | 'yearsExperience';

/**
 * Everything that differs between the four catalog-backed relation rows. The row component
 * is one implementation driven by this table.
 *
 * Since KTL-29 a row edits a draft of picker items; `validate` refuses an entry before it
 * joins the draft and `save` writes the whole draft through the relations service.
 */
export interface RelationDefinition {
  kind: RelationKind;
  /** Row wrapper test id, kept from the four components this replaced. */
  testId: string;
  /** Picker prefix: test ids and the input's `name`. */
  idPrefix: string;
  titleKey: string;
  emptyKey: string;
  addLabelKey: string;
  valueFamily: CatalogFamily;
  levelFamily?: CatalogFamily;
  detail?: RelationDetail;
  items: (candidate: Candidate) => PickerItem[];
  /** Throws a `TranslatableError` when `item` may not stand in `items` (which contains it). */
  validate: (candidate: Candidate, items: PickerItem[], item: PickerItem) => void;
  save: (
    service: CandidateRelationsService,
    candidate: Candidate,
    items: PickerItem[],
  ) => Promise<void>;
}

const text = (item: PickerItem, field: RelationDetail): string =>
  String(item.details?.[field] ?? '');

const years = (item: PickerItem): number | undefined => {
  const value = item.details?.['yearsExperience'];
  return value == null || value === '' ? undefined : Number(value);
};

/**
 * Maps draft items back to entries. A saved entry keeps its id and the fields the picker
 * does not show (notes); an item added in the draft is keyed by its value, so it gets a
 * fresh client id, which the API treats as a new row.
 */
function toEntries<T extends { id: string }>(
  saved: readonly T[],
  items: readonly PickerItem[],
  build: (item: PickerItem, base: Partial<T>) => T,
): T[] {
  return items.map((item) => {
    const base = saved.find((entry) => entry.id === item.key);
    return build(item, base ?? ({ id: randomId() } as Partial<T>));
  });
}

const languages = (candidate: Candidate, items: readonly PickerItem[]) =>
  toEntries(candidate.languages, items, (item, base) => ({
    ...base,
    id: base.id!,
    language: item.value,
    level: item.level,
    certification: text(item, 'certification'),
  }));

const skills = (candidate: Candidate, items: readonly PickerItem[]) =>
  toEntries(candidate.skills, items, (item, base) => ({
    ...base,
    id: base.id!,
    skill: item.value,
    level: item.level,
  }));

const programs = (candidate: Candidate, items: readonly PickerItem[]) =>
  toEntries(candidate.programs, items, (item, base) => ({
    ...base,
    id: base.id!,
    program: item.value,
    level: item.level,
    yearsExperience: years(item),
  }));

const tags = (candidate: Candidate, items: readonly PickerItem[]) =>
  toEntries(candidate.tags, items, (item, base) => ({ ...base, id: base.id!, tag: item.value }));

/** Validates the entry at `item`'s position against the rest of the converted list. */
function check<T>(
  entries: T[],
  items: PickerItem[],
  item: PickerItem,
  rule: (list: T[], entry: T) => void,
): void {
  const index = items.findIndex((candidate) => candidate.key === item.key);
  if (index >= 0) rule(entries, entries[index]!);
}

export const RELATION_DEFINITIONS: Record<RelationKind, RelationDefinition> = {
  language: {
    kind: 'language',
    testId: 'candidate-languages',
    idPrefix: 'candidate-language',
    titleKey: 'candidate.profile.languages.title',
    emptyKey: 'candidate.profile.languages.empty',
    addLabelKey: 'catalogPicker.add.language',
    valueFamily: 'language',
    levelFamily: 'language_level',
    detail: 'certification',
    items: (candidate) =>
      candidate.languages.map((entry) => ({
        key: entry.id,
        value: entry.language,
        level: entry.level,
        details: { certification: entry.certification ?? '' },
      })),
    validate: (candidate, items, item) =>
      check(languages(candidate, items), items, item, validateLanguageEntry),
    save: (service, candidate, items) =>
      service.saveLanguages(candidate.id, languages(candidate, items)),
  },
  skill: {
    kind: 'skill',
    testId: 'candidate-skills',
    idPrefix: 'candidate-skill',
    titleKey: 'candidate.profile.skills.title',
    emptyKey: 'candidate.profile.skills.empty',
    addLabelKey: 'catalogPicker.add.skill',
    valueFamily: 'skill',
    levelFamily: 'skill_level',
    items: (candidate) =>
      candidate.skills.map((entry) => ({ key: entry.id, value: entry.skill, level: entry.level })),
    validate: (candidate, items, item) =>
      check(skills(candidate, items), items, item, validateSkillEntry),
    save: (service, candidate, items) => service.saveSkills(candidate.id, skills(candidate, items)),
  },
  program: {
    kind: 'program',
    testId: 'candidate-programs',
    idPrefix: 'candidate-program',
    titleKey: 'candidate.profile.programs.title',
    emptyKey: 'candidate.profile.programs.empty',
    addLabelKey: 'catalogPicker.add.program',
    valueFamily: 'program',
    levelFamily: 'program_level',
    detail: 'yearsExperience',
    items: (candidate) =>
      candidate.programs.map((entry) => ({
        key: entry.id,
        value: entry.program,
        level: entry.level,
        details: { yearsExperience: entry.yearsExperience },
      })),
    validate: (candidate, items, item) =>
      check(programs(candidate, items), items, item, validateProgramEntry),
    save: (service, candidate, items) =>
      service.savePrograms(candidate.id, programs(candidate, items)),
  },
  tag: {
    kind: 'tag',
    testId: 'candidate-tags',
    idPrefix: 'candidate-tag',
    titleKey: 'candidate.profile.tags.title',
    emptyKey: 'candidate.profile.tags.empty',
    addLabelKey: 'catalogPicker.add.tag',
    valueFamily: 'tag',
    items: (candidate) =>
      candidate.tags.map((entry) => ({ key: entry.id, value: entry.tag, level: '' })),
    validate: (candidate, items, item) =>
      check(tags(candidate, items), items, item, validateTagEntry),
    save: (service, candidate, items) => service.saveTags(candidate.id, tags(candidate, items)),
  },
};

/** Extra chip text for a relation's detail, e.g. «TOEFL» or «3 años». */
export function detailText(
  detail: RelationDetail | undefined,
  item: PickerItem,
  t: TFunction,
): string | undefined {
  if (detail === 'certification') return text(item, 'certification') || undefined;
  if (detail === 'yearsExperience') {
    const value = years(item);
    return value === undefined || value === 0
      ? undefined
      : t('candidate.profile.yearsCount', { count: value, years: value });
  }
  return undefined;
}

/** The comparable content of an item: status and error are presentation, not data. */
const signature = (item: PickerItem): string =>
  JSON.stringify([item.key, item.value, item.level, item.details ?? {}]);

/** True when a family's draft differs from what is saved, in content or order. */
export function itemsChanged(saved: readonly PickerItem[], draft: readonly PickerItem[]): boolean {
  if (saved.length !== draft.length) return true;
  return saved.some((item, index) => signature(item) !== signature(draft[index]!));
}
