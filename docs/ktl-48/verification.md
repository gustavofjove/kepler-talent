# Verification Report: ktl-48-candidate-detail-and-branding

Verified on 2026-11-12 against the current working tree on `feat/KTL-48` using
`openspec-verify-change`. Schema: `spec-driven`. No implementation code, task state or
specification was changed during this verification.

## Summary

| Dimension    | Status                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Completeness | 34/34 tasks checked; all four spec files exist; implementation evidence for all 17 requirements                    |
| Correctness  | 68 scenarios reviewed against code/test evidence; Unicode validation divergence and explicit coverage gaps found   |
| Coherence    | Core architecture, encryption, permission boundary and local branding follow the design; one minor design mismatch |

No critical missing capability or unfinished checkbox was found. There are three warnings
and one suggestion. Checked task boxes are not treated as proof of exhaustive scenario coverage.

## Checks and evidence

- Re-read proposal, all four delta specifications, design and tasks from the paths returned
  by `openspec instructions apply`. OpenSpec reports 34 complete and zero remaining tasks.
- `openspec validate ktl-48-candidate-detail-and-branding --strict` passed in this verification.
- Re-ran contact, service, history and duration-label Vitest suites using temporary Node 22:
  four files and 44 tests passed.
- Compared the actual Vite-loaded frontend validator with the local API for three synthetic
  Unicode cases. Requests deliberately supplied an empty first name, ensuring that they could
  not create records. Findings below distinguish contact validation from that deliberate
  identity failure; all requests returned validation problems rather than persisting data.
- Reviewed the earlier same-session evidence in `release-notes.md`: complete frontend suite,
  affected PostgreSQL/backend suites, security gates, builds and browser journeys. Those broad
  suites were not rerun during this read-only verification. The reported global performance
  failure was not treated as a passing check or assumed to be a proven pre-existing failure.
- No verification dimension was skipped. A literal browser-tab visual inspection is not
  independently established by the recorded automated favicon-response checks.

## Requirement implementation mapping

Candidate component paths below are under
`frontend/src/app/features/candidates/components/`; candidate service paths are under
`frontend/src/app/features/candidates/services/`.

| Capability / requirement                                                               | Implementation evidence                                                                                       | Scenario evidence                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| application-branding: Consistent application display name                              | `frontend/index.html:5`, `frontend/src/assets/i18n/es.json:2`, shell `app-layout.tsx`                         | CRUD branding e2e, login and navigation suites                                                   |
| application-branding: Corporate browser icons are hosted locally                       | `frontend/index.html`, `frontend/public/favicon-150.png`, `favicon-300.png`                                   | Local PNG response assertions; earlier production response/dimension checks                      |
| application-branding: Current product documentation uses the display name              | `README.md:1`, `release-notes.md`                                                                             | Direct source inspection; technical identifiers preserved                                        |
| candidate-persistence: Education centre accepts encrypted empty text                   | `SetCandidateRelations.cs`, `CandidateEducationConfiguration.cs:32`, generated metadata-only EF migration     | `CandidateApiTests.cs:33`, `CandidateSchemaTests.cs:24`                                          |
| candidate-persistence: Candidate contacts are optional and trimmed                     | `CandidateContactRules.cs:7`, `candidate-contact.rules.ts:19`, existing domain trimming                       | Shared fixture and create/update validator tests; service normalization tests                    |
| candidate-persistence: Supplied candidate email has single-address format              | `CandidateContactRules.cs:12`, `candidate-contact.rules.ts:25`                                                | Shared fixture and contact unit tests; Unicode divergence W1                                     |
| candidate-persistence: Supplied candidate phone has allowed characters and nine digits | `CandidateContactRules.cs:18`, `candidate-contact.rules.ts:28`                                                | Shared fixture, validator tests and CRUD e2e; Unicode divergence W1                              |
| candidate-persistence: Contact and centre writes retain security and compatibility     | Existing endpoint guards in `CandidateEndpoints.cs`, handler guards, versioned writes, import validator reuse | Existing authorization/concurrency/schema suites and new API test; coverage gap W2               |
| candidate-profile-pages: Internal observations preserve plain-text layout              | `candidate-main-panel.tsx:105`, `candidate-main-panel.css`                                                    | Multiline/literal-markup detail unit test and save/reload e2e                                    |
| candidate-profile-pages: Absent and zero duration labels are hidden                    | `candidate-relation-section.logic.ts`, `candidate-experience.tsx`                                             | Five duration-label tests, period tests and zero-duration experience e2e                         |
| candidate-profile-pages: Education centre is optional in the editor                    | `candidate-relations.service.ts`, `candidate-education.tsx`                                                   | Optional-centre profile e2e, remaining required-field tests                                      |
| candidate-profile-pages: Candidate history is displayed newest first                   | `candidate-history.logic.ts`, `candidate-education.tsx:172`, `candidate-experience.tsx:235`                   | History unit tests, both-mode order and date-edit repositioning e2e; tie gap W2                  |
| candidate-profile-pages: Contact validation preserves the user's form                  | `candidate-form.tsx`, `candidate-main-panel.tsx`, `candidate-create-page.tsx`, `candidate-contact.rules.ts`   | Service refusal tests; CRUD e2e forces API failure and checks retained phone                     |
| candidate-profile-pages: Form panels save only their own changes                       | Canonical collection writes and id-based entry edits remain; main/competency draft workflows preserved        | Existing detail/profile suites, concurrency, draft cancellation and partial-family failure tests |
| candidate-profile-pages: Experience years are worked out from the dates                | Existing `candidate-period.logic.ts` and API calculation retained; summary suppression added                  | Shared experience-duration fixture, period suite and experience e2e                              |
| frontend-localization: Contact validation errors use Spanish translation resources     | `es.json`, `candidate-contact.rules.ts:5`, controlled form error presentation                                 | Contact unit tests, local validation and forced API-code e2e                                     |
| frontend-localization: Hardcoded copy is rejected outside the legacy list              | Shell uses translation keys; its exception removed from `frontend/eslint.config.js`                           | Recorded lint pass, login/navigation regression tests                                            |

