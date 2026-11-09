## Why

When a recruiter creates a candidate from a CV, the rule-based draft (KTL-32) often fills only part of the form, and nothing at all for a scanned CV. The recruiter then has to open the file separately to check or type the missing values. The create page explicitly shows no preview today, and the candidate page's layout only puts its preview beside the content from a 1360 px content area, which most laptops never reach. The brief is [openspec/KTL-47.md](../../KTL-47.md).

## What Changes

- The «Nuevo candidato» page shows the CV the user has just read in a preview panel, once the CV-draft request has returned a draft (`cv_draft.extracted` or `cv_draft.no_text`). That is the same moment the page starts holding the file for the KTL-42 attach step.
- A PDF is rendered from the held local file in the browser's PDF viewer, fitted to width. A DOCX shows the file name and a localized "preview only for PDF" message, with no viewer and no new dependency.
- No preview while the draft request is in flight, or after a refused, infected, scanner-unavailable, timed-out, failed or superseded pick. Picking another CV removes the current preview at once.
- The preview does not depend on the «Adjuntar este CV al candidato» choice or on `documents.upload`/`documents.download`.
- Create-page-only layout: the preview is a sticky column beside the form when the page's content area is at least 1024 px, and follows the form below that. The candidate page keeps its 1360 px threshold. Before a CV is read the page is unchanged: one full-width column and no widened content area.
- **Reversal of an existing rule**: `candidate-profile-pages` currently says the new-candidate page SHALL NOT show a preview. That sentence and its scenario are removed in favour of the new create-page requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `candidate-cv-draft`: adds the requirement "Read CV preview on the create page", which covers when the preview is shown, PDF vs DOCX, replacement, independence from the attach choice, and the 1024 px side-by-side layout.
- `candidate-profile-pages`: "CV preview beside the candidate sections" drops the "new-candidate page SHALL NOT show a preview" clause and its scenario, and points to the create-page requirement instead.

## Impact

- **Frontend only.** It touches `frontend/src/app/features/candidates/pages/candidate-create-page.tsx`, a new `HeldCvPreview` component with a sibling `.logic.ts`, `frontend/src/styles.css` (a `.page-split--create` container rule at 1024 px), `candidate-cv-preview.css`, and the `es.json`/`en.json` keys under `candidate.cvDraft.preview.*`.
- **Backend, API, database, grants and roles:** no change. No new endpoint, table, migration, permission or `ktl_runtime` grant.
- **Dependencies:** none added.
- **Personal data (principle 1):** the CV is personal data. The preview uses only the `File` the browser already holds after a clean draft, through an object URL that is revoked when it is replaced or unmounted. Nothing about the file is logged, persisted to browser storage or put in the URL, and nothing is uploaded or stored before «Guardar». The KTL-42 attach flow is unchanged.
- **Storage and quarantine (principle 3):** no server document content is requested. Content is shown only after ClamAV has reported it clean through the CV-draft operation, so the preview fails closed on any refusal or failure. The page stays gated by `candidates.create`, and no RLS policy, storage access path or role definition changes.
- **Docs:** `README.md` («Alta desde un CV KTL-32») and a new `docs/ktl-47/release-notes.md`.

### Actors, assumptions and success criteria

- **Actor:** a user holding `candidates.create` on «Nuevo candidato».
- **Assumptions:**
  - The CV-draft response arriving means the content was scanned clean.
  - The server has already confirmed that the file's extension matches its content, so the client can choose PDF or DOCX rendering from the extension.
  - Browsers in use render PDFs inline with `<object>`.
- **Edge cases:**
  - A clean CV that is too long to extract is refused, so it gets no preview. This is consistent with KTL-42 holding only files whose draft returned.
  - An `<object>` that cannot render shows a fallback message with no download action.
  - Re-picking the same file starts a fresh read.
- **Success criteria:**
  - At 1366 × 768 the PDF is shown to the right of the form and stays in view down to «Guardar».
  - Below a 1024 px content area it follows the form, and at 390 px there is no horizontal scroll.
  - No preview appears for any refused or in-flight pick.
  - The candidate page's 1360 px behaviour is unchanged.
