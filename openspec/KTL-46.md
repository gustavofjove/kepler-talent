## [original]

Professional experience records

On the experience section within a candidate we can currently edit the records but they don't really have a description where adding details about the role and tasks developed.

Therefore, we'd need a new "Description" field with basic rich text (bold, italic, underline, bullet list both ordered and unordered) for each experience record.

Also, in edit/add mode let's use 3 columns instead of two:

- Empresa / Puesto / Industria
- Fecha inicio / Fecha fin (small checkbox: puesto actual that disables the field) / Años experiencia (disabled and calculated with 1 decimal if both dates are entered)
- Below we'll add the new description field taking the three columns being resizable as a text area vertically only

In read only-mode the experience records will become an accordion that can be expanded to see the description

Finally, there seems to be a bug somewhere so that if you add a few experience records that take some time and click save the page reloads and doesn't save any of the experience records resulting in losing the changes.

## [enhanced]

### User story

**As** a recruiter maintaining a candidate's profile,
**I want** each experience record to carry a formatted description of the role and its tasks,
a compact three-column form whose years are worked out from the dates, and a read view I can
expand per record,
**so that** the profile tells the whole career story at a glance, and the work I stage in the
panel is never lost on «Guardar».

### Decisions taken while refining

| Topic                       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the description lives | The existing `Functions` field of `CND_CandidateExperience` (already in the API contract, encrypted at rest since KTL-33, filled with plain text by the Access migration). It keeps its name in code and contract; only the UI calls it «Descripción». It was hidden because the KTL-29 form never offered it, and KTL-43 only made edits preserve it. No new column.                                                                                                       |
| Rich-text formats           | Paragraphs, line breaks, bold, italic, ordered and unordered lists. **Underline was dropped after delivery (2026-11-05): not offered, Ctrl+U ignored, the server unwraps it.** Same editor technology as the position description (Lexical, already a dependency since KTL-15), so no new npm package. Positions keep their current format set (no underline).                                                                                                              |
| Sanitising                  | Server-side, before encryption, with the existing Ganss.Xss sanitizer, so no new NuGet package. ~~The experience allowlist is the position allowlist plus `u`.~~ **Since the follow-ups, one allowlist serves both, and `<u>` is unwrapped, keeping its words.** The API never returns markup it has not sanitised.                                                                                                                                                         |
| Legacy plain text           | A stored `Functions` value with no allowed block element (`p`, `ul`, `ol`) is legacy plain text. The read projection HTML-escapes it and turns each non-empty line into a `<p>`, so it displays with its line breaks and is never interpreted as markup. It becomes rich text the next time the entry is saved.                                                                                                                                                             |
| Description length          | At most 20,000 characters of sanitised HTML (same limit as `Position.MaximumDescriptionLength`), added as `CandidateTextLimits.Functions` and enforced by the validator and the encryption converter. Before fixing the number, the implementation checks the longest migrated value so that saving an untouched legacy entry is never refused.                                                                                                                             |
| Years of experience         | Stored with one decimal: `YearsExperience` goes from `integer` to `numeric(4,1)` (EF migration, check `0 ≤ value ≤ 100`). With a start date and an end date, or a start date on a current role, the years are **worked out** and the field is read-only. Otherwise the field can be typed in by hand, in 0.1 steps.                                                                                                                                                         |
| Years formula               | ~~`round((end − start) in days / 365.25, 1)`~~ **Since the follow-ups: the months from the start month to the end month, both included, / 12, rounded to one decimal half away from zero; the day never counts. A current role counts up to the current month.** The API recomputes and stores the value on every write, ignoring any client value when the dates allow the calculation. For a current role the read view works the value out live, so it never goes stale. |
| Sector label                | Stays «Sector». The ticket's «Industria» is the Sector catalog family, labelled «Sector» across search, administration and the CV draft. **Optional since the follow-ups.**                                                                                                                                                                                                                                                                                                 |
| Programs' years             | Unchanged (`CND_CandidatePrograms.YearsExperience` stays an integer). Only experience changes.                                                                                                                                                                                                                                                                                                                                                                              |

### Lost-save bug: reproduction (2026-11-04, working tree on :4300, Compose API)

