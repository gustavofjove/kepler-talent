# KTL-15 position list query plans

Captured by `PositionQueryPlanTests` against 5.000 positions, each with a
representative description and requirements document; the 100 most recently updated
carry 60 candidate links each, spread over every stage, so the per-stage counts
(KTL-40) are part of the plan. Regenerate by running
`dotnet test backend/Tests/IntegrationTests/IntegrationTests.csproj --filter PositionQueryPlanTests`.

## Default: open, updated descending, first page

Execution time: 1.9 ms

```
Aggregate  (cost=488.88..488.89 rows=1 width=4) (actual time=1.828..1.830 rows=1 loops=1)
  Output: (count(*))::integer
  Buffers: shared hit=417
  ->  Seq Scan on public."OPS_Positions" o  (cost=0.00..479.50 rows=3750 width=0) (actual time=0.013..1.518 rows=3750 loops=1)
        Output: "Id", "Title", "NormalizedTitle", "Description", "Location", "NormalizedLocation", "Status", "Requirements", "FilterSchemaVersion", "CreatedAtUtc", "UpdatedAtUtc"
        Filter: ((o."Status")::text = 'open'::text)
        Rows Removed by Filter: 1250
        Buffers: shared hit=417
Planning Time: 0.107 ms
Execution Time: 1.862 ms
```

Execution time: 2.7 ms

```
Nested Loop Left Join  (cost=5.45..2113.71 rows=25 width=82) (actual time=0.162..2.482 rows=25 loops=1)
  Output: o."Id", o."Title", o."Location", o."Status", o."UpdatedAtUtc", o.xmin, COALESCE(((count(*))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'new'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'shortlisted'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'interview'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'hired'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'rejected'::text)))::integer), 0)
  Buffers: shared hit=136
  ->  Limit  (cost=0.71..12.18 rows=25 width=58) (actual time=0.102..0.118 rows=25 loops=1)
        Output: o."Id", o."Location", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
        Buffers: shared hit=23
        ->  Incremental Sort  (cost=0.71..1721.03 rows=3750 width=58) (actual time=0.100..0.108 rows=25 loops=1)
              Output: o."Id", o."Location", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
              Sort Key: o."UpdatedAtUtc" DESC, o."Id"
              Presorted Key: o."UpdatedAtUtc"
              Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 28kB  Peak Memory: 28kB
              Buffers: shared hit=23
              ->  Index Scan Backward using "IX_OPS_Positions_Status_UpdatedAtUtc_Id" on public."OPS_Positions" o  (cost=0.28..1552.28 rows=3750 width=58) (actual time=0.041..0.065 rows=26 loops=1)
                    Output: o."Id", o."Location", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
                    Index Cond: ((o."Status")::text = 'open'::text)
                    Buffers: shared hit=23
  ->  GroupAggregate  (cost=4.75..84.03 rows=1 width=40) (actual time=0.093..0.093 rows=1 loops=25)
        Output: (count(*))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'new'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'shortlisted'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'interview'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'hired'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'rejected'::text)))::integer, o0."PositionId"
        Buffers: shared hit=113
        ->  Bitmap Heap Scan on public."OPS_PositionCandidates" o0  (cost=4.75..82.36 rows=60 width=24) (actual time=0.033..0.045 rows=60 loops=25)
              Output: o0."Id", o0."PositionId", o0."CandidateId", o0."Stage", o0."AddedAtUtc", o0."UpdatedAtUtc"
              Recheck Cond: (o0."PositionId" = o."Id")
              Heap Blocks: exact=55
              Buffers: shared hit=113
              ->  Bitmap Index Scan on "UX_OPS_PositionCandidates_PositionId_CandidateId"  (cost=0.00..4.73 rows=60 width=0) (actual time=0.027..0.027 rows=60 loops=25)
                    Index Cond: (o0."PositionId" = o."Id")
                    Buffers: shared hit=58
Planning Time: 0.561 ms
Execution Time: 2.716 ms
```

## Title contains, all statuses

Execution time: 1.9 ms

```
Aggregate  (cost=492.25..492.26 rows=1 width=4) (actual time=1.833..1.835 rows=1 loops=1)
  Output: (count(*))::integer
  Buffers: shared hit=417
  ->  Seq Scan on public."OPS_Positions" o  (cost=0.00..492.00 rows=101 width=0) (actual time=0.016..1.816 rows=111 loops=1)
        Output: "Id", "Title", "NormalizedTitle", "Description", "Location", "NormalizedLocation", "Status", "Requirements", "FilterSchemaVersion", "CreatedAtUtc", "UpdatedAtUtc"
        Filter: (((o."NormalizedTitle")::text ~~ '%desarrollador 12%'::text) OR ((o."NormalizedLocation")::text ~~ '%desarrollador 12%'::text))
        Rows Removed by Filter: 4889
        Buffers: shared hit=417
Planning:
  Buffers: shared hit=2
Planning Time: 0.162 ms
Execution Time: 1.865 ms
```

Execution time: 5.9 ms

