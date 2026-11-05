## Context

See `proposal.md` (Why) and the reproduction in `openspec/KTL-46.md`. Facts that shape this design:

- **Functions storage.** `CND_CandidateExperience."Functions"` already exists: encrypted text
  (KTL-33), no length limit, filled with plain text by `Tools/DataMigration`. It is carried by
  `CandidateExperienceInput` and `CandidateExperienceResponse` and kept by `applyEntryDraft`, but no
  screen shows it.
- **Years column.** `"YearsExperience"` is `integer`, checked `>= 0`. The SPA sends whatever the
  user typed.
- **Rich-text precedent.** Positions already have rich text (KTL-15). The frontend uses Lexical
  through `position-description-editor.tsx` (`PositionDescriptionEditor`, `PositionDescription`).
  The backend uses Ganss.Xss through `IPositionDescriptionSanitizer` /
  `PositionDescriptionSanitizer` (allowlist `p br strong em ul ol li span b i`; `span` stripped;
  `b`/`i` canonicalised). Its limit is `Position.MaximumDescriptionLength = 20_000`.
- **How a 401 loses the draft today.**
  - `ApiTransport.send()` calls `onUnauthorized` on any server 401, which is
    `AuthService.handleUnauthorized()` → `signOut()`.
  - `signOut()` clears the profile and navigates to `/login`. `RequireAuth` stops rendering the
    candidate page in the same render, so its `useBlocker` never runs.
  - When the token source already returns `null` (an expired password session),
    `send()` throws `AppError('UNAUTHENTICATED')` without calling `onUnauthorized`.
- **Root cause on `ktl.lan`.** Before KTL-45, `DevelopmentTokenSource` held a 60-minute token in
  memory and never renewed it. Since KTL-45, `PasswordTokenSource` keeps an 8-hour token in
  `sessionStorage` and checks its expiry locally. Neither can renew it.
- **Unsaved state.** The candidate page already computes `dirty` for the open panel
  (`candidate-detail-page.tsx`).

## Goals / Non-Goals

**Goals:**

- Reuse the existing editor and sanitizer rather than add a second rich-text stack.
- Make the API the only authority for sanitised markup and for worked-out years.
- Keep a dirty draft alive across a session end, with one generic mechanism usable by every panel.

**Non-Goals:**

- Silent token renewal or refresh tokens: they belong to the identity design. KTL-45 put refresh
  tokens out of scope, and they would not cover a deactivated user or a revoked key.
- Persisting drafts to browser storage. That is forbidden as a new data path, and drafts hold
  personal data.
- Defining an order for relation collections. It was noticed while reproducing and is proposed as
  a follow-up in the brief.

## Decisions

### D1. The description is `Functions`, unrenamed

The column, domain property, contract field (`functions`) and encryption stay as they are; only the
UI label is «Descripción».

_Alternative:_ a new `Description` column. It needs a migration, encryption wiring and an import
mapping, and leaves two overlapping free-text fields. The user chose reuse.

### D2. One sanitizer service with two profiles

Generalise `IPositionDescriptionSanitizer` into an Application abstraction, `IRichTextSanitizer`,
with `Sanitize(string html, RichTextProfile profile)`:

- `RichTextProfile.PositionDescription`: today's allowlist. Its behaviour and
  `PositionSanitizerTests` stay unchanged.
- `RichTextProfile.ExperienceFunctions`: the same allowlist plus `u`.

The implementation lives in `Infrastructure/RichText/` and keeps the `span` stripping and the
`b`/`i` canonicalisation. `ManagePositions` and the experience handler take the abstraction.

_Alternative:_ a second sanitizer class copied from the first. That duplicates the canonicalisation
rules, and they would drift apart.

### D3. Sanitise on write; guard legacy values on read

`SetCandidateExperienceHandler` sanitises `input.Functions` before `SetFunctions`, inside the
relation write and so after its permission guard. It then refuses a sanitised value over
`CandidateTextLimits.Functions` with a `RequestValidationException`. This is the pattern
`PositionDescription.Sanitize` already uses: the length that counts is the sanitised one, and the
FluentValidation validators stay dependency-free.

`CandidateProjection` maps functions through `RichTextLegacy.ToSafeHtml(value)`, a pure function
that needs no injected sanitizer, so the six handlers that project a candidate are unchanged.

- A value is passed through only when it is in the sanitizer's canonical output form:
  - it contains a `<p>`, `<ul>` or `<ol>`;
  - every tag is one of the attribute-less allowed tags (`p br strong em u ul ol li`);
  - no `<` or `>` is left once those tags are removed (the sanitizer encodes them in text).
