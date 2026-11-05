# KTL-10 query plans

Captured by `SearchQueryPlanTests` against 3.000 candidates with their
relations and primary documents — the scale KTL-7 reconciled. Regenerate by running
`dotnet test backend/Tests/IntegrationTests/IntegrationTests.csproj`.

Since KTL-33, free text and the last-name order run in the API over decrypted values, so
they issue no SQL of their own worth a plan here. Their evidence is
[`docs/ktl-33/performance.md`](../ktl-33/performance.md).

## Deep page 30 sorted by UpdatedAt Ascending

Execution time: 3.9 ms

```
Limit  (cost=72789.76..75281.26 rows=100 width=324) (actual time=3.704..3.767 rows=100 loops=1)
  Buffers: shared hit=585
  ->  Result  (cost=536.26..75281.26 rows=3000 width=324) (actual time=2.969..3.689 rows=3000 loops=1)
        Buffers: shared hit=585
        ->  Sort  (cost=536.26..543.76 rows=3000 width=321) (actual time=2.085..2.287 rows=3000 loops=1)
              Sort Key: c."UpdatedAtUtc", c."Id"
              Sort Method: quicksort  Memory: 1620kB
              Buffers: shared hit=333
              ->  Seq Scan on "CND_Candidates" c  (cost=0.00..363.00 rows=3000 width=321) (actual time=0.007..0.832 rows=3000 loops=1)
                    Buffers: shared hit=333
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c0  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.010..0.283 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..124.00 rows=1 width=16) (actual time=0.173..0.174 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..119.00 rows=1 width=16) (actual time=0.159..0.159 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=7
Planning Time: 0.361 ms
Execution Time: 3.941 ms
```

## Deep page 30 sorted by UpdatedAt Descending

Execution time: 8.5 ms

```
Limit  (cost=72789.76..75281.26 rows=100 width=324) (actual time=8.221..8.252 rows=100 loops=1)
  Buffers: shared hit=585
  ->  Result  (cost=536.26..75281.26 rows=3000 width=324) (actual time=7.388..8.126 rows=3000 loops=1)
        Buffers: shared hit=585
        ->  Sort  (cost=536.26..543.76 rows=3000 width=321) (actual time=5.889..6.088 rows=3000 loops=1)
              Sort Key: c."UpdatedAtUtc" DESC, c."Id"
              Sort Method: quicksort  Memory: 1620kB
              Buffers: shared hit=333
              ->  Seq Scan on "CND_Candidates" c  (cost=0.00..363.00 rows=3000 width=321) (actual time=0.017..2.116 rows=3000 loops=1)
                    Buffers: shared hit=333
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c0  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.019..0.505 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..124.00 rows=1 width=16) (actual time=0.224..0.224 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..119.00 rows=1 width=16) (actual time=0.224..0.224 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=7
Planning Time: 0.397 ms
Execution Time: 8.511 ms
```

## Deep page 30 sorted by AvailabilityCheckedOn Ascending

Execution time: 8.6 ms

```
Limit  (cost=72789.76..75281.26 rows=100 width=325) (actual time=8.122..8.204 rows=100 loops=1)
  Buffers: shared hit=585
  ->  Result  (cost=536.26..75281.26 rows=3000 width=325) (actual time=7.116..8.066 rows=3000 loops=1)
        Buffers: shared hit=585
        ->  Sort  (cost=536.26..543.76 rows=3000 width=322) (actual time=6.250..6.456 rows=3000 loops=1)
              Sort Key: ((c."AvailabilityCheckedOn" IS NULL)), c."AvailabilityCheckedOn", c."Id"
              Sort Method: quicksort  Memory: 1620kB
              Buffers: shared hit=333
              ->  Seq Scan on "CND_Candidates" c  (cost=0.00..363.00 rows=3000 width=322) (actual time=0.027..1.557 rows=3000 loops=1)
                    Buffers: shared hit=333
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c0  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.013..0.268 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..124.00 rows=1 width=16) (actual time=0.169..0.169 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..119.00 rows=1 width=16) (actual time=0.148..0.149 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=7
Planning Time: 0.511 ms
Execution Time: 8.612 ms
```

## Deep page 30 sorted by AvailabilityCheckedOn Descending

Execution time: 11.9 ms

