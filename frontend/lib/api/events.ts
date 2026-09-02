import { apiClient } from './client';
import type { EventCard, EventDetail, PaginatedResponse, MyRegistration } from '@/lib/types';

// ─── Listing ─────────────────────────────────────────────────────────────────

export interface EventsQuery {
  page?: number;
  limit?: number;
  event_type?: 'hackathon' | 'workshop' | 'internship';
  city_id?: number;
  mode?: 'online' | 'offline' | 'hybrid';
  is_paid?: boolean;
  fee_max?: number;
  date_from?: string;
  date_to?: string;
  tag_ids?: number[];
  sort?: 'newest';
}

export async function listEvents(query: EventsQuery = {}): Promise<PaginatedResponse<EventCard>> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.event_type) params.set('event_type', query.event_type);
  if (query.city_id != null) params.set('city_id', String(query.city_id));
  if (query.mode) params.set('mode', query.mode);
  if (query.is_paid != null) params.set('is_paid', String(query.is_paid));
  if (query.fee_max != null) params.set('fee_max', String(query.fee_max));
  if (query.date_from) params.set('date_from', query.date_from);
  if (query.date_to) params.set('date_to', query.date_to);
  if (query.tag_ids?.length) params.set('tag_ids', query.tag_ids.join(','));
  if (query.sort) params.set('sort', query.sort);

  const qs = params.toString();
  return apiClient.get<PaginatedResponse<EventCard>>(`/api/events${qs ? `?${qs}` : ''}`, {
    skipAuth: true,
  });
}

export async function getEventBySlug(slug: string): Promise<EventDetail> {
  return apiClient.get<EventDetail>(`/api/events/${slug}`, { skipAuth: true });
}

// ─── Save / unsave ────────────────────────────────────────────────────────────

export async function saveEvent(id: string): Promise<{ message: string }> {
  return apiClient.post(`/api/events/${id}/save`);
}

export async function unsaveEvent(id: string): Promise<{ message: string }> {
  return apiClient.delete(`/api/events/${id}/save`);
}

// ─── Register / cancel ────────────────────────────────────────────────────────

export async function registerForEvent(
  id: string,
  responses: Array<{ field_id: number; value: string }> = [],
): Promise<{
  message: string;
  registration_id: string;
  status: string;
  payment_status: string;
}> {
  return apiClient.post(`/api/events/${id}/register`, { responses });
}

export async function cancelRegistration(id: string): Promise<{ message: string }> {
  return apiClient.delete(`/api/events/${id}/register`);
}
