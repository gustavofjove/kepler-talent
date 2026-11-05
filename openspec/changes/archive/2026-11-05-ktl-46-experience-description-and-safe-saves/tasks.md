## 0. Create Feature Branch

- [x] 0.1 Create and check out the `feat/KTL-46` branch (the user commits and pushes themselves)

## 1. Pre-checks

- [x] 1.1 Measure the longest decrypted `Functions` value on a migrated dataset (operator tool or the reconciliation report, nothing printed but the length). Confirm `CandidateTextLimits.Functions = 20_000`, or raise it, and record the result in `design.md` Open Questions. (Local stack 1,038 rows, max 83; KTL-7 fixture max 19; limit stands, validator-only per KTL-33.)
- [x] 1.2 Confirm Lexical 0.51 exports underline as `<u>` from `$generateHtmlFromNodes`, or wrap it explicitly (design D6) (confirmed in `TextNode.exportDOM`: `$wrapElementWith(element, 'u')`)

## 2. Backend: shared sanitizer

- [x] 2.1 Generalise `IPositionDescriptionSanitizer` into `IRichTextSanitizer` with `RichTextProfile.PositionDescription` and `RichTextProfile.ExperienceFunctions` (allowlist plus `u`). Move the implementation to `Infrastructure/RichText/` and update its DI registration.
- [x] 2.2 Switch `ManagePositions` to the new abstraction without changing behaviour
- [x] 2.3 Add `RichTextLegacy.ToSafeHtml` (canonical sanitised values passed through; anything else encoded and split into `<p>` per non-empty line — design D3)
- [x] 2.4 Review `PositionSanitizerTests` (must pass unchanged) and add experience-profile and legacy-conversion unit tests (existing assertions unchanged; 61 passed with `PositionHandlerTests`)

## 3. Backend: experience years and functions

- [x] 3.1 Domain: `CandidateExperience.YearsExperience` becomes `decimal?`; add `ExperienceYears.From(start, end, isCurrent, today)`; add `CandidateTextLimits.Functions`
- [x] 3.2 Contract: `CandidateExperienceInput.YearsExperience` and `CandidateExperienceResponse.YearsExperience` become `decimal?`
- [x] 3.3 Validator: years between 0 and 100 with scale ≤ 1. The messages carry no value.
- [x] 3.4 Handler: sanitise functions with the experience profile and refuse an over-long sanitised value (`RequestValidationException`, positions pattern), and store worked-out years when derivable, else the caller's value. The permission guard stays first.
- [x] 3.5 Projection: return functions through `RichTextLegacy.ToSafeHtml`
- [x] 3.6 Configuration: `numeric(4,1)` and the replaced check constraint; functions stay unbounded in the converter (design D5)
- [x] 3.7 Generate the migration with `dotnet ef migrations add ExperienceYearsDecimal --project backend/Infrastructure --startup-project backend/Web --output-dir Persistence/Migrations` and review the generated Up/Down (`20261104154142_ExperienceYearsDecimal`; local data max 11 years, none above 100)
- [x] 3.8 Update `Tools/DataMigration` (`ExportContract`, `RowValidator`, `MigrationLoader`) and `Tools/TestDataGenerator` for the decimal type (the Access source stays integer and converts implicitly; `RowValidator` now reports years outside 0–100 instead of failing the load)
- [x] 3.9 Review and update the affected backend unit tests (`CandidateTextLimitTests`, `CandidateHandlerTests`, `RowValidatorTests`, `GeneratedExportSetTests`); add `ExperienceYears` table-driven tests using the shared cases (`Tests/Fixtures/ktl-46/experience-years-cases.json`; 979 unit tests passed)

## 4. Backend: integration and security evidence

- [x] 4.1 `CandidateApiTests` (new `CandidateExperienceApiTests`, real token pipeline):
  - rich functions round trip;
  - dangerous markup removed and `b`/`i`/`u` normalised;
  - over-long functions refused without echoing the value;
  - worked-out years override a client value;
  - typed decimal years round trip;
  - out-of-range years refused.
- [x] 4.2 `CandidateApiTests`: `PUT /experience` without a token returns 401, and with a read-only user returns 403, both before validation (oversized and malicious bodies included) (in `CandidateExperienceApiTests`; malformed JSON exposed a pre-binding 400, fixed by reading the body after `Require` as `/availability` does)
- [x] 4.3 `CandidateSchemaTests` / `MigrationSecurityEvidenceTests`: column type `numeric(4,1)`, the new check constraint, `ktl_runtime` grants unchanged
- [x] 4.4 `EncryptedStorageSecurityTests`: rich-text functions are stored as ciphertext
- [x] 4.5 Run `npm run test:backend` from `frontend/` (Docker running) and inspect the result; inspect the migrated column and constraint in the local PostgreSQL after `docker compose up --build migrator api` (979 unit passed; 566/567 integration passed — the one failure, `EncryptedSearchPerformanceTests` p95 budget, fails identically on unchanged `main` on this machine; local DB shows `numeric(4,1)`, the new check and `20261104154142_ExperienceYearsDecimal`)

