# Tasks

Source: `openspec/KTL-48.md`. FR references identify requirements in `proposal.md`; D references
identify decisions in `design.md`. Each task is sized at no more than two hours. All npm/npx
commands run from `frontend/`; dotnet commands run from the repository root. On Windows use
`npm.cmd`/`npx.cmd` if PowerShell script policy blocks the corresponding `.ps1` wrapper.
Record actual commands and inspected outcomes in `docs/ktl-48/release-notes.md`; do not mark a
verification task complete based on an intended command or an unexecuted test.

## 0. Create Feature Branch

- [x] 0.1 Create or switch to `feat/KTL-48` without losing unrelated work; verify the branch with `git branch --show-current` and inspect `git status --short`. (FR1–FR9)
- [x] 0.2 Check Node/npm, pinned .NET SDK and Docker prerequisites; run `npm ci`, `dotnet tool restore` and `dotnet restore backend/KeplerTalento.slnx` if needed, and verify the existing local stack/API is ready without resetting volumes. (FR9)

## 1. Core contact validation

- [x] 1.1 Review and update affected existing validator/service/form test cases; add shared fabricated contact cases for blanks, trimming, plus-address email, rejected email shapes, phone character/digit boundaries, whitespace and 40/255 length limits. Verify both runtimes load the same case data. (FR6, FR9; D4)
- [x] 1.2 Add shared backend rules to create/update validators and stable error codes without attempted values; verify focused xUnit create/update/contact tests pass and unauthorized handler behavior stays fail closed. (FR6, FR9; D4, D6)
- [x] 1.3 Add normalized-draft contact validation to `CandidateService.create/update`, translated `TranslatableError` messages and contact API-code translation; verify `candidate.service.spec.ts` covers refusal before gateway calls, accepted normalization and unchanged unrelated errors. (FR6; D4)
- [x] 1.4 Wire existing create/main forms to the validation/error flow without losing controlled values; update `candidate-form.spec.tsx` and affected page tests, run those Vitest specs and verify accessible Spanish alerts, no browser-only validation dependency and retention after failure. (FR6, FR9; D4)
- [x] 1.5 Review import evaluator reuse and map contact property failures to the existing row outcome; update and run `ImportRowSemanticsTests` and relevant `ImportApiTests` to verify preview/commit agree and existing import-required email/duplicate/date rules remain. (FR6, FR9; D4)
- [x] 1.6 Extend and run `CandidateApiTests` against real PostgreSQL for valid/invalid create/update, empty contacts, unchanged state after rejection, legacy-contact correction and 409 on a valid stale update; inspect outputs and resulting aggregate state. (FR6, FR9; D4, D6)
- [x] 1.7 Document the exact contact rules, optionality, Spanish messages, stricter import handling and legacy-contact correction in `docs/ktl-48/release-notes.md`; verify examples match the shared cases and delta requirements. (FR6; D4)
- [x] 1.8 Extend and actually run the contact creation/update scenarios in `npx playwright test tests/e2e/candidate-crud.spec.ts` against 4300; verify rejection, correction, save/reload and test-record cleanup using `Date.now()` markers. (FR6, FR9)

## 2. Optional encrypted education centre

- [x] 2.1 Review and update affected `candidate-relations.service.spec.ts` and profile-section tests; allow a blank centre through the frontend validator/editor and verify add/clear keeps other mandatory fields and accessible errors intact by running those Vitest specs. (FR3, FR9; D3)
- [x] 2.2 Remove only the API centre mandatory-text validation and Institution encryption `requireText` annotation; retain non-null encryption, length checks and domain trimming, and run focused education/encryption/text-limit unit tests for empty and existing values. (FR3, FR9; D3)
- [x] 2.3 Check EF model/snapshot consistency; if required, scaffold a metadata migration using `dotnet ef migrations add AllowEmptyEducationInstitution --project backend/Infrastructure --startup-project backend/Web --output-dir Persistence/Migrations`, inspect generated operations/snapshot and verify constraints/indexes/grants are retained. If no migration is needed, record the executed consistency check and result. (FR3, FR9; D3)
- [x] 2.4 Extend and run `CandidateApiTests` and `CandidateSchemaTests` on real PostgreSQL; verify empty/whitespace/cleared centre round-trips, unchanged non-empty centres, overlong rejection, required fields and valid stale-version 409. Inspect the stored non-null encrypted envelope and unchanged unrelated rows without exporting personal values. (FR3, FR9; D3, D6)
- [x] 2.5 Add the centre contract, encryption behavior, deployment/rollback implications and any generated migration details to the release notes; verify the documentation matches actual model and API test outcomes. (FR3; D3)
- [x] 2.6 Extend and actually run the optional-centre journey in `npx playwright test tests/e2e/candidate-profile.spec.ts`; verify blank add, existing-centre clear, reload and retained required fields using marked fabricated records and inspect cleanup. (FR3, FR9)

## 3. Candidate presentation and chronological history

