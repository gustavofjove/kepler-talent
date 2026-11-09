## Context

`CandidateCreatePage` renders `CvDraftPicker` and `CandidateForm` in one full-width panel. When the CV-draft request returns (`cv_draft.extracted` or `cv_draft.no_text`), the page keeps the picked `File` in React state (`heldCv`) so that it can attach the file on save (KTL-42). It clears `heldCv` at the start of every new read and never sets it for a refused, failed or aborted request.

The candidate page already has a preview, `CandidateCvPreview`. It is bound to a persisted candidate: it lists documents, polls pending scans, fetches content through `documentService.openPreview()` and offers download. It sits in `.page-split__aside`, and the layout lives in `frontend/src/styles.css`:

- `.page-split` is a size container.
- At `@container page-split (min-width: 1360px)` the grid becomes two columns, with a sticky, viewport-tall aside, but only when the aside `:has(.cv-preview)`.
- `.shell main:has(.page-split__aside .cv-preview)` widens the content area to 1920 px.
- `.page-split__aside:empty` collapses the empty aside.
- `candidate-cv-preview.css` makes the panel and viewer fill the aside at the same threshold.

The production CSP already allows `object-src blob:`, which the existing preview relies on.

The constraints come from AGENTS.md:

- No `matchMedia` or `window.innerWidth`; one DOM tree serves both widths.
- Plain co-located CSS, no CSS Modules.
- Copy goes through `t()`.
- No new runtime dependency without a documented reason.
- Pure helpers live in sibling `.logic.ts` files.

## Goals / Non-Goals

**Goals:**

- Show the held CV beside the form from a 1024 px content area, and after the form below that.
- Show it only for content that ClamAV has already reported clean via the CV-draft operation.
- Leave the candidate page's preview and its 1360 px threshold untouched.
- Keep the change frontend-only, with no new dependency.

**Non-Goals:**

- Rendering DOCX content.
- Previewing before or without a returned draft.
- Changes to the CV-draft API, the KTL-42 attach flow or `CandidateCvPreview`.
- Any backend, database, grant or permission change.

## Decisions

### D1. Preview the held `File`, gated by `heldCv`

The aside renders `<HeldCvPreview file={heldCv} />` only while `heldCv` is set. The KTL-42 hold rule already encodes every timing requirement:

- the file is set only after a returned draft;
- it is cleared when a new read starts;
- it is never set on refusal, failure or abort.

The preview therefore inherits fail-closed behaviour and the replacement semantics with no new state, and is independent of `attachCv` and `canUpload`.

- _Alternative:_ render a blob URL on pick, before the scan. This was rejected because it shows content ClamAV has not cleared, and the user would see it even for refused files. That would weaken principle 3's "quarantined until clean" in spirit.
- _Alternative:_ a separate `previewFile` state. This was rejected because it duplicates `heldCv` and risks the two drifting apart.

### D2. A new presentational `HeldCvPreview` instead of reusing `CandidateCvPreview`

`CandidateCvPreview` needs a `candidateId` and calls `documentService` for its list, content, polling and download. None of these exist before save, and threading a "local file" mode through it would complicate a component that three placements already depend on (candidate page, row preview, search). The new component lives in `features/candidates/components/held-cv-preview.tsx`, with `held-cv-preview.logic.ts` beside it:

- In an effect keyed on `file`, it creates the object URL with `URL.createObjectURL(file)` and revokes it in the cleanup. This releases the URL on replacement, unmount and save navigation, and is safe under StrictMode double effects.
- For a PDF it renders `<object type="application/pdf" data={viewerUrl(url)}>`, reusing `viewerUrl`/`FIT_WIDTH_FRAGMENT` from `candidate-cv-preview.logic.ts`. The object carries an `aria-label`/`title`, and its fallback content is a localized message with no download action.
- For a DOCX it renders the file name and the PDF-only message, and creates no object URL at all.
- The root is `<section className="panel cv-preview" data-testid="held-cv-preview">`. The `.cv-preview` class makes the existing layout rules (aside fill, shell widening, `:has(.cv-preview)` gating) apply without new selectors on the shell.

`isPdfFile(file)` in the logic file checks the extension case-insensitively, matching `ALLOWED_EXTENSIONS` in `candidate-draft.service.ts`. The server has already refused any file whose extension and content disagree, so the extension is trustworthy once a draft has returned. `file.type` is not used because browsers report DOCX MIME types inconsistently.

### D3. A create-page modifier with its own container threshold

The create page wraps its content in `<div className="page-split page-split--create">`, reusing `.page-split__layout`, `.page-split__main` and `.page-split__aside`. `styles.css` gains a block:

```css
@container page-split (min-width: 1024px) {
  .page-split--create > .page-split__layout:has(> .page-split__aside .cv-preview) {
    grid-template-columns: minmax(0, 1fr) minmax(440px, 45%);
  }
  /* sticky, viewport-tall aside: same declarations as the 1360 px block */
}
```