| Run                                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid session: 3 entries added slowly (with «Añadir» and with Enter), then «Guardar» | **Saves correctly.** `PUT /experience` → 200, all three stored, «Experiencia guardada.» Not reproduced.                                                                                                                                                                                                                                                                                                                             |
| The API answers the save with **401** (token refused server-side)                    | **Reproduced.** Within 10 ms the app goes to `/login` (`ApiTransport` → `AuthService.handleUnauthorized()` → `signOut()`). The unsaved-changes guard does not fire, because the candidate page unmounts when `RequireAuth` drops the profile. The three staged entries are gone and nothing is stored. Signing in again lands on `/app`, not on the candidate. To the user this reads as "the page reloaded and nothing was saved". |
| Password session **expired in the browser** (stored `expiresAt` in the past)         | **Draft kept, but stuck.** `ApiTransport.send()` refuses to send and the panel shows «Sesión no válida o expirada.» The draft is still on screen, but the only way to sign in again is to leave or reload the page, which throws the draft away.                                                                                                                                                                                    |

Conclusion: the loss happens whenever a session ends during an edit, and both paths end with no way
to save the staged work.

**Confirmed cause (2026-11-04).** The user reproduced it on `ktl.lan`: `PUT …/experience` → `401`
from a built bundle (`index-kLBpaUyd.js`). That rules out a Vite reload. The trigger was the
pre-KTL-45 sign-in there: «Entrar» fetched a development token that lasted 60 minutes from
sign-in, lived only in memory and was never renewed. A save after that window got a `401`, the app
signed out, and the one-button login page put the user back in the app with the draft gone. A tab
opened before the KTL-45 deploy hits the same `401` at once, because the LAN server no longer
accepts development tokens. KTL-45 made the window 8 hours and kept the token in `sessionStorage`,
which makes the loss rarer but does not fix it.

Required behaviour (all form panels, not only Experiencia, since the mechanism is shared):

- A 401, or a session the browser already knows has expired, during a panel save never navigates
  away and never discards a dirty draft.
- The panel shows «La sesión ha caducado. Vuelve a iniciar sesión para guardar los cambios.» with
  «Iniciar sesión». That action opens the sign-in for the configured mode over the page: user and
  password fields in password mode, the MSAL popup in Entra mode, the button in development mode.
- Once signed in, the save is retried with the same draft and the same version. A 409 then follows
  the existing concurrency handling.
- Signing in as a different account discards the draft and continues as a fresh sign-in (decided
  in the change's design: no confirmation, so another user can never keep the previous one's
  work).
- With no dirty panel, a 401 keeps today's behaviour: sign out and go to `/login`.

### Functional description

#### Experiencia, edit mode (the add/edit form)

1. Three-column grid (`grid three`):
   - Row 1: Empresa | Puesto | Sector.
   - Row 2: Fecha inicio | Fecha fin, with a small «Puesto actual» checkbox under the end-date
     input | Años de experiencia.
   - Row 3: «Descripción», spanning the three columns (`span-all`).
2. Ticking «Puesto actual» disables «Fecha fin» and clears it (as `normalizeExperience` already
   does on submit). Unticking it enables the field, still empty.
3. «Años de experiencia» is read-only and shows the worked-out value with one decimal, formatted
   with `formatNumber` (`5,3`), whenever the dates allow it (see the decisions). Otherwise it can be
   typed in with `step="0.1"`, `min="0"`. When the field becomes read-only, the value shown replaces
   any typed one.
4. «Descripción» is the rich-text editor with a toolbar: Negrita, Cursiva, Subrayado, Lista con
   viñetas, Lista numerada. Its body can be resized vertically only (`resize: vertical`), starts
   about 6 lines tall and never overflows the panel horizontally.
5. «Editar» on an entry loads its description into the editor. «Actualizar experiencia» stages it
   like any other field. An update that changes nothing, including an untouched description,
   leaves the panel clean.
6. The entries listed above the form in edit mode stay flat rows (period, chip, company, sector,
   years, «Editar», «Quitar»), with no accordion.

#### Experiencia, read-only

7. Each entry with a description is an accordion row. The whole row summary (period, position
   chip, company, sector, years) is a disclosure button with `aria-expanded` and `aria-controls`.
   Activating it shows the formatted description below the summary. Rows start collapsed, and
   several can be open at once.
