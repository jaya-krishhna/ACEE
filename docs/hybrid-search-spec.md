# Hybrid Search Implementation Spec (Phase 9 — Search Layer)

Architecture: Filtered-then-fused hybrid search. Metadata filters gate a candidate set; BM25 (Postgres native full-text, `ts_rank`) and pgvector cosine similarity independently rank *within* that filtered set; results are merged via Reciprocal Rank Fusion (RRF).

```
Extracted metadata filters (event_type, location, eligibility, dates, tags, fee)
                              │
                              ▼
                 Filtered candidate set (status='published' AND ...)
                     │                              │
                     ▼                              ▼
              BM25 rank (ts_rank,               Vector rank (pgvector
              over filtered set)                 cosine, over filtered set)
                     │                              │
                     └──────────────┬───────────────┘
                                    ▼
                                   RRF
                                    │
                                    ▼
                          Final ranked results
```

**Hard rule:** metadata filters are applied identically to both the BM25 query and the vector query, as the same upstream filtered set — never applied to only one leg. An unconstrained leg fused via RRF will leak out-of-category results into the final ranking.

**Non-relaxable filters, always:** `status = 'published'`, `event_type` (if the student specified one). Every other extracted filter (location, eligibility, date range, tags, fee) is eligible for progressive relaxation if the strict pass returns too few results.

---

## 1. Reference Data Cache

Maintained in-memory, refreshed on a timer (e.g. every 5 minutes) or on write to the source tables:

```
cityCache:        Map<cityDisplayLabel, location_id>       -- from `locations`
tagCache:         Map<tagName, tag_id>                      -- from `tags`
eligibilityCache: Map<categoryName, eligibility_category_id> -- from `eligibility_categories`
```

`cityDisplayLabel` = `city` alone if unique across the table; if two cities share a name across different states, disambiguate to `"City, State"` at cache-build time. The enum arrays fed into the LLM schema below are built from these caches' keys, refreshed alongside them.

---

## 2. Extraction Schema (JSON Schema, `strict: true`)

Every field except `semantic_search_term` is nullable/optional. **Null or empty-array means "not mentioned" — never invented, never guessed into a default.**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "semantic_search_term": {
      "type": "string",
      "description": "The meaningful descriptive phrase left after structured fields are extracted (e.g. 'AI hackathons', 'generative AI LLM applications'). Empty string if the query is purely structural with nothing semantic left (e.g. 'hackathons in Chennai this month')."
    },
    "event_type": {
      "type": ["string", "null"],
      "enum": ["hackathon", "workshop", "internship", null]
    },
    "location_city_ids": {
      "type": "array",
      "items": { "type": "string", "enum": [ /* injected from cityCache keys */ ] },
      "description": "Empty array if no city mentioned. Multiple entries only if the student explicitly named more than one city."
    },
    "eligibility_category_ids": {
      "type": "array",
      "items": { "type": "string", "enum": [ /* injected from eligibilityCache keys */ ] },
      "description": "Empty array if unclear or not mentioned. Do not guess a category from an ambiguous phrase like 'students' alone."
    },
    "min_year_of_study": { "type": ["integer", "null"] },
    "max_year_of_study": { "type": ["integer", "null"] },
    "tag_ids": {
      "type": "array",
      "items": { "type": "string", "enum": [ /* injected from tagCache keys */ ] },
      "description": "Empty array if no domain/technology/theme mentioned."
    },
    "is_paid": { "type": ["boolean", "null"] },
    "fee_max": { "type": ["number", "null"] },
    "date_range_start": { "type": ["string", "null"], "format": "date" },
    "date_range_end": { "type": ["string", "null"], "format": "date" }
  },
  "required": [
    "semantic_search_term", "event_type", "location_city_ids",
    "eligibility_category_ids", "min_year_of_study", "max_year_of_study",
    "tag_ids", "is_paid", "fee_max", "date_range_start", "date_range_end"
  ]
}
```

System context sent alongside: today's date (for resolving "this month"/"next week"), and an explicit instruction: *"Extract only what is explicitly stated or unambiguously implied. Never select a value not present in the provided enum lists. When uncertain, prefer null/empty over guessing."*

---

## 3. Null / Empty-Value Handling (query-builder rules)

These rules apply when translating the extracted JSON into SQL predicates — get this wrong and queries silently return zero rows or ignore intended filters:

| Extracted value | Behavior |
|---|---|
| `event_type: null` | Omit `event_type = ...` entirely |
| `location_city_ids: []` | Omit location predicate entirely (do NOT emit `location_id = ANY(ARRAY[]::int[])` — this always evaluates false, not "no filter") |
| `eligibility_category_ids: []` | Same as above — omit, don't pass empty array into `ANY()` |
| `tag_ids: []` | Same — omit |
| `min_year_of_study: null` / `max_year_of_study: null` | Omit each bound independently; a query can specify one without the other |
| `is_paid: null` | Omit — do not default to either true or false |
| `fee_max: null` | Omit |
| `date_range_start` / `date_range_end`: either or both null | Omit the missing bound only; a query can be open-ended on one side (e.g. "after October 1st" with no end date) |
| `semantic_search_term: ""` | Skip both BM25 and vector legs entirely; return the filtered set ordered by date (see §4) |

---

## 4. Query Execution Logic

**If `semantic_search_term` is non-empty:**

```sql
WITH filtered AS (
  SELECT id FROM events
  WHERE status = 'published'
    -- each line below present ONLY if its corresponding extracted field is non-null/non-empty
    AND event_type = $event_type
    AND location_id = ANY($location_ids)
    AND eligibility_category_ids && $eligibility_ids  -- array overlap = ANY match
    AND tag_ids && $tag_ids
    AND min_year_of_study >= $min_year_of_study
    AND max_year_of_study <= $max_year_of_study
    AND is_paid = $is_paid
    AND registration_fee_inr <= $fee_max
    AND event_start_at >= $date_range_start
    AND event_start_at <= $date_range_end
),
bm25_ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    ORDER BY ts_rank(search_text_tsv, websearch_to_tsquery('english', $semantic_search_term)) DESC
  ) AS rnk
  FROM events
  WHERE id IN (SELECT id FROM filtered)
    AND search_text_tsv @@ websearch_to_tsquery('english', $semantic_search_term)
  LIMIT 50
),
vector_ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $query_vector) AS rnk
  FROM events
  WHERE id IN (SELECT id FROM filtered)
  ORDER BY embedding <=> $query_vector
  LIMIT 50
)
SELECT e.*,
  COALESCE(1.0 / (60 + b.rnk), 0) + COALESCE(1.0 / (60 + v.rnk), 0) AS rrf_score
