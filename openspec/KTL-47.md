## [original]

Preview CV just after uploading it for the first time

Users would like to see the CV on the RHS just after uploading it. Sometimes the own system can extract the personal info from reading the CV. However, sometimes it doesn't work as expected and it would be useful getting the CV on RHS to check, copy & paste or type the info manually having the reference in front of the user. We may need to change the breakpoint for this page only, as getting it at the bottom as it happens for other views won't probably work on this case

## [enhanced]

### User story

**As** a recruiter creating a candidate from a CV on «Nuevo candidato»,
**I want** the CV I have just read to be shown beside the form,
**so that** I can check the suggested values and copy or type the missing ones while looking at the original. This matters most when extraction fills little or nothing, for example a scanned CV (`cv_draft.no_text`).

### Context (current behaviour)

- `CandidateCreatePage` ([candidate-create-page.tsx](../frontend/src/app/features/candidates/pages/candidate-create-page.tsx)) renders `CvDraftPicker` and `CandidateForm` inside one full-width panel. Picking a file calls `candidateDraftService.extract()` (`POST` CV-draft endpoint, KTL-32). The file is scanned by ClamAV and parsed, and nothing is stored.
- After a draft returns (`cv_draft.extracted` or `cv_draft.no_text`), the page keeps the `File` in memory as `heldCv`. It is attached on save as the primary CV if «Adjuntar este CV al candidato» stays ticked (KTL-42). A refused, failed or superseded pick is not held.
- The candidate page shows the CV preview (`CandidateCvPreview`) in `.page-split__aside`. It sits beside the sections when the `page-split` container is **≥ 1360 px** and is stacked after them below that width (KTL-28/35, [styles.css](../frontend/src/styles.css) `.page-split`). The desktop navigation is a top bar, so the content area is the viewport minus 44 px of padding: the split needs a viewport of about 1404 px. Common 1280–1366 px laptops therefore always see the preview at the bottom, which is useless while filling in a form.
- `openspec/specs/candidate-profile-pages/spec.md` currently states: _"The new-candidate page SHALL NOT show a preview."_ This story reverses that rule.

### Decisions (agreed with product)

| Topic                 | Decision                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| When it appears       | Only once the CV-draft request has **returned a draft** (`extracted` or `no_text`), meaning the file has been scanned clean. This is exactly when the page starts holding the file (KTL-42). Refused, infected, scanner-unavailable, timed-out, failed or superseded picks get no preview. |
| Source of the content | The held local `File` through an object URL. No upload, no new endpoint, nothing stored before «Guardar».                                                                                                                                                                                  |
| DOCX                  | The panel is shown with the file name and a localized message that preview is only available for PDF. No DOCX renderer and no new dependency.                                                                                                                                              |
| Breakpoint            | Create page only: preview **beside** the form when the `page-split` container is **≥ 1024 px** (viewport about 1068 px). Below that it stacks after the form. The candidate page keeps 1360 px.                                                                                            |
| Attach choice         | The preview does not depend on «Adjuntar este CV al candidato». Unticking it keeps the preview.                                                                                                                                                                                            |

### Functional behaviour

1. Before any CV has been read, the create page looks exactly as it does today: one full-width column, no empty aside, and the content area is not widened.
2. When a draft returns for a picked CV:
   - **PDF**: an aside panel titled «Vista previa del CV» shows the file in the browser's PDF viewer, fitted to width (reuse `viewerUrl()` / `FIT_WIDTH_FRAGMENT`).
   - **DOCX**: the same panel shows the file name and «La vista previa solo está disponible para CV en PDF.». It has no viewer and no download button, since the file is already on the user's machine.
   - The draft fills the form as today. The preview appears in both outcomes, including `no_text`.
