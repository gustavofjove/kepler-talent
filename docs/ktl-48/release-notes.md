# KTL-48 — Kepler Talent candidate details

## Behavior

- Internal observations retain line breaks and blank lines as escaped plain text.
- Program and experience summaries omit missing and zero years without erasing stored values.
- The education or experience row being edited keeps equal 16px highlighted padding above and below its
  action buttons, including at the edges of the list.
- Education accepts an empty centre, persisted as encrypted, non-null empty text.
- Education sorts by end year descending; experience groups current roles first, then sorts by
  end date or start fallback, descending. Missing dates follow dated entries within each group;
  ties use start date and then the loaded order. Sorting changes no stored collection order.
- Optional email and phone are trimmed and checked on creation and main-data updates. Phone
  accepts ASCII digits, plus signs, parentheses and whitespace and needs at least nine digits.
  Email must be a single address without whitespace or display-name/list syntax. Existing
  maximum lengths remain 40 and 255. Invalid stored contacts must be corrected or cleared when
  saving main data; unrelated relation edits remain available. Import shares create validation.
- The document title, login, shell and README use Kepler Talent. Other interface copy is Spanish.
- Corporate PNG icons are bundled locally, with no external runtime request. Sources:
  `https://jovegroup.com/wp-content/uploads/2026/02/Isotipo-150x150.png` and
  `https://jovegroup.com/wp-content/uploads/2026/02/Isotipo-300x300.png`.

## Deployment

The EF-generated `AllowEmptyEducationInstitution` migration records encryption annotation changes
in the model snapshot; its Up/Down operations are empty because physical schema and grants do not
change. Use the explicit migrator deployment path and rebuild the API and frontend together.
Existing encrypted values need no backfill or key rotation. Rolling back to the mandatory-centre
application can require a user to fill a centre before subsequently saving that education list.

## Verification

- Complete Vitest run with temporary Node 22: 106 files passed, 1,077 tests passed and one
  skipped. Later focused service/contact/history coverage passed 39 tests; form/detail coverage
  passed 63 tests; program-duration label coverage passed five tests.
- The shared contact fixture is read by both the TypeScript and C# validators' tests.
- Updated affected backend suites: 508 unit tests and 224 real-PostgreSQL integration tests passed.
  These include contact rejection without partial writes, optional encrypted centre, unchanged
  required fields, concurrency, import semantics, authorization and private-document boundaries.
- Frontend security project: 13 files / 69 tests passed. Database boundary and private-storage
  scripts passed. No runtime privileges or private-storage paths were widened.
- Chromium targeted authentication, CRUD, profile, experience, import and responsive navigation:
  37 tests passed. The subsequently expanded chronology/zero-years scenario and forced API-error
  scenario each passed on rerun. Marker-based teardown removed the fabricated candidates/files.
- Node 22 and npm 10 were used temporarily without replacing the machine's global Node 26.
  Frontend production build, build:all, lint, repository format check and strict OpenSpec
  validation were run. The local Compose API/migrator/nginx stack was rebuilt successfully.
- Production icon responses were checked against the declared PNG types and dimensions; the
  downloaded corporate artwork was visually inspected. Icons are local files, not hotlinks.

### Broader-suite limitation

The earlier unfiltered backend run passed 983 unit tests and 568 integration tests but failed
one global encrypted-search performance benchmark (300 ms p95 budget). An isolated Debug run
and an optimized Release run also exceeded the budget on this machine. No benchmark threshold
was relaxed and no search implementation was changed. The affected KTL-48 functional/security
suites pass; the global search benchmark remains a separately recorded environment/performance
limitation, not a claimed passing gate.

The unrelated transport test incompatibility between a jsdom Blob and Node Response was corrected
by using a string Response body for the same download test. The complete frontend suite then passed.

## Completion evidence

All 34 implementation/checklist tasks have been executed and reviewed. The final history
journey verifies that changing an education year moves that same record to its new position,
clearing its centre persists, observations retain literal markup/blank lines, current roles
sort first and zero-duration summaries stay hidden at desktop and 390px. Its last rerun passed.
The final detail/label unit rerun passed 58 tests; frontend integration passed 15 tests.
The local production bundle on port 4200 and working tree on 4300 both returned the new title
and the two icons with correct image/png types and 150/300 dimensions.

The broader encrypted-search benchmark limitation above remains disclosed; checklist completion
records actual execution and the passing affected feature suites, not a claim that this unrelated
benchmark passed. No commit or push was performed.

## Archive

Archived on 2026-11-12 as
`openspec/changes/archive/2026-11-12-ktl-48-candidate-detail-and-branding/` using the
`spec-driven` schema. All 34 tasks and four planning artifacts were complete. All four
capability deltas were synchronized and compared with the main specs before moving the change:
14 requirements added and three modified, preserving existing scenarios. Main-spec validation
passed for all 28 capabilities, with existing long-requirement warnings.

The archive retains the verification report's three warnings (Unicode whitespace differences,
explicit scenario coverage gaps and the global search benchmark) and one sorting-design
suggestion. Archiving does not resolve or waive those findings.