```
Limit  (cost=72789.76..75281.26 rows=100 width=325) (actual time=11.597..11.625 rows=100 loops=1)
  Buffers: shared hit=585
  ->  Result  (cost=536.26..75281.26 rows=3000 width=325) (actual time=10.777..11.538 rows=3000 loops=1)
        Buffers: shared hit=585
        ->  Sort  (cost=536.26..543.76 rows=3000 width=322) (actual time=8.870..9.048 rows=3000 loops=1)
              Sort Key: ((c."AvailabilityCheckedOn" IS NULL)), c."AvailabilityCheckedOn" DESC, c."Id"
              Sort Method: quicksort  Memory: 1620kB
              Buffers: shared hit=333
              ->  Seq Scan on "CND_Candidates" c  (cost=0.00..363.00 rows=3000 width=322) (actual time=0.018..1.743 rows=3000 loops=1)
                    Buffers: shared hit=333
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c0  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.027..0.593 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..124.00 rows=1 width=16) (actual time=0.300..0.300 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..119.00 rows=1 width=16) (actual time=0.256..0.257 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=7
Planning Time: 0.604 ms
Execution Time: 11.870 ms
```

## Deep page 30 sorted by CreatedAt Ascending

Execution time: 5.2 ms

```
Limit  (cost=72789.76..75281.26 rows=100 width=332) (actual time=4.608..4.658 rows=100 loops=1)
  Buffers: shared hit=585
  ->  Result  (cost=536.26..75281.26 rows=3000 width=332) (actual time=3.500..4.544 rows=3000 loops=1)
        Buffers: shared hit=585
        ->  Sort  (cost=536.26..543.76 rows=3000 width=329) (actual time=2.650..2.801 rows=3000 loops=1)
              Sort Key: c."CreatedAtUtc", c."Id"
              Sort Method: quicksort  Memory: 1620kB
              Buffers: shared hit=333
              ->  Seq Scan on "CND_Candidates" c  (cost=0.00..363.00 rows=3000 width=329) (actual time=0.014..0.949 rows=3000 loops=1)
                    Buffers: shared hit=333
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c0  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.008..0.288 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..124.00 rows=1 width=16) (actual time=0.167..0.167 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..119.00 rows=1 width=16) (actual time=0.143..0.143 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=7
Planning Time: 0.453 ms
Execution Time: 5.162 ms
```

## Deep page 30 sorted by CreatedAt Descending

Execution time: 3.8 ms

```
Limit  (cost=72789.76..75281.26 rows=100 width=332) (actual time=3.629..3.653 rows=100 loops=1)
  Buffers: shared hit=585
  ->  Result  (cost=536.26..75281.26 rows=3000 width=332) (actual time=3.007..3.579 rows=3000 loops=1)
        Buffers: shared hit=585
        ->  Sort  (cost=536.26..543.76 rows=3000 width=329) (actual time=2.154..2.244 rows=3000 loops=1)
              Sort Key: c."CreatedAtUtc" DESC, c."Id"
              Sort Method: quicksort  Memory: 1620kB
              Buffers: shared hit=333
              ->  Seq Scan on "CND_Candidates" c  (cost=0.00..363.00 rows=3000 width=329) (actual time=0.007..0.830 rows=3000 loops=1)
                    Buffers: shared hit=333
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c0  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.009..0.257 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..124.00 rows=1 width=16) (actual time=0.187..0.187 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..119.00 rows=1 width=16) (actual time=0.156..0.157 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=7
Planning Time: 0.234 ms
Execution Time: 3.824 ms
```

## Newest active candidates first, home page panel

Execution time: 0.9 ms

```
Limit  (cost=0.28..126.27 rows=5 width=332) (actual time=0.846..0.850 rows=5 loops=1)
  Buffers: shared hit=255
  ->  Index Scan using "IX_CND_Candidates_IsActive_CreatedAtUtc" on "CND_Candidates" c  (cost=0.28..75592.53 rows=3000 width=332) (actual time=0.845..0.849 rows=5 loops=1)
        Buffers: shared hit=255
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c0  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.006..0.253 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..124.00 rows=1 width=16) (actual time=0.165..0.165 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..119.00 rows=1 width=16) (actual time=0.150..0.150 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=7
Planning Time: 0.241 ms
Execution Time: 0.926 ms
```

## Unfiltered first page

Execution time: 2.1 ms

