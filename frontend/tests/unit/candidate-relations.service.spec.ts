import { CandidateService } from '../../src/app/features/candidates/services/candidate.service';
import {
  CandidateRelationsService,
  validateEducationEntry,
  validateExperienceEntry,
  validateLanguageEntry,
  validateProgramEntry,
  validateSkillEntry,
  validateTagEntry,
} from '../../src/app/features/candidates/services/candidate-relations.service';
import {
  EMPTY_CANDIDATE_DRAFT,
  type CandidateEducation,
  type CandidateExperience,
} from '../../src/app/features/candidates/models/candidate.models';
import { createCandidateTestBed, FakeCandidateApi } from './support/candidate-doubles';

const education = (overrides: Partial<CandidateEducation> = {}): CandidateEducation => ({
  id: crypto.randomUUID(),
  educationType: 'Grado',
  degree: 'Grado en ADE',
  institution: 'UCM',
  status: 'Finalizada',
  ...overrides,
});

const experience = (overrides: Partial<CandidateExperience> = {}): CandidateExperience => ({
  id: crypto.randomUUID(),
  company: 'Acme',
  position: 'Analista',
  sector: 'Servicios',
  isCurrent: false,
  ...overrides,
});

// KTL-29: panels validate each entry before it joins their draft, and save whole lists.
describe('candidate relation validators', () => {
  it('refuses a duplicate language regardless of case, but not the entry itself', () => {
    const english = { id: 'a', language: 'Inglés', level: 'B2' };
    const copy = { id: 'b', language: 'inglés', level: 'C1' };
    expect(() => validateLanguageEntry([english], english)).not.toThrow();
    expect(() => validateLanguageEntry([english, copy], copy)).toThrow(/ya tiene este idioma/i);
  });

  it('refuses a duplicate program and negative years', () => {
    const excel = { id: 'a', program: 'Excel', level: 'Avanzado' };
    const copy = { id: 'b', program: 'excel', level: 'Medio' };
    expect(() => validateProgramEntry([excel, copy], copy)).toThrow(/ya tiene este programa/i);
    const negative = { id: 'c', program: 'SAP', level: 'Medio', yearsExperience: -1 };
    expect(() => validateProgramEntry([negative], negative)).toThrow(/no pueden ser negativos/i);
  });

  it('refuses a duplicate skill and a duplicate tag', () => {
    const skill = { id: 'a', skill: 'Gestión documental', level: 'Alto' };
    const skillCopy = { id: 'b', skill: 'gestión documental', level: 'Medio' };
    expect(() => validateSkillEntry([skill, skillCopy], skillCopy)).toThrow(
      /ya tiene esta habilidad/i,
    );
    const tag = { id: 'a', tag: 'Remoto' };
    const tagCopy = { id: 'b', tag: 'remoto' };
    expect(() => validateTagEntry([tag, tagCopy], tagCopy)).toThrow();
  });

  it('requires a degree and a plausible end year', () => {
    expect(() => validateEducationEntry(education({ degree: '   ' }))).toThrow(
      /titulación es obligatoria/i,
    );
    expect(() => validateEducationEntry(education({ endYear: 1900 }))).toThrow(
      /año de finalización no es válido/i,
    );
    expect(() => validateEducationEntry(education({ endYear: 2020 }))).not.toThrow();
  });

  // The panel forms use noValidate, so these rules are what stops a blank required field.
  it.each([
    ['educationType', 'El tipo de formación es obligatorio.'],
    ['status', 'El estado de la formación es obligatorio.'],
  ] as const)('refuses education without %s', (field, message) => {
    expect(() => validateEducationEntry(education({ [field]: '  ' }))).toThrow(message);
  });

  it.each([
    ['company', 'La empresa es obligatoria.'],
    ['position', 'El puesto es obligatorio.'],
  ] as const)('refuses experience without %s', (field, message) => {
    expect(() => validateExperienceEntry(experience({ [field]: '' }))).toThrow(message);
  });

  it('accepts experience without a sector (KTL-46 follow-up)', () => {
    expect(() => validateExperienceEntry(experience({ sector: '' }))).not.toThrow();
    expect(() => validateExperienceEntry(experience({ sector: undefined }))).not.toThrow();
  });

  it('refuses an experience date after the current month, but not in it', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 5));
    try {
      expect(() =>
        validateExperienceEntry(experience({ startDate: '2026-12-01', isCurrent: true })),
      ).toThrow('Las fechas de una experiencia no pueden ser posteriores al mes actual.');
      expect(() =>
        validateExperienceEntry(experience({ startDate: '2025-01-01', endDate: '2027-01-01' })),
      ).toThrow(/posteriores al mes actual/);
      expect(() =>
        validateExperienceEntry(experience({ startDate: '2026-11-01', isCurrent: true })),
      ).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses an end date before the start date and negative years', () => {
    expect(() =>
      validateExperienceEntry(experience({ startDate: '2024-06-01', endDate: '2024-01-01' })),
    ).toThrow(/no puede ser anterior/i);
    expect(() => validateExperienceEntry(experience({ yearsExperience: -2 }))).toThrow(
      /no pueden ser negativos/i,
    );
  });
});