FROM events e
LEFT JOIN bm25_ranked b ON e.id = b.id
LEFT JOIN vector_ranked v ON e.id = v.id
WHERE e.id IN (SELECT id FROM bm25_ranked UNION SELECT id FROM vector_ranked)
ORDER BY rrf_score DESC
LIMIT $page_size OFFSET $offset;
```

Constants: RRF `k = 60` (standard, from the original Cormack et al. 2009 paper — do not tune without real query-eval data), candidate pool = top 50 per leg before fusion, final page size per your existing pagination rules.

**If `semantic_search_term` is empty:** run only the `filtered` CTE (no BM25/vector legs), order by `event_start_at ASC` (default) or `published_at DESC` (`sort=newest`), same pagination rules as your existing `GET /api/events`.

**Progressive relaxation:** if the strict `filtered` count (or final result count) is below a threshold (e.g. 3), drop optional filters in this order and re-run: eligibility → tags → date range → location. Never drop `event_type` or `status`. Tag results with `relaxed_match: true` and record which filters were dropped in `search_query_log.filters_relaxed`.

---

## Antigravity Prompt

```
Read docs/build-plan.md and docs/schema-design.md first. Phases 0–8 are already
complete. We are implementing the hybrid natural-language search endpoint.

IMPORTANT — READ CAREFULLY, DO NOT DEVIATE OR ASSUME:
- Backend only. Do not touch frontend code.
- This is a single new endpoint: POST /api/search
- Do not use Elasticsearch or any external search service. Everything runs in
  the existing Postgres database using pgvector (already set up) and Postgres's
  native tsvector/ts_rank full-text search (no new extensions).
- Follow the extraction schema, null-handling rules, and SQL/RRF logic below
  EXACTLY as specified. Do not invent alternative filter-combination logic,
  do not skip the RRF fusion step, and do not apply metadata filters to only
  one of the two ranking legs.

==================================================
1. REFERENCE DATA CACHE
==================================================

Implement an in-memory cache service (src/services/referenceCache.ts or similar)
that holds three maps, refreshed every 5 minutes on a timer:
- cityCache: city display label -> location_id (from the locations table; if two
  cities share the same name across different states, use "City, State" as the
  label to disambiguate — detect this automatically when building the cache)
- tagCache: tag name -> tag_id (from tags table)
- eligibilityCache: eligibility category name -> eligibility_category_id (from
  eligibility_categories table)
Expose a function to get the current enum arrays (the caches' keys) for building
the extraction JSON Schema on each request, and a function to resolve a label
back to its id.

==================================================
2. EXTRACTION SERVICE
==================================================

Implement a service that calls the LLM extraction API using structured
outputs / strict JSON schema mode (not plain prompting) with this exact
schema shape — inject the live enum arrays from the reference cache into
event_type is a fixed enum, location_city_ids/eligibility_category_ids/tag_ids
enums come from the cache:

[paste the full JSON Schema from §2 of this doc]

Send along with the schema: today's date (for resolving relative date terms
like "this month"), and this exact instruction: "Extract only what is
explicitly stated or unambiguously implied. Never select a value not present
in the provided enum lists. When uncertain, prefer null/empty over guessing."

The service must return the raw extracted object with nulls/empty arrays
preserved as-is — do not fill in defaults at this stage.