```
Limit  (cost=0.58..631.85 rows=25 width=324) (actual time=1.965..1.975 rows=25 loops=1)
  Buffers: shared hit=271
  ->  Result  (cost=0.58..75753.03 rows=3000 width=324) (actual time=1.963..1.971 rows=25 loops=1)
        Buffers: shared hit=271
        ->  Incremental Sort  (cost=0.58..1015.53 rows=3000 width=321) (actual time=0.124..0.126 rows=25 loops=1)
              Sort Key: c."UpdatedAtUtc" DESC, c."Id"
              Presorted Key: c."UpdatedAtUtc"
              Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 37kB  Peak Memory: 37kB
              Buffers: shared hit=19
              ->  Index Scan Backward using "IX_CND_Candidates_IsActive_UpdatedAtUtc" on "CND_Candidates" c  (cost=0.28..880.53 rows=3000 width=321) (actual time=0.036..0.065 rows=26 loops=1)
                    Index Cond: ("IsActive" = true)
                    Buffers: shared hit=19
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c0  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.014..0.696 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..124.00 rows=1 width=16) (actual time=0.241..0.241 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..119.00 rows=1 width=16) (actual time=0.154..0.154 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=7
Planning Time: 0.687 ms
Execution Time: 2.133 ms
```

## Availability subset and primary CV

Execution time: 1.8 ms

```
Limit  (cost=1.97..660.89 rows=25 width=324) (actual time=1.694..1.708 rows=25 loops=1)
  Buffers: shared hit=357
  ->  Result  (cost=1.97..35135.71 rows=1333 width=324) (actual time=1.693..1.705 rows=25 loops=1)
        Buffers: shared hit=357
        ->  Incremental Sort  (cost=1.97..1927.34 rows=1333 width=321) (actual time=0.083..0.087 rows=25 loops=1)
              Sort Key: c."UpdatedAtUtc" DESC, c."Id"
              Presorted Key: c."UpdatedAtUtc"
              Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 37kB  Peak Memory: 37kB
              Buffers: shared hit=105
              ->  Nested Loop Semi Join  (cost=0.56..1867.36 rows=1333 width=321) (actual time=0.026..0.064 rows=26 loops=1)
                    Buffers: shared hit=105
                    ->  Index Scan Backward using "IX_CND_Candidates_IsActive_UpdatedAtUtc" on "CND_Candidates" c  (cost=0.28..888.03 rows=2000 width=321) (actual time=0.014..0.029 rows=26 loops=1)
                          Index Cond: ("IsActive" = true)
                          Filter: (("AvailabilityState")::text = ANY ('{available,unavailable}'::text[]))
                          Rows Removed by Filter: 12
                          Buffers: shared hit=27
                    ->  Index Only Scan using "UX_CND_Documents_CandidateId_Primary" on "CND_Documents" c0  (cost=0.28..0.48 rows=1 width=16) (actual time=0.001..0.001 rows=1 loops=26)
                          Index Cond: ("CandidateId" = c."Id")
                          Heap Fetches: 26
                          Buffers: shared hit=78
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.006..0.470 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..124.00 rows=1 width=16) (actual time=0.509..0.509 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c3  (cost=0.00..119.00 rows=1 width=16) (actual time=0.198..0.198 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=20
Planning Time: 0.432 ms
Execution Time: 1.832 ms
```

## Checked from a recent date

Execution time: 2.4 ms

```
Limit  (cost=223.72..846.60 rows=25 width=325) (actual time=2.079..2.093 rows=25 loops=1)
  Buffers: shared hit=355
  ->  Result  (cost=223.72..2715.22 rows=100 width=325) (actual time=2.077..2.089 rows=25 loops=1)
        Buffers: shared hit=355
        ->  Sort  (cost=223.72..223.97 rows=100 width=322) (actual time=0.549..0.553 rows=25 loops=1)
              Sort Key: ((c."AvailabilityCheckedOn" IS NULL)), c."AvailabilityCheckedOn" DESC, c."Id"
              Sort Method: top-N heapsort  Memory: 44kB
              Buffers: shared hit=103
              ->  Bitmap Heap Scan on "CND_Candidates" c  (cost=5.06..220.90 rows=100 width=322) (actual time=0.117..0.326 rows=100 loops=1)
                    Recheck Cond: (("AvailabilityCheckedOn" >= '2026-09-01'::date) AND "IsActive")
                    Heap Blocks: exact=100
                    Buffers: shared hit=103
                    ->  Bitmap Index Scan on "IX_CND_Candidates_IsActive_AvailabilityCheckedOn"  (cost=0.00..5.03 rows=100 width=0) (actual time=0.060..0.061 rows=100 loops=1)
                          Index Cond: ("AvailabilityCheckedOn" >= '2026-09-01'::date)
                          Buffers: shared hit=3
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c0  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.014..0.629 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c1  (cost=0.00..124.00 rows=1 width=16) (actual time=0.174..0.174 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c2  (cost=0.00..119.00 rows=1 width=16) (actual time=0.149..0.149 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=7
Planning Time: 0.682 ms
Execution Time: 2.372 ms
```

