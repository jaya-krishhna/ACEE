// Shared TypeScript types for the event platform frontend.
// These map directly to the confirmed API response shapes from /api-docs.

// ─── Reference data ───────────────────────────────────────────────────────────

export interface Location {
  id: number;
  city: string;
  state: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  category: 'domain' | 'technology' | 'theme';
}

export interface EligibilityCategory {
  id: number;
  name: string;
  slug: string;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type EventType = 'hackathon' | 'workshop' | 'internship';
export type EventMode = 'online' | 'offline' | 'hybrid';
export type EventStatus =
  'draft' | 'published' | 'registration_closed' | 'completed' | 'hidden' | 'archived';

/** Lightweight shape returned by GET /api/events and saved/registration lists */
export interface EventCard {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  event_type: EventType;
  banner_image_url: string | null;
  organization: { name: string };
  /** String: "Online Event" | city name */
  location: string;
  event_start_at: string;
  registration_close_at: string | null;
  is_paid: boolean;
  registration_fee: number;
  prize_summary_text?: string | null;
}

export interface EventContact {
  id: number;
  name: string;
  phone: string;
  email: string;
  role_label: string | null;
  sort_order: number;
}

export interface HackathonDetails {
  max_participants: number | null;
  prize_summary_text: string | null;
  tracks: string[];
  submission_type: string | null;
}

export interface WorkshopDetails {
  speaker_name: string | null;
  speaker_bio: string | null;
  duration_hours: number | null;
  seats_available: number | null;
  certificate_provided: boolean;
  prerequisite_skills: string[];
}

export interface InternshipDetails {
  stipend_min: number | null;
  stipend_max: number | null;
  duration_months: number | null;
  work_mode: 'remote' | 'onsite' | 'hybrid' | null;
  positions_available: number | null;
  min_experience_months: number;
  perks: string[];
}

/** Full shape returned by GET /api/events/:slug */
export interface EventDetail {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string;
  event_type: EventType;
  mode: EventMode;
  venue: string | null;
  /** "Online Event" string for online, or {city,state,country} for offline/hybrid */
  location: string | { city: string; state: string | null; country: string };
  timezone: string;
  banner_image_url: string | null;
  is_paid: boolean;
  registration_fee: number;
  currency: string;
  resume_required: boolean;
  registration_open_at: string | null;
  registration_close_at: string | null;
  event_start_at: string;
  event_end_at: string | null;
  eligibility_notes: string | null;
  organization: {
    name: string;
    logo_url: string | null;
    is_verified: boolean;
    org_type: string;
    website_url: string | null;
  };
  hackathon_details?: HackathonDetails;
  workshop_details?: WorkshopDetails;
  internship_details?: InternshipDetails;
  tags: Tag[];
  eligibility_categories: EligibilityCategory[];
  contacts: EventContact[];
}

// ─── Custom fields ─────────────────────────────────────────────────────────────

export type CustomFieldType =
  'text' | 'textarea' | 'select' | 'multiselect' | 'file' | 'checkbox' | 'date' | 'url';

export interface CustomField {
  id: number;
  event_id: string;
  label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
}

// ─── Registrations ────────────────────────────────────────────────────────────

export type RegistrationStatus = 'registered' | 'confirmed' | 'waitlisted' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'not_applicable';

export interface MyRegistration extends EventCard {
  registration_id: string;
  status: RegistrationStatus;
  payment_status: PaymentStatus;
  registered_at: string;
}

export interface OrganizerRegistration {
  id: string;
  student: { name: string; email: string };
  status: RegistrationStatus;
  payment_status: PaymentStatus;
  registered_at: string;
  responses: Array<{ label: string; value: string }>;
}

// ─── Organizer events ─────────────────────────────────────────────────────────

export interface OrganizerEvent {
  id: string;
  slug: string;
  title: string;
  event_type: EventType;
  status: EventStatus;
  mode: EventMode;
  is_paid: boolean;
  registration_fee: number;
  event_start_at: string;
  registration_close_at: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  registration_count: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface StudentUser {
  id: string;
  name: string;
  email: string;
  role: 'student';
}

export interface OrganizerUser {
  id: string;
  name: string;
  email: string;
  role: 'organizer';
  organizationId: string;
  membershipRole: 'owner' | 'member';
}

export type AuthUser = StudentUser | OrganizerUser;

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  data: T[];
}

// ─── API error shape (Phase 6 centralized) ────────────────────────────────────

export interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}