3. Picking another CV removes the current preview immediately, because the page drops `heldCv` when the new read starts. The new preview appears only if the new draft returns. A refused new pick leaves no preview.
4. If the browser cannot render the PDF (the `<object>` fallback), the panel shows «El navegador no puede mostrar este PDF.» with no download action.
5. Leaving the page, saving, or replacing the file revokes the object URL. Nothing about the file is written to `localStorage`, `sessionStorage` or the URL.
6. Layout on the create page:
   - Container **≥ 1024 px**: two columns, with the form on the left and the preview on the right. The aside is sticky below the app header and viewport-tall, as on the candidate page. The shell content area widens exactly as it does for the candidate page (`.shell main:has(.page-split__aside .cv-preview)`).
   - Container **< 1024 px**: the preview follows the form panel, one below the other, at full width.
   - At 390 px there is no horizontal scroll, and the form's two-field grid collapses to one column via the existing `page-split-main` container query.
   - At ≥ 1360 px the create page keeps its own column proportions; the candidate page's rule must not override them.
7. Keyboard and screen-reader order: breadcrumb, header, form panel (picker, then fields, then «Guardar»), then preview, at every width.

### UI / frontend changes (`frontend/`)

| File                                                                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/features/candidates/pages/candidate-create-page.tsx`           | Wrap the panel in `.page-split.page-split--create` → `.page-split__layout` → `.page-split__main` / `<aside className="page-split__aside">`. Render the new held-CV preview in the aside while `heldCv` is set. Keep every existing `name=`/`data-testid`.                                                                                                                                                                                                                                               |
| `src/app/features/candidates/components/held-cv-preview.tsx` (new)      | Presentational `HeldCvPreview({ file })`: a `<section className="panel cv-preview" data-testid="held-cv-preview">`. It owns the object URL (`URL.createObjectURL` in an effect, revoked in cleanup) and renders the PDF `<object data-testid="held-cv-preview-viewer">` or the DOCX message (`data-testid="held-cv-preview-unsupported"`). It reuses the `.cv-preview` / `.cv-preview__viewer` classes so the existing fill and sticky rules apply. It needs no `documentService` and no `candidateId`. |
| `src/app/features/candidates/components/held-cv-preview.logic.ts` (new) | `isPdfFile(file)`: a case-insensitive `.pdf` extension check, consistent with `ALLOWED_EXTENSIONS` in `candidate-draft.service.ts`. The server has already verified that extension and content agree.                                                                                                                                                                                                                                                                                                   |
| `src/styles.css`                                                        | Add a `@container page-split (min-width: 1024px)` block scoped to `.page-split--create`, using the same two-column and sticky-aside rules as the 1360 block. Scope the existing 1360 block with `:not(.page-split--create)`, or order the rules, so the two never conflict. Do not use `matchMedia` or `window.innerWidth` (AGENTS.md).                                                                                                                                                                 |
| `src/app/features/candidates/components/candidate-cv-preview.css`       | Extend the "fill the aside" rule (`flex: 1` on panel and viewer) to `.page-split--create` at 1024 px.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/assets/i18n/es.json` (+ `en.json` optional)                        | New keys: `candidate.cvDraft.preview.title` «Vista previa del CV», `candidate.cvDraft.preview.viewerLabel` «Vista previa del CV en PDF», `candidate.cvDraft.preview.pdfOnly` «La vista previa solo está disponible para CV en PDF.», `candidate.cvDraft.preview.fallback` «El navegador no puede mostrar este PDF.». Keep the file name as plain text, not interpolated into a sentence.                                                                                                                |

`CandidateCvPreview` stays unchanged. It is tied to a persisted candidate (list, polling, `openPreview`, download), and none of that applies before save.

### Backend / API

**No changes.** No new endpoint, table, migration, permission or `ktl_runtime` grant. The CV-draft operation still stores nothing, and the preview uses only the file the browser already holds after a clean draft.

### Permissions and security

- The page stays gated by `candidates.create`, the same as the CV picker. The preview needs no `documents.download`, because no server content is requested. It also needs no `documents.upload`: the preview is shown whether or not the attach choice is offered.
- Fail closed: no preview is shown for content ClamAV has not reported clean, so a refused or failed draft request means no preview.
- Personal data: the CV never leaves the browser for the preview. The object URL is revoked when it is no longer shown, and the file name and content are not logged, persisted or put in the URL. No new runtime dependency.

### Acceptance criteria

