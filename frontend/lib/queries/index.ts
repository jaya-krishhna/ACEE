import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  listEvents,
  getEventBySlug,
  saveEvent,
  unsaveEvent,
  registerForEvent,
  cancelRegistration,
} from '@/lib/api/events';
import { getMySavedEvents, getMyRegistrations } from '@/lib/api/users';
import {
  listOrganizerEvents,
  publishEvent,
  unpublishEvent,
  deleteEvent,
  getEventRegistrations,
  getCustomFields,
  setCustomFields,
  uploadBanner,
  inviteMember,
} from '@/lib/api/organizer';
import { getLocations, getTags, getEligibilityCategories } from '@/lib/api/reference';
import type { EventsQuery } from '@/lib/api/events';

// ─── Reference data queries (long staleTime — rarely changes) ─────────────────

export const REFERENCE_STALE = 1000 * 60 * 30; // 30 min

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: getLocations,
    staleTime: REFERENCE_STALE,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: getTags,
    staleTime: REFERENCE_STALE,
  });
}

export function useEligibilityCategories() {
  return useQuery({
    queryKey: ['eligibilityCategories'],
    queryFn: getEligibilityCategories,
    staleTime: REFERENCE_STALE,
  });
}

// ─── Public event listing ─────────────────────────────────────────────────────

export function useEvents(query: EventsQuery) {
  return useQuery({
    queryKey: ['events', query],
    queryFn: () => listEvents(query),
    placeholderData: keepPreviousData,
  });
}

export function useEventDetail(slug: string) {
  return useQuery({
    queryKey: ['event', slug],
    queryFn: () => getEventBySlug(slug),
  });
}

// ─── Save / unsave ────────────────────────────────────────────────────────────

export function useSaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => saveEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savedEvents'] });
    },
  });
}

export function useUnsaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unsaveEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savedEvents'] });
    },
  });
}

// ─── Saved events ─────────────────────────────────────────────────────────────

export function useSavedEvents(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['savedEvents', page, limit],
    queryFn: () => getMySavedEvents(page, limit),
    placeholderData: keepPreviousData,
  });
}

// ─── Registrations (student) ──────────────────────────────────────────────────

export function useMyRegistrations(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['myRegistrations', page, limit],
    queryFn: () => getMyRegistrations(page, limit),
    placeholderData: keepPreviousData,
  });
}

export function useRegisterForEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      responses,
    }: {
      id: string;
      responses: Array<{ field_id: number; value: string }>;
    }) => registerForEvent(id, responses),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myRegistrations'] });
    },
  });
}

export function useCancelRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelRegistration(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myRegistrations'] });
    },
  });
}

// ─── Organizer events ─────────────────────────────────────────────────────────

export function useOrganizerEvents(page = 1, limit = 10) {
  return useQuery({
    queryKey: ['organizerEvents', page, limit],
    queryFn: () => listOrganizerEvents(page, limit),
    placeholderData: keepPreviousData,
  });
}

export function usePublishEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizerEvents'] }),
  });
}

export function useUnpublishEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unpublishEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizerEvents'] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizerEvents'] }),
  });
}

// ─── Organizer registrations ──────────────────────────────────────────────────

export function useEventRegistrations(
  eventId: string,
  options: { page?: number; limit?: number; status?: string } = {},
) {
  return useQuery({
    queryKey: ['eventRegistrations', eventId, options],
    queryFn: () => getEventRegistrations(eventId, options),
    placeholderData: keepPreviousData,
  });
}

// ─── Custom fields ────────────────────────────────────────────────────────────

export function useCustomFields(eventId: string) {
  return useQuery({
    queryKey: ['customFields', eventId],
    queryFn: () => getCustomFields(eventId),
  });
}

export function useSetCustomFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Parameters<typeof setCustomFields>[1] }) =>
      setCustomFields(id, fields),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['customFields', id] });
    },
  });
}

// ─── Banner upload ────────────────────────────────────────────────────────────

export function useUploadBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadBanner(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizerEvents'] }),
  });
}

// ─── Member invite ────────────────────────────────────────────────────────────

export function useInviteMember() {
  return useMutation({
    mutationFn: (email: string) => inviteMember(email),
  });
}