## Critical issues

None found. The implemented capability set matches the proposal, and no task remains unchecked.

## Warnings

### W1 — Frontend and API disagree on Unicode whitespace

Evidence: `frontend/src/app/features/candidates/services/candidate-contact.rules.ts:20` uses
JavaScript `trim()` and `\s`, while
`backend/Application/Features/Candidates/CandidateContactRules.cs:12` uses .NET trimming,
`IsNullOrWhiteSpace`, `\s` and `char.IsWhiteSpace`. These sets differ.

Observed against the actual frontend and running API:

| Synthetic input                             | Frontend result         | API contact result                 |
| ------------------------------------------- | ----------------------- | ---------------------------------- |
| Phone consisting only of U+0085 (NEXT LINE) | Minimum-digit error     | No contact issue; considered blank |
| Phone U+FEFF followed by `612345678`        | Accepted after trimming | `candidate.phone.characters`       |
| Email `a` + U+0085 + `b@example.com`        | Accepted                | `candidate.email.invalid`          |

This diverges from D4's same-set normalization intent and the requirement to reject embedded
email whitespace consistently before sending a write.

**Recommendation:** Define one explicit trimming/whitespace policy in both helpers; add these
cases plus tab and non-breaking space to
`backend/Tests/Fixtures/ktl-48/contact-cases.json`, then rerun both fixture consumers and API cases.

### W2 — Some declared scenarios lack explicit regression tests

- **Equal dates:** `frontend/tests/unit/candidate-history.logic.spec.ts:21` includes no two
  experience records sharing an effective date, despite its title mentioning stable ties.
  Add cases for descending start-date tie-breaking, missing starts and exact stable ties.
- **Legacy invalid contact / unrelated panel remains usable:** The new
  `backend/Tests/IntegrationTests/CandidateApiTests.cs:33` checks rejection without partial
  persistence, but does not seed an invalid stored contact and exercise core refusal followed
  by correction/clearing and an unrelated successful relation write. Add that API journey.
- **Import keeps shared validation:** `ImportRowSemanticsTests` covers an overlong phone, but
  no explicit newly-invalid short/character-invalid phone. Add preview/commit coverage asserting
  the phone column, unchanged reason-code contract and no candidate creation.

Implementation evidence exists for these behaviors. This is a coverage warning, not a claim
that those behaviors currently fail. Tasks 1.5, 1.6 and 3.3 overstate the specificity of the
checked regression coverage; add the cases or qualify those task descriptions/evidence.

### W3 — Global performance acceptance remains unresolved

`docs/ktl-48/release-notes.md:51` records failure of the 300 ms p95 encrypted-search benchmark
in broad, isolated Debug and Release runs. Search code was not changed by KTL-48, but the
failure has not been proven to exist on an unchanged baseline under identical conditions.

**Recommendation:** Compare `EncryptedSearchPerformanceTests` with the unchanged base on the
same machine/configuration, or track the benchmark failure separately before release approval.
Keep the failed result visible; do not equate 34 checked tasks with all gates passing.

## Suggestion

### S1 — Align the sorting design with the render implementation

`design.md:56` specifies deriving sorted arrays with `useMemo`, but
`candidate-education.tsx:172` and `candidate-experience.tsx:235` call the pure sort functions
directly during rendering. The helpers copy their inputs and preserve identities, so this is
not a functional defect. Memoize by collection reference or amend D2 to describe intentional
per-render sorting. The subsequent shared 16px highlight refinement is documented in release
notes and follows the shared component CSS pattern.

## Final assessment

No critical issues. Three warnings and one suggestion remain. Ready for archive with the
noted improvements; resolving W1 and closing the coverage gaps is recommended before archiving.
This report does not certify that the global performance gate is green. No archive was performed.