- [x] 3.1 Preserve observations with scoped whitespace/wrapping CSS and escaped text; update and run `candidate-detail-page.spec.tsx` and affected main-panel tests for multiline/blank-line and literal-markup rendering. Verify no HTML interpretation is introduced. (FR1; D1)
- [x] 3.2 Fix null/empty year conversion and conditional duration labels/separators for programs and experience; update and run affected relation/profile/period helper specs covering absent, null, zero, singular, plural, decimals and date-derived positive years. Verify stored values and date calculations are unchanged. (FR2; D1)
- [x] 3.3 Add stable pure sort helpers for education and experience; run focused unit tests for current groups, end/start fallback, undated cases, ties and non-mutating input arrays. Verify the full ticket example order. (FR4, FR5; D2)
- [x] 3.4 Apply sorted derived lists in read/edit views while retaining canonical write collections and id-based actions; update and run profile-section tests for add/date-edit repositioning, no opening write, correct middle-entry edit/remove and preserved hidden notes/disclosure state. (FR4, FR5, FR9; D2)
- [x] 3.5 Document multiline observations, hidden year labels and exact chronology/tie behavior in the release notes; verify each documented example maps to a passing scenario. (FR1, FR2, FR4, FR5)
- [x] 3.6 Extend and actually run `npx playwright test tests/e2e/candidate-profile.spec.ts tests/e2e/candidate-experience.spec.ts` at desktop and 390px; verify save/reload, period ordering, date-derived years, no dangling separators, keyboard/focus, no horizontal scroll and retained drafts after refused writes. Inspect marker-based cleanup. (FR1–FR5, FR9)

## 4. Local corporate branding

- [x] 4.1 Download the two verified Jove Group PNGs to `frontend/public/favicon-150.png` and `favicon-300.png`; inspect their PNG MIME types/dimensions and artwork, add same-origin icon/touch-icon links in `index.html`, and verify URLs resolve on login and a direct SPA route without external icon requests. (FR7; D5)
- [x] 4.2 Set the initial document title and Spanish `app.title` to Kepler Talent; use `t('app.title')` in the shell, migrate its other literals/attribute labels verbatim to i18n and remove its legacy lint exception. Update and run login and affected shell tests for the new brand and unchanged Spanish accessible names. (FR8, FR9; D5)
- [x] 4.3 Update the Spanish README heading and document local icon source URLs, actual sizes, product name and caching considerations in the release notes; verify the app-wide displayed name is consistent without changing technical identifiers or historical records. (FR7, FR8; D5)
- [x] 4.4 Run `npm run build`, inspect emitted HTML/assets and locally serve the production output to verify icon responses and initial title; visually confirm the favicon in a fresh browser context. Record actual observations rather than adding static-markup-only tests. (FR7, FR8; D5)
- [x] 4.5 Extend and actually run `npx playwright test tests/e2e/authentication.spec.ts tests/e2e/navigation-responsive.spec.ts` against 4300; verify login/shell names, document title, same-origin icons, keyboard navigation, sign-out and 390px layout. (FR7–FR9)

## 5. Integration and security gates

- [x] 5.1 Extend/review API authorization cases for core create/update and education with anonymous callers, actors missing the specific permission, valid/invalid bodies and existing/missing ids; run them and verify 401/403 precedes validation/lookup, no partial persistence and no personal data in errors/logs/audit. (FR3, FR6, FR9; D6)
- [x] 5.2 Run the affected PostgreSQL least-privilege and private-document integration checks; verify `ktl_runtime` approved DML still works, DDL is denied, unauthorized document access is refused, encrypted centres remain non-null, and storage binaries/quarantine metadata have not changed. Record evidence without private paths or candidate content. (FR3, FR6, FR9; D3, D6)
- [x] 5.3 Review/update applicable `frontend/tests/security/` boundary coverage and run `npm run test:security`, `npm run security:rls` and `npm run security:storage`; inspect fail-closed results and retain checks for unchanged legacy paths without adding new Supabase/localStorage usage. (FR9; D6)
- [x] 5.4 Run the affected frontend integration suites (`npm run test:integration`) and backend unit/integration suites (`dotnet test backend/KeplerTalento.slnx --no-restore`); inspect actual outcomes, including import and experience regressions, and resulting PostgreSQL/storage state. (FR1–FR9)
- [x] 5.5 Run `npx playwright test tests/e2e/candidate-import.spec.ts` for affected shared-validation behavior, inspect outcomes and cleanup; restore any changed shared seed fixtures without destroying development data. Confirm other targeted browser runs above passed against 4300. (FR6, FR9)
- [x] 5.6 Run `npm run build:all`, `npm run lint` and `npm run format:check`; inspect their outputs and resolve failures introduced by this change. Validate the OpenSpec change and confirm all KTL-48 acceptance scenarios have executed evidence before marking implementation complete. (FR1–FR9)
- [x] 5.7 Consolidate the actual command outcomes, security/database/storage evidence, browser checks and any limitations in the release notes; verify no unexecuted command is claimed as passing and no private data/path is included. (FR9)

## Workflow follow-up

- Synchronize the four capability deltas and archive through the OpenSpec skills after implementation and verification, retaining `ktl-48-candidate-detail-and-branding` in the dated archive name.
- Commit, push or open a pull request only when explicitly requested.