8. An entry without a description is a plain row with no disclosure control and no chevron.
9. Leaving and re-entering the page, or saving the panel, collapses every row again.

### API and data contract

`PUT /api/candidates/{id}/experience` and `GET /api/candidates/{id}` already exist; no new route.

| Item                                                                                    | Change                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CandidateExperienceInput` (`Application/Features/Candidates/SetCandidateRelations.cs`) | `YearsExperience`: `int?` → `decimal?`. `Functions` is now rich-text HTML.                                                                                                                                                       |
| `SetCandidateExperienceValidator`                                                       | `Functions` `MustFitWithin(CandidateTextLimits.Functions)`, measured after sanitising. `YearsExperience` between 0 and 100 with at most one decimal.                                                                             |
| `SetCandidateExperienceHandler`                                                         | Sanitises `Functions` through the experience sanitizer profile, and computes `YearsExperience` from the dates when possible, before `SetFunctions`/`SetYearsExperience`. The permission guard is unchanged and still runs first. |
| `CandidateExperienceResponse` / `CandidateProjection`                                   | `YearsExperience` `decimal?`; `Functions` always sanitised HTML (legacy plain text converted as described).                                                                                                                      |
| `Domain/Candidates/CandidateExperience.cs`                                              | `YearsExperience` `decimal?`; a domain helper for the years formula, reused by the handler.                                                                                                                                      |
| `CandidateExperienceConfiguration`                                                      | `YearsExperience` `numeric(4,1)`; `CK_CND_CandidateExperience_YearsExperience` becomes `IS NULL OR (>= 0 AND <= 100)`; `Functions` encrypted with the new limit.                                                                 |
| Migration `…_ExperienceYearsDecimal`                                                    | `ALTER COLUMN "YearsExperience" TYPE numeric(4,1)`, with the check constraint replaced in the same migration. No new table or column, so `ktl_runtime` grants are unchanged (the slice's grant test still has to pass).          |
| Sanitizer                                                                               | Generalise `PositionDescriptionSanitizer` behind an Application abstraction with two allowlists (position unchanged; experience = position + `u`). The position behaviour and its tests must not change.                         |
| Operator tools                                                                          | `Tools/DataMigration` (`ExportContract`, `RowValidator`, `MigrationLoader`) and `Tools/TestDataGenerator` accept the decimal type. Access integers load unchanged.                                                               |

Permissions: unchanged. The write needs `candidates.update` (the existing check in
`CandidateRelationWrite`). Reads follow the candidate read permission. Unauthenticated and
unauthorised callers must still get 401/403 before validation.

### Files to change

**Frontend (`frontend/`)**

| File                                                                      | Change                                                                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/app/shared/components/rich-text-editor.tsx` (new) + `.css`           | `RichTextEditor` (format set as a prop) and `RichTextView`, extracted from `position-description-editor.tsx`      |
| `src/app/features/positions/components/position-description-editor.tsx`   | Uses the shared editor with its current formats; no behaviour change; keeps `name="description"` and its test ids |
| `src/app/features/candidates/components/candidate-experience.tsx`         | Three-column form, checkbox placement, worked-out years, description editor, read-only accordion                  |
| `src/app/features/candidates/components/candidate-period.logic.ts`        | `experienceYears(entry, today)` with the shared formula                                                           |
| `src/app/features/candidates/models/candidate.models.ts`                  | Document `functions` as sanitised HTML                                                                            |
| `src/app/features/candidates/services/candidate-relations.service.ts`     | Validation: length limit (`TranslatableError`); `normalizeExperience` sets worked-out years                       |
| `src/app/core/auth/auth.service.ts`, `src/app/core/http/api-transport.ts` | Session-expired path that keeps the page and offers to sign in again, then retries                                |
| `src/app/core/auth/` (new re-sign-in dialog)                              | Reuses the login form fields (`name="username"`, `name="password"`) inside a dialog                               |
| `src/app/features/candidates/components/candidate-panel.tsx`              | Shows the session-expired message with «Iniciar sesión» and retries `onSave`                                      |
| `src/styles.css` / `candidate-panel.css`                                  | Accordion row, editor vertical resize; the existing `.grid.three` 760px rule collapses the form to one column     |
| `src/assets/i18n/es.json` (+ `en.json`)                                   | Keys below; shared toolbar keys move from `positions.description.*` to `richText.*`                               |