```
Nested Loop Left Join  (cost=499.60..2596.45 rows=25 width=82) (actual time=2.306..2.412 rows=25 loops=1)
  Output: o."Id", o."Title", o."Location", o."Status", o."UpdatedAtUtc", o.xmin, COALESCE(((count(*))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'new'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'shortlisted'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'interview'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'hired'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'rejected'::text)))::integer), 0)
  Buffers: shared hit=467
  ->  Limit  (cost=494.85..494.91 rows=25 width=58) (actual time=2.251..2.261 rows=25 loops=1)
        Output: o."Id", o."Location", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
        Buffers: shared hit=417
        ->  Sort  (cost=494.85..495.10 rows=101 width=58) (actual time=2.249..2.255 rows=25 loops=1)
              Output: o."Id", o."Location", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
              Sort Key: o."UpdatedAtUtc" DESC, o."Id"
              Sort Method: top-N heapsort  Memory: 31kB
              Buffers: shared hit=417
              ->  Seq Scan on public."OPS_Positions" o  (cost=0.00..492.00 rows=101 width=58) (actual time=0.020..2.174 rows=111 loops=1)
                    Output: o."Id", o."Location", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
                    Filter: (((o."NormalizedTitle")::text ~~ '%desarrollador 12%'::text) OR ((o."NormalizedLocation")::text ~~ '%desarrollador 12%'::text))
                    Rows Removed by Filter: 4889
                    Buffers: shared hit=417
  ->  GroupAggregate  (cost=4.75..84.03 rows=1 width=40) (actual time=0.005..0.005 rows=0 loops=25)
        Output: (count(*))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'new'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'shortlisted'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'interview'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'hired'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'rejected'::text)))::integer, o0."PositionId"
        Buffers: shared hit=50
        ->  Bitmap Heap Scan on public."OPS_PositionCandidates" o0  (cost=4.75..82.36 rows=60 width=24) (actual time=0.004..0.004 rows=0 loops=25)
              Output: o0."Id", o0."PositionId", o0."CandidateId", o0."Stage", o0."AddedAtUtc", o0."UpdatedAtUtc"
              Recheck Cond: (o0."PositionId" = o."Id")
              Buffers: shared hit=50
              ->  Bitmap Index Scan on "UX_OPS_PositionCandidates_PositionId_CandidateId"  (cost=0.00..4.73 rows=60 width=0) (actual time=0.002..0.002 rows=0 loops=25)
                    Index Cond: (o0."PositionId" = o."Id")
                    Buffers: shared hit=50
Planning:
  Buffers: shared hit=2
Planning Time: 0.381 ms
Execution Time: 5.906 ms
```

## Location contains, closed

Execution time: 1.7 ms

```
Aggregate  (cost=489.02..489.04 rows=1 width=4) (actual time=1.537..1.540 rows=1 loops=1)
  Output: (count(*))::integer
  Buffers: shared hit=426
  ->  Bitmap Heap Scan on public."OPS_Positions" o  (cost=49.70..488.58 rows=179 width=0) (actual time=0.351..1.513 rows=179 loops=1)
        Recheck Cond: ((o."Status")::text = 'closed'::text)
        Filter: (((o."NormalizedTitle")::text ~~ '%malaga%'::text) OR ((o."NormalizedLocation")::text ~~ '%malaga%'::text))
        Rows Removed by Filter: 1071
        Heap Blocks: exact=412
        Buffers: shared hit=426
        ->  Bitmap Index Scan on "IX_OPS_Positions_Status_UpdatedAtUtc_Id"  (cost=0.00..49.66 rows=1250 width=0) (actual time=0.262..0.264 rows=1250 loops=1)
              Index Cond: ((o."Status")::text = 'closed'::text)
              Buffers: shared hit=14
Planning:
  Buffers: shared hit=2
Planning Time: 0.209 ms
Execution Time: 1.706 ms
```

Execution time: 0.5 ms

