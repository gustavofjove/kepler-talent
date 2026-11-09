## 0. Create Feature Branch

- [x] 0.1 Create and switch to `feat/KTL-47` from an up-to-date `main`

## 1. Held CV preview component (Read CV preview on the create page: PDF / DOCX)

- [x] 1.1 Add `frontend/src/app/features/candidates/components/held-cv-preview.logic.ts` with `isPdfFile(file)`, a case-insensitive `.pdf` extension check (design D2)
- [x] 1.2 Add `held-cv-preview.tsx`, a presentational `HeldCvPreview({ file })` with these parts:
  - root `<section className="panel cv-preview" data-testid="held-cv-preview">` with an `h2` title;
  - an object URL created in an effect keyed on `file` and revoked in its cleanup;
  - for a PDF, `<object type="application/pdf" data={viewerUrl(url)} data-testid="held-cv-preview-viewer">` with `aria-label`/`title` and a fallback message with no download action;
  - for a DOCX, the file name and the PDF-only message (`data-testid="held-cv-preview-unsupported"`), with no object URL.
- [x] 1.3 Add the `candidate.cvDraft.preview.{title,viewerLabel,pdfOnly,fallback}` keys to `frontend/src/assets/i18n/es.json` with correct accents, plus `en.json` values (design D4)

## 2. Create page and layout (Read CV preview on the create page: layout; CV preview beside the candidate sections)

- [x] 2.1 In `candidate-create-page.tsx`, wrap the panel in `.page-split.page-split--create` → `.page-split__layout` → `.page-split__main` + `<aside className="page-split__aside">`, and render `<HeldCvPreview file={heldCv} />` only while `heldCv` is set. Keep every existing `name=` and `data-testid`, and leave the `attachCv`/`canUpload` logic untouched (design D1)
- [x] 2.2 In `frontend/src/styles.css`, add the `@container page-split (min-width: 1024px)` block for `.page-split--create`: two columns `minmax(0, 1fr) minmax(440px, 45%)` and the sticky, viewport-tall aside. Place it after the 1360 px block so it wins at every width ≥ 1024 px (design D3)
- [x] 2.3 In `candidate-cv-preview.css`, add the 1024 px "fill the aside" rule scoped to `.page-split--create` (panel and viewer `flex: 1; min-height: 0`)
- [x] 2.4 Manually check the create page at 390, 1024, 1366 and 1920 px:
  - no CV: one column, not widened;
  - PDF: beside the form from 1024 px, below it under that;
  - DOCX: message shown;
  - no horizontal scroll at any width.

  Also check that the candidate page still splits only at 1360 px.

## 3. Unit tests (review existing, add new)

- [x] 3.1 Review `tests/unit/candidate-create-page.spec.tsx`, `cv-draft-picker.spec.tsx` and `candidate-cv-preview.spec.tsx`, and update any assertion broken by the new wrapper markup
- [x] 3.2 Add `tests/unit/held-cv-preview.logic.spec.ts` for `isPdfFile` (`.pdf`, `.PDF`, `.docx`, no extension)
- [x] 3.3 Add `tests/unit/held-cv-preview.spec.tsx`:
  - a PDF renders the viewer with the fit-width fragment and an accessible name;
  - a DOCX renders the file name and PDF-only message, with no object and no `createObjectURL` call;
  - the URL is revoked on unmount and on file change.
- [x] 3.4 Extend `tests/unit/candidate-create-page.spec.tsx`:
  - no preview before a pick or while busy;
  - a preview after `extracted` and after `no_text`;
  - no preview after a refused draft;
  - the preview is removed when a new pick starts and kept when attach is cleared;
  - the preview is present for a user without `documents.upload`.
- [x] 3.5 Run `npx vitest run tests/unit/held-cv-preview.logic.spec.ts tests/unit/held-cv-preview.spec.tsx tests/unit/candidate-create-page.spec.tsx tests/unit/cv-draft-picker.spec.tsx tests/unit/candidate-cv-preview.spec.tsx` and inspect the output

## 4. Full suites and persisted state

- [x] 4.1 Run `npm test` (unit + integration + security projects) from `frontend/` and confirm it passes
- [x] 4.2 Run `npm run test:backend` with Docker running, and confirm the CV-draft fail-closed tests still pass (no backend change expected)
- [x] 4.3 Against the local stack, pick a CV on «Nuevo candidato», see the preview, and leave without saving. Confirm that no new candidate row, document record or stored object exists, and that nothing about the file remains in `localStorage`, `sessionStorage` or the URL

## 5. End-to-end

- [x] 5.1 Extend `tests/e2e/candidate-cv-draft.spec.ts`:
  - at 1366×768, after picking the synthetic PDF, `held-cv-preview` is right of the form (bounding boxes) and stays in the viewport after scrolling to «Guardar»;
  - at 390 px it is below the form with no horizontal scroll.

  Use `data-testid`/role selectors only, and keep the `Date.now()` marker on created candidates.

- [x] 5.2 Run the spec with `docker compose up` running: `npx playwright test tests/e2e/candidate-cv-draft.spec.ts`, and inspect the results
- [x] 5.3 Run `npx playwright test tests/e2e/candidate-cv-row-preview.spec.ts tests/e2e/navigation-responsive.spec.ts` plus the candidate-page preview specs, to confirm that the candidate page's 1360 px behaviour and the shell are unchanged
- [x] 5.4 Confirm that the Playwright global teardown purged the marked candidates and documents created by the runs

## 6. Security evidence (personal data)

- [x] 6.1 Run `npm run security:rls && npm run security:storage` from `frontend/` and confirm both pass
- [x] 6.2 In the browser's network panel, confirm that showing the preview issues no request beyond the existing CV-draft `POST`, and that no document content or upload request happens before «Guardar»
- [x] 6.3 Confirm that an unauthenticated caller and a caller without `candidates.create` are still refused by the CV-draft endpoint (existing security/xUnit coverage from 4.1–4.2), so no preview can appear for them

## 7. Documentation

- [x] 7.1 Update `README.md` («Alta desde un CV KTL-32») with a Spanish paragraph: the read CV is previewed beside the form from a 1024 px content area, DOCX shows a PDF-only message, and nothing is stored before «Guardar»
- [x] 7.2 Add `docs/ktl-47/release-notes.md` covering the behaviour, the create-page-only breakpoint, the timing (after a clean draft) and the known limitation for CVs refused as too long

## 8. Quality gates

- [x] 8.1 Run `npm run lint` and `npm run format:check` from `frontend/` and fix any finding
- [x] 8.2 Run `npm run build:all` and confirm it builds with no warnings
- [x] 8.3 Run `openspec validate ktl-47-create-page-cv-preview --strict` and confirm it passes