- Any other value, including legacy text that happens to contain markup, is plain text. It is
  HTML-encoded (`&`, `<`, `>`) and split on line breaks into `<p>` elements, and empty lines are
  dropped.

No markup that the allowlist would refuse can pass this check, so it guards legacy rows as well as
re-sanitising would, without parsing every value on every read.

_Alternatives:_

- A one-off backfill converting legacy rows. It needs decryption in a tool, as with KTL-33's
  backfill, for a value that is converted on its next save anyway.
- Doing the conversion in the browser. Then the browser would render a value the server never
  checked.

### D4. Worked-out years: computed by the API, mirrored in the SPA

A domain helper, `ExperienceYears.From(startDate, endDate, isCurrent, today)`, returns
`decimal?`:

- `Math.Round((end − start).Days / 365.25m, 1, MidpointRounding.AwayFromZero)` when a start date
  is set and there is an end date or the role is current.
- `null` otherwise.

The handler stores that value when it is not null. Otherwise it stores the caller's value, after
the validator checks `0 ≤ value ≤ 100` and a scale of at most 1.

The SPA mirrors the formula in `candidate-period.logic.ts` (`experienceYears(entry, today)`):

- The form disables the field and shows the computed value.
- The read view computes a current role's years live, and shows the stored value otherwise.

The same table-driven cases feed a Vitest spec and an xUnit test, so the two implementations cannot
drift.

_Alternatives:_

- Client-only computation. The API would then trust a value it can derive, and imports and seeds
  would get no years.
- Never storing derivable years. That breaks consumers of the stored column (export, import
  reports, demo seed).

### D5. Schema change

One EF migration, `ExperienceYearsDecimal`:

- `ALTER COLUMN "YearsExperience" TYPE numeric(4,1)`. The integer-to-numeric conversion is
  implicit and lossless.
- Replace `CK_CND_CandidateExperience_YearsExperience` with
  `"YearsExperience" IS NULL OR ("YearsExperience" >= 0 AND "YearsExperience" <= 100)`.

No new table or column, so the `ktl_runtime` grants are unchanged; the existing grant test still
asserts them. The functions length limit is enforced by the API validator only. The column stays
unbounded in the encryption converter, following the KTL-33 rule in `CandidateTextLimits` that
"columns that were unbounded stay unbounded". The operator migration tool (`ktl-migrate`) writes
through the converter, so a converter limit would start rejecting legacy rows it loads today.
There is no database check either, because the column holds ciphertext.
`CandidateProgram.YearsExperience` is untouched.

### D6. Shared rich-text editor in `shared/components/`

Extract `RichTextEditor` and `RichTextView` from `position-description-editor.tsx` into
`frontend/src/app/shared/components/rich-text-editor.tsx` (+ `.css`).

- The editor takes `formats` (`bold`, `italic`, `underline`, `bulletList`, `numberedList`), `name`,
  `ariaLabel`, `placeholder` and `testId`.
- `RichTextView` renders API-returned HTML. `PositionDescription` keeps its show-more shell in the
  positions folder, because only positions need it.
- Toolbar buttons are named `${name}Bold`, `${name}Underline` and so on, so positions keep the
  `descriptionBold` that e2e binds to.
- Loading a value leaves no selection (`$setSelection(null)`), so «Editar» does not scroll the page
  to the editor. A value with no text is reported as `''`, not as an empty paragraph.
- Toolbar copy moves to `richText.*` keys. Positions keep their current formats, `name` and test
  ids.
- Lexical 0.51's `TextNode.exportDOM` already wraps underlined text in `<u>`, as it wraps bold in
  `<b>` and italic in `<i>`, so `FORMAT_TEXT_COMMAND` `'underline'` is enough. The API keeps `<u>`
  for the experience profile only. No new dependency.
- Vertical resize is CSS on the editor body (`resize: vertical; overflow: auto; min-height`), so it
  works on the contenteditable without a textarea.

### D7. Experiencia layout and accordion

- The form moves to `grid three`. The existing 760px rule in `styles.css` already collapses
  `.grid.three` to one column, so no new breakpoint is added.
- «Puesto actual» sits inside the Fecha fin field cell. The description field uses `span-all`.
- In read-only mode, a row with a description renders its summary inside a `<button
aria-expanded aria-controls>` and a region that holds `RichTextView` when it is expanded.
- Expansion state is component state keyed by entry id. It is reset on leaving edit mode or on
  saving, since `usePanelDraft` remounts nothing, so reset it explicitly.
