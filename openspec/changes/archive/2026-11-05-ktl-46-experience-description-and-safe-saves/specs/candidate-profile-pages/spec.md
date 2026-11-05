## MODIFIED Requirements

### Requirement: Form panels save only their own changes

Datos principales, Competencias, Educación and Experiencia SHALL keep the changes made in edit mode
as a draft. They SHALL NOT write anything until the user activates that panel's «Guardar».

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

In edit mode, Educación and Experiencia SHALL show the form for a new entry after the existing
entries, set apart from them by a visible rule. The form SHALL be titled «Nueva formación» or
«Nueva experiencia», and that title SHALL be its accessible name.

In edit mode, each Educación and Experiencia entry SHALL also offer «Editar», whose accessible name
names the entry («Editar la formación {titulación}», «Editar la experiencia {puesto} en
{empresa}»). «Editar» SHALL:

- load the entry into the same form, retitled «Editar formación» or «Editar experiencia»,
  including an experience entry's description;
- move focus to the form's first field;
- mark the entry's row as the one being edited.

The submit control SHALL read «Actualizar formación» or «Actualizar experiencia». «Cancelar
edición» SHALL return the form to a new entry without changing the draft.

An update SHALL:

- apply the same validation as an add;
- replace the entry in the draft where it stands;
- keep its identity and the fields the form does not show (notes);
- return the form to a new entry.

An update that changes no value, including an untouched description, SHALL leave the panel without
unsaved changes. The form SHALL keep offering the entry's education type, education status or
sector when that catalog value is no longer active, so the update does not drop it. Removing the
entry being edited, «Cancelar» or a successful «Guardar» SHALL also end the edit.

#### Scenario: Staged changes are saved together

- **WHEN** an editor, with Educación in edit mode, adds one entry and removes another and then
  activates «Guardar»
- **THEN** no write is sent before «Guardar». After it, the candidate's education is saved as the
  resulting list, the panel shows it read-only, and a confirmation is announced.

#### Scenario: Cancel discards the draft

- **WHEN** an editor changes Experiencia in edit mode and activates «Cancelar»
- **THEN** no write is sent and the panel shows the saved experience read-only

#### Scenario: Core record is saved

- **WHEN** an editor changes the e-mail in Datos principales and activates «Guardar»
- **THEN** the change persists, the page header shows the new e-mail, and a confirmation is announced

#### Scenario: Core record without a name

- **WHEN** an editor clears the first name in Datos principales and activates «Guardar»
- **THEN** a Spanish validation message is shown in the error style at the top of the form, before
  its first field, and nothing is written

#### Scenario: Add form is set apart from the entries

- **WHEN** an editor puts Educación in edit mode on a candidate with education entries
- **THEN** the entries are listed first, then a rule, then a form titled «Nueva formación»

#### Scenario: Entry is edited in place

- **WHEN** an editor activates «Editar» on an education entry, changes its centre, activates
  «Actualizar formación» and then «Guardar»
- **THEN** the education is saved with that entry in the same position, under the same identity,
  with the new centre, and the form is titled «Nueva formación» again

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
- **THEN** the panel reports no unsaved changes

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

### Requirement: Experience form groups its dates

The Experiencia form SHALL lay out its fields in a three-column grid:

1. Empresa, Puesto and Sector.
2. Fecha inicio; Fecha fin with the «Puesto actual» checkbox directly under it; Años de
   experiencia.
3. «Descripción», spanning all three columns.

Ticking «Puesto actual» SHALL disable «Fecha fin» and clear it. Unticking it SHALL enable the field
again, empty.

The «Descripción» editing area SHALL be resizable vertically only. At narrow widths the grid SHALL
collapse to a single column in the same field order, with no horizontal scrolling. The label of the
third field stays «Sector».

#### Scenario: Field order

- **WHEN** an editor opens the Experiencia form at desktop width
- **THEN** Empresa, Puesto and Sector share the first row; Fecha inicio, Fecha fin with «Puesto
  actual» under it, and Años de experiencia share the second; «Descripción» spans the third

#### Scenario: Current role disables the end date

- **WHEN** an editor fills «Fecha fin» and then ticks «Puesto actual»
- **THEN** «Fecha fin» is disabled and empty, and unticking enables it again without a value

#### Scenario: Narrow screen

- **WHEN** the Experiencia form is shown at 390px wide
- **THEN** every field is stacked in the same order and the page does not scroll horizontally

## ADDED Requirements

### Requirement: Experience description is edited as rich text

The Experiencia form SHALL offer «Descripción», a rich-text editor whose accessible name is
«Descripción», with a labelled toolbar of Negrita, Cursiva, Subrayado, Lista con viñetas and Lista
numerada. The description SHALL support paragraphs, line breaks, bold, italic, underline,
bulleted lists and numbered lists, and nothing else.

The description SHALL be staged with the entry like any other field and written with the panel's
«Guardar». A description over the length the API accepts SHALL be refused in the panel with a
Spanish message, and nothing SHALL be written.

