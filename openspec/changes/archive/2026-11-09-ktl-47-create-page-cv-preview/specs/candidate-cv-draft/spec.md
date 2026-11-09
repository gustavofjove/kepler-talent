## ADDED Requirements

### Requirement: Read CV preview on the create page

While the create page holds a CV under «Read CV is attached to the created candidate», it SHALL
show that CV in a preview panel. The preview SHALL therefore appear only after the draft endpoint
has returned a draft for the file, including an empty `cv_draft.no_text` draft. No preview SHALL be
shown while the draft request is in flight, or for a CV whose draft request was refused, failed or
superseded. Picking another CV SHALL remove the current preview as soon as the new read starts.

The preview SHALL render the file the browser already holds. It SHALL NOT upload the file, request
document content from the API or store anything, and it SHALL NOT write the file, its name or its
content to browser storage, the URL or logs. Any local reference created to display the file SHALL
be released when the preview is replaced or the page is left.

- A PDF SHALL be shown in an embedded viewer fitted to the panel width, with an accessible name. If
  the browser cannot display it, the panel SHALL show a localized message with no download action.
- A DOCX SHALL show the file name and a localized message that the preview is only available for
  PDF CVs, with no viewer and no download action.

The preview SHALL be offered to every user who can use the CV picker. It SHALL NOT depend on the
document upload or download permissions, nor on the attach choice.

When the preview is shown and the create page's content area is at least 1024 CSS pixels wide:

- The preview SHALL be a column to the right of the form.
- It SHALL stay visible below the application header while the form scrolls.
- The content area SHALL widen as it does on the candidate page.

When the content area is narrower, the preview SHALL follow the form. When no CV is held, the form
SHALL take the full content width, no empty column SHALL remain, and the content area SHALL NOT
widen. Two-column field groups in the form SHALL become one column when the form column is too
narrow for two. Reading and keyboard order SHALL be the form first and then the preview, at every
width, and the page SHALL NOT scroll horizontally at 390 CSS pixels wide.

#### Scenario: PDF shown beside the form on a laptop

- **WHEN** a user picks a clean PDF CV on the create page at 1366×768 and the draft returns
- **THEN** the PDF is shown to the right of the form, and it remains fully visible below the
  application header when the user scrolls down to «Guardar»

#### Scenario: Scanned CV is previewed

- **WHEN** the draft for a clean PDF returns `cv_draft.no_text`
- **THEN** the user is told to fill the form in by hand and the PDF preview is shown

#### Scenario: DOCX shows a PDF-only message

- **WHEN** the draft for a clean DOCX CV returns
- **THEN** the preview panel shows the file name and the PDF-only message, with no viewer and no
  download action

#### Scenario: No preview before a clean draft

- **WHEN** the draft request is still in flight, or the CV was refused for format, size,
  infection, an unavailable scanner, a timeout or any other failure
- **THEN** no preview is shown and the form takes the full content width

#### Scenario: Picking another CV replaces the preview

- **WHEN** a preview is shown and the user picks another file
- **THEN** the previous preview disappears at once, and a preview of the new file appears only if
  its draft returns

#### Scenario: Preview is independent of the attach choice

- **WHEN** the user clears «Adjuntar este CV al candidato», or does not hold `documents.upload` and
  so is not offered the choice
- **THEN** the preview stays shown

#### Scenario: Preview follows the form on a narrow screen

- **WHEN** the create page's content area is narrower than 1024 CSS pixels and a CV is held
- **THEN** the preview is shown below the form, and at 390 CSS pixels wide the page does not scroll
  horizontally

#### Scenario: No CV keeps the page unchanged

- **WHEN** a user opens the create page and has not read a CV
- **THEN** no preview panel is shown, the form takes the full content width and the content area
  is not widened

#### Scenario: Preview stores nothing

- **WHEN** a CV has been previewed and the user leaves the create page without saving
- **THEN** no candidate, document or stored object exists as a result, and nothing about the file
  remains in browser storage or the URL