## 5. Frontend: shared rich-text editor

- [x] 5.1 Extract `RichTextEditor` and `RichTextView` into `src/app/shared/components/rich-text-editor.tsx` (+ `.css`), with a `formats` prop and vertical resize
- [x] 5.2 Re-point `position-description-editor.tsx` at the shared components with its current formats, `name="description"` and test ids
- [x] 5.3 Move the toolbar copy to `richText.*` keys in `es.json` and `en.json`; add `richText.underline`
- [x] 5.4 Review the existing position editor and page unit specs (must pass unchanged); add a shared editor spec (formats offered, underline only when asked) (position specs unchanged, 60 passed; `rich-text-editor.spec.tsx` 7 passed)

## 6. Frontend: Experiencia

- [x] 6.1 Add `experienceYears(entry, today)` to `candidate-period.logic.ts`, using the same cases as the xUnit tests
- [x] 6.2 Form:
  - `grid three` layout, with «Puesto actual» under Fecha fin;
  - read-only worked-out years with `aria-describedby`, manual input `step="0.1"` otherwise;
  - «Descripción» editor (`name="functions"`, `data-testid="experience-functions-editor"`) spanning the width;
  - keep every existing `name=` and test id.
- [x] 6.3 `normalizeExperience` and `validateExperienceEntry`: refuse an over-long description with `TranslatableError('candidate.profile.experience.functionsTooLong')`. Worked-out years are not written into the draft: the API recomputes them, and doing it client-side would dirty an untouched current role or migrated entry.
- [x] 6.4 Read-only accordion: a disclosure button per entry with a description (`experience-toggle`, `aria-expanded`, `aria-controls`), `RichTextView` region (`experience-description`), collapsed on save or leaving edit mode, plain row otherwise
- [x] 6.5 Years shown with `formatNumber` in rows and form; update `candidate.models.ts` docs for `functions` and `yearsExperience`
- [x] 6.6 Add the `candidate.profile.experience.*` keys from the brief to `es.json` and `en.json`; styles for the accordion and the editor in `candidate-panel.css`/`styles.css`
- [x] 6.7 Update `scripts/seed-demo-data.lib.js` `yearsBetween` to the one-decimal formula and its spec `tests/unit/seed-demo-data.lib.spec.ts`

## 7. Frontend: session end with unsaved changes

