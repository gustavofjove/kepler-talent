# Design

## Context

See `proposal.md` for motivation and FR1–FR9. The React SPA already reads full candidate aggregates
through singleton signal services and the ASP.NET Core API. Collection writes replace a complete
relation set against the candidate version and return a fresh aggregate. Education/experience
entry forms persist immediately; core data and Competencias have save/cancel drafts.

Current implementation points explain the changes:

- `candidate-main-panel.tsx` renders observations in a plain paragraph without preserving breaks.
- `candidate-relation-section.logic.ts` converts chip year details to numbers; JSON null can
  become zero. The experience panel has a separate duration formatter and date-derived helper.
- Education and experience panels render the aggregate arrays without a chronological view.
- `validateEducationEntry`, `SetCandidateRelations.cs` and the Institution encryption mapping
  require centre text. The domain property is already a non-null trimmed string.
- Create/update validators currently limit contact lengths only. `CandidateService.create/update`
  forward drafts directly. The import evaluator reuses `CreateCandidateValidator`, while retaining
  its own required columns, dotted-domain email shape and row-outcome contract.
- `index.html` has no icon and declares Kepler Talento. Login reads `app.title`; the shell hardcodes
  the name and all remaining legacy UI literals. English `app.title` already reads Kepler Talent.

The design is cross-cutting and touches personal data, so it includes API and encrypted-persistence
verification even though no physical column change is expected.

## Goals / Non-Goals

**Goals:** Keep contracts and panel state coherent while applying the agreed display corrections;
validate contacts consistently at service and API boundaries; allow empty centre plaintext through
the encryption converter; deliver branding without external runtime traffic.

**Non-Goals:** A contact-verification service, country-specific phone parsing, new years fields,
persisted/manual history ordering, new data stores, new routes, document-storage changes, PWA
installation, broad namespace/project renames or historical-document rewriting.

## Decisions

### D1 — Plain-text rendering and explicit duration presence (FR1, FR2)

Use a scoped CSS class with `white-space: pre-wrap` and wrapping suitable for long tokens on the
observations paragraph. Keep React text children so markup remains escaped. Do not convert notes
to HTML or run experience rich-text formatting on them.

Treat absent, null and empty picker years as absent before numeric conversion. Rendering functions
return no duration label for absent or zero values; separators are conditional on the label.
Positive program counts keep singular/plural and experience counts keep `formatNumber` with one
optional decimal. Retain `shownExperienceYears` precedence: calculated years override manual years
whenever dates determine a duration. The form retains calculation and zero-editing behavior.

Alternatives: coercing all missing values to zero reproduces the defect; stripping zeros from
stored data would make a presentation request change the data contract. Neither is needed.

### D2 — Sort derived copies, preserve source arrays and ids (FR4, FR5, FR9)

Put pure sorting helpers in sibling `.logic.ts` files and derive displayed arrays with `useMemo`
from the candidate relation references. Both read and edit lists consume those arrays. Existing
write operations must use canonical source collections, resolving edits/removals by id; do not
accidentally serialize a reordered presentation array just because it is now used for rendering.

Education compares end year descending, missing last. Experience compares:

1. `isCurrent`, true first.
2. Effective date descending: current role's start, otherwise end or start fallback; missing last
   within the current/non-current group.
3. Start date descending, missing last.
4. Original loaded index, ascending, for stable exact ties.

Use stored ISO calendar-date values directly for comparison, without timezone conversion or
fabricated dates. No date is inferred from manual years. Sorting costs O(n log n) in the already
loaded aggregate, with no query/request change and no encrypted-field SQL sorting. React keys,
editing ids and expanded-description ids remain entry ids. On a successful save the returned
aggregate drives the new view; a failure retains the current form.

Alternatives: sorting in place mutates signal-backed state; server ordering expands a view-only
request into all API responses and does not help immediate local rendering. Stable ties deliberately
use the current response order; they are not a new cross-reload ordering guarantee for exact ties.

### D3 — Empty centre stays an encrypted non-null string (FR3)

Remove only Institution's mandatory-text rule in `SetCandidateRelations.cs` and its corresponding
frontend required-text check. Preserve length checks, type/status/degree validation and domain
trimming. The controlled input submits a blank centre as `institution: ""`; whitespace normalizes
to the same value. This change does not promise that an omitted/null JSON property is equivalent
to an explicitly blank string.

