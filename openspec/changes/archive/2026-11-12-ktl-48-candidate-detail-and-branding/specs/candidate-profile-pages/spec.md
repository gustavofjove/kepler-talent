# Spec Delta

## ADDED Requirements

### Requirement: Internal observations preserve plain-text layout

Read-only Observaciones internas SHALL preserve authored line breaks and blank lines, wrap long
lines and display markup-like text literally. Editing, saving and reloading SHALL retain the
content. These rules SHALL apply to the core observations field independently of custom notes.

#### Scenario: Multiline observations round-trip

- **WHEN** an editor saves observations containing two lines separated by a blank line and
  reloads the candidate
- **THEN** the read view preserves both line breaks and the blank line

#### Scenario: Literal markup and long lines

- **WHEN** observations contain `<script>` text and an unbroken long line
- **THEN** the markup is displayed literally without execution and the content wraps without
  horizontal page scrolling at 390px

### Requirement: Absent and zero duration labels are hidden

Program chips and experience summaries SHALL omit absent, null and zero years and their
separators in read and edit lists. Positive values SHALL retain localized singular/plural and
number formatting. Hiding a label SHALL NOT change stored values or duration calculations.
Absent editable years SHALL show an empty input; an explicitly stored zero SHALL remain editable.

#### Scenario: No synthetic duration

- **WHEN** program or manual-experience entries have absent, null or zero years
- **THEN** their lists show no duration placeholder, `0 años` or orphan separator

#### Scenario: Positive and calculated durations

- **WHEN** programs have 1 and 3 years and an experience has 3.5 years
- **THEN** the labels read `1 año`, `3 años` and `3,5 años` respectively

#### Scenario: Unrelated edit preserves values

- **WHEN** an editor changes an unrelated field in a relation with no years or explicitly zero years
- **THEN** the write neither converts absent years to zero nor erases an existing zero

### Requirement: Education centre is optional in the editor

The education editor SHALL allow adding an entry without Centro and clearing an existing centre.
It SHALL retain other required fields and the centre length limit. An empty centre SHALL produce
no placeholder or stray punctuation in the entry summary.

#### Scenario: Add and clear a centre

- **WHEN** an editor supplies valid education type, degree and status with blank Centro, or
  clears Centro on an existing entry
- **THEN** the entry saves immediately and remains centre-free after reload

#### Scenario: Other required fields

- **WHEN** an editor adds education with a missing degree, type or status
- **THEN** the appropriate Spanish validation error is announced and the entry is not saved

### Requirement: Candidate history is displayed newest first

Education SHALL sort by end year descending, undated last, with stable ties. Experience SHALL
group current roles first, then sort by end date or start fallback descending; current roles
use start date. Within each group undated entries SHALL be last, then ties SHALL use start date
descending, missing starts last, then loaded order. Both modes SHALL use this order without
writing or mutating the loaded collections merely to sort them.

#### Scenario: Education years and stable ties

- **WHEN** loaded education is 2020, undated, 2024-A and 2024-B
- **THEN** read and edit lists show 2024-A, 2024-B, 2020, undated

#### Scenario: Experience groups and fallback dates

- **WHEN** loaded experience includes current starts 2022 and 2024, a current undated role,
  completed ends 2020 and 2023, a non-current start-only 2021 and a non-current undated role
- **THEN** both modes show current 2024, current 2022, current undated, completed 2023,
  start-only 2021, completed 2020, non-current undated

#### Scenario: Equal dates

- **WHEN** experience entries have the same effective sort date
- **THEN** later start dates precede earlier starts, missing starts follow known ones,
  and entries still tied retain their loaded relative order

#### Scenario: Reordering after a write

- **WHEN** an editor changes a 2020 education end year to 2025 and the write succeeds
- **THEN** the same entry moves to its new chronological position, subsequent edit/remove
  actions target its identity, and opening a sorted panel itself sends no write

#### Scenario: Experience state follows identity

- **WHEN** a successful date change moves an experience entry
- **THEN** edit and disclosure state stays attached to entry identities rather than list positions

### Requirement: Contact validation preserves the user's form

Candidate creation and Datos principales saves SHALL validate optional email and phone values
before sending a request. Invalid values SHALL produce Spanish field-specific errors, including
distinct phone character and minimum-digit errors, exposed as an alert at the top of the form.
Failed validation or writes SHALL retain entered values. Blank contacts SHALL remain valid.

#### Scenario: Invalid contact before request

- **WHEN** a user submits an invalid email, a phone containing letters or an eight-digit phone
  on create or main-data edit
- **THEN** no write is sent, the error identifies the field and reason, and the form keeps its values

#### Scenario: Clear invalid legacy contact