## Skill ANY across three values

Execution time: 2.0 ms

```
Limit  (cost=29.10..1373.00 rows=25 width=324) (actual time=1.792..1.803 rows=25 loops=1)
  Buffers: shared hit=681
  ->  Result  (cost=29.10..141138.97 rows=2625 width=324) (actual time=1.791..1.800 rows=25 loops=1)
        Buffers: shared hit=681
        ->  Incremental Sort  (cost=29.10..75743.65 rows=2625 width=321) (actual time=0.859..0.862 rows=25 loops=1)
              Sort Key: c."UpdatedAtUtc" DESC, c."Id"
              Presorted Key: c."UpdatedAtUtc"
              Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 37kB  Peak Memory: 37kB
              Buffers: shared hit=429
              ->  Index Scan Backward using "IX_CND_Candidates_IsActive_UpdatedAtUtc" on "CND_Candidates" c  (cost=0.28..75625.53 rows=2625 width=321) (actual time=0.793..0.833 rows=26 loops=1)
                    Index Cond: ("IsActive" = true)
                    Filter: ((ANY ("Id" = (hashed SubPlan 8).col1)) OR (ANY ("Id" = (hashed SubPlan 10).col1)) OR (ANY ("Id" = (hashed SubPlan 12).col1)))
                    Rows Removed by Filter: 43
                    Buffers: shared hit=429
                    SubPlan 8
                      ->  Bitmap Heap Scan on "CND_CandidateSkills" c0  (cost=7.28..140.64 rows=387 width=16) (actual time=0.063..0.275 rows=387 loops=1)
                            Recheck Cond: ("SkillId" = ANY ('{01a1a74f-5a92-7032-af3b-ac0cd156e9a6}'::uuid[]))
                            Heap Blocks: exact=125
                            Buffers: shared hit=127
                            ->  Bitmap Index Scan on "IX_CND_CandidateSkills_SkillId_SkillFamily"  (cost=0.00..7.19 rows=387 width=0) (actual time=0.040..0.041 rows=387 loops=1)
                                  Index Cond: ("SkillId" = ANY ('{01a1a74f-5a92-7032-af3b-ac0cd156e9a6}'::uuid[]))
                                  Buffers: shared hit=2
                    SubPlan 10
                      ->  Bitmap Heap Scan on "CND_CandidateSkills" c1  (cost=7.05..140.07 rows=357 width=16) (actual time=0.032..0.132 rows=357 loops=1)
                            Recheck Cond: ("SkillId" = ANY ('{01a1a74f-5a92-7f75-b213-97be49552df0}'::uuid[]))
                            Heap Blocks: exact=125
                            Buffers: shared hit=127
                            ->  Bitmap Index Scan on "IX_CND_CandidateSkills_SkillId_SkillFamily"  (cost=0.00..6.96 rows=357 width=0) (actual time=0.019..0.019 rows=357 loops=1)
                                  Index Cond: ("SkillId" = ANY ('{01a1a74f-5a92-7f75-b213-97be49552df0}'::uuid[]))
                                  Buffers: shared hit=2
                    SubPlan 12
                      ->  Bitmap Heap Scan on "CND_CandidateSkills" c2  (cost=7.29..140.66 rows=388 width=16) (actual time=0.032..0.124 rows=388 loops=1)
                            Recheck Cond: ("SkillId" = ANY ('{01a1a74f-5a92-75ee-bbd7-9eefa60d1834}'::uuid[]))
                            Heap Blocks: exact=125
                            Buffers: shared hit=127
                            ->  Bitmap Index Scan on "IX_CND_CandidateSkills_SkillId_SkillFamily"  (cost=0.00..7.20 rows=388 width=0) (actual time=0.017..0.017 rows=388 loops=1)
                                  Index Cond: ("SkillId" = ANY ('{01a1a74f-5a92-75ee-bbd7-9eefa60d1834}'::uuid[]))
                                  Buffers: shared hit=2
        SubPlan 2
          ->  Seq Scan on "CND_Documents" c3  (cost=0.00..104.00 rows=2000 width=16) (actual time=0.006..0.304 rows=2000 loops=1)
                Filter: "IsPrimary"
                Buffers: shared hit=84
        SubPlan 4
          ->  Seq Scan on "CND_Documents" c4  (cost=0.00..124.00 rows=1 width=16) (actual time=0.167..0.167 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
        SubPlan 6
          ->  Seq Scan on "CND_Documents" c5  (cost=0.00..119.00 rows=1 width=16) (actual time=0.148..0.148 rows=0 loops=1)
                Filter: ("IsPrimary" AND (("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 2000
                Buffers: shared hit=84
Planning:
  Buffers: shared hit=13
Planning Time: 0.692 ms
Execution Time: 2.043 ms
```