1. **PDF shown beside the form on a laptop.** **Given** a 1366 × 768 viewport, **when** the user picks a clean PDF CV and the draft returns, **then** the PDF is shown to the right of the form and stays visible while the user scrolls to «Guardar».
2. **Scanned CV.** **Given** a clean image-only PDF, **when** the draft returns `cv_draft.no_text`, **then** the «no text» message is shown and the PDF preview is visible beside the form.
3. **DOCX.** **When** a clean DOCX draft returns, **then** the aside shows the file name and «La vista previa solo está disponible para CV en PDF.», with no viewer and no download action.
4. **No preview before a clean draft.** **While** the draft request is in flight, and **after** a refused, infected, scanner-unavailable or failed request, **then** no preview is shown and the form keeps the full width.
5. **Replacing the CV.** **Given** a preview is shown, **when** the user picks another file, **then** the previous preview disappears at once, and the new one appears only if its draft returns.
6. **Attach choice independent.** **When** the user unticks «Adjuntar este CV al candidato», **then** the preview stays.
7. **Narrow screen.** **Given** a container below 1024 px, **then** the preview follows the form panel. At 390 px the page has no horizontal scroll.
8. **No CV, no change.** **Given** no CV has been read, **then** the page has a single full-width column, no empty aside, and the content area is not widened.
9. **Candidate page unaffected.** The candidate page still places its preview beside the sections only at ≥ 1360 px.
10. **Nothing persisted.** Leaving the page without saving creates no candidate and no document, and the object URL is revoked. Saving keeps the KTL-42 behaviour unchanged.

### Tests

- **Unit (Vitest + RTL)**
  - `tests/unit/held-cv-preview.spec.tsx` (new): PDF renders the viewer with the fit-width fragment, DOCX renders the message, and the object URL is created once and revoked on unmount and on file change. Stub `URL.createObjectURL`/`revokeObjectURL`.
  - `tests/unit/held-cv-preview.logic.spec.ts` (new): `isPdfFile` with `.pdf`, `.PDF`, `.docx` and no extension.
  - `tests/unit/candidate-create-page.spec.tsx`: preview absent before a pick and while busy. It appears after `extracted` and after `no_text`. It is absent after a refused draft, removed when a new pick starts, kept when attach is unticked, and present for a user without `documents.upload`.
  - jsdom has no media or container queries, so these tests assert on presence only.
- **E2E (Playwright)**: extend `tests/e2e/candidate-cv-draft.spec.ts`. At 1366 × 768, the preview is right of the form (bounding boxes) and stays in view after scrolling to «Guardar». At 390 px it follows the form with no horizontal scroll. A DOCX shows the PDF-only message. Selectors use `data-testid`/roles and no Spanish text. Created candidates keep the `Date.now()` marker.
- **Backend / security**: no new backend tests, since there is no contract change. The existing CV-draft fail-closed tests stay green.

### Documentation

- `openspec/specs/candidate-profile-pages/spec.md`: **MODIFIED** "CV preview beside the candidate sections". Remove "The new-candidate page SHALL NOT show a preview" and the scenario "New candidate page has no preview", and refer instead to the create-page requirement below.
- `openspec/specs/candidate-cv-draft/spec.md`: **ADDED** "Read CV preview on the create page", covering when it is shown, PDF vs DOCX, replacement, independence from the attach choice, and the 1024 px layout with stacking below it.
- `README.md` («Alta desde un CV KTL-32»): add a Spanish paragraph about the preview beside the form from 1024 px of content area.
- `docs/ktl-47/release-notes.md` (new).

### Non-functional requirements

- **Performance**: no extra network request; rendering happens in the local browser viewer.
- **Accessibility**: the viewer has an accessible name (`aria-label`/`title`), the panel has a heading, the reading order is form first, and 44 px targets are kept.
- **Responsive**: verified at 390, 1024, 1366 and 1920 px. No horizontal scroll at any width.
- **Corporate identity**: only the existing `.panel` / `.cv-preview` styles and Kepler tokens; no inline styles.

### Out of scope

- Rendering DOCX content in the browser.
- Previewing before the scan, or for refused or failed drafts.
- Changing the candidate page's 1360 px breakpoint or the KTL-42 attach flow.
- Highlighting extracted values inside the PDF.
