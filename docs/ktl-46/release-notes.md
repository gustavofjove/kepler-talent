# KTL-46 release notes

Experience records gain a rich-text description and years with one decimal, and a session that
ends while a candidate panel holds unsaved work no longer throws that work away. Two migrations:
`ExperienceYearsDecimal` changes a column type and its check constraint, and
`ExperienceSectorOptional` makes the experience sector nullable. No new table, grant, role,
permission or dependency.

## What changes

- **«Descripción» per experience entry.**
  - The editor offers bold, italic, bulleted lists and numbered lists, the position
    description's formats; it is the same editor. Underline, which the ticket asked for, was
    dropped after review: neither editor offers it, and Ctrl+U does nothing in either.
  - The server unwraps underline and keeps its words. Before, an underlined phrase typed with
    Ctrl+U in a **position** description was lost entirely on save.
  - The description is stored in the entry's existing `functions` field, which no screen showed
    until now. It stays encrypted at rest (KTL-33).
  - The API sanitises it before storage. Links, images, scripts, styles and attributes are
    removed, and `<b>`/`<i>` are stored as `<strong>`/`<em>`.
  - At most 20,000 characters of sanitised HTML. A longer one is refused with
    `candidate.field.too_long`, and the panel says so in Spanish before saving.
  - Functions migrated from Access are plain text. They are returned as escaped paragraphs, one
    per line, and become rich text the next time the entry is saved.
- **Three-column experience form.** Empresa | Puesto | Sector; Fecha inicio | Fecha fin with
  «Puesto actual» under it | Años de experiencia; «Descripción» across the row, resizable
  vertically. Ticking «Puesto actual» clears and disables Fecha fin.
- **Sector is optional.** Its selector starts at «Sin sector», and a row without a sector shows no
  empty parentheses.
- **Dates are a month and a year.** Each date is a Mes and an Año selector, with no day.
  - A date chosen in the form is stored as the first day of its month.
  - **No date may be later than the current month.** The Año selector stops at the current year,
    and the panel and the API both refuse a later month («Las fechas de una experiencia no pueden
    ser posteriores al mes actual.», `candidate.experience.date.future`). Before, a future start
    date on a current role gave nonsense years.
  - An entry already stored with a later month blocks every write of that candidate's
    Experiencia, because each write sends the whole list. The panel names it («La experiencia
    «…» en … tiene fechas posteriores al mes actual. Corrígelas con «Editar»…»), and correcting
    it with «Editar» unblocks the panel.
  - **Existing dates are kept as they are**, day included: there is no data migration for this.
    The form shows their month and year, and an untouched date is saved back unchanged.
- **Years worked out from the dates.**
  - With a start and an end date, or a start date on a current role, the years are the months from
    the start month to the end month, both included, / 12, rounded to one decimal. January to
    December is `1`, January to the next January `1,1`; a whole number shows no decimal part. The day of a date never counts, and a
    current role runs to the current month. The form shows them read-only.
  - Otherwise they are typed by hand, in steps of 0.1, from 0 to 100.
  - The API recomputes them on every write, so a saved entry with dates may read back with a
    different value from the one it held. For example, a migrated `4` with dates spanning 4 years
    and 4 months becomes `4.3` the next time its list is saved.
  - Every row, staged or saved, shows the years its dates determine, a current role's worked out
    to today. A value typed before the dates were filled in is never shown against them. Rows read
    «1 año» and «N años».
- **Experience rows lead with their months.** «2020 (ene) – 2020 (dic)», «2019 (mar) –
  actualidad», or one month when only one is known. A row without dates reserves no space for them
  and starts at the left. Education rows keep their end-year column.
- **Educación and Experiencia write each entry at once.** This replaces the KTL-29 draft for these
  two panels.
  - «Añadir …» and «Actualizar …» save the entry immediately; an «Actualizar» that changes nothing
    sends nothing.
  - «Quitar» asks for confirmation, then saves the list without the entry.
  - «Cancelar edición» only empties the form, and the panel has no «Guardar» or «Cancelar».
  - The entry form is hidden until «Nueva formación» / «Nueva experiencia» or a row's «Editar»;
    «Cancelar» and a successful write hide it again.
  - The panel closes with «Hecho» in the top-right corner of its header, where «Editar» was, as
    Notas and Documentos now do too: their «Hecho» moved there from the footer.
- **The panel in edit mode has a light background**, a pale tint of the brand orange, so the
  section being edited stands out; the entry being edited inside it keeps its stronger highlight.
  - What is typed and not yet added still counts as unsaved when leaving the page or switching
    panels.
