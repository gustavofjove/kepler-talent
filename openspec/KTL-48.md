## [original]

A few updates to the candidate detail page:

- "Observaciones internas" doesn't keep the break lines when in read-only mode
- Programs, skills, etc.: If you don't enter the amount of years it always says "0 años". Should be empty
- Experience: "Centro" seems to be mandatory. If so make it optional
- Formación y Experiencias: should be sorted in opposite order i.e. latest at the top and oldest at the bottom

### Additional user request

Also I'd like some validation for the email (email format) and phone number (only +() whitespaces and digits and a minimum length

Confirmed minimum: 9 digits, excluding `+`, parentheses and whitespace from the count.
Email and phone remain optional; validate supplied values on create and main-data save in
both the frontend and API.

### Additional user request — favicon

Also could we add the same favicon as [https://jovegroup.com/](https://jovegroup.com/)? Do you need me to download it for you?

### Additional user request — application name

Ok. Finally I'd like to rename the application to be Kepler Talent rather than Kepler Talento

## [enhanced]

# KTL-48 — Candidate detail improvements, contact validation and application branding

### User story

As an HR user reviewing or maintaining a candidate, I want internal observations to retain
their line breaks, irrelevant year counts to stay hidden, education to be recordable without
a centre, education and experience to appear newest first, and invalid contact details to
be rejected, so I can read the profile accurately and record usable information without
inventing values.

As an application user, I also want the application to be named Kepler Talent and the
browser tab to show the Jove Group favicon, so its identity is consistent and recognizable
among my open tabs.

### Confirmed scope

- Make **Centro in Educación** optional. Empresa in Experiencia remains required.
- Hide both missing year counts and explicit zero counts in displayed chips and entry
  summaries. Do not erase stored zero values or change experience duration calculations.
- Apply the chronological ordering below in both read-only and edit modes.
- Validate optional email and phone fields on candidate creation and main-data updates;
  a supplied phone must contain at least 9 digits.
- Use the same favicon artwork as Jove Group, served locally by Kepler Talent.
- Rename the displayed application from **Kepler Talento** to **Kepler Talent** throughout
  the browser title, login page, application header and current user-facing documentation.
- Keep the existing per-panel workflow: education and experience additions, updates and
  removals persist immediately; Competencias retains its save/cancel draft.

### Functional requirements

1. **Internal observations.** In Datos principales, render `candidate.notes` as plain text
   preserving authored line breaks, including blank lines. Long lines must wrap. Preserve
   the content through edit, save and reload; do not interpret HTML. This concerns
   «Observaciones internas», not the separate custom-notes collection.
2. **Year counts.** Program chips and experience summaries must omit the duration text
   when the displayed value is absent, null or zero, including legacy zero values. Omit
   its separator too, leaving no dangling punctuation or placeholder. Positive values
   keep Spanish singular/plural and existing number formatting, including experience
   decimals. Program and manual-experience inputs remain empty for absent values and may
   retain an explicitly entered zero while editing. Date-derived experience years remain
   calculated and read-only; positive calculated values remain visible. Habilidades,
   Idiomas and Etiquetas have no year field and must not acquire one.
3. **Optional education centre.** Allow adding an education entry with Centro blank and
   clearing it on an existing entry. Trim whitespace and persist an empty centre as an
   empty string, preserving the existing string response contract. The frontend submits
   `institution: ""` for a blank control. Keep maximum-length validation, encryption and
   all other required education fields. An empty centre produces no placeholder or stray
   separator in the entry summary. Existing non-empty centres remain intact.
4. **Education ordering.** Sort by `endYear` descending, with undated entries last.
   Equal years and undated entries retain their relative order from the loaded collection.
5. **Experience ordering.** Put `isCurrent` entries first. Within each group, sort
   descending by `endDate`, falling back to `startDate` when no end date exists; for current
   roles use the start date, since their end date is absent. Entries without either date
   follow dated entries within their group. Break ties by start date descending, with
   missing starts last, then preserve loaded collection order. Thus a current role with
   no dates still precedes completed roles.
6. **Ordering is presentation.** Derive sorted copies; do not mutate signal-backed
   collections or send writes just to reorder. After a successful add or date update,
   recompute the visible order. Entry actions, expanded descriptions and edit state remain
   attached to entry ids. An edit with unchanged dates retains its position; changing a
   date may move the entry. Save errors keep the form and its values available for retry.
7. **Contact validation.** Email and phone remain optional: blank or whitespace-only
   values are treated as empty. Trim leading/trailing whitespace before validation and
   saving. Validate in the frontend service before sending a create/update request and in
   the API regardless of the client; HTML input types alone are insufficient.
   - A supplied email must be a single address with a non-empty local part and domain,
     exactly one `@`, and no embedded whitespace or display-name/list syntax. Accept
     ordinary addresses such as `ana.perez+rrhh@example.com`; reject `ana`, `ana@`,
     `@example.com`, `ana@@example.com` and `ana perez@example.com`. Use consistent
     frontend/API cases; do not perform DNS, mailbox ownership or deliverability checks.
   - A supplied phone permits only ASCII digits `0`–`9`, `+`, `(`, `)` and whitespace,
     and must contain at least **9 digits**, counting digits only. Accept both
     `612345678` and `+34 (612) 345 678`. Reject letters, extensions, hyphens, dots and
     other characters, and reject a value containing only punctuation or fewer than
     9 digits regardless of its total character count. This is a character/minimum-digit
     check, not country-specific numbering or punctuation-position validation.
   - Retain existing maximum lengths (`CandidateTextLimits.Phone = 40` and
     `CandidateTextLimits.Email = 255`). Preserve accepted phone formatting after outer
     trimming; do not strip invalid characters to make an invalid number pass.
   - Show Spanish errors that identify the invalid field and distinguish unsupported
     phone characters from too few digits, e.g. «Introduce un correo electrónico válido.»,
     «El teléfono solo puede contener dígitos, +, paréntesis y espacios.» and
     «El teléfono debe contener al menos 9 dígitos.». Use i18n keys and
     `TranslatableError` in the service, stable API validation codes and existing
     ProblemDetails/error translation. Never include the submitted contact value in
     errors or logs. Keep form values on failure and announce the error accessibly.
   - Existing invalid contact data remains readable without automatic cleanup. Saving
     Datos principales requires correcting or clearing invalid contacts, even if another
     main field changed; unrelated relation-panel writes must remain possible.
8. **Corporate favicon.** Replace the missing application favicon with the existing
   Jove Group artwork, retaining its colors, proportions and transparency. Apply it to
   the shared HTML entry point so the login page and all SPA routes use the same icon.
   Bundle copies under `frontend/public/` and reference them with same-origin URLs in
   `frontend/index.html`; no runtime request to Jove Group or third-party icon service
   is allowed. The assets are publicly downloadable; the user does not need to provide
   them. Download the existing artwork during implementation rather than recreating it.

   Source verified on 2026-11-12 from the site's HTML and PNG responses:

   | Site declaration                                         | Verified source asset                                                                       | Actual dimensions |
   | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------- |
   | `rel="icon"`, declared `32x32`                           | [Isotipo-150x150.png](https://jovegroup.com/wp-content/uploads/2026/02/Isotipo-150x150.png) | 150 × 150 PNG     |
   | `rel="icon"`, declared `192x192`, and `apple-touch-icon` | [Isotipo-300x300.png](https://jovegroup.com/wp-content/uploads/2026/02/Isotipo-300x300.png) | 300 × 300 PNG     |

   Use correct MIME types and actual dimensions in local link metadata rather than
   copying the source site's mismatched `sizes` values. A local apple-touch-icon may
   reuse its published artwork. No new PWA manifest, install flow or generated logo is
   needed. Use the Kepler Talent page title and preserve existing runtime-config loading.

9. **Application name.** Display the exact product name «Kepler Talent» in the initial
   HTML document title, login heading and authenticated shell brand. The brand is the
   same in Spanish and English; all other UI copy remains Spanish. Update the existing
   `app.title` translation rather than introducing a second product-name key; the English
   value already reads `Kepler Talent`. Make the shell consume that key through `t()`.
   - `frontend/src/app/core/layout/app-layout.tsx` is currently the remaining member of
     `LEGACY_HARDCODED_COPY`. When changing its brand copy, migrate all its UI literals
     (including skip link, tagline, buttons and notification label) to i18n keys, preserving
     their existing Spanish wording and behavior, then remove the file from that exception
     list in `frontend/eslint.config.js` in the same implementation change.
   - Update the README heading and current product references in documentation changed
     by this ticket. Keep README prose Spanish. Historical ticket originals and archived
     specifications retain the name used when written.
   - This is a display-name change: no rename of C# namespaces/projects, assembly names,
     repository paths, database identifiers, configuration keys, API routes or permissions
     is needed. It requires no data migration or new runtime dependency.

### Existing architecture and affected files

Frontend paths below are relative to `frontend/`:

The favicon affects `index.html` and static PNG assets in `public/`, independently of
candidate components. Vite must include those assets in the production output.
The name change also affects `src/assets/i18n/es.json` (`app.title`),
`src/app/core/layout/app-layout.tsx` and `eslint.config.js`. The login page at
`src/app/core/auth/login-page.tsx` already reads `app.title`; retain that behavior.

| Area                          | Existing files and intended responsibility                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observations                  | `src/app/features/candidates/components/candidate-main-panel.tsx` and its `.css`: preserve plain-text line breaks and wrapping in the read view.                                                                                                                                                                                                                                         |
| Program years                 | `src/app/features/candidates/components/candidate-relation-section.logic.ts` (`detailText` and year conversion), with `candidate-relation-section.tsx` as needed: handle null/absent/zero consistently without changing persisted values.                                                                                                                                                |
| Experience years and ordering | `src/app/features/candidates/components/candidate-experience.tsx`, `candidate-period.logic.ts` and sibling `.logic.ts` helpers as appropriate.                                                                                                                                                                                                                                           |
| Education centre and ordering | `src/app/features/candidates/components/candidate-education.tsx` and `src/app/features/candidates/services/candidate-relations.service.ts` (`validateEducationEntry`); sibling pure helpers for sorting.                                                                                                                                                                                 |
| Contact validation            | `src/app/features/candidates/services/candidate.service.ts`: shared rules invoked by `create` and `update`, in a sibling `.ts` helper if useful. `src/app/features/candidates/components/candidate-form.tsx`, `candidate-main-panel.tsx` and `src/app/features/candidates/pages/candidate-create-page.tsx`: retain controlled inputs and use the existing accessible error presentation. |
| Copy                          | `src/assets/i18n/es.json`: any changed labels, optional-field hints or validation copy, with correct Spanish and `t()`.                                                                                                                                                                                                                                                                  |

Continue using function components, controlled forms, `useCandidates()` subscriptions and
the existing singleton services wired in `core/di/services.ts`. HTTP stays in
`candidate.api.ts` over `core/http/api-transport.ts`. No new service or shared component is
required; keep any reusable helper in a `.ts` module rather than exporting it from `.tsx`.

Backend paths are relative to the repository root:

- `backend/Web/Features/Candidates/CandidateEndpoints.cs` already exposes the required
  routes; do not introduce new endpoints.
- `backend/Application/Features/Candidates/CreateCandidate.cs` and `UpdateCandidate.cs`
  currently validate contact length only. Add the same format/minimum-digit rules to
  both command validators, sharing pure validation logic and stable error codes where
  appropriate. Preserve the `Domain` → `Application` → `Infrastructure` → `Web` graph.
  Review `backend/Application/Import/CandidateImportRowEvaluator.cs`: imports reuse the
  create validator and must surface invalid contacts through the existing row-validation
  flow rather than bypassing the new rules. No import UI redesign is needed.
- `backend/Application/Features/Candidates/SetCandidateRelations.cs` contains
  `CandidateEducationInput`, `SetCandidateEducationCommand`, its validator and
  `SetCandidateEducationHandler`. Remove only the centre's mandatory-text validation,
  retaining its length limit. Review normalization against
  `backend/Domain/Candidates/CandidateEducation.cs`.
- `backend/Infrastructure/Persistence/Configurations/CandidateEducationConfiguration.cs`
  currently marks Institution with `IsEncrypted(..., requireText: true).IsRequired()`.
  Permit encrypted empty plaintext for this property without relaxing other properties or
  disabling encryption. Keep the physical column non-null and its encrypted-envelope check.
- Review `CandidateContract.cs` and `CandidateProjection.cs` in the candidate application
  slice for compatibility. No new response fields or server-side chronological ordering
  are required.

### API, persistence and security contract

| Existing operation                    | Requirement                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/candidates/{id}`            | Requires `candidates.read`; returns existing observations, optional year values and education centre through the existing aggregate projection.          |
| `POST /api/candidates`                | Requires `candidates.create`; `CreateCandidateCommand` rejects supplied invalid email/phone before persistence, keeping blank contacts valid.            |
| `PUT /api/candidates/{id}`            | Requires `candidates.update`; `UpdateCandidateCommand` applies the same contact validation as create; observations continue to round-trip as plain text. |
| `PUT /api/candidates/{id}/education`  | Requires `candidates.update`; accepts an empty `institution` in the existing `{ education, version }` body through `SetCandidateEducationCommand`.       |
| `PUT /api/candidates/{id}/programs`   | Existing `{ programs, version }` body and `SetCandidateProgramsCommand`; preserve optional years and explicit zero values.                               |
| `PUT /api/candidates/{id}/experience` | Existing `{ experience, version }` body and `SetCandidateExperienceCommand`; preserve duration rules and required Empresa/Puesto.                        |

Existing-record writes retain aggregate optimistic concurrency, return the updated aggregate
and reject stale versions with 409; creation returns a new aggregate without a prior token.
Contact validation failures use the existing validation ProblemDetails contract and do not
persist any part of the request. Endpoint and handler guards must check `ICurrentActor` and the
specific permission before validation or lookup. Program and experience writes require
`candidates.update` too.

Relevant existing tables are `"CND_Candidates"` (observations and encrypted contact details),
`"CND_CandidateEducation"` (centre and end year), `"CND_CandidatePrograms"` and
`"CND_CandidateExperience"` (duration/date values). No new tables, indexes, permissions,
roles, storage access or grants are required. Preserve existing `ktl_runtime` DML grants
and its inability to perform DDL. Keep personal fields encrypted and out of logs, audit
payloads and error details.

Empty encrypted centre text can use the current non-null encrypted column, so no physical
schema change is expected. Review EF model/snapshot consistency when changing the encryption
annotation; any required model migration must be generated under
`backend/Infrastructure/Persistence/Migrations/`, run as `ktl_migrator`, and preserve existing
encryption constraints and least-privilege grants. Do not hand-edit SQL or rewrite historical
migrations. Do not extend Supabase or localStorage paths or add runtime dependencies.

### Acceptance scenarios

1. **Multiline observations:** Given observations containing two lines separated by a blank
   line, when saved and the candidate reloaded, then the read view displays the same line
   and paragraph separation. Literal `<script>` text is displayed as text and never runs.
2. **No visible zero duration:** Given program and manual-experience entries with missing,
   null or zero years, when viewed or listed in edit mode, then none shows «0 años», a
   duration placeholder or an orphan separator. An unrelated edit does not turn missing
   years into zero or erase an existing zero.
3. **Positive duration:** Given values 1, 3 and experience 3.5, then the appropriate entries
   display «1 año», «3 años» and «3,5 años». An experience with complete dates keeps its
   calculated positive duration even when its previously supplied manual value was zero.
4. **Centre omitted by the user:** Given valid education type, degree and status, when an
   editor adds an entry with blank or whitespace-only Centro, then it persists and reads
   back with `institution: ""`. Clearing an existing centre also persists. Other required
   fields and the centre's maximum length remain enforced.
5. **Education chronology:** Given entries for 2020, no year, 2024 and another 2024, then
   both views show the two 2024 entries in their loaded relative order, then 2020, then the
   undated entry. Changing 2020 to 2025 moves that entry to the top after a successful write.
6. **Experience chronology:** Given current roles starting in 2024 and 2022, a current role
   without dates, completed roles ending in 2023 and 2020, a non-current role with only a
   2021 start and one without dates, then they appear in that order except the 2021 role
   precedes the 2020 role. Equal effective dates use descending start date, then stable
   loaded order. Entering edit mode preserves the same visible ordering.
7. **Safe writes and concurrency:** Opening either sorted panel sends no write. Editing or
   removing a sorted entry targets its id. A stale-version write returns 409 and leaves
   the stored aggregate unchanged; the editor retains entered values and shows the error.
8. **Fail-closed access:** An unauthenticated caller cannot read or write the candidate;
   a reader without update permission cannot write education, including with a valid blank
   centre, an invalid body or an unknown candidate id. Refusal precedes validation/lookup.
9. **Accessible responsive view:** At 390px and desktop widths, multiline observations
   wrap without horizontal page scrolling. Labels, keyboard actions, focus restoration,
   entry disclosures and accessible error announcements continue to work after reordering.
10. **Optional contacts and valid email:** Creating or updating with empty or
    whitespace-only contacts succeeds with empty values. A trimmed
    `ana.perez+rrhh@example.com` succeeds; each malformed email example above is rejected
    in the service without a request and by a direct API call without persistence.
11. **Phone character and digit boundaries:** On both create and update, `612345678`
    and `+34 (612) 345 678` succeed, while `61234567`, `+(12) 345 678`, `612-345-678`,
    `612.345.678`, `612345678 ext 1` and `+++()` fail. Nine digits with allowed formatting
    pass; eight digits with enough formatting to exceed nine characters still fail.
    Existing length limits remain enforced for both contact fields.
12. **Invalid stored contacts:** A candidate with an old invalid phone remains readable.
    Saving another main-data field is refused until that phone is corrected or cleared;
    the form retains changes. Saving education or experience does not validate or rewrite
    the untouched contact fields.
13. **Contact security and import:** Anonymous callers and actors missing the relevant
    create/update permission are refused before contact validation, with valid or invalid
    values. Rejected authorized writes leave the database unchanged. Import rows with
    invalid contacts are reported through existing validation outcomes, without leaking
    contact values into logs or bypassing the create rules.
14. **Corporate favicon on every page:** Given the locally served login page or a direct
    candidate route, when the browser loads the document, then its icon links resolve to
    local PNG assets showing the same artwork as the verified Jove Group sources. Assets
    return successfully in development and the production build, with correct MIME types
    and dimensions. No favicon request leaves the application origin, even when external
    network access is unavailable. Visually confirm the browser-tab icon after a fresh
    load, accounting for favicon caching.
15. **Consistent product name:** On a fresh load of login and on an authenticated candidate
    page, the browser document title is «Kepler Talent», the login heading and shell brand
    show that exact name wherever applicable, and no visible product-name label says
    «Kepler Talento». The README heading uses the new name. Existing Spanish shell text,
    keyboard navigation, toast actions and sign-out behavior remain unchanged, and the
    shell no longer needs the hardcoded-copy lint exception.

### Verification required during implementation

- Update affected Vitest/React Testing Library coverage in
  `frontend/tests/unit/candidate-detail-page.spec.tsx`,
  `candidate-profile-sections.spec.tsx`, `candidate-period.logic.spec.ts` and
  `candidate-relations.service.spec.ts`; cover year formatting and stable sorting with
  focused helper tests. Review affected integration coverage under
  `frontend/tests/integration/` for API round-trip and normalization regressions.
- Extend `frontend/tests/unit/candidate.service.spec.ts` and `candidate-form.spec.tsx`
  for contact validation on create/update, optional and trimmed values, character and
  digit-count boundaries, existing maximum lengths, translated errors and retained form
  values. Use matching frontend/backend case tables to avoid format-rule differences.
- Update xUnit coverage in `backend/Tests/UnitTests/Features/CandidateHandlerTests.cs`
  and relevant encryption/text-limit tests. Exercise empty-centre create/update/read,
  whitespace normalization, length rejection and retained required fields using the real
  PostgreSQL fixture in `backend/Tests/IntegrationTests/CandidateApiTests.cs` and
  `CandidateSchemaTests.cs`; retain experience-duration coverage in
  `CandidateExperienceApiTests.cs`.
- Cover contact cases in create/update validator tests and `CandidateApiTests.cs`,
  including no partial persistence, missing create/update permissions and invalid legacy
  contacts. Update affected import validation tests for the reused create validator.
- Demonstrate that an empty centre still stores an encrypted envelope, previous centres
  still decrypt, runtime grants remain unchanged, and anonymous/unauthorized API requests
  fail closed. Review `frontend/tests/security/` boundary coverage and run the applicable
  security checks; existing private-document access must stay unchanged.
- Extend and actually run `frontend/tests/e2e/candidate-profile.spec.ts` against port 4300,
  covering save/reload, hidden years, optional centre, contact validation and both sort orders.
  Cover contact validation on creation in the applicable create journey too. Mark every
  created record with `Date.now()` for teardown. Include desktop and 390px assertions.
- Run affected frontend/backend unit and integration suites, the security gates, and
  `npm run lint` plus `npm run format:check` from `frontend/`; inspect actual outputs
  before marking implementation tasks complete.
- For the favicon, build the frontend and inspect the emitted HTML and assets. Verify
  local icon URLs and successful image responses in the browser on login and a direct
  SPA route, then visually confirm the tab artwork. Avoid adding tests that only mirror
  static link markup; no backend or database tests are required for the favicon itself.
- Update `frontend/tests/unit/login-page.spec.tsx` and affected shell coverage for the
  displayed name. Exercise the browser title and shell brand in the existing authentication
  or navigation e2e journey; keep responsive navigation and accessible names working after
  migrating shell copy. Confirm the hardcoded-copy lint exception is removed.

### Documentation and non-functional requirements

Update `openspec/specs/candidate-profile-pages/spec.md` and
`openspec/specs/candidate-persistence/spec.md` through the subsequent OpenSpec change,
including the exception to required centre text, repositioning after date edits and the
optional-contact format/minimum-digit contract. Add
`docs/ktl-48/release-notes.md` with user-visible behavior and the retained encryption
contract, plus favicon asset provenance, local hosting and the new product name. Update
the README.md heading to Kepler Talent while keeping its prose Spanish; include any
operator instruction changes if needed.

Use CSS consistent with Kepler tokens, preserve labels, `name` attributes and test ids,
and source changed UI copy from i18n. Sorting should cost O(n log n) within the already
loaded aggregate, with no extra requests, per-entry database lookups or changes to search
filters, pagination or query performance. Protect personal data throughout; document
binaries and storage paths are outside this change's scope.