#### Scenario: Formatted description is saved

- **WHEN** an editor writes a description with bold, italic and underlined words, a bulleted list
  and a numbered list, adds the entry and activates «Guardar»
- **THEN** after reloading the page the entry's description shows the same formatting

#### Scenario: Pasted markup is reduced to the allowed formats

- **WHEN** an editor pastes content containing a link, an image and coloured text into
  «Descripción» and saves
- **THEN** the saved description contains the text without the link, the image or the colour

#### Scenario: Description too long

- **WHEN** an editor's description exceeds the accepted length and the editor activates «Guardar»
- **THEN** a Spanish message states the limit and nothing is written

### Requirement: Experience years are worked out from the dates

«Años de experiencia» SHALL hold years with one decimal, shown with the Spanish decimal separator.
When an entry has a start date and an end date, or a start date and is a current role, the field
SHALL show the years worked out from those dates. It SHALL be read-only, and SHALL say that the
value is calculated from the dates.

The years SHALL be the elapsed days divided by 365.25, rounded to one decimal, half away from zero.
A current role SHALL count up to today. Otherwise the field SHALL accept a value typed by hand, from
zero in steps of one tenth.

In read-only mode, a current role's years SHALL be worked out up to the day the page is shown.

#### Scenario: Both dates

- **WHEN** an editor enters 1 March 2019 as Fecha inicio and 30 June 2024 as Fecha fin
- **THEN** «Años de experiencia» is read-only and shows `5,3`

#### Scenario: Current role

- **WHEN** an entry is a current role that started two years ago to the day
- **THEN** the form shows `2,0` and the read-only row shows «2 años»

#### Scenario: Incomplete dates

- **WHEN** an entry has only an end date
- **THEN** «Años de experiencia» accepts `3,5` typed by hand and the entry is saved with 3.5 years

### Requirement: Experiencia read view expands descriptions

In read-only mode, each Experiencia entry that has a description SHALL be a disclosure row. Its
summary SHALL be a button that exposes whether it is expanded, and activating it by pointer, Enter
or Space SHALL show or hide the formatted description below the summary. The summary shows the
period, position, company, sector and years.

Rows SHALL start collapsed. More than one row MAY be expanded at a time. An entry without a
description SHALL be a plain row with no disclosure control. In edit mode, entries SHALL be listed
as plain rows with their «Editar» and «Quitar» actions.

A description migrated as plain text SHALL be shown as paragraphs, one per line of the original
text, with any markup-like characters shown literally.

#### Scenario: Entry is expanded

- **WHEN** a reader activates an Experiencia entry that has a description
- **THEN** the description is shown with its formatting and the control reports it is expanded

#### Scenario: Entry without a description

- **WHEN** Experiencia lists an entry with no description
- **THEN** the row offers no disclosure control

#### Scenario: Legacy plain text

- **WHEN** an entry's stored description is the plain text `Gestión de equipos` and
  `Planificación` on two lines, and `a < b` on a third
- **THEN** the expanded row shows three paragraphs and the `<` literally

### Requirement: Unsaved panel changes survive the end of the session

When a candidate page has unsaved changes in any panel and an API request is refused as
unauthenticated, or the session is found to have expired, the page SHALL NOT navigate away and
SHALL NOT discard the draft.

The panel SHALL show, in the error style, «La sesión ha caducado. Vuelve a iniciar sesión para
guardar los cambios.» with an «Iniciar sesión» action. That action SHALL open the sign-in for the
configured mode over the page.

Once the user has signed in again as the same user:

- a form panel whose save was refused SHALL retry that save with the same draft, once;
- a refused action of Notas or Documentos SHALL be left for the user to repeat, with its text or
  selected file kept.

Signing in as a different user SHALL discard the unsaved changes and continue as a fresh sign-in.
Closing the dialog without signing in SHALL keep the draft and the message.

When no panel has unsaved changes, an unauthenticated refusal SHALL end the session and return the
user to sign-in, as before.

#### Scenario: Save refused because the session ended

- **WHEN** an editor has added three experience entries to the draft and «Guardar» is refused as
  unauthenticated
- **THEN** the page stays on the candidate, the three entries are still listed, and «Iniciar sesión»
  is offered

#### Scenario: Signing in again saves the draft

- **WHEN** the editor activates «Iniciar sesión» after that refusal and signs in as the same user
- **THEN** the three entries are saved without being entered again and the panel returns to
  read-only with a confirmation

#### Scenario: Session already expired before saving

- **WHEN** the session has expired before the editor activates «Guardar» on a panel with unsaved
  changes
- **THEN** no request is sent, the draft is kept, and «Iniciar sesión» is offered

#### Scenario: Different user signs in

- **WHEN** the user signs in again as a different user from the dialog
- **THEN** the unsaved changes are discarded and the application continues as that user's fresh
  sign-in

#### Scenario: Nothing unsaved

- **WHEN** no panel has unsaved changes and an API request is refused as unauthenticated
- **THEN** the session ends and the user is returned to sign-in
