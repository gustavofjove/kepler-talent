# Candidate CV Draft Specification

## Purpose

Lets a user creating a candidate upload a CV and receive suggested values for the core record
fields, extracted locally by rules, without the CV or its content being stored, logged or trusted
before a clean malware scan.

## Requirements

### Requirement: CV draft extraction operation

The system SHALL expose an operation that accepts a single CV file and returns a draft of
suggested values for the candidate fields first name, last name, e-mail, phone, location and
province. Each suggested value SHALL carry a confidence of `high` or `low`. A field with no
suggestion SHALL be absent from the draft rather than returned empty. The response SHALL also carry
an opaque draft identifier and a stable outcome code, and SHALL carry nothing else from the file:
no extracted text, no original filename, no storage key or path.

#### Scenario: CV with a text layer is processed

- **WHEN** a permitted actor submits a clean PDF or DOCX CV that contains a readable name, e-mail
  and phone
- **THEN** the response carries suggestions for those fields, each with a `high` or `low`
  confidence, an opaque draft identifier and the `cv_draft.extracted` outcome

#### Scenario: Field cannot be found

- **WHEN** the CV contains no recognisable value for a field
- **THEN** that field is absent from the draft and the other suggestions are still returned

#### Scenario: Response carries no file content

- **WHEN** any draft response is inspected
- **THEN** it contains only the suggested field values, their confidences, the draft identifier
  and the outcome code, and contains no extracted text, filename, storage key or path

### Requirement: CV draft authorization fails closed

The operation SHALL require the candidate create capability and SHALL check authentication and
that capability before reading, scanning or parsing the request body. It SHALL fail closed for an
unauthenticated actor and for an authenticated actor lacking the capability.

#### Scenario: Unauthenticated caller submits a CV

- **WHEN** an unauthenticated caller submits a CV
- **THEN** the request is refused, the body is not scanned or parsed, and no draft is returned

#### Scenario: Actor may read candidates but not create them

- **WHEN** an actor holding the candidate read capability but not the create capability submits a
  CV
- **THEN** the request is refused, the body is not scanned or parsed, and no draft is returned

#### Scenario: Actor may upload documents but not create candidates

- **WHEN** an actor holding the document upload capability but not the candidate create
  capability submits a CV
- **THEN** the request is refused and no draft is returned

### Requirement: Accepted CV formats and size

The operation SHALL accept PDF and DOCX files only, whose extension and detected content agree,
within the same 20 MB limit that applies to candidate documents. Any other file SHALL be refused
with a stable code before scanning or parsing, and an empty upload or a request with no file SHALL
be refused with a stable code.

#### Scenario: Allowed format is submitted

- **WHEN** a permitted actor submits a non-empty PDF or DOCX within the size limit whose content
  matches its extension
- **THEN** it proceeds to scanning

#### Scenario: Other allowed document format is submitted

- **WHEN** a permitted actor submits a DOC, ODT, RTF, TXT or image file
- **THEN** the request is refused with a stable unsupported-format code and nothing is parsed

#### Scenario: Extension and content disagree

- **WHEN** a file named as a PDF or DOCX has content that does not match, or is a macro-enabled or
  encrypted DOCX
- **THEN** the request is refused with a stable code before scanning, and nothing is parsed

#### Scenario: Encrypted or password-protected PDF

- **WHEN** a permitted actor submits a clean PDF that is encrypted or password-protected
- **THEN** the request is refused with a stable unreadable code and no text is extracted from it

#### Scenario: File exceeds the limit or is missing

- **WHEN** the upload exceeds 20 MB, is empty, or carries no file
- **THEN** the request is refused with a stable validation code and nothing is scanned or parsed

### Requirement: Scan before parse

No CV content SHALL be parsed or have text extracted from it until automated malware scanning has
reported the content clean. An infected verdict, an error, a timeout or an unavailable scanner
SHALL each refuse the request without parsing, with a stable code that reveals no scanner signature
or internal detail.

#### Scenario: Clean CV is parsed

- **WHEN** the scanner reports the submitted content clean
- **THEN** the content is parsed and a draft is returned

#### Scenario: Infected CV is refused

- **WHEN** the scanner reports the submitted content infected
- **THEN** the request is refused with a stable rejection code, nothing is parsed, and no
  signature name is disclosed

