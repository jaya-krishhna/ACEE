import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  customType,
  index,
  primaryKey,
  jsonb,
  smallint,
  serial,
} from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, organizerAccounts } from './organizations';
import { locations, eligibilityCategories } from './locations';
import { tags } from './tags';

// Custom tsvector type for Postgres full-text search
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => organizerAccounts.id),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    tagline: text('tagline'),
    description: text('description').notNull(),
    thumbnailImageUrl: text('thumbnail_image_url'),
    bannerImageUrl: text('banner_image_url'),
    documentUrl: text('document_url'),
    externalRegistrationUrl: text('external_registration_url'),
    status: text('status').notNull().default('draft'),
    flaggedReason: text('flagged_reason'),
    mode: text('mode').notNull(),
    venue: text('venue'),
    locationId: integer('location_id').references(() => locations.id),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    isPaid: boolean('is_paid').notNull().default(false),
    registrationFee: numeric('registration_fee', { precision: 10, scale: 2 }).default('0'),
    currency: text('currency').notNull().default('INR'),
    feeConfidence: text('fee_confidence').default('explicit'),
    resumeRequired: boolean('resume_required').notNull().default(false),
    registrationOpenAt: timestamp('registration_open_at', { withTimezone: true }),
    registrationCloseAt: timestamp('registration_close_at', { withTimezone: true }),
    eventStartAt: timestamp('event_start_at', { withTimezone: true }).notNull(),
    eventEndAt: timestamp('event_end_at', { withTimezone: true }),
    eligibilityNotes: text('eligibility_notes'),
    eligibilityConfidence: text('eligibility_confidence').default('explicit'),
    registrationCount: integer('registration_count').notNull().default(0),
    embedding: vector('embedding', { dimensions: 1536 }),
    embeddingSourceText: text('embedding_source_text'),
    embeddingUpdatedAt: timestamp('embedding_updated_at', { withTimezone: true }),
    searchTextTsv: tsvector('search_text_tsv'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_events_status_type').on(table.status, table.eventType),
    index('idx_events_location').on(table.locationId),
    index('idx_events_dates').on(table.eventStartAt, table.registrationCloseAt),
    index('idx_events_embedding').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('idx_events_search_tsv').using('gin', table.searchTextTsv),
    sql`CONSTRAINT "events_event_type_check" CHECK (event_type IN ('hackathon','workshop','internship'))`,
    sql`CONSTRAINT "events_status_check" CHECK (status IN ('draft','published','registration_closed','completed','hidden','archived'))`,
    sql`CONSTRAINT "events_mode_check" CHECK (mode IN ('online','offline','hybrid'))`,
    sql`CONSTRAINT "events_fee_confidence_check" CHECK (fee_confidence IN ('explicit','inferred'))`,
    sql`CONSTRAINT "events_eligibility_confidence_check" CHECK (eligibility_confidence IN ('explicit','inferred'))`,
  ],
);

export const eventEligibility = pgTable(
  'event_eligibility',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    eligibilityCategoryId: integer('eligibility_category_id')
      .notNull()
      .references(() => eligibilityCategories.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.eligibilityCategoryId] }),
    index('idx_event_eligibility_category').on(table.eligibilityCategoryId),
  ],
);

export const eventTags = pgTable(
  'event_tags',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.tagId] }),
    index('idx_event_tags_tag').on(table.tagId),
  ],
);

export const hackathonDetails = pgTable('hackathon_details', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => events.id, { onDelete: 'cascade' }),
  maxParticipants: integer('max_participants'),
  prizeSummaryText: text('prize_summary_text'),
  tracks: text('tracks').array(),
  submissionType: text('submission_type'),
});

export const workshopDetails = pgTable('workshop_details', {
  eventId: uuid('event_id')
    .primaryKey()
    .references(() => events.id, { onDelete: 'cascade' }),
  speakerName: text('speaker_name'),
  speakerBio: text('speaker_bio'),
  durationHours: numeric('duration_hours', { precision: 4, scale: 1 }),
  seatsAvailable: integer('seats_available'),
  certificateProvided: boolean('certificate_provided').default(false),
  prerequisiteSkills: text('prerequisite_skills').array(),
});

export const internshipDetails = pgTable(
  'internship_details',
  {
    eventId: uuid('event_id')
      .primaryKey()
      .references(() => events.id, { onDelete: 'cascade' }),
    stipendMin: numeric('stipend_min', { precision: 10, scale: 2 }),
    stipendMax: numeric('stipend_max', { precision: 10, scale: 2 }),
    durationMonths: numeric('duration_months', { precision: 4, scale: 1 }),
    workMode: text('work_mode'),
    positionsAvailable: integer('positions_available'),
    minExperienceMonths: integer('min_experience_months').default(0),
    perks: text('perks').array(),
  },
  (table) => [
    sql`CONSTRAINT "internship_details_work_mode_check" CHECK (work_mode IN ('remote','onsite','hybrid'))`,
  ],
);

export const eventCustomFields = pgTable(
  'event_custom_fields',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    fieldType: text('field_type').notNull(),
    options: jsonb('options'),
    isRequired: boolean('is_required').default(false),
    sortOrder: smallint('sort_order').default(0),
  },
  (table) => [
    sql`CONSTRAINT "event_custom_fields_field_type_check" CHECK (field_type IN ('text','textarea','select','multiselect','file','checkbox','date','url'))`,
  ],
);
