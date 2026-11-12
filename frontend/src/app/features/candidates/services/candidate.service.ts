import { contactError, validatedContacts } from './candidate-contact.rules';
import { signal } from '../../../core/state/signal';
import { AppError, toAppError } from '../../../shared/models/error.models';
import {
  Candidate,
  CandidateAvailabilityInput,
  CandidateDraft,
  CandidateEducation,
  CandidateExperience,
  CandidateLanguage,
  CandidateListPage,
  CandidateListQuery,
  CandidateLoadStatus,
  CandidateProgram,
  CandidateSkill,
  CandidateTag,
} from '../models/candidate.models';
import type { CandidateGateway } from './candidate.api';
import { validateAvailability } from './candidate-availability.rules';

export interface CandidateState {
  /** `error` once an aggregate load has failed for a reason other than "not found". */
  status: CandidateLoadStatus;
  /** Complete aggregates, by identifier, for the candidates that have been opened. */
  aggregates: Record<string, Candidate>;
  /**
   * Identifiers the API answered "not found" for.
   *
   * `find(id)` returning `undefined` means both "not loaded yet" and "no such candidate",
   * and a screen has to tell them apart: one is a spinner, the other is "Candidato no
   * encontrado". This is what separates them.
   */
  missing: string[];
  error?: AppError;
}

/**
 * Candidate records, owned by the API.
 *
 * This is a per-identifier aggregate cache and nothing wider. Since KTL-18 it holds no
 * whole-table list: the candidate list asks the API for one page at a time through
 * `listPage`, and filtering, sorting and paging happen in PostgreSQL. No cache here is the
 * means by which a screen filters, sorts or pages.
 *
 * `find(id)` stays synchronous so the consuming services and screens keep their shape.
 * `find(id)` returning `undefined` means "not loaded yet" as well as "no such candidate", so
 * `aggregateStatus` separates them, and `ensureAggregate(id)` is idempotent and shares an
 * in-flight promise per identifier.
 */
export class CandidateService {
  readonly state = signal<CandidateState>({
    status: 'idle',
    aggregates: {},
    missing: [],
  });

  private readonly aggregatesInFlight = new Map<string, Promise<void>>();

  constructor(private readonly api: CandidateGateway) {}

  get status(): CandidateLoadStatus {
    return this.state().status;
  }

  get error(): AppError | undefined {
    return this.state().error;
  }

  /** One page of the candidate list. Not cached: the page is the screen's state, not ours. */
  listPage(query: CandidateListQuery, signal?: AbortSignal): Promise<CandidateListPage> {
    return this.api.listPage(query, signal);
  }

  /**
   * Forgets every cached aggregate, so the next reader loads current data. Used after work
   * that changes candidates outside this service, such as an import.
   */
  invalidate(): void {
    this.aggregatesInFlight.clear();
    this.state.set({ status: 'idle', aggregates: {}, missing: [] });
  }

  /**
   * Loads one complete aggregate. Idempotent, and concurrent callers for the same
   * identifier share one request — which is what stops the detail screen's six section
   * components from each issuing their own.
   */
  ensureAggregate(id: string): Promise<void> {
    if (this.state().aggregates[id]) {
      return Promise.resolve();
    }
    const existing = this.aggregatesInFlight.get(id);
    if (existing) {
      return existing;
    }
    const request = this.loadAggregate(id).finally(() => {
      this.aggregatesInFlight.delete(id);
    });
    this.aggregatesInFlight.set(id, request);
    return request;
  }

  /** A synchronous read of the cache. `undefined` means "not loaded" or "no such candidate". */
  find(id: string): Candidate | undefined {
    return this.state().aggregates[id];
  }

  /**
   * What a screen showing one candidate should render. Separates "still loading" from
   * "genuinely not there", which `find` alone cannot express.
   */
  aggregateStatus(id: string): 'loading' | 'loaded' | 'missing' | 'error' {
    const state = this.state();
    if (state.aggregates[id]) {
      return 'loaded';
    }
    if (state.missing.includes(id)) {
      return 'missing';
    }
    return state.status === 'error' ? 'error' : 'loading';
  }

  async create(draft: CandidateDraft): Promise<Candidate> {
    return this.absorb(await this.api.create(validatedContacts(draft)).catch(contactError));
  }