- Rows without a description keep today's markup.

### D8. Session end with unsaved changes

The decision is made in the auth layer, so every panel and future page gets it.

1. **`UnsavedChangesRegistry`** (new singleton in `core/state/`): a signal holding the set of owners
   with unsaved changes. The candidate page registers itself while `dirty`. Notas and Documentos
   already report dirty through the same page flag.
2. **`AuthService.handleUnauthorized()`:**
   - When the registry is empty, it behaves as today and calls `signOut()`.
   - Otherwise it discards the token (`tokenSource.discard()`), keeps the profile so `RequireAuth`
     keeps the page mounted, and sets a `sessionExpired` signal.
3. **`ApiTransport.send()`** calls `onUnauthorized` on the local no-token path too, before throwing
   `UNAUTHENTICATED`. Both expiry paths then behave the same. With nothing unsaved, a user stuck on
   an expired password session is now sent to sign-in instead of seeing a generic error.
4. **`AuthService.reauthenticate(credentials?)`:**
   - Runs `tokenSource.signIn` and reloads `/me`.
   - If the profile `id` matches, it clears `sessionExpired` and resolves `'same'`.
   - Otherwise it clears the registry, sets the new profile, navigates to `/app` and resolves
     `'different'`.
   - A refused sign-in keeps the dialog open with the login page's existing error mapping.
5. **`SessionExpiredDialog`** (new, `core/auth/`), rendered once in the app layout:
   - Password mode: the login form fields (`name="username"`, `name="password"`, reusing
     `login-page.logic.ts`).
   - Entra mode: one button (popup). Development mode: one button.
   - Focus is trapped while open and returns to the control that opened it.
6. **Panel wiring:** a `useSessionRetry()` hook gives panels `run(save)`.
   - If `save` fails with `UNAUTHENTICATED`, the panel shows `auth.session.expired` with «Iniciar
     sesión» (`data-testid="session-expired-sign-in"`), which opens the dialog.
   - On `'same'` the hook re-runs `save` once.
   - Form panels (`CandidateForm`, Competencias, Educación, Experiencia) wrap their save in it.
     Notas and Documentos show the message and keep their text or file without retrying.
7. **Profile and permissions.** The profile is kept during the expired window, so the UI stays
   rendered. The API refuses every call regardless, so nothing is authorised by the kept profile
   (principle 3).

_Alternatives:_

- Silent renewal before expiry: no refresh mechanism exists.
- Saving the draft to `sessionStorage` before signing out: a new personal-data browser path,
  forbidden by AGENTS.
- Handling the 401 per panel only: the navigation to `/login` happens in the auth service, before
  any panel can react.

## Risks / Trade-offs

- **A legacy value that contains literal markup** (for example «Uso de <b>Excel</b>» typed in
  Access) is shown with its tags as text instead of formatted. → This is the safe direction, and it
  becomes rich text on its next save in the editor.
- **The sanitizer allowlist differs per profile.** A future change could edit the wrong one. →
  Profile-specific tests on both, and the position profile tests stay unchanged.
- **A migrated `Functions` value longer than 20,000 characters** would refuse any API save of its
  entry list. → Measured on 2026-11-04 (task 1.1): the local stack's 1,038 stored values are at
  most 83 characters with no markup, and the KTL-7 export fixture's are at most 19. The production
  Access export is not available to this repository. An operator who meets an over-long legacy value
  raises `CandidateTextLimits.Functions`; it is never truncated.
- **API contract change (`yearsExperience` decimal).** Older clients still send integers, which
  remain valid, and the seed script and tools are updated in the same slice.
- **Same user, different tab.** Signing in again replaces the tab's token only (password and MSAL
  sessions are per tab). Other tabs stay as they were. That is acceptable.
- **The kept profile while expired.** The UI may render controls that the API then refuses. →
  Every refusal surfaces the same «sesión caducada» message. The API remains the control.
- **The retry runs once.** A second 401 after signing in again (such as an immediately deactivated
  user) falls back to the message, and the user can sign out manually. No loop.

## Migration Plan

1. Deploy the API and migrator together, as usual. The migrator applies `ExperienceYearsDecimal`
   before the API starts, and the change is backward-compatible for integer values.
2. The SPA ships in the same image. No configuration change and no new secret.
3. Rollback: redeploy the previous image. A down migration converting `numeric(4,1)` back to
   `integer` rounds stored decimals; it is generated by EF and only used on rollback. Sanitised
   functions remain valid for the previous build, which never displayed them.