Change only Institution's `IsEncrypted` declaration in `CandidateEducationConfiguration.cs` to
permit empty plaintext, keeping `.IsRequired()`, the encryption context, text column and envelope
check. Keep other required encrypted properties unchanged. The existing converter can encrypt
empty strings when `requireText` is false. Existing ciphertext needs no backfill or key change.

Review model/snapshot consistency for the changed custom annotation. Use EF scaffolding if model
metadata requires a new snapshot; an empty physical migration is acceptable when generated for
metadata consistency, with the reason documented. No hand-written schema SQL, nullable-column
change, new table/index or grant is planned. Any generated migration runs through the explicit
migrator, retaining constraints, indexes and grants in the same deployment action.

Alternative: introducing nullable Institution would needlessly change domain/JSON contracts and
the encrypted-column constraint. Empty encrypted plaintext preserves compatibility and intent.

### D4 — Centralize contact rules in the existing create/update paths (FR6, FR9)

Add a pure contact-rules helper used by `CandidateService.create/update`; return a normalized copy
of the draft rather than mutating the form. Throw `TranslatableError` for format/length failures.
The API remains authoritative: share backend rules between `CreateCandidateValidator` and
`UpdateCandidateValidator`, adding stable codes to the candidate error vocabulary, for example
`candidate.email.invalid`, `candidate.phone.characters` and `candidate.phone.too_short`.

Validation sequence is blank normalization, outer trim, existing trimmed-length limit, then format.
Whitespace-only contacts normalize to empty and skip format/minimum checks. Keep accepted interior
phone whitespace and punctuation; do not strip it. Count ASCII digits only, independently of total
length. For phone whitespace, use the Unicode White_Space set in both runtimes, including ordinary
spaces, tab and non-breaking space; align outer trimming cases in the shared acceptance fixtures.
Character failure takes precedence over minimum digits, avoiding two contradictory errors.

Use a deliberately small, matching email-shape rule in TypeScript and C#: one `@`, non-empty parts,
no whitespace, angle-bracket display names, comma/semicolon address lists. This is shape validation,
not a full RFC parser or deliverability test; avoid separately choosing browser-native and framework
defaults whose accepted sets differ. Shared fabricated case tables cover ordinary plus-addresses,
all ticket rejection examples, empty/trimmed values and length boundaries. No dependency is needed.

Keep `type="email"` as an input hint, but ensure the existing form submission/error flow reaches
the service rules rather than relying on browser-only validation. Both create and main-data edit
must retain values and show the same field-specific Spanish alert.

The transport already retains ProblemDetails `code` and `errors` in `AppError`. Add the contact-code
translation at the candidate service/presentation boundary using the existing error shape; do not
translate or rewrite unrelated transport failures. Do not include attempted values in errors,
FluentValidation message templates, logs or audit fields. Preserve existing candidate write events.

The import evaluator's existing create-validator call automatically inherits the contact checks.
Keep its separate required-email/duplicate/date/language semantics and existing reason-code flow;
map new contact property failures to phone/email columns where appropriate. Preview and commit
must agree and report failures without persisting candidates or leaking contact content into logs.
No import capability rewrite is required because its existing shared-validation behavior remains.

Alternatives: validating only input attributes leaves direct API writes unprotected; forcing stored
legacy contacts through a cleanup migration would change data without user review. Legacy values
stay readable, and only resubmitted core data must be corrected or cleared. Relation handlers do
not apply core-contact validation to untouched fields.

### D5 — Same-origin assets and translation-backed product name (FR7, FR8)

Reuse the PNG sources verified in the brief, without image generation:

- `https://jovegroup.com/wp-content/uploads/2026/02/Isotipo-150x150.png` →
  `frontend/public/favicon-150.png` (150×150).
- `https://jovegroup.com/wp-content/uploads/2026/02/Isotipo-300x300.png` →
  `frontend/public/favicon-300.png` (300×300), also usable for `apple-touch-icon`.

Record source URLs and provenance in the release notes. Add local `image/png` icon links with
actual `sizes` values in `frontend/index.html`; source HTML advertises mismatched 32/192 sizes,
so do not copy those declarations. Root-relative URLs survive direct SPA routes and Vite copies
`public/` assets to the production output. Keep runtime configuration before the application module.
Do not hotlink: intranet browsers should not depend on or disclose visits to a corporate site.