- **WHEN** a stored invalid phone is loaded and the user tries to save another main-data field
- **THEN** saving is refused until the contact is corrected or cleared, without losing the draft

#### Scenario: Unrelated panel remains usable

- **WHEN** a candidate has an invalid legacy contact and an editor changes education or experience
- **THEN** that relation can save without rewriting or validating the untouched contact fields

#### Scenario: Server rejects the contact

- **WHEN** the API returns a contact-validation problem to the form
- **THEN** it is presented accessibly in Spanish without including the submitted personal value

## MODIFIED Requirements

### Requirement: Form panels save only their own changes

Datos principales and Competencias SHALL keep the changes made in edit mode as a draft. They SHALL
NOT write anything until the user activates that panel's «Guardar». Educación and Experiencia have
no draft: each entry is written as soon as it is added, updated or removed (see «Educación and
Experiencia write each entry at once»).

«Guardar» SHALL write only that panel's data. It SHALL then return the panel to read-only with the
saved values, and announce a confirmation accessibly. «Cancelar» SHALL discard the draft, send no
write, and return the panel to read-only with the saved values.

For Competencias, «Guardar» SHALL write only the families (Habilidades, Idiomas, Programas,
Etiquetas) whose entries changed. When some families are saved and others are refused, the saved
families SHALL stay saved. The panel SHALL stay in edit mode, show the Spanish error on each refused
family, and a further «Guardar» SHALL write only the families still unsaved.

Validation that refuses an entry SHALL be reported in the panel without saving it. This covers a
duplicate value, a missing required field, an out-of-range year or date, negative years, and an
over-long description.

A validation or save error of a candidate form SHALL be shown in the error style (the danger
colour, not the muted or empty-state style), exposed as an alert, and placed at the top of the form
it refers to, before its first field. This applies to the core record form on both pages, the
Educación and Experiencia add forms, and the document upload form. Errors of Notas SHALL be shown
at the top of the Notas panel, since they can come from adding, editing or retiring a note. A
Competencias family error SHALL stay on that family's row.

In edit mode, Educación and Experiencia SHALL show, after the existing entries and set apart from
them by a visible rule, a «Nueva formación» or «Nueva experiencia» button and no form. Activating it
SHALL show the form for a new entry, titled «Nueva formación» or «Nueva experiencia» (its accessible
name), with focus on its first field. «Cancelar» SHALL hide the form again without writing, and a
written add or update SHALL hide it too, returning focus to the button. On entering edit mode, focus
SHALL move to the panel's first control, the first row's «Editar» or the «Nueva …» button.

In edit mode, each Educación and Experiencia entry SHALL also offer «Editar», whose accessible name
names the entry («Editar la formación {titulación}», «Editar la experiencia {puesto} en
{empresa}»). «Editar» SHALL:

- load the entry into the same form, retitled «Editar formación» or «Editar experiencia»,
  including an experience entry's description;
- move focus to the form's first field;
- mark the entry's row as the one being edited.

The submit control SHALL read «Actualizar formación» or «Actualizar experiencia». «Cancelar
edición» SHALL only return the form to a new entry, writing nothing.

An update SHALL:

- apply the same validation as an add;
- be written at once under the same identity, with its visible position determined by the history ordering rules;
- keep its identity and the fields the form does not show (notes);
- return the form to a new entry once written.

An update that changes no value, including an untouched description, SHALL write nothing. The form
SHALL keep offering the entry's education type, education status or sector when that catalog value
is no longer active, so the update does not drop it. Removing the entry being edited or closing the
panel SHALL also end the edit.

#### Scenario: Competencias changes are saved together

- **WHEN** an editor, with Competencias in edit mode, adds a skill and removes a tag and then
  activates «Guardar»
- **THEN** no write is sent before «Guardar». After it, both families are saved, the panel shows
  them read-only, and a confirmation is announced.

#### Scenario: Cancel discards the draft

- **WHEN** an editor changes Datos principales in edit mode and activates «Cancelar»
- **THEN** no write is sent and the panel shows the saved values read-only

#### Scenario: Core record is saved

- **WHEN** an editor changes the e-mail in Datos principales and activates «Guardar»
- **THEN** the change persists, the page header shows the new e-mail, and a confirmation is announced

#### Scenario: Core record without a name

- **WHEN** an editor clears the first name in Datos principales and activates «Guardar»
- **THEN** a Spanish validation message is shown in the error style at the top of the form, before
  its first field, and nothing is written

#### Scenario: Add form is set apart from the entries

- **WHEN** an editor puts Educación in edit mode on a candidate with education entries
- **THEN** the entries are listed first, then a rule, then the «Nueva formación» button and no form;
  activating it shows a form titled «Nueva formación»