## Open Questions

- Resolved (task 1.1): the 20,000-character limit stands. See the over-long `Functions` risk above
  for the measurement and the fallback.

## Follow-ups after archive (2026-11-05)

These were decided on review of the delivered slice and applied directly to the main specs
(`candidate-profile-pages`, `candidate-persistence`), `docs/ktl-46/release-notes.md` and
`README.md`. They supersede the decisions named in each item. The task record is section 11 of
`tasks.md`.

### F1. No underline anywhere (supersedes the `u` parts of D2 and D6)

Neither editor offers underline, and Ctrl+U does nothing (`UnsupportedFormatsPlugin` swallows any
format the editor does not offer). A single `RichTextSanitizer` profile serves both positions and
experience. It parses `<u>` and unwraps it, keeping its words. Before, Ganss.Xss dropped a
disallowed tag together with its content, so an underlined phrase in a position description was
lost on save.

### F2. Years count whole months (supersedes the formula in D4)

The years are the months from the start month to the end month, both included, / 12, rounded to
one decimal, half away from zero. The day never counts, a current role runs to the current month,
and the result is capped at 100. January to December is `1`. API (`ExperienceYears.From`) and SPA
(`experienceYears`) share `backend/Tests/Fixtures/ktl-46/experience-years-cases.json`. Every row
shows the years its dates determine, never a typed value they contradict. A whole number shows no
decimal, and rows read «1 año» / «N años».

### F3. Dates are a month and a year

`MonthYearField` (two selects, Mes and Año) replaces the date inputs. A date chosen in the form is
stored as the first day of its month. Stored dates keep their day: there is no data migration, and
an untouched date is written back unchanged. A native month input was rejected because desktop
Firefox and Safari render it as a plain text box.

### F4. Educación and Experiencia write each entry at once (supersedes the KTL-29 draft for them)

«Añadir»/«Actualizar» write immediately; an «Actualizar» that changes nothing sends nothing.
«Quitar» confirms, then writes. «Cancelar edición» only empties the form. The panel has no
«Guardar»/«Cancelar». `useEntryWrites` wraps the write in `useSessionRetry`, so the D8 retry applies
to the refused entry write. Only the open, changed form counts as unsaved.

- The form stays hidden behind «Nueva formación» / «Nueva experiencia» (`useEntryFormDisclosure`)
  until asked for or until a row's «Editar».
- Every action panel (Formación, Experiencia, Notas, Documentos) closes with «Hecho» in the header's
  top-right corner. A close button (×) was tried and dropped.
- The panel in edit mode has a pale brand-orange background (`.candidate-panel.is-editing`).

### F5. Accordion arrow before the title (refines D7)

The chevron leads the summary, pointing right and turning down when expanded. Rows without one get
a spacer of the same width. Education rows get no accordion: there is nothing to reveal.

### F6. Optional sector and no future dates

- `CandidateExperience.SectorId` is `Guid?`. Migration `ExperienceSectorOptional` makes the column
  nullable; this is widening, and the composite FK is not checked for a null sector (MATCH SIMPLE).
  Its `Down` fails while any entry has no sector. The form offers «Sin sector», and a row without a
  sector shows no parentheses.
- Start and end months after the current month are refused by the validator
  (`candidate.experience.date.future`) and in the panel. The Año selector stops at the current
  year. Each write sends the whole list, so an entry stored with a future date before this rule
  blocks every write of its list. The panel then names that entry and asks for it to be corrected
  with «Editar».

### F7. Month periods, no reserved column

An experience row leads with «2020 (ene) – 2020 (dic)», «2019 (mar) – actualidad» or one month,
using `candidate.profile.month.1..12` three-letter keys. An undated row reserves no space and starts
at the left. Education keeps its end-year column.

### Known limitations

- **"Current month" differs by a time zone.** The API takes it in UTC, the panel in the browser's
  local time. In Spain, during the first one or two hours of a month, the panel accepts the new
  month and the API refuses it with `candidate.experience.date.future`. The user sees the Spanish
  refusal and nothing is written. Not fixed: aligning the client on UTC is a small follow-up.
- **Fail-closed body binding on the other relation routes.** Only `/experience` reads its body
  after the permission check. The languages, programs, education, skills and tags routes still
  answer a malformed body from an unauthorised caller with `400` instead of `401`/`403`. To be
  proposed as a separate ticket.
- **`ktl-migrate` does not flag future experience dates.** Migrated rows with them block their
  panel until edited (see F6), and the release notes give the SQL that finds them.