==================================================
3. QUERY BUILDER — NULL/EMPTY HANDLING (CRITICAL)
==================================================

Implement a function that takes the extracted object (with resolved ids, not
labels) and builds a Drizzle dynamic WHERE clause following these rules exactly:
- Any null field: omit that predicate entirely from the query. Do not pass null
  into a comparison.
- Any empty array field (location_city_ids, eligibility_category_ids, tag_ids
  after resolution to ids): omit that predicate entirely. Do NOT emit
  `= ANY(ARRAY[]::int[])` — this always evaluates false and would incorrectly
  exclude every row.
- min_year_of_study / max_year_of_study: each is an independent optional bound;
  either can be present without the other.
- date_range_start / date_range_end: same — either can be present without the
  other (open-ended range).
- Resolve location_city_ids, eligibility_category_ids, and tag_ids labels to
  their actual integer ids via the reference cache before building the query —
  never pass label strings into SQL.

Write unit tests specifically for this function covering: all fields null/empty
(should produce a query with only status='published'), each field individually
present, empty arrays specifically (confirm they produce omitted predicates,
not always-false conditions), and partial date/year ranges (only start, only end).

==================================================
4. HYBRID SEARCH EXECUTION
==================================================

Implement the two execution paths:

A) semantic_search_term is a non-empty string:
   Execute the filtered-candidate CTE, then BM25 ranking via
   ts_rank(search_text_tsv, websearch_to_tsquery('english', semantic_search_term))
   over the filtered set (top 50), and vector ranking via
   embedding <=> queryVector over the same filtered set (top 50), then fuse via
   Reciprocal Rank Fusion: score = COALESCE(1.0/(60+bm25_rank), 0) +
   COALESCE(1.0/(60+vector_rank), 0), using a LEFT JOIN so an item ranked by
   only one leg still gets a partial score. Use the exact SQL structure in §4
   of docs/hybrid-search-spec.md as your reference — implement this as a raw
   parameterized SQL query via Drizzle's sql`` template (this query is too
   complex for the standard query builder), NOT string concatenation.
   The query_vector must come from embedding semantic_search_term with the
   same embedding model/dimensions used for event ingestion.

B) semantic_search_term is empty/whitespace-only:
   Skip both BM25 and vector ranking entirely. Return the filtered set ordered
   by event_start_at ASC (default) or published_at DESC if sort=newest was
   requested, same as the existing GET /api/events ordering rules.

Both paths must apply the exact same filtered candidate set — metadata filters
are never applied to only one ranking leg.

==================================================
5. PROGRESSIVE RELAXATION
==================================================

If the result count (after step 4, before pagination) is below 3:
- Relax filters in this exact order, re-running the query after each drop,
  stopping as soon as results >= 3 or all optional filters are dropped:
  1. eligibility_category_ids / min_year_of_study / max_year_of_study
  2. tag_ids
  3. date_range_start / date_range_end
  4. location_city_ids
- NEVER relax event_type or status='published' — these are hard filters always.
- Mark every result returned after any relaxation with relaxed_match: true in
  the response, and record which filter categories were dropped.

==================================================
6. ENDPOINT
==================================================

POST /api/search — public (no auth required), body: { query: string, page?:
number, limit?: number }. Response shape:
{
  data: [ ...lightweight event cards, same shape as GET /api/events, plus a
          relaxed_match boolean per item ],
  pagination: { page, limit, total, totalPages },
  extracted_filters: { ...the resolved extraction object, for debugging/UI use },
  filters_relaxed: [ ...list of filter categories that were dropped, empty if none ]
}
Validate the request body with Zod (query: required non-empty string, page >=1,
limit 1-100).

==================================================
7. LOGGING
==================================================

Insert a row into search_query_log for every request: raw_query, extracted
filters (the resolved object), filters_relaxed, results_count, created_at.

==================================================
8. TESTING
==================================================

Integration tests covering at minimum:
- Fully structured query with no semantic term returns filtered-only results,
  ordered correctly, no BM25/vector legs invoked
- Query with only a semantic term (no filters extracted) runs BM25+vector+RRF
  over the full published set
- Combined query (filters + semantic term) correctly restricts BOTH ranking
  legs to the same filtered candidate set — verify a non-matching event_type
  never appears even if it would rank highly on vector similarity alone
- Empty-array filter fields do not exclude all results (regression test for
  the ANY(ARRAY[]::int[]) bug specifically)
- Partial date range (only start or only end) works correctly
- Progressive relaxation drops filters in the correct order and stops as soon
  as enough results are found
- event_type and status are never relaxed even when results are zero
- relaxed_match flag is set correctly on relaxed results and absent/false on
  strict-pass results
- search_query_log receives a row per request with correct extracted_filters
  and filters_relaxed

==================================================
9. DELIVERABLE
==================================================

At the end, provide a concise walkthrough: files changed, the exact SQL query
structure implemented, endpoint added, tests run and their results, and any
assumptions made where this spec was ambiguous (flag these explicitly rather
than silently resolving them).

Do not implement anything beyond what's specified above.
```