## Skill ALL across three values

Execution time: 1.7 ms

```
Limit  (cost=693.08..842.57 rows=6 width=324) (actual time=1.468..1.483 rows=3 loops=1)
  Buffers: shared hit=677
  ->  Result  (cost=693.08..842.57 rows=6 width=324) (actual time=1.467..1.481 rows=3 loops=1)
        Buffers: shared hit=677
        ->  Sort  (cost=693.08..693.10 rows=6 width=321) (actual time=1.429..1.433 rows=3 loops=1)
              Sort Key: c."UpdatedAtUtc" DESC, c."Id"
              Sort Method: quicksort  Memory: 26kB
              Buffers: shared hit=650
              ->  Nested Loop Semi Join  (cost=290.32..693.01 rows=6 width=321) (actual time=0.631..1.422 rows=3 loops=1)
                    Buffers: shared hit=650
                    ->  Hash Semi Join  (cost=290.04..667.34 rows=46 width=353) (actual time=0.438..1.359 rows=30 loops=1)
                          Hash Cond: (c."Id" = c2."CandidateId")
                          Buffers: shared hit=587
                          ->  Hash Semi Join  (cost=144.53..520.27 rows=357 width=337) (actual time=0.166..1.083 rows=357 loops=1)
                                Hash Cond: (c."Id" = c1."CandidateId")
                                Buffers: shared hit=460
                                ->  Seq Scan on "CND_Candidates" c  (cost=0.00..363.00 rows=3000 width=321) (actual time=0.007..0.745 rows=3000 loops=1)
                                      Filter: "IsActive"
                                      Buffers: shared hit=333
                                ->  Hash  (cost=140.07..140.07 rows=357 width=16) (actual time=0.149..0.150 rows=357 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 25kB
                                      Buffers: shared hit=127
                                      ->  Bitmap Heap Scan on "CND_CandidateSkills" c1  (cost=7.05..140.07 rows=357 width=16) (actual time=0.027..0.104 rows=357 loops=1)
                                            Recheck Cond: ("SkillId" = ANY ('{01a1a74f-5a92-7f75-b213-97be49552df0}'::uuid[]))
                                            Heap Blocks: exact=125
                                            Buffers: shared hit=127
                                            ->  Bitmap Index Scan on "IX_CND_CandidateSkills_SkillId_SkillFamily"  (cost=0.00..6.96 rows=357 width=0) (actual time=0.017..0.017 rows=357 loops=1)
                                                  Index Cond: ("SkillId" = ANY ('{01a1a74f-5a92-7f75-b213-97be49552df0}'::uuid[]))
                                                  Buffers: shared hit=2
                          ->  Hash  (cost=140.66..140.66 rows=388 width=16) (actual time=0.237..0.238 rows=388 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 27kB
                                Buffers: shared hit=127
                                ->  Bitmap Heap Scan on "CND_CandidateSkills" c2  (cost=7.29..140.66 rows=388 width=16) (actual time=0.036..0.187 rows=388 loops=1)
                                      Recheck Cond: ("SkillId" = ANY ('{01a1a74f-5a92-75ee-bbd7-9eefa60d1834}'::uuid[]))
                                      Heap Blocks: exact=125
                                      Buffers: shared hit=127
                                      ->  Bitmap Index Scan on "IX_CND_CandidateSkills_SkillId_SkillFamily"  (cost=0.00..7.20 rows=388 width=0) (actual time=0.022..0.022 rows=388 loops=1)
                                            Index Cond: ("SkillId" = ANY ('{01a1a74f-5a92-75ee-bbd7-9eefa60d1834}'::uuid[]))
                                            Buffers: shared hit=2
                    ->  Index Scan using "UX_CND_CandidateSkills_CandidateId_SkillId" on "CND_CandidateSkills" c0  (cost=0.29..0.56 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=30)
                          Index Cond: (("CandidateId" = c."Id") AND ("SkillId" = ANY ('{01a1a74f-5a92-7032-af3b-ac0cd156e9a6}'::uuid[])))
                          Filter: ("LevelId" = ANY ('{01a1a74f-5a92-7566-ae9f-2b18292ff52e,01a1a74f-5a92-7594-87cc-d834b0f0acc1,01a1a74f-5a92-7bf3-add9-b016bb8c8e27,01a1a74f-5a92-7cf8-a0f1-5e141e1e600e}'::uuid[]))
                          Buffers: shared hit=63
        SubPlan 1
          ->  Index Only Scan using "UX_CND_Documents_CandidateId_Primary" on "CND_Documents" c3  (cost=0.28..8.29 rows=1 width=0) (actual time=0.007..0.007 rows=1 loops=3)
                Index Cond: ("CandidateId" = c."Id")
                Heap Fetches: 3
                Buffers: shared hit=9
        SubPlan 3
          ->  Index Scan using "UX_CND_Documents_CandidateId_Primary" on "CND_Documents" c4  (cost=0.28..8.30 rows=1 width=0) (actual time=0.003..0.003 rows=0 loops=3)
                Index Cond: ("CandidateId" = c."Id")
                Filter: ((("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 1
                Buffers: shared hit=9
        SubPlan 5
          ->  Index Scan using "UX_CND_Documents_CandidateId_Primary" on "CND_Documents" c5  (cost=0.28..8.30 rows=1 width=0) (actual time=0.003..0.003 rows=0 loops=3)
                Index Cond: ("CandidateId" = c."Id")
                Filter: ((("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
                Rows Removed by Filter: 1
                Buffers: shared hit=9
Planning:
  Buffers: shared hit=70
Planning Time: 1.117 ms
Execution Time: 1.742 ms
```