Kept: every `name=` (`company`, `position`, `sector`, `startDate`, `endDate`, `isCurrent`,
`yearsExperience`), `experience-add-form`, `experience-edit`, `experience-period`. New: the
editor's `name="functions"`, `data-testid="experience-functions-editor"`, `experience-toggle`,
`experience-description`, `session-expired-sign-in`.

**i18n keys (Spanish)**

```json
"candidate.profile.experience.functions": "Descripción",
"candidate.profile.experience.functionsPlaceholder": "Describe el puesto, las responsabilidades y los logros",
"candidate.profile.experience.functionsTooLong": "La descripción no puede superar los 20.000 caracteres.",
"candidate.profile.experience.yearsCalculated": "Calculado a partir de las fechas",
"richText.toolbar": "Formato del texto",
"richText.bold": "Negrita",
"richText.italic": "Cursiva",
"richText.underline": "Subrayado",
"richText.bullets": "Lista con viñetas",
"richText.numbers": "Lista numerada",
"auth.session.expired": "La sesión ha caducado. Vuelve a iniciar sesión para guardar los cambios.",
"auth.session.signInAgain": "Iniciar sesión",
"auth.session.dialogTitle": "Vuelve a iniciar sesión"
```

`candidate.profile.yearsCount` («{{years}} años») is reused with a `formatNumber` value.

**Backend (`backend/`)**: `Domain/Candidates/CandidateExperience.cs`, `CandidateTextLimits.cs`,
`Application/Features/Candidates/SetCandidateRelations.cs`, `CandidateContract.cs`,
`CandidateProjection.cs`, `Application/Abstractions/Positions/IPositionDescriptionSanitizer.cs`
(generalised), `Infrastructure/Positions/PositionDescriptionSanitizer.cs` (generalised),
`Infrastructure/Persistence/Configurations/CandidateExperienceConfiguration.cs`, a new migration in
`Infrastructure/Persistence/Migrations/`, and `Tools/DataMigration`, `Tools/TestDataGenerator`.

**Scripts**: `scripts/seed-demo-data.lib.js` `yearsBetween` uses the same one-decimal formula.
Demo `functions` stay plain text, so they exercise the legacy path.

### Acceptance criteria

1. **Layout.** In the Experiencia form at 1280px, Empresa, Puesto and Sector share the first row;
   Fecha inicio, Fecha fin (with «Puesto actual» under it) and Años de experiencia the second;
   «Descripción» spans the third. At 390px every field stacks, with no horizontal scroll.
2. **Current role.** Ticking «Puesto actual» disables and clears «Fecha fin». Unticking it
   enables it again.
3. **Worked-out years.** From 2019-03-01 to 2024-06-30 the years field is read-only and shows
   `5,3`. The saved entry stores `5.3` even if a different client value was sent.
4. **Current role years.** For a current role started 2024-11-04, on 2026-11-04 the field shows
   `2,0` and the read view shows «2 años».
5. **Manual years.** With only an end date, the field accepts `3,5`, and the entry is saved and
   read back as 3.5.
6. **Rich description.** A description with bold, italic, underlined text, a bulleted and a
   numbered list survives «Actualizar experiencia» → «Guardar» → reload, with the same formatting.
7. **Sanitised.** A `PUT` whose `functions` holds `<script>`, `onclick`, `style`, `<a>` or `<img>`
   stores and returns none of them; `<b>`/`<i>` come back as `<strong>`/`<em>`; `<u>` is kept.
8. **Too long.** A description above the limit is refused with the Spanish message, and nothing is
   written.
9. **Legacy text.** An entry whose stored functions are `Gestión de equipos\nPlanificación`
   (migrated plain text) shows two paragraphs, and `a < b` shows literally.
10. **Accordion.** In read-only mode an entry with a description expands and collapses on click,
    Enter and Space, with `aria-expanded` following. An entry without a description has no
    toggle.
11. **Untouched edit.** «Editar» → «Actualizar experiencia» on an entry with a description, with
    no change, leaves the panel without unsaved changes.
