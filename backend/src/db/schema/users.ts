import { pgTable, uuid, text, smallint, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { locations } from './locations';
import { events } from './events';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  authProvider: text('auth_provider').notNull().default('email'),
  phone: text('phone'),
  resumeUrl: text('resume_url'),
  collegeName: text('college_name'),
  branch: text('branch'),
  yearOfStudy: smallint('year_of_study'),
  cityId: integer('city_id').references(() => locations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const savedEvents = pgTable(
  'saved_events',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.eventId] })],
);