- [x] 7.1 Add `UnsavedChangesRegistry` in `src/app/core/state/`, wire it in `core/di/services.ts`, and register the candidate page while `dirty` (the page's `useBlocker` now takes a function that lets a different-user sign-in leave)
- [x] 7.2 `AuthService.handleUnauthorized()`: sign out only when nothing is unsaved; otherwise discard the token, keep the profile and set `sessionExpired`
- [x] 7.3 `ApiTransport.send()`: call `onUnauthorized` on the local no-token path before throwing `UNAUTHENTICATED`
- [x] 7.4 `AuthService.reauthenticate(credentials?)`: sign in, reload `/me`, resolve `'same'`/`'different'`; on `'different'` clear the registry and navigate to `/app`
- [x] 7.5 `SessionExpiredDialog` in `core/auth/`, rendered once in the app layout: per-mode content, login error mapping reused, focus trap and return. Copy under `auth.session.*`.
- [x] 7.6 `useSessionRetry()` hook. Wrap the saves of Datos principales, Competencias, Educación and Experiencia (retry once on `'same'`). Notas and Documentos show the message and keep their text or file. (Notice extracted as `core/auth/session-expired-notice.tsx`, rendered by `CandidatePanel` and by Notas/Documentos.)
- [x] 7.7 Unit specs (`auth.service.spec.ts`, `api-transport.spec.ts`, new `session-expired.spec.tsx`; 35 passed):
  - auth service (`handleUnauthorized` with and without unsaved changes; `reauthenticate` same/different/refused);
  - transport (the no-token path calls `onUnauthorized`);
  - dialog per mode;
  - a panel saving after a 401 keeps the draft and retries once;
  - a second 401 does not loop.
- [x] 7.8 Review the existing affected specs (`api-transport`, `auth.service`, `token-source`, `login-page`, `candidate-detail-page`, `candidate-profile-sections`, `tests/security` 401-clears-session) and update them to the new rule (only `api-transport` needed a change; the others still hold because nothing is unsaved in them)

## 8. Frontend tests and end-to-end

- [x] 8.1 Extend `tests/unit/candidate-profile-sections.spec.tsx`:
  - layout order and checkbox;
  - worked-out versus manual years;
  - description staging and clean no-op;
  - accordion behaviour and accessibility.
- [x] 8.2 Run the full Vitest suite (`npm test` from `frontend/`) and inspect the result (101 files; 1025 passed, 1 skipped)
- [x] 8.3 Extend `tests/e2e/candidate-profile.spec.ts` (as the new `tests/e2e/candidate-experience.spec.ts`; 3 passed):
  - rich description saved, reloaded and expanded;
  - session expiry mid-edit, via a stubbed 401 and via a stored `expiresAt` in the past, keeps the draft, and signing in again saves it;
  - 390px with no horizontal scroll;
  - every record carries a `Date.now()` marker.
- [x] 8.4 Run `npx playwright test tests/e2e/candidate-profile.spec.ts` and the position journeys (`tests/e2e/position-candidates.spec.ts`, plus the position description spec) against the running stack; inspect the result and confirm the global teardown purged the marked records (with `positions`, `candidate-tags-notes`, `candidate-documents`, `password-sign-in`, `authentication`: 26 passed, 1 skipped; teardown purged 12 candidates and 3 files)

## 9. Quality gates

- [x] 9.1 Run `npm run build:all` from `frontend/` (warnings are errors) (0 warnings, 0 errors)
- [x] 9.2 Run `npm run lint` and `npm run format:check` from `frontend/` (clean, except the user's untracked `openspec/KTL-XX.md`, left untouched)
- [x] 9.3 Run `npm run security:rls` and `npm run security:storage` from `frontend/` (all PASS)

## 10. Documentation

- [x] 10.1 Write `docs/ktl-46/release-notes.md` (with the `ktl.lan` pre-merge backup and data check, since it now holds real data):
  - the API contract change (`yearsExperience` decimal);
  - the description field;
  - the session-end behaviour;
  - the root cause found on `ktl.lan` (60-minute in-memory development token before KTL-45);
  - the migration and its rollback.
- [x] 10.2 Update `docs/ktl-40/demo-data.md` if the seed's years change; add a line to `README.md` (Spanish) about the experience description and session recovery (`demo-data.md` does not describe experience years: unchanged)
- [x] 10.3 Update `openspec/KTL-46.md`'s reproduction section with the confirmed root cause (Vite ruled out; pre-KTL-45 development token)
- [x] 10.4 Sync the four delta specs into `openspec/specs/` (`/opsx:sync` or at archive) (synced at archive, 2026-11-05: 4 modified, 6 added, each verified verbatim)

## 11. Follow-ups after archive (2026-11-05, design F1–F7)

Applied straight to the main specs; no delta specs.

- [x] 11.1 Drop underline from both editors; the sanitizer unwraps `<u>` and keeps its words (F1)
- [x] 11.2 Count years in whole months, inclusive / 12, shared fixture; rows never show typed years the dates contradict; «1 año» singular; no decimal for whole numbers (F2)
- [x] 11.3 Month and year selects for Fecha inicio/fin, stored as day 1; stored days kept, no data migration (F3)
- [x] 11.4 Educación and Experiencia write each entry at once; form behind «Nueva …»; «Hecho» in every action panel header; light background in edit mode (F4)
- [x] 11.5 Accordion arrow before the title, with a spacer on rows without one (F5)
- [x] 11.6 Optional sector: `SectorId` nullable, migration `ExperienceSectorOptional`, «Sin sector» option (F6)
- [x] 11.7 Refuse start/end months after the current month in the API (`candidate.experience.date.future`) and the panel; Año stops at the current year; a stored future entry that blocks the list is named (F6)
- [x] 11.8 Experience period as «2020 (ene) – 2020 (dic)», no reserved column for undated rows (F7)
- [x] 11.9 Tests: backend unit (68) and integration (54) for the experience slice; frontend `npm test` 1041 passed, 1 skipped; `npm run lint` and Prettier clean; e2e experience and profile specs 9/9 against the rebuilt local stack with `ExperienceSectorOptional` applied
- [x] 11.10 Update `openspec/specs/candidate-profile-pages` and `candidate-persistence`, `docs/ktl-46/release-notes.md`, `README.md` and `openspec/KTL-46.md`
- [ ] 11.11 Align the panel's "current month" on UTC, as the API's is (design, Known limitations); not done, left as a follow-up