  async update(id: string, draft: CandidateDraft): Promise<Candidate> {
    return this.absorb(
      await this.api.update(id, validatedContacts(draft), this.versionOf(id)).catch(contactError),
    );
  }

  /**
   * Records an availability check (KTL-36) against the cached aggregate's version, and replaces
   * the cached aggregate with the response. Every panel reads the aggregate from here, so an
   * editor opened before the check saves afterwards with the new version instead of a 409.
   */
  async recordAvailability(id: string, input: CandidateAvailabilityInput): Promise<Candidate> {
    validateAvailability(input);
    return this.absorb(await this.api.recordAvailability(id, input, this.versionOf(id)));
  }

  async deactivate(id: string): Promise<Candidate> {
    return this.absorb(await this.api.setActive(id, false, this.versionOf(id)));
  }

  async reactivate(id: string): Promise<Candidate> {
    return this.absorb(await this.api.setActive(id, true, this.versionOf(id)));
  }

  deactivateMany(ids: string[]): Promise<number> {
    return this.setActiveMany(ids, false);
  }

  reactivateMany(ids: string[]): Promise<number> {
    return this.setActiveMany(ids, true);
  }

  async setLanguages(id: string, languages: CandidateLanguage[]): Promise<Candidate> {
    return this.absorb(await this.api.setLanguages(id, languages, this.versionOf(id)));
  }

  async setPrograms(id: string, programs: CandidateProgram[]): Promise<Candidate> {
    return this.absorb(await this.api.setPrograms(id, programs, this.versionOf(id)));
  }

  async setEducation(id: string, education: CandidateEducation[]): Promise<Candidate> {
    return this.absorb(await this.api.setEducation(id, education, this.versionOf(id)));
  }

  async setExperience(id: string, experience: CandidateExperience[]): Promise<Candidate> {
    return this.absorb(await this.api.setExperience(id, experience, this.versionOf(id)));
  }

  async setSkills(id: string, skills: CandidateSkill[]): Promise<Candidate> {
    return this.absorb(await this.api.setSkills(id, skills, this.versionOf(id)));
  }

  async setTags(id: string, tags: CandidateTag[]): Promise<Candidate> {
    return this.absorb(await this.api.setTags(id, tags, this.versionOf(id)));
  }

  async refreshAggregate(id: string): Promise<Candidate> {
    return this.absorb(await this.api.get(id));
  }

  /**
   * Sequential per-candidate calls, counting the ones that actually changed. A refusal on
   * one candidate leaves the rest applied, and the count the UI reports is the count that
   * really happened.
   *
   * The list rows carry no version, so each candidate's aggregate is loaded first and its
   * version used — one read per selected row, bounded by the page the user selected on.
   */
  private async setActiveMany(ids: string[], isActive: boolean): Promise<number> {
    let changed = 0;
    for (const id of ids) {
      await this.ensureAggregate(id);
      const before = this.find(id);
      if (!before || before.isActive === isActive) {
        continue;
      }
      const after = await this.api.setActive(id, isActive, before.version);
      this.absorb(after);
      if (after.isActive === isActive) {
        changed += 1;
      }
    }
    return changed;
  }

  /** Replaces the cached aggregate from a response, never from a local guess. */
  private absorb(candidate: Candidate): Candidate {
    const current = this.state();
    this.state.set({
      ...current,
      aggregates: { ...current.aggregates, [candidate.id]: candidate },
    });
    return candidate;
  }

  /** The version a write must carry: the one on the aggregate the caller opened. */
  private versionOf(id: string): number {
    const candidate = this.state().aggregates[id];
    if (!candidate) {
      throw new AppError('NOT_FOUND', 'Candidato no encontrado.');
    }
    return candidate.version;
  }

  private async loadAggregate(id: string): Promise<void> {
    try {
      this.absorb(await this.api.get(id));
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code === 'NOT_FOUND') {
        // A candidate that genuinely does not exist is not a failure of the screen. It is
        // recorded as missing so the caller can render "no encontrado" instead of a
        // spinner that never resolves.
        const current = this.state();
        this.state.set({ ...current, missing: [...current.missing, id] });
        return;
      }
      this.state.set({ ...this.state(), status: 'error', error: appError });
    }
  }
}
