import { sql, SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { searchQueryLog } from '../db/schema/analytics';
import { extractSearchFilters, ExtractedFilters, ResolvedFilters } from './searchExtractionService';
import {
  refreshReferenceCache,
  resolveCityIds,
  resolveEligibilityIds,
  resolveTagIds,
} from './referenceCache';
import { fetchGeminiEmbedding } from './embeddingService';

export interface SearchOptions {
  rawQuery: string;
  page?: number;
  limit?: number;
  sort?: 'upcoming' | 'newest';
  userId?: string | null;
}

export interface EventCardResponse {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  event_type: string;
  banner_image_url: string | null;
  organization: {
    name: string;
  };
  location: string;
  event_start_at: Date | string;
  registration_close_at: Date | string | null;
  is_paid: boolean;
  registration_fee: number;
  prize_summary_text?: string | null;
  relaxed_match: boolean;
}

export interface SearchResponse {
  data: EventCardResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  extracted_filters: ResolvedFilters;
  filters_relaxed: string[];
}

/**
 * Builds the dynamic parameterized SQL WHERE conditions for the candidate set CTE.
 */
export function buildCandidateWhereConditions(
  resolved: ResolvedFilters,
  activeRelaxations: Set<string>,
): SQL {
  const conditions: SQL[] = [sql`events.status = 'published'`];

  // Hard filter: event_type (never relaxed)
  if (resolved.event_type) {
    conditions.push(sql`events.event_type = ${resolved.event_type}`);
  }

  // Location filter (can be relaxed)
  if (!activeRelaxations.has('location_city_ids') && resolved.location_city_ids.length > 0) {
    const locIdsStr = resolved.location_city_ids.join(',');
    conditions.push(sql`events.location_id IN (${sql.raw(locIdsStr)})`);
  }

  // Eligibility category filter via event_eligibility join table (can be relaxed)
  if (
    !activeRelaxations.has('eligibility_category_ids') &&
    resolved.eligibility_category_ids.length > 0
  ) {
    const catIdsStr = resolved.eligibility_category_ids.join(',');
    conditions.push(
      sql`events.id IN (
        SELECT event_id FROM event_eligibility
        WHERE eligibility_category_id IN (${sql.raw(catIdsStr)})
      )`,
    );
  }

  // Tag filter via event_tags join table (can be relaxed)
  if (!activeRelaxations.has('tag_ids') && resolved.tag_ids.length > 0) {
    const tagIdsStr = resolved.tag_ids.join(',');
    conditions.push(
      sql`events.id IN (
        SELECT event_id FROM event_tags
        WHERE tag_id IN (${sql.raw(tagIdsStr)})
      )`,
    );
  }

  // Fee filters (is_paid, fee_max)
  if (resolved.is_paid !== null) {
    conditions.push(sql`events.is_paid = ${resolved.is_paid}`);
  }

  if (resolved.fee_max !== null) {
    conditions.push(sql`events.registration_fee <= ${resolved.fee_max}`);
  }

  // Date range filters (can be relaxed)
  if (!activeRelaxations.has('date_range')) {
    if (resolved.date_range_start) {
      conditions.push(sql`events.event_start_at >= ${resolved.date_range_start}::timestamptz`);
    }
    if (resolved.date_range_end) {
      conditions.push(sql`events.event_start_at <= ${resolved.date_range_end}::timestamptz`);
    }
  }

  return sql.join(conditions, sql` AND `);
}

/**
 * Main hybrid search execution entry point.
 */
export async function executeSearch(options: SearchOptions): Promise<SearchResponse> {
  const { rawQuery, page = 1, limit = 10, sort = 'upcoming', userId = null } = options;

  // 1. Perform LLM Extraction
  const rawExtracted: ExtractedFilters = await extractSearchFilters(rawQuery);

  // 2. Resolve enums to IDs via referenceCache
  const resolvedFilters: ResolvedFilters = {
    semantic_search_term: rawExtracted.semantic_search_term,
    event_type: rawExtracted.event_type,
    location_city_ids: resolveCityIds(rawExtracted.location_city_ids),
    eligibility_category_ids: resolveEligibilityIds(rawExtracted.eligibility_category_ids),
    tag_ids: resolveTagIds(rawExtracted.tag_ids),
    is_paid: rawExtracted.is_paid,
    fee_max: rawExtracted.fee_max,
    date_range_start: rawExtracted.date_range_start,
    date_range_end: rawExtracted.date_range_end,
    raw_extracted: rawExtracted,
  };

  const offset = (page - 1) * limit;
  const semanticTerm = resolvedFilters.semantic_search_term.trim();

  // Determine vector if semantic search term exists
  let queryVector: number[] | null = null;
  if (semanticTerm.length > 0) {
    try {
      queryVector = await fetchGeminiEmbedding(semanticTerm);
    } catch (err: any) {
      console.warn(`[SearchService] Query vector embedding generation failed (${err.message}). Falling back to dummy vector.`);
      queryVector = new Array(1536).fill(0.01);
    }
  }

  // 3. Progressive Relaxation Loop
  // Order of relaxation if results < 3:
  // 1. eligibility_category_ids
  // 2. tag_ids
  // 3. date_range
  // 4. location_city_ids
  const relaxationSteps: string[] = [];
  if (resolvedFilters.eligibility_category_ids.length > 0) relaxationSteps.push('eligibility_category_ids');
  if (resolvedFilters.tag_ids.length > 0) relaxationSteps.push('tag_ids');
  if (resolvedFilters.date_range_start || resolvedFilters.date_range_end) relaxationSteps.push('date_range');
  if (resolvedFilters.location_city_ids.length > 0) relaxationSteps.push('location_city_ids');

  const activeRelaxations = new Set<string>();
  const filtersRelaxed: string[] = [];

  let queryResults: any[] = [];
  let totalMatches = 0;

  for (let step = 0; step <= relaxationSteps.length; step++) {
    if (step > 0) {
      const relaxedField = relaxationSteps[step - 1];
      activeRelaxations.add(relaxedField);
      filtersRelaxed.push(relaxedField);
    }

    const whereClause = buildCandidateWhereConditions(resolvedFilters, activeRelaxations);

    if (semanticTerm.length > 0 && queryVector) {
      // Path A: Hybrid BM25 + Vector + RRF ranking
      const vectorStr = `[${queryVector.join(',')}]`;

      const hybridQuery = sql`
        WITH filtered AS (
          SELECT events.id FROM events
          WHERE ${whereClause}
        ),
        bm25_ranked AS (
          SELECT events.id, ROW_NUMBER() OVER (
            ORDER BY ts_rank(events.search_text_tsv, websearch_to_tsquery('english', ${semanticTerm})) DESC
          ) AS rnk
          FROM events
          WHERE events.id IN (SELECT id FROM filtered)
            AND events.search_text_tsv @@ websearch_to_tsquery('english', ${semanticTerm})
          LIMIT 50
        ),
        vector_ranked AS (
          SELECT events.id, ROW_NUMBER() OVER (ORDER BY events.embedding <=> ${vectorStr}::vector) AS rnk
          FROM events
          WHERE events.id IN (SELECT id FROM filtered)
            AND events.embedding IS NOT NULL
          ORDER BY events.embedding <=> ${vectorStr}::vector
          LIMIT 50
        )
        SELECT e.id,
          e.slug,
          e.title,
          e.tagline,
          e.event_type AS "eventType",
          e.banner_image_url AS "bannerImageUrl",
          e.mode,
          e.event_start_at AS "eventStartAt",
          e.registration_close_at AS "registrationCloseAt",
          e.is_paid AS "isPaid",
          e.registration_fee AS "registrationFee",
          o.name AS "orgName",
          l.city AS "city",
          hd.prize_summary_text AS "prizeSummaryText",
          COALESCE(1.0 / (60 + b.rnk), 0) + COALESCE(1.0 / (60 + v.rnk), 0) AS rrf_score,
          COUNT(*) OVER() AS total_count
        FROM events e
        INNER JOIN organizations o ON e.organization_id = o.id
        LEFT JOIN locations l ON e.location_id = l.id
        LEFT JOIN hackathon_details hd ON e.id = hd.event_id
        LEFT JOIN bm25_ranked b ON e.id = b.id
        LEFT JOIN vector_ranked v ON e.id = v.id
        WHERE e.id IN (SELECT id FROM bm25_ranked UNION SELECT id FROM vector_ranked)
        ORDER BY rrf_score DESC, e.event_start_at ASC
        LIMIT ${limit} OFFSET ${offset};
      `;

      const resultObj = await db.execute(hybridQuery);
      queryResults = Array.from(resultObj.rows || []);
    } else {
      // Path B: Pure metadata search (empty semantic search term)
      const sortOrder =
        sort === 'newest'
          ? sql`e.published_at DESC, e.id DESC`
          : sql`e.event_start_at ASC, e.id ASC`;

      const metadataQuery = sql`
        SELECT e.id,
          e.slug,
          e.title,
          e.tagline,
          e.event_type AS "eventType",
          e.banner_image_url AS "bannerImageUrl",
          e.mode,
          e.event_start_at AS "eventStartAt",
          e.registration_close_at AS "registrationCloseAt",
          e.is_paid AS "isPaid",
          e.registration_fee AS "registrationFee",
          o.name AS "orgName",
          l.city AS "city",
          hd.prize_summary_text AS "prizeSummaryText",
          COUNT(*) OVER() AS total_count
        FROM events e
        INNER JOIN organizations o ON e.organization_id = o.id
        LEFT JOIN locations l ON e.location_id = l.id
        LEFT JOIN hackathon_details hd ON e.id = hd.event_id
        WHERE e.id IN (
          SELECT events.id FROM events
          WHERE ${whereClause}
        )
        ORDER BY ${sortOrder}
        LIMIT ${limit} OFFSET ${offset};
      `;

      const resultObj = await db.execute(metadataQuery);
      queryResults = Array.from(resultObj.rows || []);
    }

    totalMatches = queryResults.length > 0 ? Number(queryResults[0].total_count) : 0;

    // If we have >= 3 matches, or if we have at least 1 match after relaxing everything, stop
    if (totalMatches >= 3 || (totalMatches > 0 && step === relaxationSteps.length)) {
      break;
    }
  }

  // 4. Format card shape response
  const isRelaxed = filtersRelaxed.length > 0;
  const formattedCards: EventCardResponse[] = queryResults.map((row: any) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline ?? null,
    event_type: row.eventType,
    banner_image_url: row.bannerImageUrl ?? null,
    organization: {
      name: row.orgName,
    },
    location: row.mode === 'online' ? 'Online Event' : (row.city ?? 'Online Event'),
    event_start_at: row.eventStartAt,
    registration_close_at: row.registrationCloseAt ?? null,
    is_paid: Boolean(row.isPaid),
    registration_fee: row.registrationFee ? Number(row.registrationFee) : 0,
    ...(row.eventType === 'hackathon'
      ? { prize_summary_text: row.prizeSummaryText ?? null }
      : {}),
    relaxed_match: isRelaxed,
  }));

  const totalPages = Math.ceil(totalMatches / limit) || 0;

  // 5. Log search query asynchronously to search_query_log
  try {
    await db.insert(searchQueryLog).values({
      userId: userId ?? null,
      rawQuery: rawQuery,
      extractedFilters: resolvedFilters,
      filtersRelaxed: filtersRelaxed,
      resultsCount: totalMatches,
    });
  } catch (logErr) {
    console.error('[SearchService] Failed to insert row into search_query_log:', logErr);
  }

  return {
    data: formattedCards,
    pagination: {
      page,
      limit,
      total: totalMatches,
      totalPages,
    },
    extracted_filters: resolvedFilters,
    filters_relaxed: filtersRelaxed,
  };
}