## Every SQL family combined

Execution time: 0.5 ms

```
Limit  (cost=407.45..432.37 rows=1 width=324) (actual time=0.338..0.340 rows=0 loops=1)
  Buffers: shared hit=325
  ->  Result  (cost=407.45..432.37 rows=1 width=324) (actual time=0.337..0.339 rows=0 loops=1)
        Buffers: shared hit=325
        ->  Sort  (cost=407.45..407.46 rows=1 width=321) (actual time=0.336..0.338 rows=0 loops=1)
              Sort Key: c."UpdatedAtUtc" DESC, c."Id"
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=325
              ->  Nested Loop Semi Join  (cost=55.88..407.44 rows=1 width=321) (actual time=0.330..0.332 rows=0 loops=1)
                    Buffers: shared hit=325
                    ->  Nested Loop Semi Join  (cost=55.60..406.43 rows=1 width=369) (actual time=0.195..0.321 rows=1 loops=1)
                          Buffers: shared hit=322
                          ->  Nested Loop Semi Join  (cost=55.32..405.33 rows=1 width=353) (actual time=0.183..0.309 rows=1 loops=1)
                                Buffers: shared hit=319
                                ->  Nested Loop  (cost=55.04..395.40 rows=12 width=337) (actual time=0.153..0.266 rows=18 loops=1)
                                      Buffers: shared hit=265
                                      ->  HashAggregate  (cost=54.76..55.50 rows=74 width=16) (actual time=0.075..0.082 rows=74 loops=1)
                                            Group Key: c3."CandidateId"
                                            Batches: 1  Memory Usage: 24kB
                                            Buffers: shared hit=43
                                            ->  Bitmap Heap Scan on "CND_CandidatePrograms" c3  (cost=4.85..54.58 rows=74 width=16) (actual time=0.023..0.061 rows=74 loops=1)
                                                  Recheck Cond: ("ProgramId" = ANY ('{01a1a74f-5a92-70e4-adec-6fdb9345def1}'::uuid[]))
                                                  Heap Blocks: exact=41
                                                  Buffers: shared hit=43
                                                  ->  Bitmap Index Scan on "IX_CND_CandidatePrograms_ProgramId_ProgramFamily"  (cost=0.00..4.83 rows=74 width=0) (actual time=0.015..0.016 rows=74 loops=1)
                                                        Index Cond: ("ProgramId" = ANY ('{01a1a74f-5a92-70e4-adec-6fdb9345def1}'::uuid[]))
                                                        Buffers: shared hit=2
                                      ->  Index Scan using "PK_CND_Candidates" on "CND_Candidates" c  (cost=0.28..4.68 rows=1 width=321) (actual time=0.002..0.002 rows=0 loops=74)
                                            Index Cond: ("Id" = c3."CandidateId")
                                            Filter: ("IsActive" AND (("AvailabilityState")::text = ANY ('{available}'::text[])) AND ("AvailabilityCheckedOn" >= '2026-01-01'::date))
                                            Rows Removed by Filter: 1
                                            Buffers: shared hit=222
                                ->  Index Scan using "IX_CND_CandidateLanguages_CandidateId" on "CND_CandidateLanguages" c2  (cost=0.28..0.83 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=18)
                                      Index Cond: ("CandidateId" = c."Id")
                                      Filter: (("LanguageId" = ANY ('{01a1a74f-5a92-7303-a23f-75695fde9594}'::uuid[])) AND ("LevelId" = ANY ('{01a1a74f-5a92-7288-b972-9e5e404625ca,01a1a74f-5a92-762f-b487-4686df040285,01a1a74f-5a92-7998-a46e-a1cd54fcc3b5,01a1a74f-5a92-7bf7-b3b4-2405702fcf38,01a1a74f-5a92-7ea5-9f66-94c25b4041e8,01a1a74f-5a92-7ef6-8bc6-e102b652e35c}'::uuid[])))
                                      Rows Removed by Filter: 1
                                      Buffers: shared hit=54
                          ->  Index Only Scan using "UX_CND_Documents_CandidateId_Primary" on "CND_Documents" c0  (cost=0.28..1.10 rows=1 width=16) (actual time=0.011..0.011 rows=1 loops=1)
                                Index Cond: ("CandidateId" = c."Id")
                                Heap Fetches: 1
                                Buffers: shared hit=3
                    ->  Index Scan using "IX_CND_CandidateSkills_CandidateId" on "CND_CandidateSkills" c1  (cost=0.29..0.65 rows=1 width=16) (actual time=0.009..0.009 rows=0 loops=1)
                          Index Cond: ("CandidateId" = c0."CandidateId")
                          Filter: ("SkillId" = ANY ('{01a1a74f-5a92-7032-af3b-ac0cd156e9a6}'::uuid[]))
                          Rows Removed by Filter: 3
                          Buffers: shared hit=3
        SubPlan 1
          ->  Index Only Scan using "UX_CND_Documents_CandidateId_Primary" on "CND_Documents" c4  (cost=0.28..8.29 rows=1 width=0) (never executed)
                Index Cond: ("CandidateId" = c."Id")
                Heap Fetches: 0
        SubPlan 3
          ->  Index Scan using "UX_CND_Documents_CandidateId_Primary" on "CND_Documents" c5  (cost=0.28..8.30 rows=1 width=0) (never executed)
                Index Cond: ("CandidateId" = c."Id")
                Filter: ((("ScanState")::text = 'Clean'::text) AND (("ContentType")::text = 'application/pdf'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
        SubPlan 5
          ->  Index Scan using "UX_CND_Documents_CandidateId_Primary" on "CND_Documents" c6  (cost=0.28..8.30 rows=1 width=0) (never executed)
                Index Cond: ("CandidateId" = c."Id")
                Filter: ((("ScanState")::text = 'Clean'::text) AND (("SourceKey" IS NULL) OR (btrim(("Sha256")::text, ' 	
'::text) <> ''::text)))
Planning:
  Buffers: shared hit=95
Planning Time: 1.491 ms
Execution Time: 0.486 ms
```

