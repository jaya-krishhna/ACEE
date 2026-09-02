import { apiClient } from './client';
import type {
  OrganizerEvent,
  CustomField,
  OrganizerRegistration,
  PaginatedResponse,
} from '@/lib/types';

// ─── Event CRUD ───────────────────────────────────────────────────────────────

export async function listOrganizerEvents(
  page = 1,
  limit = 10,
): Promise<PaginatedResponse<OrganizerEvent>> {
  return apiClient.get<PaginatedResponse<OrganizerEvent>>(
    `/api/organizer/events?page=${page}&limit=${limit}`,
  );
}

export async function createEvent(data: unknown): Promise<OrganizerEvent> {
  return apiClient.post<OrganizerEvent>('/api/organizer/events', data);
}

export async function updateEvent(id: string, data: unknown): Promise<OrganizerEvent> {
  return apiClient.put<OrganizerEvent>(`/api/organizer/events/${id}`, data);
}

export async function publishEvent(id: string): Promise<{ message: string }> {
  return apiClient.patch(`/api/organizer/events/${id}/publish`);
}

export async function unpublishEvent(id: string): Promise<{ message: string }> {
  return apiClient.patch(`/api/organizer/events/${id}/unpublish`);
}

export async function deleteEvent(id: string): Promise<{ message: string }> {
  return apiClient.delete(`/api/organizer/events/${id}`);
}

// ─── Get single event (organizer list endpoint gives list; use detail view) ───

export async function getOrganizerEventById(id: string): Promise<OrganizerEvent> {
  // The backend list includes all fields needed for editing when fetching
  // a single event. We get it by fetching the list and filtering, OR we
  // use a dedicated approach. Since the backend returns full data in the list,
  // callers should cache from the list. For the edit form, we expose a helper
  // that fetches the full list and finds the event.
  // If your backend gains a GET /api/organizer/events/:id endpoint, update here.
  const res = await apiClient.get<PaginatedResponse<OrganizerEvent>>(
    `/api/organizer/events?limit=100`,
  );
  const event = res.data.find((e) => e.id === id);
  if (!event) throw new Error('Event not found');
  return event;
}

// ─── Banner upload ────────────────────────────────────────────────────────────

export async function uploadBanner(
  id: string,
  file: File,
): Promise<{ message: string; banner_image_url: string }> {
  const form = new FormData();
  form.append('banner', file);
  return apiClient.post(`/api/organizer/events/${id}/banner`, form);
}

// ─── Custom fields ────────────────────────────────────────────────────────────

export async function getCustomFields(id: string): Promise<CustomField[]> {
  return apiClient.get<CustomField[]>(`/api/organizer/events/${id}/custom-fields`);
}

export async function setCustomFields(
  id: string,
  fields: Array<{
    label: string;
    field_type: string;
    options?: string[];
    is_required: boolean;
    sort_order?: number;
  }>,
): Promise<{ message: string }> {
  return apiClient.put(`/api/organizer/events/${id}/custom-fields`, fields);
}

// ─── Registrations ────────────────────────────────────────────────────────────

export async function getEventRegistrations(
  id: string,
  options: { page?: number; limit?: number; status?: string } = {},
): Promise<PaginatedResponse<OrganizerRegistration>> {
  const params = new URLSearchParams();
  if (options.page) params.set('page', String(options.page));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.status) params.set('status', options.status);
  const qs = params.toString();
  return apiClient.get<PaginatedResponse<OrganizerRegistration>>(
    `/api/organizer/events/${id}/registrations${qs ? `?${qs}` : ''}`,
  );
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function inviteMember(email: string): Promise<{ message: string; token: string }> {
  return apiClient.post('/api/organizer/members/invite', { email });
}
