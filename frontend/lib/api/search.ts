import { apiClient } from './client';
import type { EventCard } from '@/lib/types';

export interface SearchFilters {
  category?: string[];
  team_size?: string | null;
  payment?: 'free' | 'paid' | null;
  location?: string | null;
  tags?: string[];
}

export interface SearchRequestPayload {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
  page?: number;
  sort?: 'upcoming' | 'newest';
  literalQuery?: boolean;
}

export interface SearchResultItem extends EventCard {
  organizer: string;
  category: string;
  description: string;
  starts_at: string;
  register_by: string | null;
  fee: number | null;
  currency: string;
  tags: string[];
  score: number;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  query_interpreted: string | null;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Normalizes extracted filter object into human-readable description for AI query feedback
 */
function buildQueryInterpreted(extractedFilters: any, rawQuery: string): string | null {
  if (!extractedFilters) return null;
  const parts: string[] = [];

  if (extractedFilters.event_type) {
    const typeLabel =
      extractedFilters.event_type.charAt(0).toUpperCase() + extractedFilters.event_type.slice(1);
    parts.push(`${typeLabel}s`);
  }

  if (extractedFilters.location_city_ids?.length) {
    parts.push('in target locations');
  }

  if (extractedFilters.is_paid === false) {
    parts.push('free');
  } else if (extractedFilters.is_paid === true) {
    parts.push('paid');
  }

  if (extractedFilters.tag_ids?.length) {
    parts.push('with matching tags');
  }

  if (parts.length === 0) return null;
  const interpreted = parts.join(' ');
  // Return interpreted string if it differs noticeably from raw query
  if (interpreted.toLowerCase() === rawQuery.trim().toLowerCase()) return null;
  return interpreted;
}

export async function searchEvents(
  params: SearchRequestPayload,
  options?: { signal?: AbortSignal },
): Promise<SearchResponse> {
  const page =
    params.page ?? (params.offset ? Math.floor(params.offset / (params.limit || 20)) + 1 : 1);
  const limit = params.limit ?? 20;

  // Post to backend hybrid search endpoint
  const rawResponse = await apiClient.post<any>(
    '/api/search',
    {
      query: params.query,
      page,
      limit,
      sort: params.sort,
      filters: params.filters,
      literalQuery: params.literalQuery,
    },
    {
      skipAuth: true,
      signal: options?.signal,
    },
  );

  const rawData: any[] = rawResponse.data ?? rawResponse.results ?? [];
  const pagination = rawResponse.pagination ?? {
    page,
    limit,
    total: rawResponse.total ?? rawData.length,
    totalPages: Math.ceil((rawResponse.total ?? rawData.length) / limit),
  };

  const results: SearchResultItem[] = rawData.map((item: any) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    tagline: item.tagline ?? null,
    event_type: item.event_type ?? 'hackathon',
    banner_image_url: item.banner_image_url ?? null,
    organization: item.organization ?? { name: item.organizer ?? 'Organization' },
    location: typeof item.location === 'string' ? item.location : 'Online Event',
    event_start_at: item.event_start_at ?? item.starts_at ?? new Date().toISOString(),
    registration_close_at: item.registration_close_at ?? item.register_by ?? null,
    is_paid: item.is_paid ?? (item.fee != null && item.fee > 0),
    registration_fee: item.registration_fee ?? item.fee ?? 0,
    prize_summary_text: item.prize_summary_text ?? null,

    // Contract fields
    organizer: item.organization?.name ?? item.organizer ?? 'Organization',
    category: item.event_type ?? item.category ?? 'hackathon',
    description: item.tagline ?? item.description ?? '',
    starts_at: item.event_start_at ?? item.starts_at ?? new Date().toISOString(),
    register_by: item.registration_close_at ?? item.register_by ?? null,
    fee: item.is_paid ? item.registration_fee : 0,
    currency: item.currency ?? 'INR',
    tags: item.tags ?? [],
    score: item.score ?? 1.0,
  }));

  const query_interpreted =
    rawResponse.query_interpreted ??
    buildQueryInterpreted(rawResponse.extracted_filters, params.query);

  return {
    results,
    total: pagination.total,
    query_interpreted,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: pagination.totalPages,
  };
}
