## MODIFIED Requirements

### Requirement: CV preview beside the candidate sections

The candidate page SHALL offer the CV preview to users holding the document download permission,
under the existing preview rules, whether or not a panel is in edit mode. It SHALL offer it only
when the candidate's primary CV can be previewed: a clean PDF whose binary exists, the same rule
that makes the candidate tables offer «Ver». A candidate without a primary CV, or whose primary CV
is of another format, still pending, refused, unscannable or a legacy record without a binary,
SHALL get no preview. Their documents stay available from the Documentos panel. When a pending
primary CV is reported clean while the page is open, the preview SHALL appear without a reload.
The new-candidate page SHALL show only the preview of the CV read on that page, as «Read CV preview
on the create page» in `candidate-cv-draft` describes, and the thresholds below SHALL NOT apply to
it.

When the preview is shown and the page's content area is at least 1360 CSS pixels wide:

- The preview SHALL be a column to the right of the sections column.
- It SHALL stay visible below the application header while the sections scroll.
- The page's content area SHALL widen, up to 1920 CSS pixels.

When the content area is narrower, the preview SHALL follow the last section, one below another.

When the preview is not shown, the sections column SHALL take the full content width, and no empty
column SHALL remain.

Two-column field groups inside the sections column SHALL become one column when that column is too
narrow for two, regardless of the viewport width. Reading and keyboard order SHALL be the sections
first and then the preview, at every width.

#### Scenario: Preview beside the sections on a wide screen

- **WHEN** a user holding the document download permission opens the page of a candidate with a
  clean PDF at 1920×1080
- **THEN** the CV preview is shown to the right of Datos principales

#### Scenario: Preview on the edit page

- **WHEN** a user holding the candidate update and document download permissions puts Datos
  principales in edit mode on a candidate with a clean PDF at 1920×1080
- **THEN** the CV preview stays shown to the right of the Datos principales editor

#### Scenario: Preview stays in view

- **WHEN** the preview is shown beside the sections and the user scrolls down to Documentos
- **THEN** the preview remains fully visible below the application header

#### Scenario: Preview stacked on a narrower screen

- **WHEN** a user holding the document download permission opens the candidate page at 1366×768
- **THEN** the CV preview is shown below the last section

#### Scenario: No preview leaves one column

- **WHEN** a user without the document download permission opens the candidate page at 1920×1080
- **THEN** no preview content is requested, the sections take the full content width and no empty
  column is shown

#### Scenario: Primary CV cannot be previewed

- **WHEN** a user holding the document download permission opens the page of a candidate whose
  primary CV is a clean `.docx`, or who has only non-primary documents
- **THEN** no preview is shown, no document content is requested, the sections take the full
  content width, and the documents remain downloadable from Documentos

#### Scenario: Pending primary CV becomes previewable

- **WHEN** the candidate page is open for a candidate whose primary PDF is pending and the scan
  reports it clean
- **THEN** the CV preview appears without reloading the page

#### Scenario: Field groups follow the sections column

- **WHEN** the preview is shown beside the sections, the sections column is too narrow for two
  field columns, and Datos principales, Educación, Experiencia or Documentos is in edit mode
- **THEN** that panel's form shows its fields in one column

#### Scenario: New candidate page previews only the read CV

- **WHEN** an editor opens the new-candidate page and has not read a CV
- **THEN** no CV preview is shown and no document content is requested
