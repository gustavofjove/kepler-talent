import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { repoRoot } from '../repo-root';

interface DemoCandidate {
  first: string;
  last: string;
  city: string;
  availability: [string, number, number?] | null;
  cv: boolean;
  removed?: boolean;
}

interface DemoProfile {
  languages: [string, string][];
  programs: [string, string, number][];
  skills: [string, string][];
}

interface DemoBackground {
  education: [string, string, string | null, string, string, number | null][];
  experience: [string, string, string, string, string | null, string][];
}

interface DemoLib {
  BACKGROUND: Record<string, DemoBackground>;
  backgroundBodies(
    background: DemoBackground,
    today: Date,
  ): { education: Record<string, unknown>[]; experience: Record<string, unknown>[] };
  CANDIDATES: DemoCandidate[];
  COMPETENCIES: Record<string, DemoProfile>;
  competencyBodies(profile: DemoProfile): Record<string, Record<string, unknown>[]>;
  POSITIONS: { title: string; closed?: boolean; links: Record<string, string> }[];
  PRESETS: { name: string; used: number | null; filters: Record<string, unknown> }[];
  STAGES: string[];
  DEMO_DOMAIN: string;
  assertLoopback(url: string): URL;
  availabilityBody(
    candidate: DemoCandidate,
    today: Date,
  ): { state: string; checkedOn: string; until: string | null } | null;
  candidateBody(candidate: DemoCandidate, index: number, today: Date): Record<string, string>;
  emailFor(candidate: DemoCandidate): string;
}

/** The KTL-40 demo dataset (scripts/seed-demo-data.lib.js), loaded as the script loads it. */
const lib = createRequire(__filename)(
  resolve(repoRoot, 'scripts/seed-demo-data.lib.js'),
) as DemoLib;
const today = new Date(Date.UTC(2026, 9, 7));

/**
 * The names of one family in the deployment catalog seed, read from its C# source. The API refuses
 * a name the catalog does not hold, so a typo in the dataset would fail the whole seed run.
 */