12. **Session ends mid-edit (401).** With three staged entries, when the save gets a 401 the page
    stays, the entries are still listed, and «Iniciar sesión» is offered. After signing in again,
    the three entries are saved without being retyped.
13. **Session expired in the browser.** Same as 12 when the stored session has already expired
    before «Guardar».
14. **No draft, 401.** With no panel in edit mode, a 401 still signs out to `/login`.
15. **Fail closed.** `PUT /experience` without a token is 401 and with a read-only user is 403,
    both before validation (oversized or malicious `functions` included).
16. **Positions unchanged.** The position description editor and sanitizer behave as before
    (existing tests pass unchanged, no underline offered there).

### Test coverage

| Suite                                                                                         | Coverage                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/Tests/UnitTests/Features/PositionSanitizerTests.cs` (+ new experience profile tests) | Allowlists, `u` only for experience, canonicalisation, script/link/style/image removal                                                                                                                                                         |
| `backend/Tests/UnitTests` (domain + handler)                                                  | Years formula (rounding, current role, missing dates), the API recomputing over a client value, legacy plain-text projection                                                                                                                   |
| `backend/Tests/UnitTests/Features/CandidateTextLimitTests.cs`                                 | `Functions` limit                                                                                                                                                                                                                              |
| `backend/Tests/IntegrationTests/CandidateApiTests.cs`                                         | Rich `functions` round trip, sanitised storage, decimal years round trip, 401/403 before validation                                                                                                                                            |
| `backend/Tests/IntegrationTests/CandidateSchemaTests.cs`, `MigrationSecurityEvidenceTests.cs` | `numeric(4,1)`, new check constraint, grants unchanged                                                                                                                                                                                         |
| `backend/Tests/IntegrationTests/EncryptedStorageSecurityTests.cs`                             | Rich `functions` stored as ciphertext, never in clear                                                                                                                                                                                          |
| `frontend/tests/unit/candidate-profile-sections.spec.tsx`                                     | Layout order, checkbox, worked-out vs manual years, editor staging, clean no-op, accordion and its a11y                                                                                                                                        |
| `frontend/tests/unit/candidate-period.logic.spec.ts`                                          | `experienceYears`                                                                                                                                                                                                                              |
| `frontend/tests/unit/` rich-text editor spec (new) and the existing position editor specs     | Shared editor formats; positions unchanged                                                                                                                                                                                                     |
| `frontend/tests/unit/` auth / transport / candidate-panel specs                               | 401 during a dirty save keeps the draft, re-sign-in retries; 401 with no draft signs out                                                                                                                                                       |
| `frontend/tests/e2e/candidate-profile.spec.ts`                                                | Rich description saved and shown in the accordion; a session expiring mid-edit (stored `expiresAt` set to the past, and a stubbed 401) keeps and then saves the draft; 390px with no horizontal scroll. Records carry the `Date.now()` marker. |
| `frontend/tests/e2e/navigation-responsive.spec.ts` or the profile spec                        | Three-column form collapses to one column below 760px                                                                                                                                                                                          |

### Documentation

- `openspec/specs/candidate-profile-pages/spec.md`:
  - Replace «Experience form groups its dates» with the three-column layout.
  - Add the read-only accordion and the worked-out years.
  - The «Edit keeps the fields the form does not show» scenario now covers `notes` only.
- `openspec/specs/candidate-persistence/spec.md`: decimal experience years, the functions limit
  and its sanitisation.
- `openspec/specs/frontend-api-transport/spec.md` and/or `identity-and-access-control/spec.md`:
  session expiry during a dirty save.
- `docs/ktl-46/release-notes.md` (new); `docs/ktl-40/demo-data.md` if the seed changes;
  `README.md` only if a user-visible command changes.

### Non-functional requirements

- **Personal data.** The description is personal data. It stays encrypted (KTL-33), is never
  logged (Serilog redaction), and its value never appears in validation or ProblemDetails
  messages. The re-sign-in dialog never stores the password outside the existing token source.
- **Security.** Sanitising is the server's job and happens on every write. Rendering uses only
  API-returned HTML. The read projection also guards legacy values, so no unsanitised markup ever
  reaches `dangerouslySetInnerHTML`. Endpoints fail closed as listed in criterion 15. There is no
  new data path: no `localStorage` or `sessionStorage` copy of the draft.
- **Accessibility.** The editor has the accessible name «Descripción» and a labelled toolbar
  (`role="toolbar"`). The accordion buttons expose `aria-expanded`/`aria-controls`. The
  read-only years field explains itself with `aria-describedby` → «Calculado a partir de las
  fechas». The re-sign-in dialog traps focus and returns it to «Guardar».
- **Responsive.** One column below 760px through the existing `.grid.three` rule, with no new
  breakpoint; the editor never causes horizontal scroll at 390px.
- **Performance.** No change to search queries; sanitising runs once per entry on write and on
  read for legacy values only.

### Out of scope

- Renaming «Sector» to «Industria».
- Decimal years for programs.
- A rich-text description for education entries.
- Rich-text search over `functions` (it is encrypted and not searchable).
- Saving drafts to browser storage.

### Follow-ups delivered after archive (2026-11-05)

Requested on review of the delivered slice and applied straight to the main specs. They supersede
the matching parts of the functional description and acceptance criteria above. Decisions are in
the archived `design.md` («Follow-ups after archive», F1–F7) and the task record in its
`tasks.md`, section 11.

| Request                                                                 | Outcome                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Underline does not work: remove it                                      | Neither editor offers it and Ctrl+U does nothing. The server unwraps `<u>` and keeps its words; before, an underlined phrase in a position description was lost. Criteria 6, 7 and 16 now read without underline.                                                                                                                                 |
| A 1-year range accepted 6 typed years                                   | Rows always show the years the dates determine, never a typed value they contradict. «1 año» is singular. A whole number shows no decimal (`10`, not `10,0`).                                                                                                                                                                                     |
| Dates should be month and year only                                     | Mes and Año selects; stored as day 1. Years count inclusive months / 12 (January–December is `1`). No data migration: stored days are kept and written back unchanged. Criterion 4 now reads `2` rather than `2,0`.                                                                                                                               |
| Too many buttons when adding or editing entries                         | Educación and Experiencia write each entry at once: «Añadir»/«Actualizar» save, «Quitar» confirms then saves, «Cancelar edición» only cancels. No panel «Guardar»/«Cancelar». Criteria 6, 11 and 12 apply to the entry write: a refused «Añadir» keeps the typed entry and retries after signing in again.                                        |
| Close button, then «Hecho»; light background; hide the form             | Every action panel (Formación, Experiencia, Notas, Documentos) closes with «Hecho» in the header's top-right corner. The panel in edit mode has a pale brand-orange background. The entry form is hidden behind «Nueva experiencia» / «Nueva formación».                                                                                          |
| Accordion arrow far from the title                                      | The arrow leads the title, pointing right, and turns down when expanded; rows without one get a spacer. Education gets no accordion (nothing to reveal).                                                                                                                                                                                          |
| Sector optional; no future dates; months in the summary; no left margin | `SectorId` nullable (migration `ExperienceSectorOptional`, «Sin sector»). Start and end months after the current month are refused by the panel and the API (`candidate.experience.date.future`), and Año stops at the current year. Rows lead with «2020 (ene) – 2020 (dic)» / «2019 (mar) – actualidad», and an undated row starts at the left. |
| The future-date error did not go away after correcting                  | Each write sends the whole list, and an entry stored with a future date before the rule kept failing the check. The panel now names that entry and asks for it to be corrected with «Editar».                                                                                                                                                     |

**Contract:** an experience's `sector` may now be `null` (breaking for a client that assumes a
string).

**Known limitations (not fixed):**

- The panel takes "current month" in local time and the API in UTC. In Spain, the API refuses a
  new month for the first one or two hours of that month.
- The other five relation routes still bind the body before the permission check (see the archived
  design).
- `ktl-migrate` does not flag future experience dates.

### Found while reproducing (proposed follow-up, not in this scope unless confirmed)

- **Experience order is not defined.** Relations have no order column and the repository applies
  no `OrderBy`, so three entries added as 1, 2, 3 came back as 2, 3, 1 after «Guardar». The
  accordion makes this more visible. Proposal: the API returns experience as current roles first,
  then by start date descending, then by id, and the panel shows that order after a save.
