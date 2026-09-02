import { apiClient } from './client';
import type { Location, Tag, EligibilityCategory } from '@/lib/types';

export async function getLocations(): Promise<Location[]> {
  return apiClient.get<Location[]>('/api/locations', { skipAuth: true });
}

export async function getTags(): Promise<Tag[]> {
  return apiClient.get<Tag[]>('/api/tags', { skipAuth: true });
}

export async function getEligibilityCategories(): Promise<EligibilityCategory[]> {
  return apiClient.get<EligibilityCategory[]>('/api/eligibility-categories', {
    skipAuth: true,
  });
}