The block is placed after the 1360 px block. Its selector carries an extra class (`.page-split--create >`), so it outranks the 1360 px rule at every width at or above 1024 px, without needing `:not()` on the candidate page's rule. `candidate-cv-preview.css` gets the matching "fill the aside" rule, scoped to `.page-split--create` at 1024 px.

- At a 1024 px container, a 45% aside is about 460 px and the form column about 540 px. The existing `@container page-split-main (max-width: 620px)` rule then collapses `.grid.two` to one column. Nothing new is needed for that.
- The desktop navigation is a top bar, so the container is the viewport minus the 44 px of `main` padding: a 1024 px container corresponds to a viewport of about 1068 px, and 1280/1366/1440 px laptops get two columns. Measured during apply: 1024 px viewport → 980 px container, stacked; 1280 px → 1236 px, side by side.
- _Alternative:_ lower the shared 1360 px threshold. This was rejected because product asked to change the breakpoint for this page only, and the candidate page's sections need the room.
- _Alternative:_ place the preview above the form when the content area is narrow. This was rejected by product in favour of stacking it after the form, which keeps the form first in reading and keyboard order.

### D4. Copy

New keys go in `es.json`, and optionally `en.json`, under `candidate.cvDraft.preview.*`:

- `title`: «Vista previa del CV»
- `viewerLabel`: «Vista previa del CV en PDF»
- `pdfOnly`: «La vista previa solo está disponible para CV en PDF.»
- `fallback`: «El navegador no puede mostrar este PDF.»

The file name is rendered as its own text node, not interpolated into a sentence. The new keys do not reuse `candidate.profile.preview.*`, because those fallbacks offer a download action that does not apply here.

### Authorization, storage and data model

- **Authorization:** unchanged. The route stays gated by `candidates.create`, and the CV-draft endpoint keeps its fail-closed checks. No new client-side permission check is added, since the preview reads no server data.
- **Storage:** none. Nothing goes to PostgreSQL, private document storage, `localStorage`/`sessionStorage` or the URL.
- **Data model:** none. No migration or grant.

### Test strategy

| Level                                            | Coverage                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit `tests/unit/held-cv-preview.logic.spec.ts`  | `isPdfFile` for `.pdf`, `.PDF`, `.docx`, no extension.                                                                                                                                                                                                                                                                  |
| Unit `tests/unit/held-cv-preview.spec.tsx`       | PDF renders `<object>` with the fit-width fragment and an accessible name. DOCX renders the file name and PDF-only message, with no object and no object URL. The URL is created once per file and revoked on unmount and on file change (stubbed `URL.createObjectURL`/`revokeObjectURL`).                             |
| Unit `tests/unit/candidate-create-page.spec.tsx` | No preview before a pick or while busy. The preview appears after `extracted` and after `no_text`. No preview after a refused draft. It is removed when a new pick starts, kept when attach is cleared, and present without `documents.upload`. jsdom has no container queries, so these tests assert on presence only. |
| E2E `tests/e2e/candidate-cv-draft.spec.ts`       | At 1366×768 the preview's bounding box is right of the form and stays in the viewport after scrolling to «Guardar». At 390 px it is below the form with no horizontal scroll. Selectors use `data-testid`/roles, and candidates keep the `Date.now()` marker.                                                           |
| Backend / security                               | No contract change. The existing CV-draft fail-closed xUnit and security suites must stay green.                                                                                                                                                                                                                        |

DOCX is covered at unit level only. The e2e support has no DOCX builder, and adding a zip writer just for one assertion is not worth a new helper or dependency.

## Risks / Trade-offs

- [The browser's PDF viewer is unavailable, for example under a policy-disabled plugin] → the `<object>` fallback shows a localized message. The user still has the file locally.
- [A clean CV that exceeds the extraction bounds is refused, so it gets no preview even though it is safe] → accepted for consistency with the KTL-42 hold rule. The brief records it as a known limitation.
- [The 1024 px and 1360 px rules interact at ≥ 1360 px] → the create rule's higher specificity wins. An e2e check at 1366 px and a manual check at 1920 px confirm the create page keeps its own proportions, while `candidate-profile-pages` e2e specs confirm the candidate page is unchanged.
- [Large PDFs held as object URLs] → one URL at a time, revoked on replacement or unmount. The 20 MB limit already bounds the size.
- [Sticky aside height assumes the 64 px header] → reuses the same `calc()` as the candidate page, so both stay in sync if the header changes.

## Migration Plan

Frontend-only and shipped with the bundle; no data migration. Rollback is a revert of the frontend change.

## Open Questions

None. Product settled timing, DOCX handling, threshold and attach independence in the brief.
