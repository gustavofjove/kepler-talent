## Why

Experience records cannot hold a description of the role and its tasks, and the experience form
spreads a few fields over two columns with an integer «Años de experiencia» typed by hand. Worse,
recruiters lose staged work: when the session ends while a panel is being edited, «Guardar» gets a
401, the application signs out to `/login`, and every staged entry is discarded with nothing
saved. On `ktl.lan` before KTL-45 this happened at most 60 minutes after sign-in. The development
token lived only in memory and was never renewed. KTL-45 made it rarer (8-hour password sessions in
`sessionStorage`) but did not fix it. Brief: `openspec/KTL-46.md`.

## What Changes

- Experiencia gains a rich-text **«Descripción»** per entry: bold, italic, underline, bulleted and
  numbered lists. It is stored in the entry's existing `functions` field, which no screen showed
  until now.
- The API sanitises every description before it is stored, and returns only sanitised markup.
  Legacy plain-text functions from the Access migration are shown as escaped paragraphs.
- Descriptions are limited to 20,000 characters.
- The experience form uses three columns:
  - Empresa | Puesto | Sector.
  - Fecha inicio | Fecha fin with «Puesto actual» under it | Años de experiencia.
  - «Descripción» across the full width, resizable vertically only.
- «Años de experiencia» holds one decimal. It is worked out from the dates, and read-only, when
  there is a start date and an end date, or a start date on a current role. Otherwise it stays
  typed in by hand. The API recomputes it on every write.
- **BREAKING (API contract):** `yearsExperience` of an experience entry becomes a decimal with one
  fraction digit in requests and responses. A whole number is still accepted.
- In read-only mode, an Experiencia entry with a description is an accordion row that expands to
  show it.
- **Session end with unsaved changes no longer loses work.** If a request is refused as
  unauthenticated, or the session is known to have expired, while a candidate panel has unsaved
  changes:
  - The page stays and keeps the draft.
  - A dialog offers to sign in again in place.
  - Once signed in as the same user, the failed panel save is retried.
  - With no unsaved changes, today's behaviour stays: sign out and return to sign-in.

> **Follow-ups after archive (2026-11-05).** Review of the delivered slice changed parts of the
> list above. See design.md, «Follow-ups after archive», F1–F7, and tasks section 11.
>
> - Underline was dropped from both editors.
> - Years count whole months.
> - Dates are a month and a year.
> - Educación and Experiencia write each entry at once, with «Hecho» in the panel header.
> - Sector is optional (a second migration, `ExperienceSectorOptional`), and dates after the
>   current month are refused.
> - Experience rows lead with «2020 (ene) – 2020 (dic)».
> - **BREAKING (API contract):** an experience's `sector` may be `null`.

### Actors

- Recruiters holding `candidates.update`: write descriptions and years; protected from lost saves.
- Every holder of the candidate read permission sees the description in the accordion.

### Key entities

- Candidate experience entry: company, position, sector, start and end date, current flag, years
  (now a decimal), functions (now sanitised rich text), notes.
- Browser session: token, expiry, signed-in user.

### Assumptions

- Lexical (already a frontend dependency, KTL-15) can export underline.
- Ganss.Xss (already a backend dependency) can allow `u` for one profile without changing the
  position profile.
- No migrated `functions` value exceeds the 20,000-character limit; this is checked before the
  limit is fixed.
- Experience years are not a search filter, so the decimal change touches no search query.

### Edge cases

- A current role with no start date: no worked-out years, so the field stays typed in.
- An end date before the start date: refused as today.
- Ticking «Puesto actual» on an entry that has an end date.
- A legacy plain-text description containing `<`, `&` or line breaks.
- Pasted rich text carrying links, images, styles or scripts.
- An untouched description on «Actualizar»: the panel stays clean.
- The session ends while Notas holds an unsent note, or Documentos holds a selected file.
- Sign-in again as a different user.
- A second 401 right after signing in again.

### Personal data, permissions and storage

- The description is personal data, already encrypted at rest under KTL-33. It stays encrypted,
  is never logged, and never appears in validation or problem messages.
- Sanitising on the server means no unsanitised markup reaches the browser (principle 1).
- No endpoint, permission, role, RLS policy, grant or storage path is added. The experience write
  keeps checking authentication and `candidates.update` before validation (principle 3).
- The re-sign-in dialog goes through the existing token source only: no draft and no credential is
  written to browser storage.

### Success criteria

- An entry's formatted description survives save and reload, and dangerous markup never comes back.
- With dates, the years shown and stored equal the documented formula to one decimal.
- With three staged entries, a 401 on «Guardar» loses none of them. After signing in again they are
  saved without retyping.
- The existing position description editor and sanitizer tests pass unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `candidate-profile-pages`:
  - The Experiencia form layout, description editor and worked-out years.
  - The read-only accordion.
  - The edit-keeps-hidden-fields rule (functions are now shown).
  - Panel drafts surviving a session end.
- `candidate-persistence`: experience years stored with one decimal; experience functions
  sanitised, bounded and returned safely.
- `frontend-api-transport`: an unauthenticated refusal while the page holds unsaved changes keeps
  the user on the page.
- `identity-and-access-control`: the browser can sign in again in place without ending the
  application session's page state.

## Impact

- **Backend:**
  - `Domain/Candidates/CandidateExperience.cs` and `CandidateTextLimits.cs`.
  - `Application/Features/Candidates/SetCandidateRelations.cs`, `CandidateContract.cs` and
    `CandidateProjection.cs`.
  - The sanitizer abstraction and implementation, generalised from positions.
  - `CandidateExperienceConfiguration.cs` and one EF migration (`YearsExperience` → `numeric(4,1)`
    with its check constraint). No grant change.
  - `Tools/DataMigration` and `Tools/TestDataGenerator` types.
- **Frontend:**
  - A shared rich-text editor and view, extracted from
    `features/positions/components/position-description-editor.tsx`.
  - `features/candidates/components/candidate-experience.tsx`, `candidate-period.logic.ts` and
    `candidate-panel.tsx`.
  - `features/candidates/services/candidate-relations.service.ts`.
  - `core/auth/` (`auth.service.ts`, a new re-sign-in dialog) and `core/http/api-transport.ts`.
  - `src/styles.css`, `es.json` and `en.json`.
- **Scripts:** `scripts/seed-demo-data.lib.js` uses the one-decimal years formula.
- **Dependencies:** no new npm or NuGet package.
- **Docs:** `docs/ktl-46/release-notes.md`, the updated specs, and `docs/ktl-40/demo-data.md` if the
  seed changes.
