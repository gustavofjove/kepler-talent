# KTL-33 search performance over encrypted fields

Captured by `EncryptedSearchPerformanceTests` against 12,000 active candidates
with notes of 200–600 characters, in a Testcontainers `postgres:17.6-alpine` on the developer machine.
Each case: 3 warm-up runs, then 20 timed runs of `CandidateSearchQuery.SearchAsync` (every
statement plus decryption, matching, sorting and paging; HTTP and JSON excluded).
Budget: p95 ≤ 300 ms at the ceiling.

| Case | Median (ms) | p95 (ms) | Max (ms) |
| ---- | ----------: | -------: | -------: |
| Text matching one candidate | 188.8 | 259.0 | 353.9 |
| Text matching most candidates | 215.3 | 272.4 | 272.9 |
| Text found only in notes | 235.3 | 335.3 | 488.0 |
| Text matching nothing | 287.8 | 457.9 | 526.4 |
| Last-name order, first page | 122.2 | 182.3 | 217.3 |
| Last-name order, deep page 120 | 124.2 | 141.4 | 145.3 |
| Text matching most candidates, availability-date order | 258.9 | 446.6 | 454.5 |
| Text and availability, last-name order | 97.1 | 113.4 | 208.7 |

Searches with neither free text nor the last-name order are unchanged by KTL-33 and
keep their SQL plan evidence in [`docs/ktl-10/query-plans.md`](../ktl-10/query-plans.md).