#### Scenario: Scanner is unavailable

- **WHEN** the scanner is unavailable, errors or times out
- **THEN** the request is refused with a stable, retryable scanner-unavailable code and nothing is
  parsed

### Requirement: CV and extracted content are neither stored nor logged

The submitted file, its original filename, the extracted text and the suggested values SHALL NOT
be written to document storage, the database, application logs or the audit trail. They SHALL
exist only for the duration of the request. Each attempt that passes the permission and request
checks (a single non-empty file within the size limit, a free concurrency slot) SHALL record one
audit event carrying the acting internal user identifier, the draft identifier, the outcome code
and the correlation identifier, and nothing from the file. Refusals before that point carry no file
content and are not audited.

#### Scenario: Draft is extracted

- **WHEN** a draft is returned
- **THEN** no document record, stored object or candidate exists as a result, and one audit event
  records actor, draft identifier, outcome and correlation only

#### Scenario: Logs are inspected after an extraction

- **WHEN** application logs are inspected after successful, refused and failed extractions
- **THEN** they contain no filename, extracted text or suggested value, and identify the attempt
  only by draft and correlation identifiers and an outcome code

#### Scenario: Refused CV leaves nothing behind

- **WHEN** a CV is refused for format, size, infection or an unavailable scanner
- **THEN** no stored object, document record or candidate exists as a result

### Requirement: CV without a text layer

A CV from which no usable text can be extracted, such as a scanned image-only PDF, SHALL produce
an empty draft with a distinct outcome code rather than an error, so the user can be told to fill
the form in by hand.

#### Scenario: Image-only PDF is submitted

- **WHEN** a permitted actor submits a clean PDF with no text layer
- **THEN** the response is a successful empty draft with the `cv_draft.no_text` outcome

### Requirement: Bounded extraction work

Extraction SHALL be bounded in the number of concurrent extractions, the number of pages and
characters read, and the total processing time. A request that would exceed the concurrency bound
SHALL be refused with a stable, retryable code; a CV that exceeds the page, character or time
bound SHALL either yield a draft from the bounded portion or be refused with a stable code. The
request SHALL return within its time budget, and work abandoned at the budget SHALL stop at the
next page or paragraph boundary. Work that outlives its request SHALL keep counting against the
concurrency bound until it has actually stopped.

#### Scenario: Too many extractions at once

- **WHEN** more CVs are submitted concurrently than the configured bound allows
- **THEN** the excess requests are refused with a stable retryable code and nothing from them is
  scanned or parsed

#### Scenario: Very long CV

- **WHEN** a clean CV has more pages or text than the configured bound
- **THEN** only the bounded portion is read and the operation completes within its time budget

### Requirement: Suggestion rules and confidence

Suggestions SHALL follow deterministic, local rules with no external service. The e-mail SHALL be a
syntactically valid address found in the text. The phone SHALL be a number that parses as valid
with Spain as the default region. The province SHALL be one of the Spanish provinces, and the
location one of the Spanish municipalities, preferring a postcode line or the contact block over
the rest of the document. Confidence SHALL be `high` only when the value was corroborated (for
example a name matching the e-mail's local part, or a municipality consistent with a postcode's
province) and `low` otherwise.

#### Scenario: Name matches the e-mail

- **WHEN** the most prominent text near the top of the first page is a name whose words appear in
  the e-mail's local part
- **THEN** first and last name are suggested with `high` confidence

#### Scenario: Name is uncorroborated

- **WHEN** a probable name is found but cannot be cross-checked
- **THEN** first and last name are suggested with `low` confidence

#### Scenario: Postcode identifies the province

- **WHEN** the contact block contains a Spanish postcode followed by a known municipality
- **THEN** the province of that postcode and the municipality are suggested with `high` confidence

#### Scenario: Several e-mails or phones are present

- **WHEN** the CV contains more than one e-mail or phone
- **THEN** the one nearest the top of the document is suggested

### Requirement: Create form applies a draft without overwriting