Set the initial HTML title and Spanish `app.title` to `Kepler Talent`; keep the English value.
Read `app.title` with `useTranslation()` in `app-layout.tsx`. Migrate its skip link, tagline,
sign-out, toast label and dismiss copy to Spanish keys verbatim, including attribute labels,
and remove the shell from `LEGACY_HARDCODED_COPY`. Update README's heading and current references
in the release notes. Preserve technical identifiers and historical documents.

Alternative: a wholesale project rename adds compatibility risk with no requested user value.

### D6 — Preserve authorization, concurrency and private storage (FR9)

Keep endpoint actor/permission guards before validation/dispatch and handler guards before work:
GET candidate requires `candidates.read`; POST core requires `candidates.create`; PUT core,
education, programs and experience require `candidates.update`. Existing updates retain the
aggregate version and 409 handling. Never interpret a validation failure as success or partially
save a core write. No new claims, permissions, roles, RLS policies or grants are introduced.

Relevant tables remain `CND_Candidates`, `CND_CandidateEducation`, `CND_CandidatePrograms` and
`CND_CandidateExperience`. They retain their encrypted fields and approved `ktl_runtime` DML.
Candidate document storage, quarantine/scanning and permission-checked downloads are unchanged;
public favicon PNGs contain no candidate data and are separate static assets.

## Risks / Trade-offs

- Invalid legacy contacts block unrelated main-data edits → state this in the release notes,
  retain the form and allow correction/clearing; relation panels keep working.
- Shared import validation rejects previously accepted phones → cover preview/commit outcomes
  and document the stricter input contract without weakening import-required columns.
- TypeScript/.NET whitespace, length and numeric coercion can differ → share fabricated fixture
  cases, test null program years and digit counts separately from formatted length.
- Sorted indexes can target the wrong record → keep canonical write collections and id-based
  actions; test a middle-entry update/removal after sorting and retained hidden notes.
- Favicon caches can show the old tab icon → use explicit versioned filenames and test a fresh
  browser context; inspect local asset responses in development and production.
- EF custom annotation drift can trigger model-pending errors → check model/snapshot after the
  converter configuration change; scaffold only the required EF migration and inspect its output.

## Migration Plan

1. Implement and verify on `feat/KTL-48`; no implementation task is complete at planning time.
2. If generated, apply the reviewed EF metadata migration through `--migrate` as `ktl_migrator`.
   There is no candidate-data rewrite, key rotation or runtime-startup migration.
3. Deploy the API validators/converter and rebuilt SPA in the same release; rebuild nginx so
   port 4200 serves the new assets. Port 4300 remains the working-tree verification target.
4. Smoke-test blank-centre save/read, contact refusal, chronological views and local branding.
5. Roll back binaries together if necessary. No new schema needs removal. Previously accepted
   empty-centre rows stay valid encrypted rows; an older mandatory-centre application may require
   the user to fill them on a subsequent education save. Do not delete or fabricate their data.

## Verification Strategy

Update existing tests before broadening coverage. Vitest/RTL covers service validation, duration
formatting, sorting copies/ties, id-based actions, blank-centre form errors, multiline rendering,
form retention and login/shell copy. xUnit covers validators, shared contact cases, encryption
conversion and import semantics; PostgreSQL integration demonstrates actual empty-centre ciphertext,
unchanged other rows, no partial core write, length limits and version conflicts.

API security cases cover anonymous and missing-permission callers using valid/invalid bodies and
existing/unknown ids, ensuring 401/403 precedes validation/lookup. Verify runtime DDL denial and
approved DML, private-document unauthorized denial and no binary/storage-state changes. Run the
frontend security project and existing RLS/storage gates, retaining legacy checks without extending
their paths. Do not infer database least privilege from frontend visibility.

Actually execute targeted candidate-profile, candidate-experience, candidate-crud, authentication,
responsive-navigation and affected import Playwright journeys against 4300. All created records
carry a `Date.now()` marker, use fabricated data and are cleaned up. Exercise 390px and desktop,
save/reload, keyboard/focus, session/conflict retention and a fresh-context favicon check. Build the
frontend and inspect generated icon responses; a manual browser-tab visual check complements
request assertions without adding static-markup-only tests. Finish with affected integration suites,
`npm run build:all`, lint and repository format check, recording actual results and limitations in
`docs/ktl-48/release-notes.md`. No standing-principle exception is required.
