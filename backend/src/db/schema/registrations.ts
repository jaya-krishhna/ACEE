import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  index,
  bigserial,
  integer,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { events, eventCustomFields } from './events';
import { users } from './users';

export const eventRegistrations = pgTable(
  'event_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('registered'),
    paymentStatus: text('payment_status').notNull().default('not_applicable'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('event_registrations_event_id_user_id_unique').on(table.eventId, table.userId),
    index('idx_event_registrations_event').on(table.eventId),
    sql`CONSTRAINT "event_registrations_status_check" CHECK (status IN ('registered','confirmed','waitlisted','cancelled'))`,
    sql`CONSTRAINT "event_registrations_payment_status_check" CHECK (payment_status IN ('pending','paid','failed','not_applicable'))`,
  ],
);

export const eventRegistrationResponses = pgTable('event_registration_responses', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  registrationId: uuid('registration_id')
    .notNull()
    .references(() => eventRegistrations.id, { onDelete: 'cascade' }),
  fieldId: integer('field_id')
    .notNull()
    .references(() => eventCustomFields.id, { onDelete: 'cascade' }),
  value: text('value'),
});