The create page SHALL offer a CV picker to a user who can create candidates. Applying a draft SHALL
fill only fields that are empty at the moment the draft arrives and SHALL NOT change a field the
user has typed in. Every filled field SHALL stay editable, SHALL be marked as suggested from the CV,
and a `low` confidence suggestion SHALL additionally be marked for review. Nothing SHALL be saved
until the user submits the form. Whether the CV is attached to the saved candidate is governed by
«Read CV is attached to the created candidate».

#### Scenario: Draft fills empty fields

- **WHEN** a user picks a CV on the create page and the draft arrives while every field is empty
- **THEN** each suggested field is filled and marked as suggested, low-confidence ones are also
  marked for review, and no candidate has been saved

#### Scenario: Typed values are kept

- **WHEN** a user has typed a first name and then picks a CV whose draft suggests a different one
- **THEN** the typed first name is kept and only the empty fields are filled

#### Scenario: User edits a suggestion

- **WHEN** the user changes a suggested value
- **THEN** the new value is kept and the field is no longer marked as suggested

#### Scenario: Empty or refused draft

- **WHEN** the draft is empty because the CV has no text, or the CV is refused
- **THEN** the form is unchanged and the user sees a localized message explaining what to do,
  without technical detail

#### Scenario: Draft request is in flight

- **WHEN** the draft request has not yet completed
- **THEN** the picker shows a busy state and the form remains usable

#### Scenario: Saved candidate has no document

- **WHEN** the user saves a candidate after applying a draft, and the CV is not attached because
  the attach choice was cleared or the user lacks `documents.upload`
- **THEN** the candidate is created exactly as from a manually filled form, with no document
  attached

#### Scenario: Picking a CV saves nothing by itself

- **WHEN** the user picks a CV and leaves the create page without submitting the form
- **THEN** no candidate and no document exist as a result, and the file is no longer held by the
  page

### Requirement: Read CV is attached to the created candidate

After the draft endpoint has returned a draft for a CV, including an empty `cv_draft.no_text`
draft, the create page SHALL hold that file in browser memory only, until the page is left or
another CV is picked. A CV whose draft request was refused, failed or was superseded SHALL NOT be
held. While a CV is held and the user holds `documents.upload`, the page SHALL offer a choice to
attach it, selected by default; a user without `documents.upload` SHALL NOT be offered the choice
and SHALL NOT have the CV attached.

When the candidate is created and the choice is selected, the page SHALL upload the held file
through the standard candidate document upload as the candidate's primary CV document, with every
control of that operation (permission check before validation, quarantine, malware scan before the
document is available, private storage under an opaque key, audit) applying unchanged. The CV
draft operation itself SHALL continue to store nothing.

A failed attach SHALL NOT undo or block the candidate's creation: the user SHALL be taken to the
created candidate and SHALL see a localized warning that the CV was not attached and can be
uploaded from the candidate page. If the candidate's creation fails, nothing SHALL be uploaded.
The page SHALL NOT log the file or its name.

#### Scenario: CV is attached on save

- **WHEN** a user with `documents.upload` picks a CV, keeps the attach choice selected, and saves
  the form
- **THEN** the candidate is created, its primary CV document is that file in the pending-scan
  state, and the user is taken to the candidate page

#### Scenario: Latest CV wins

- **WHEN** the user picks one CV, then picks another whose draft is returned, and saves with the
  choice selected
- **THEN** only the second CV is attached

#### Scenario: Refused CV is not offered

- **WHEN** the draft endpoint refuses the picked CV
- **THEN** no attach choice is offered for it and saving attaches no document

#### Scenario: Actor cannot upload documents

- **WHEN** a user who may create candidates but lacks `documents.upload` picks a CV and saves
- **THEN** no attach choice is shown, no upload is attempted, and the candidate is created with no
  document

#### Scenario: Attach fails after the candidate is created

- **WHEN** the candidate is created but the document upload is refused or fails
- **THEN** the candidate is kept, the user is taken to it, and a localized warning says the CV was
  not attached and can be uploaded from the candidate page

#### Scenario: Candidate creation fails

- **WHEN** the candidate create request fails
- **THEN** no document upload is attempted, the user stays on the create page with the error
  shown, and the held CV and attach choice are kept for a retry

#### Scenario: Upload endpoint still fails closed

- **WHEN** an unauthenticated caller, or an actor without `documents.upload`, posts a file to the
  candidate document upload
- **THEN** the request is refused before validation and nothing is stored

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