#### Scenario: Entry is edited in place

- **WHEN** an editor activates «Editar» on an education entry, changes its centre and activates
  «Actualizar formación»
- **THEN** the education is saved at once with that entry in the same position, under the same
  identity, with the new centre, and the form is titled «Nueva formación» again

#### Scenario: Edit keeps the fields the form does not show

- **WHEN** an editor updates an experience entry that has notes recorded
- **THEN** the saved entry keeps those notes

#### Scenario: Edit loads the description

- **WHEN** an editor activates «Editar» on an experience entry that has a description
- **THEN** the form's «Descripción» shows that description with its formatting

#### Scenario: Entry holds a retired catalog value

- **WHEN** an editor edits an education entry whose status is no longer an active catalog value
- **THEN** the form shows that status selected, and updating the entry keeps it

#### Scenario: Edit that changes nothing

- **WHEN** an editor activates «Editar» on an entry and then «Actualizar» without changing a field
- **THEN** nothing is written and the panel reports no unsaved changes

#### Scenario: Edit is cancelled

- **WHEN** an editor changes a field of an entry being edited and activates «Cancelar edición»
- **THEN** the entry is unchanged and the form is empty and titled for a new entry

#### Scenario: Edit refused by validation

- **WHEN** an editor clears the degree of an education entry being edited and activates
  «Actualizar formación»
- **THEN** the Spanish validation message is shown at the top of the form, the form stays in edit,
  and the entry is unchanged

#### Scenario: Only changed families are written

- **WHEN** an editor, with Competencias in edit mode, adds a skill and changes a language's level
  and activates «Guardar»
- **THEN** the skills and the languages are written, and the programs and tags are not

#### Scenario: One family is refused

- **WHEN** Competencias saves changed skills and languages and the API refuses the languages
- **THEN** the skills stay saved, the panel stays in edit mode with the Spanish error on Idiomas,
  and a further «Guardar» writes only the languages

#### Scenario: Entry is added with the lowest level

- **WHEN** an editor adds a language in Competencias and the language level catalog's first active
  value is A1
- **THEN** the draft shows the language at A1 without asking for a level, and it is saved at A1 on
  «Guardar»

#### Scenario: Level is changed in place

- **WHEN** an editor changes an existing language entry's level in the draft and saves
- **THEN** the entry persists with the new level and keeps its certification

#### Scenario: No active level

- **WHEN** every value of the program level catalog is inactive
- **THEN** the editor cannot add a program to the draft

#### Scenario: Duplicate entry is refused in the draft

- **WHEN** an editor adds to the Competencias draft a language the candidate already has
- **THEN** the Spanish duplicate message is shown and the language is not added to the draft

### Requirement: Experience years are worked out from the dates

«Años de experiencia» SHALL hold years with one decimal, shown with the Spanish decimal separator;
a whole number SHALL be shown without a decimal part (`10`, not `10,0`).
When an entry has a start date and an end date, or a start date and is a current role, the field
SHALL show the years worked out from those dates. It SHALL be read-only, and SHALL say that the
value is calculated from the dates.

The years SHALL be the months from the start month to the end month, both included, divided by 12,
rounded to one decimal, half away from zero; the day of a date SHALL NOT count. A current role
SHALL count up to the current month. Otherwise the field SHALL accept a value typed by hand, from
zero in steps of one tenth.

Every Experiencia row SHALL show the years its dates determine whenever they
determine them, a current role's worked out up to the month the page is shown. A value typed by hand
SHALL be shown only for an entry whose dates do not determine its years. Years SHALL read «1 año»
for one and «N años» otherwise. Entry summaries SHALL omit absent, null and zero years and
their separators, without changing stored values or the calculated form field.

#### Scenario: Typed years the dates contradict

- **WHEN** an editor types 6 in «Años de experiencia», then enters January 2023 to December 2023
  and adds the entry
- **THEN** the field shows `1` read-only, the written row shows «1 año», and no row shows «6 años»

#### Scenario: Both dates

- **WHEN** an editor enters March 2019 as Fecha inicio and June 2024 as Fecha fin
- **THEN** «Años de experiencia» is read-only and shows `5,3` (64 months)

#### Scenario: Both months count

- **WHEN** an editor enters January 2023 to January 2024
- **THEN** «Años de experiencia» shows `1,1` (13 months), and the same month to the same month shows
  `0,1`

#### Scenario: Current role

- **WHEN** an entry is a current role that started 24 months ago, this month included
- **THEN** the form shows `2` and the read-only row shows «2 años»

#### Scenario: Incomplete dates

- **WHEN** an entry has only an end date
- **THEN** «Años de experiencia» accepts `3,5` typed by hand and the entry is saved with 3.5 years