describe('CandidateRelationsService', () => {
  let candidateService: CandidateService;
  let api: FakeCandidateApi;
  let relations: CandidateRelationsService;
  let candidateId: string;

  beforeEach(async () => {
    localStorage.clear();
    ({ service: candidateService, api } = createCandidateTestBed());
    relations = new CandidateRelationsService(candidateService);
    candidateId = (
      await candidateService.create({
        ...EMPTY_CANDIDATE_DRAFT,
        firstName: 'Ana',
        lastName: 'Lopez',
      })
    ).id;
  });

  it('saves a whole language list in one write, keeping ids of existing entries', async () => {
    await relations.saveLanguages(candidateId, [
      { id: 'l1', language: 'Inglés', level: 'B1', certification: 'TOEFL' },
    ]);
    const [english] = candidateService.find(candidateId)!.languages;

    await relations.saveLanguages(candidateId, [
      { ...english!, level: 'C1' },
      { id: 'l2', language: 'Francés', level: 'A2' },
    ]);

    const saved = candidateService.find(candidateId)!.languages;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual({ ...english, level: 'C1' });
  });

  it('refuses a list holding a duplicate and writes nothing', async () => {
    await expect(
      relations.saveSkills(candidateId, [
        { id: 's1', skill: 'Compras', level: 'Medio' },
        { id: 's2', skill: 'compras', level: 'Alto' },
      ]),
    ).rejects.toThrow(/ya tiene esta habilidad/i);
    expect(candidateService.find(candidateId)?.skills).toHaveLength(0);
  });

  it('refuses invalid education and experience lists', async () => {
    await expect(relations.saveEducation(candidateId, [education({ degree: '' })])).rejects.toThrow(
      /titulación es obligatoria/i,
    );
    await expect(
      relations.saveExperience(candidateId, [experience({ yearsExperience: -1 })]),
    ).rejects.toThrow(/no pueden ser negativos/i);
  });

  it('names a stored entry with future dates that blocks the list, and writes nothing', async () => {
    const stored = experience({
      company: 'Kepler',
      position: 'Técnico',
      startDate: '2999-12-01',
      isCurrent: true,
    });

    await expect(
      relations.saveExperience(candidateId, [stored, experience({ startDate: '2020-01-01' })]),
    ).rejects.toThrow(
      'La experiencia «Técnico» en Kepler tiene fechas posteriores al mes actual. Corrígelas con «Editar» para poder guardar cambios en Experiencia.',
    );
    expect(candidateService.find(candidateId)?.experience).toHaveLength(0);
  });

  it('saves an empty list, removing every entry', async () => {
    await relations.savePrograms(candidateId, [{ id: 'p1', program: 'SAP', level: 'Medio' }]);
    await relations.savePrograms(candidateId, []);
    expect(candidateService.find(candidateId)?.programs).toHaveLength(0);
  });

  it('clears the end date of a current position', async () => {
    await relations.saveExperience(candidateId, [
      experience({ startDate: '2024-01-01', endDate: '2024-06-01', isCurrent: true }),
    ]);
    expect(candidateService.find(candidateId)?.experience[0]!.endDate).toBeUndefined();
  });

  it('throws when the candidate does not exist', async () => {
    await expect(relations.saveTags('missing-id', [])).rejects.toThrow(/no encontrado/i);
  });

  // The candidate page has already awaited the aggregate, but that invariant erodes, so the
  // service loads it itself before writing.
  it('loads a candidate it has not seen rather than reporting it missing', async () => {
    api.seed({ id: 'never-opened', firstName: 'Nunca', lastName: 'Abierta' });

    await relations.saveLanguages('never-opened', [{ id: 'l1', language: 'Inglés', level: 'B1' }]);

    expect(candidateService.find('never-opened')?.languages).toHaveLength(1);
  });
});