```
Nested Loop Left Join  (cost=5.03..2299.69 rows=25 width=100) (actual time=0.075..0.306 rows=25 loops=1)
  Output: o."Id", o."Title", o."Location", o."Status", o."UpdatedAtUtc", o.xmin, COALESCE(((count(*))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'new'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'shortlisted'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'interview'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'hired'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'rejected'::text)))::integer), 0), o."NormalizedTitle"
  Buffers: shared hit=201
  ->  Limit  (cost=0.28..198.15 rows=25 width=76) (actual time=0.055..0.215 rows=25 loops=1)
        Output: o."Id", o."Location", o."NormalizedTitle", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
        Buffers: shared hit=151
        ->  Index Scan using "IX_OPS_Positions_Status_NormalizedTitle_Id" on public."OPS_Positions" o  (cost=0.28..1416.99 rows=179 width=76) (actual time=0.053..0.210 rows=25 loops=1)
              Output: o."Id", o."Location", o."NormalizedTitle", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
              Index Cond: ((o."Status")::text = 'closed'::text)
              Filter: (((o."NormalizedTitle")::text ~~ '%malaga%'::text) OR ((o."NormalizedLocation")::text ~~ '%malaga%'::text))
              Rows Removed by Filter: 153
              Buffers: shared hit=151
  ->  GroupAggregate  (cost=4.75..84.03 rows=1 width=40) (actual time=0.003..0.003 rows=0 loops=25)
        Output: (count(*))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'new'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'shortlisted'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'interview'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'hired'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'rejected'::text)))::integer, o0."PositionId"
        Buffers: shared hit=50
        ->  Bitmap Heap Scan on public."OPS_PositionCandidates" o0  (cost=4.75..82.36 rows=60 width=24) (actual time=0.002..0.002 rows=0 loops=25)
              Output: o0."Id", o0."PositionId", o0."CandidateId", o0."Stage", o0."AddedAtUtc", o0."UpdatedAtUtc"
              Recheck Cond: (o0."PositionId" = o."Id")
              Buffers: shared hit=50
              ->  Bitmap Index Scan on "UX_OPS_PositionCandidates_PositionId_CandidateId"  (cost=0.00..4.73 rows=60 width=0) (actual time=0.002..0.002 rows=0 loops=25)
                    Index Cond: (o0."PositionId" = o."Id")
                    Buffers: shared hit=50
Planning:
  Buffers: shared hit=2
Planning Time: 0.834 ms
Execution Time: 0.490 ms
```

## Deep page sorted by location

Execution time: 1.5 ms

```
Aggregate  (cost=479.50..479.51 rows=1 width=4) (actual time=1.434..1.436 rows=1 loops=1)
  Output: (count(*))::integer
  Buffers: shared hit=417
  ->  Seq Scan on public."OPS_Positions" o  (cost=0.00..467.00 rows=5000 width=0) (actual time=0.011..0.998 rows=5000 loops=1)
        Output: "Id", "Title", "NormalizedTitle", "Description", "Location", "NormalizedLocation", "Status", "Requirements", "FilterSchemaVersion", "CreatedAtUtc", "UpdatedAtUtc"
        Buffers: shared hit=417
Planning:
  Buffers: shared hit=2
Planning Time: 0.101 ms
Execution Time: 1.463 ms
```

Execution time: 17.7 ms

```
Nested Loop Left Join  (cost=791.19..9192.85 rows=100 width=89) (actual time=15.512..17.183 rows=100 loops=1)
  Output: o."Id", o."Title", o."Location", o."Status", o."UpdatedAtUtc", o.xmin, COALESCE(((count(*))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'new'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'shortlisted'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'interview'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'hired'::text)))::integer), 0), COALESCE(((count(*) FILTER (WHERE ((o0."Stage")::text = 'rejected'::text)))::integer), 0), o."NormalizedLocation"
  Buffers: shared hit=646
  ->  Limit  (cost=786.44..786.69 rows=100 width=65) (actual time=15.453..15.493 rows=100 loops=1)
        Output: o."Id", o."Location", o."NormalizedLocation", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
        Buffers: shared hit=417
        ->  Sort  (cost=774.19..786.69 rows=5000 width=65) (actual time=13.716..14.957 rows=5000 loops=1)
              Output: o."Id", o."Location", o."NormalizedLocation", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
              Sort Key: o."NormalizedLocation", o."Id"
              Sort Method: quicksort  Memory: 857kB
              Buffers: shared hit=417
              ->  Seq Scan on public."OPS_Positions" o  (cost=0.00..467.00 rows=5000 width=65) (actual time=0.019..2.869 rows=5000 loops=1)
                    Output: o."Id", o."Location", o."NormalizedLocation", o."Status", o."Title", o."UpdatedAtUtc", o.xmin
                    Buffers: shared hit=417
  ->  GroupAggregate  (cost=4.75..84.03 rows=1 width=40) (actual time=0.016..0.016 rows=0 loops=100)
        Output: (count(*))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'new'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'shortlisted'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'interview'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'hired'::text)))::integer, (count(*) FILTER (WHERE ((o0."Stage")::text = 'rejected'::text)))::integer, o0."PositionId"
        Buffers: shared hit=229
        ->  Bitmap Heap Scan on public."OPS_PositionCandidates" o0  (cost=4.75..82.36 rows=60 width=24) (actual time=0.009..0.011 rows=8 loops=100)
              Output: o0."Id", o0."PositionId", o0."CandidateId", o0."Stage", o0."AddedAtUtc", o0."UpdatedAtUtc"
              Recheck Cond: (o0."PositionId" = o."Id")
              Heap Blocks: exact=27
              Buffers: shared hit=229
              ->  Bitmap Index Scan on "UX_OPS_PositionCandidates_PositionId_CandidateId"  (cost=0.00..4.73 rows=60 width=0) (actual time=0.007..0.007 rows=8 loops=100)
                    Index Cond: (o0."PositionId" = o."Id")
                    Buffers: shared hit=202
Planning Time: 0.285 ms
Execution Time: 17.674 ms
```
