# Proposal

## Why

HR readers lose authored line breaks, see misleading zero-year labels and must scan candidate
history in the wrong order; editors cannot record education without inventing a centre.
KTL-48 also closes missing contact validation and gives the application the agreed Kepler Talent
name and Jove Group tab icon. Source: `openspec/KTL-48.md`, including the confirmed follow-ups.

## What Changes

Actors are HR readers (`candidates.read`), candidate creators (`candidates.create`), editors
(`candidates.update`) and users opening the login page or authenticated application.

- **FR1 — Observations:** Preserve plain-text line breaks and blank lines in read-only
  «Observaciones internas», with wrapping and escaped markup.
- **FR2 — Year labels:** Hide absent/null/zero years in program chips and experience summaries,
  including their separators. Preserve stored values, positive formatting and date-derived years.
- **FR3 — Education centre:** Accept a blank Centro on add/update and clearing an existing one;
  trim and round-trip it as `institution: ""`, still encrypted. Other required fields stay required.
- **FR4 — Education chronology:** Descending end year, undated last, stable ties, in both modes.
- **FR5 — Experience chronology:** Current roles first; within groups, descending end date or
  start-date fallback, undated last; then descending start date and stable ties. Current roles
  use their start date. Sorting sends no write, preserves entry identity and reacts to date edits.
- **FR6 — Contacts:** Optional trimmed email/phone on create and main-data update, checked by
  the frontend service and API. Phone accepts only ASCII digits, `+`, parentheses and whitespace,
  with at least 9 digits; keep 40/255-character phone/email limits. Email accepts a single address,
  rejecting missing/repeated `@`, empty parts, embedded whitespace and display-name/list syntax.
  Legacy invalid contacts remain readable; main-data saves require correction or clearing.
  **BREAKING:** Previously accepted invalid contact values are refused on create/update; the
  existing import create-validator reuse also rejects invalid phone values through row outcomes.
- **FR7 — Favicon:** Bundle the existing Jove Group PNG artwork and serve it locally on all routes,
  with correct dimensions/MIME metadata and no external runtime dependency.
- **FR8 — Product name:** Use Kepler Talent in document title, login, shell and README. Migrate
  the remaining shell literals to i18n and remove its hardcoded-copy lint exception.
- **FR9 — Boundaries and quality:** Retain per-panel save semantics, accessible errors and focus,
  responsive layouts at 390px, aggregate concurrency and fail-closed API authorization.

Key entities are the candidate core record, program/education/experience relations and the
application's static brand assets. No new business entity, endpoint, permission or runtime
dependency is introduced. Empresa remains required; Habilidades has no years field. Sorting is
view-only and uses loaded order for exact ties, not a new persisted user-controlled order.

Success means all KTL-48 acceptance cases pass after save/reload; no blank/zero summary duration
is visible; valid blank centres round-trip encrypted; malformed contacts are refused without
partial writes; all visible product names and local favicon requests match the new branding.
Measured regression evidence includes targeted Playwright, affected Vitest/xUnit suites and
security gates, lint and repository formatting.

## Capabilities

### New Capabilities

- `application-branding`: Product display name and locally hosted corporate browser icons.

### Modified Capabilities

- `candidate-profile-pages`: Multiline observations, optional centre UI, chronological rows,
  hidden zero durations and contact validation feedback without losing per-panel workflows.
- `candidate-persistence`: Optional encrypted centre and contact acceptance rules on core writes.
- `frontend-localization`: Localized core-contact errors and completion of shell copy migration.

## Impact

Frontend changes affect candidate components/helpers and `CandidateService`, `es.json`, the shell,
`eslint.config.js`, `index.html` and `public/`. Backend changes affect create/update validators,
education validation and its encrypted mapping; imports keep using the create validator. The
existing candidate routes and contracts remain, apart from stricter validation of supplied data.

This change touches personal data (observations, contact details and education centre), preserving
encryption, minimal responses and redacted logging. It changes no RLS policies, role definitions,
database grants or private-document access. `ICurrentActor` guards precede validation and lookup;
`ktl_runtime` keeps approved DML only. No physical schema change is expected; any EF metadata
migration must preserve encryption constraints, indexes and grants and run as `ktl_migrator`.

Documentation includes `docs/ktl-48/release-notes.md`, the Spanish README heading and capability
spec synchronization at archive time. Historical records and technical identifiers retain their
existing names. Search semantics, storage keys, consent and retention behavior stay unchanged.