function seededNames(family: string): string[] {
  const source = readFileSync(
    resolve(repoRoot, 'backend/Infrastructure/Persistence/CatalogSeedData.cs'),
    'utf8',
  );
  const block = new RegExp(`\\[CatalogFamilies\\.${family}\\]\\s*=\\s*\\[([\\s\\S]*?)\\],\\s*\\n`)
    .exec(source)?.[1]
    ?.replace(/\/\/.*$/gm, '')
    // new("C#", "CSHARP"): the second string is the stored code, not a name.
    .replace(/new\("([^"]+)",\s*"[^"]+"\)/g, '"$1"');
  if (!block) throw new Error(`CatalogFamilies.${family} not found in CatalogSeedData.cs`);
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe('demo dataset (KTL-40)', () => {
  it('writes only to a stack on this machine', () => {
    for (const url of ['http://localhost:4200', 'http://127.0.0.1:4300', 'http://[::1]:4200']) {
      expect(() => lib.assertLoopback(url)).not.toThrow();
    }
    for (const url of [
      'https://kepler-talento.example.com',
      'http://10.0.0.5:4200',
      'http://localhost.evil.test',
      'file:///etc/passwd',
      'not a url',
    ]) {
      expect(() => lib.assertLoopback(url)).toThrow();
    }
  });

  it('never carries the 13-digit marker the e2e teardown purges by', () => {
    const everything = JSON.stringify({
      candidates: lib.CANDIDATES.map((candidate, index) =>
        lib.candidateBody(candidate, index, today),
      ),
      positions: lib.POSITIONS,
      presets: lib.PRESETS,
    });

    expect(everything).not.toMatch(/\d{13}/);
  });

  it('gives every candidate a distinct e-mail in the reserved domain', () => {
    const emails = lib.CANDIDATES.map((candidate) => lib.emailFor(candidate));

    expect(new Set(emails).size).toBe(emails.length);
    for (const email of emails) {
      expect(email).toMatch(
        new RegExp(`^[a-z]+\\.[a-z]+@${lib.DEMO_DOMAIN.replace(/\./g, '\\.')}$`),
      );
    }
  });

  it('has the population the spec promises', () => {
    const active = lib.CANDIDATES.filter((candidate) => !candidate.removed);
    const state = (value: string) =>
      active.filter((candidate) => candidate.availability?.[0] === value).length;

    expect(active.length).toBeGreaterThanOrEqual(20);
    expect(lib.CANDIDATES.length - active.length).toBeGreaterThanOrEqual(2);
    expect(state('available')).toBeGreaterThanOrEqual(6);
    expect(state('unavailable')).toBeGreaterThanOrEqual(4);
    expect(active.some((candidate) => candidate.availability === null)).toBe(true);
    const withCv = active.filter((candidate) => candidate.cv).length;
    expect(withCv / active.length).toBeGreaterThan(0.35);
    expect(withCv / active.length).toBeLessThan(0.65);
  });

  it('records checks within the last 30 days, with some «hasta» dates', () => {
    const bodies = lib.CANDIDATES.map((candidate) => lib.availabilityBody(candidate, today)).filter(
      (body) => body !== null,
    );

    for (const body of bodies) {
      expect(body.checkedOn >= '2026-09-07' && body.checkedOn <= '2026-10-07').toBe(true);
      if (body.until) expect(body.until > body.checkedOn).toBe(true);
    }
    expect(bodies.some((body) => body.state === 'unavailable' && body.until)).toBe(true);
  });

  it('links candidates at every stage of open positions and leaves one open position empty', () => {
    const open = lib.POSITIONS.filter((position) => !position.closed);
    const stages = new Set(open.flatMap((position) => Object.values(position.links)));

    expect(open.length).toBeGreaterThanOrEqual(6);
    expect(lib.POSITIONS.filter((position) => position.closed)).toHaveLength(1);
    expect([...stages].sort()).toEqual([...lib.STAGES].sort());
    expect(open.some((position) => Object.keys(position.links).length === 0)).toBe(true);
    for (const position of lib.POSITIONS) {
      for (const index of Object.keys(position.links)) {
        expect(lib.CANDIDATES[Number(index)]).toBeDefined();
      }
    }
  });

  it('uses only languages, programs, skills and levels the catalog seed holds', () => {
    const families = {
      Language: seededNames('Language'),
      LanguageLevel: seededNames('LanguageLevel'),
      Program: seededNames('Program'),
      ProgramLevel: seededNames('ProgramLevel'),
      Skill: seededNames('Skill'),
      SkillLevel: seededNames('SkillLevel'),
    };
    expect(families.Program).toEqual(expect.arrayContaining(['Navision', 'AutoCAD', 'C#']));

    for (const [index, profile] of Object.entries(lib.COMPETENCIES)) {
      expect(lib.CANDIDATES[Number(index)]?.removed).toBeFalsy();
      for (const [language, level] of profile.languages) {
        expect(families.Language).toContain(language);
        expect(families.LanguageLevel).toContain(level);
      }
      for (const [program, level, years] of profile.programs) {
        expect(families.Program).toContain(program);
        expect(families.ProgramLevel).toContain(level);
        expect(Number.isInteger(years) && years >= 0).toBe(true);
      }
      for (const [skill, level] of profile.skills) {
        expect(families.Skill).toContain(skill);
        expect(families.SkillLevel).toContain(level);
      }
      for (const [, rows] of Object.entries(lib.competencyBodies(profile))) {
        const names = rows.map((row) => Object.values(row)[1]);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });

  it('gives every active candidate an education and work history the catalog accepts', () => {
    const types = seededNames('EducationType');
    const statuses = seededNames('EducationStatus');
    const sectors = seededNames('Sector');
    const active = lib.CANDIDATES.flatMap((candidate, index) => (candidate.removed ? [] : [index]));

    expect(
      Object.keys(lib.BACKGROUND)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(active);
    for (const background of Object.values(lib.BACKGROUND)) {
      expect(background.education.length).toBeGreaterThan(0);
      for (const [type, degree, , institution, status, endYear] of background.education) {
        expect(types).toContain(type);
        expect(statuses).toContain(status);
        expect(degree.trim() && institution.trim()).toBeTruthy();
        expect(endYear === null || (endYear >= 1990 && endYear <= 2026)).toBe(true);
        expect(endYear === null).toBe(status !== 'Finalizada');
      }
      expect(background.experience.filter(([, , , , end]) => end === null)).toHaveLength(1);
      for (const [company, position, sector, start, end] of background.experience) {
        expect(sectors).toContain(sector);
        expect(company.trim() && position.trim()).toBeTruthy();
        expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(start))).toBe(false);
        if (end) expect(end > start && !Number.isNaN(Date.parse(end))).toBe(true);
      }
      const { experience } = lib.backgroundBodies(background, today);
      for (const row of experience) {
        expect(
          Number.isInteger(row['yearsExperience']) && Number(row['yearsExperience']) >= 0,
        ).toBe(true);
      }
    }
  });

  it('gives the «Inglés B2 + Navision + AutoCAD» search matches and near misses', () => {
    const order = seededNames('LanguageLevel');
    const englishAtLeastB2 = (profile: DemoProfile) =>
      profile.languages.some(
        ([language, level]) => language === 'Inglés' && order.indexOf(level) >= order.indexOf('B2'),
      );
    const programs = (profile: DemoProfile) => profile.programs.map(([program]) => program);
    const hits = (profile: DemoProfile) =>
      [
        englishAtLeastB2(profile),
        programs(profile).includes('Navision'),
        programs(profile).includes('AutoCAD'),
      ].filter(Boolean).length;
    const profiles = Object.values(lib.COMPETENCIES);

    expect(profiles.filter((profile) => hits(profile) === 3).length).toBeGreaterThanOrEqual(5);
    expect(profiles.filter((profile) => hits(profile) === 2).length).toBeGreaterThanOrEqual(3);
    const preset = lib.PRESETS.find((item) => item.name === 'Inglés B2 + Navision + AutoCAD');
    expect(preset?.filters).toMatchObject({
      languageCriteria: [{ value: 'Inglés', level: 'B2' }],
      programMode: 'ALL',
    });
  });

  it('has used presets in a known order and one never used', () => {
    const used = lib.PRESETS.map((preset) => preset.used).filter((order) => order !== null);

    expect(lib.PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(used.length).toBeGreaterThanOrEqual(3);
    expect(new Set(used).size).toBe(used.length);
    expect(lib.PRESETS.some((preset) => preset.used === null)).toBe(true);
  });
});
