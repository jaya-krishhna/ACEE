import { apiClient } from './client';
import type { EventCard, MyRegistration, PaginatedResponse } from '@/lib/types';

export async function getMySavedEvents(
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<EventCard>> {
  return apiClient.get<PaginatedResponse<EventCard>>(
    `/api/users/me/saved?page=${page}&limit=${limit}`,
  );
}

export async function getMyRegistrations(
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<MyRegistration>> {
  return apiClient.get<PaginatedResponse<MyRegistration>>(
    `/api/users/me/registrations?page=${page}&limit=${limit}`,
  );
}