- **Read-only accordion.** An entry with a description expands from its summary to show it. An
  arrow before the summary points right while collapsed and down while expanded.
  Entries without one stay plain rows.
- **Session end with unsaved work.**
  - Before, a `401` on a panel save signed out to `/login` and discarded the staged work. On
    `ktl.lan` before KTL-45, that happened at most 60 minutes after signing in: the development
    token lived only in memory and was never renewed. KTL-45 made it rarer (8-hour password
    sessions) without fixing it.
  - Now, while the candidate page holds unsaved changes, a refused session keeps the page and the
    draft. The panel shows «La sesión ha caducado. Vuelve a iniciar sesión para guardar los
    cambios.» with «Iniciar sesión», which opens the sign-in over the page.
  - Signed in again as the same user, a form panel retries its save once. Notas and Documentos
    keep the typed note or the selected file for the user to repeat the action.
  - Signing in as another user gives the unsaved work up and continues as a fresh sign-in.
  - With nothing unsaved, a refused session still signs out to `/login`, as before. This now also
    applies when the browser already knows the session has expired; before, the page stayed with
    «Sesión no válida o expirada.» and no way forward.

## API contract

- `yearsExperience` of an experience entry is a decimal with at most one fraction digit, in
  `PUT /api/candidates/{id}/experience` and in every candidate response. **Breaking** for a client
  that parses it as an integer; a whole number is still accepted. Out of range or with two decimals,
  the write is refused with `candidate.experience.years.invalid`.
- `functions` is sanitised rich text on the way in and out.
- `sector` of an experience entry is optional on the way in and may be `null` on the way out.
  **Breaking** for a client that assumes it is always a string.
- A start or end date after the current month (UTC) is refused with
  `candidate.experience.date.future`.
- `PUT /api/candidates/{id}/experience` now reads its body after the permission check, as
  `/availability` does. A malformed body from a caller without `candidates.update` is refused with
  `401`/`403` like any other, instead of `400`; from an editor it is a `400` with
  `candidate.constraint.violation`.

## Schema

`ExperienceYearsDecimal`:

- `CND_CandidateExperience."YearsExperience"`: `integer` → `numeric(4,1)`. Lossless for existing
  values.
- `CK_CND_CandidateExperience_YearsExperience`: `>= 0` → `>= 0 AND <= 100`. **A row above 100 makes
  the migration fail**, so check before deploying (below).
  `ExperienceSectorOptional`:

- `CND_CandidateExperience."SectorId"`: `NOT NULL` → nullable. Widening, so it cannot fail on
  existing rows. The composite foreign key to the sector catalog stays and is not checked for a
  row without a sector.

Both:

- `Functions` stays an unbounded encrypted column; the 20,000-character limit is the API's.
  `ktl-migrate` keeps loading Access memos of any length and now reports experience years outside
  0–100 as `integer.invalid` instead of failing the load.

## LAN server (`ktl.lan`): before merging

`ktl.lan` now holds real candidate data, and the cron deploy rebuilds and migrates on every push to
`main`.

1. **Back up** the database and the documents before the merge: a `pg_dump` of `kepler_talento`
   from `hts-postgres` and the `ktl_documents` volume, keeping the field-encryption keys apart.
2. **Check the existing data** against the new limits, on the server:

   ```sql
   SELECT count(*) FROM "CND_CandidateExperience" WHERE "YearsExperience" > 100 OR "YearsExperience" < 0;
   ```

   It must return `0`, or the migration fails and the previous containers keep running. Then
   look for experience dates already in the future, which the migrations accept but a later save
   of that candidate's experience list would refuse until they are corrected:

   ```sql
   SELECT count(*) FROM "CND_CandidateExperience"
   WHERE "StartDate" >= date_trunc('month', now()) + interval '1 month'
      OR "EndDate" >= date_trunc('month', now()) + interval '1 month';
   ```

   The
   20,000-character description limit cannot be checked in SQL, because the column is encrypted.
   Descriptions were never editable before this release, so only Access-migrated values could
   exceed it. An entry list holding one would be refused on save until
   `CandidateTextLimits.Functions` is raised.

3. Merge. The next cron tick applies the migration.
4. Verify: an experience entry can be given a formatted description, and its years show one
   decimal.

## Rollback

Revert the merge and redeploy. `ExperienceYearsDecimal`'s `Down` turns the column back into
`integer`, rounding any decimal, and restores the previous check constraint.
`ExperienceSectorOptional`'s `Down` makes `SectorId` required again and **fails while any entry has
no sector**: give those entries a sector first
(`SELECT count(*) FROM "CND_CandidateExperience" WHERE "SectorId" IS NULL` must return `0`). Sanitised descriptions remain
valid data for the previous build, which never displayed them.
