/**
 * The availability check's values (KTL-36). There is no candidate status: the position stage is
 * the only pipeline state, and this records only whether the person can take a job.
 */
export type CandidateAvailabilityState = 'unknown' | 'available' | 'unavailable';

export const ALL_AVAILABILITY_STATES: readonly CandidateAvailabilityState[] = [
  'unknown',
  'available',
  'unavailable',
];

/**
 * The latest availability check. Dates are calendar days (`yyyy-MM-dd`) or `''`; an `unknown`
 * check has neither, and no checker. The checker is a display name only, never a user id, and
 * is null when the check was recorded by an actor without a stored user.
 */
export interface CandidateAvailability {
  state: CandidateAvailabilityState;
  checkedOn: string;
  until: string;
  checkedByDisplayName: string | null;
}

/**
 * What the availability write sends (`PUT /api/candidates/{id}/availability`). The version is
 * added by the service from the cached aggregate; the checker is assigned by the server.
 */
export interface CandidateAvailabilityInput {
  state: CandidateAvailabilityState;
  checkedOn: string;
  until: string;
}

export const UNKNOWN_AVAILABILITY: CandidateAvailability = {
  state: 'unknown',
  checkedOn: '',
  until: '',
  checkedByDisplayName: null,
};

export type CandidateLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** The closed set of fields the list and search may be ordered by (KTL-18). */
/** `createdAt` (KTL-40) has no list column; it is reached by URL, e.g. from the home page. */
export type CandidateSortField = 'updatedAt' | 'lastName' | 'availabilityCheckedOn' | 'createdAt';
export type CandidateSortDirection = 'asc' | 'desc';
export type HasCvFilter = '' | 'yes' | 'no';

/**
 * One page request for the candidate list. Filtering, sorting and paging happen in
 * PostgreSQL; the browser only states what it wants.
 *
 * `sortField` is typed as a string on purpose: a value read from a URL is sent as-is so an
 * unknown field is refused by the API rather than silently replaced here.
 */
export interface CandidateListQuery {
  page: number;
  pageSize: number;
  sortField: string;
  sortDirection: CandidateSortDirection;
  text: string;
  availability: CandidateAvailabilityState | '';
  hasCv: HasCvFilter;
  includeInactive: boolean;
}

/**
 * A list row: the minimal search projection. No notes, consent, retention, location or
 * source — the list never rendered them, so they no longer cross the network for it.
 */
export interface CandidateListItem {
  candidateId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  availabilityState: CandidateAvailabilityState;
  /** The check date (`yyyy-MM-dd`), or null when unchecked. */
  availabilityCheckedOn: string | null;
  hasPrimaryCv: boolean;
  /** See `SearchResult.primaryCvPreviewable` (KTL-35). */
  primaryCvPreviewable: boolean;
  /** See `SearchResult.primaryCvDownloadable` (KTL-35). */
  primaryCvDownloadable: boolean;
  updatedAt: string;
  isActive: boolean;
}

/** One page plus the server's count. Page navigation reads `totalCount`, never `items.length`. */
export interface CandidateListPage {
  items: CandidateListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

/**
 * A candidate as the list endpoint returns it: core fields, no collections.
 *
 * `version` is the concurrency token. Every write carries the one that came with the
 * record it read, so a stale editor is refused rather than silently overwriting a
 * concurrent change.
 */
export interface CandidateSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  location: string;
  province: string;
  country: string;
  /** Changed only through its own write, never through the candidate form (KTL-36). */
  availability: CandidateAvailability;
  source: string;
  notes: string;
  receivedAt: string;
  consentAt: string;
  reviewDueAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** How many documents the candidate has, so the list can show and filter "tiene CV". */
  documentCount: number;
  /**
   * The candidate's principal CV, or null. An identifier, not personal data — it is what
   * lets the list and the search results offer "Abrir CV" without loading the whole
   * document collection.
   */
  primaryDocumentId: string | null;
}

/** The complete aggregate, as the detail endpoint returns it. */
export interface Candidate extends CandidateSummary {
  languages: CandidateLanguage[];
  programs: CandidateProgram[];
  education: CandidateEducation[];
  experience: CandidateExperience[];
  skills: CandidateSkill[];
  tags: CandidateTag[];
  customNotes: CandidateNote[];
  documents: CandidateDocument[];
}

export interface CandidateLanguage {
  id: string;
  language: string;
  level: string;
  certification?: string;
  notes?: string;
}

export interface CandidateProgram {
  id: string;
  program: string;
  level: string;
  yearsExperience?: number;
  notes?: string;
}

export interface CandidateEducation {
  id: string;
  educationType: string;
  degree: string;
  specialty?: string;
  institution: string;
  status: string;
  endYear?: number;
  notes?: string;
}

export interface CandidateExperience {
  id: string;
  company: string;
  position: string;
  /** Optional since the KTL-46 follow-up; the API answers `null` when none was chosen. */
  sector?: string | null;
  /** «Descripción» (KTL-46): rich text the API has sanitised; legacy plain text arrives as paragraphs. */
  functions?: string;
  startDate?: string;
  endDate?: string;
  /** One decimal at most. The API works it out from the dates whenever they determine it. */
  yearsExperience?: number;
  isCurrent: boolean;
  notes?: string;
}

export interface CandidateSkill {
  id: string;
  skill: string;
  level: string;
  notes?: string;
}

export interface CandidateTag {
  id: string;
  tag: string;
}

export interface CandidateNote {
  id: string;
  body: string;
  authorUserId?: string | null;
  authorDisplayName?: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  version: number;
}

export interface CandidateDocument {
  id: string;
  documentType: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  isPrimary: boolean;
  uploadedAt: string;
  scanState?: 'PendingScan' | 'Clean' | 'Infected' | 'Rejected' | 'ScanFailed';
  availabilityState?: 'Pending' | 'Available' | 'Refused' | 'Error' | 'LegacyUnavailable';
  failureCode?: string;
}

export type CandidateDraft = Omit<
  Candidate,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'version'
  | 'documentCount'
  | 'primaryDocumentId'
  | 'availability'
  | 'languages'
  | 'programs'
  | 'education'
  | 'experience'
  | 'skills'
  | 'tags'
  | 'customNotes'
  | 'documents'
>;

export const EMPTY_CANDIDATE_DRAFT: CandidateDraft = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  location: '',
  province: '',
  country: 'España',
  source: 'Email',
  notes: '',
  receivedAt: new Date().toISOString().slice(0, 10),
  consentAt: '',
  reviewDueAt: '',
  isActive: true,
};
