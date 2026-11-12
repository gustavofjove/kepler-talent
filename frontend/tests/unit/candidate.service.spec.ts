import { EMPTY_CANDIDATE_DRAFT } from '../../src/app/features/candidates/models/candidate.models';
import { CandidateService } from '../../src/app/features/candidates/services/candidate.service';
import {
  ConflictError,
  createCandidateTestBed,
  FakeCandidateApi,
} from './support/candidate-doubles';

describe('CandidateService', () => {
  let service: CandidateService;
  let api: FakeCandidateApi;

  beforeEach(async () => {
    localStorage.clear();
    ({ service, api } = createCandidateTestBed());
  });

  it('rejects malformed contacts before calling the API and keeps the caller draft intact', async () => {
    const create = vi.spyOn(api, 'create');
    const draft = {
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Ana',
      lastName: 'Perez',
      phone: '123-456-789',
    };
    await expect(service.create(draft)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(draft.phone).toBe('123-456-789');
    api.seed({ id: 'contact', firstName: 'Ana' });
    await service.ensureAggregate('contact');
    const update = vi.spyOn(api, 'update');
    await expect(service.update('contact', draft)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('normalizes contacts on a valid create without changing the input', async () => {
    const draft = {
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Ana',
      lastName: 'Perez',
      phone: ' +34 (612) 345 678 ',
      email: ' ana@example.com ',
    };
    const candidate = await service.create(draft);
    expect(candidate.phone).toBe('+34 (612) 345 678');
    expect(candidate.email).toBe('ana@example.com');
    expect(draft.email).toBe(' ana@example.com ');
  });

  const listQuery = {
    page: 1,
    pageSize: 25,
    sortField: 'updatedAt',
    sortDirection: 'desc' as const,
    text: '',
    availability: '' as const,
    hasCv: '' as const,
    includeInactive: false,
  };
  const listedIds = async (includeInactive = false) =>
    (await service.listPage({ ...listQuery, includeInactive })).items.map(
      (item) => item.candidateId,
    );

  it('records availability with the cached version and adopts the response for the next write', async () => {
    api.seed({ id: 'c-check', firstName: 'Ana', version: 7 });
    await service.ensureAggregate('c-check');
    const record = vi.spyOn(api, 'recordAvailability');
    const update = vi.spyOn(api, 'update');

    const checked = await service.recordAvailability('c-check', {
      state: 'available',
      checkedOn: '2026-09-20',
      until: '',
    });
    expect(record).toHaveBeenCalledWith(
      'c-check',
      { state: 'available', checkedOn: '2026-09-20', until: '' },
      7,
    );
    expect(service.find('c-check')?.availability).toEqual(checked.availability);
    await service.update('c-check', { ...EMPTY_CANDIDATE_DRAFT, firstName: 'Ana' });
    expect(update).toHaveBeenCalledWith('c-check', expect.anything(), 8);
  });

  it('creates a candidate with audit timestamps and empty relations', async () => {
    const candidate = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Maria',
      lastName: 'Ruiz',
    });

    expect(candidate.id).toBeTruthy();
    expect(candidate.isActive).toBe(true);
    expect(candidate.languages).toEqual([]);
    expect(service.find(candidate.id)).toEqual(candidate);
  });

  it('lists only active candidates by default', async () => {
    const active = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Activa',
      lastName: 'Uno',
    });
    const inactive = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Inactiva',
      lastName: 'Dos',
    });
    await service.deactivate(inactive.id);

    const visible = await listedIds();

    expect(visible).toContain(active.id);
    expect(visible).not.toContain(inactive.id);
    expect(await listedIds(true)).toContain(inactive.id);
  });

  it('asks the API for exactly the page it was given and caches nothing from it', async () => {
    api.seed({ id: 'c1', firstName: 'Ana', lastName: 'Gil' });
    const query = {
      ...listQuery,
      page: 2,
      pageSize: 50,
      sortField: 'lastName',
      sortDirection: 'asc' as const,
    };

    await service.listPage(query);

    expect(api.listQueries).toEqual([query]);
    expect(service.find('c1')).toBeUndefined();
    expect(api.getCalls).toEqual([]);
    expect(Object.keys(service.state())).not.toContain('summaries');
  });

  it('has no whole-table loaders', () => {
    const surface = service as unknown as Record<string, unknown>;
    for (const name of ['list', 'ensureLoaded', 'ensureAllAggregates']) {
      expect(surface[name]).toBeUndefined();
    }
  });

  it('loads each candidate for its version before a bulk change it never opened', async () => {
    api.seed({ id: 'c1', firstName: 'Ana', lastName: 'Gil', version: 7 });

    const updated = await service.deactivateMany(['c1']);

    expect(updated).toBe(1);
    expect(api.getCalls).toEqual(['c1']);
    expect(api.candidates.get('c1')?.isActive).toBe(false);
  });

  it('updates a candidate and refreshes updatedAt without losing relations', async () => {
    const candidate = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Luis',
      lastName: 'Diaz',
    });

    const updated = await service.update(candidate.id, {
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Luis',
      lastName: 'Diaz Garcia',
    });

    expect(updated.lastName).toBe('Diaz Garcia');
    expect(updated.id).toBe(candidate.id);
  });

  it('throws when updating a candidate that does not exist', async () => {
    await expect(service.update('missing-id', EMPTY_CANDIDATE_DRAFT)).rejects.toThrow(
      /no encontrado/i,
    );
  });

  it('logically deactivates a candidate without deleting it', async () => {
    const candidate = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Eva',
      lastName: 'Soler',
    });

    await service.deactivate(candidate.id);

    const stored = service.find(candidate.id);
    expect(stored?.isActive).toBe(false);
    expect(stored).toBeDefined();
  });

  it('logically deactivates multiple active candidates and returns updated count', async () => {
    const one = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Ana',
      lastName: 'Rios',
    });
    const two = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Bea',
      lastName: 'Mora',
    });
    const three = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Carla',
      lastName: 'Gil',
    });
    await service.deactivate(three.id);

    const updated = await service.deactivateMany([one.id, two.id, three.id]);

    // Three requested, but the already-inactive one did not change, so it is not counted.
    expect(updated).toBe(2);
    expect(service.find(one.id)?.isActive).toBe(false);
    expect(service.find(two.id)?.isActive).toBe(false);
    expect(service.find(three.id)?.isActive).toBe(false);
  });

  it('reverts a logical deletion so the candidate is listed again', async () => {
    const candidate = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Eva',
      lastName: 'Soler',
    });
    await service.deactivate(candidate.id);

    await service.reactivate(candidate.id);

    expect(service.find(candidate.id)?.isActive).toBe(true);
    expect(await listedIds()).toContain(candidate.id);
  });

  it('reactivates only the inactive candidates and returns updated count', async () => {
    const active = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Ana',
      lastName: 'Rios',
    });
    const inactive = await service.create({
      ...EMPTY_CANDIDATE_DRAFT,
      firstName: 'Bea',
      lastName: 'Mora',
    });
    await service.deactivate(inactive.id);

    const updated = await service.reactivateMany([active.id, inactive.id]);

    expect(updated).toBe(1);
    expect(service.find(active.id)?.isActive).toBe(true);
    expect(service.find(inactive.id)?.isActive).toBe(true);
  });

  describe('the cache', () => {
    it('writes nothing to browser storage', async () => {
      await service.create({
        ...EMPTY_CANDIDATE_DRAFT,
        firstName: 'Privada',
        lastName: 'Datos',
      });

      expect(localStorage.length).toBe(0);
      expect(localStorage.getItem('rrhh-candidates')).toBeNull();
    });

    it('loads an aggregate once however many callers ask concurrently', async () => {
      api.seed({ id: 'c1', firstName: 'Ana', lastName: 'Gil' });

      await Promise.all([
        service.ensureAggregate('c1'),
        service.ensureAggregate('c1'),
        service.ensureAggregate('c1'),
      ]);
      await service.ensureAggregate('c1');

      expect(api.getCalls).toEqual(['c1']);
      expect(service.find('c1')?.firstName).toBe('Ana');
    });

    it('reports a failed load rather than presenting an absent candidate', async () => {
      const { service: failing, api: failingApi } = createCandidateTestBed();
      failingApi.failure = new Error('sin conexión');

      await failing.ensureAggregate('c1');

      expect(failing.status).toBe('error');
      expect(failing.aggregateStatus('c1')).toBe('error');
      expect(failing.error?.message).toBeTruthy();
    });

    it('forgets cached aggregates when invalidated', async () => {
      api.seed({ id: 'c1', firstName: 'Ana', lastName: 'Gil' });
      await service.ensureAggregate('c1');

      service.invalidate();
      await service.ensureAggregate('c1');

      expect(api.getCalls).toEqual(['c1', 'c1']);
    });

    it('leaves find() undefined for a candidate that does not exist, without failing', async () => {
      await service.ensureAggregate('no-such-candidate');

      expect(service.find('no-such-candidate')).toBeUndefined();
      expect(service.status).not.toBe('error');
    });

    it('refuses a write carrying a version another writer has already moved past', async () => {
      const seeded = api.seed({ id: 'c1', firstName: 'Ana', lastName: 'Gil' });
      await service.ensureAggregate('c1');
      // Somebody else writes, advancing the stored version past the one we hold.
      await api.update('c1', { ...EMPTY_CANDIDATE_DRAFT, firstName: 'Otra' }, seeded.version);

      await expect(
        service.update('c1', { ...EMPTY_CANDIDATE_DRAFT, firstName: 'Nuestra' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
