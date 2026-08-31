import { pgTable, uuid, serial, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { events } from './events';

export const eventContacts = pgTable(
  'event_contacts',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email').notNull(),
    roleLabel: text('role_label'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_contacts_event').on(table.eventId)],
);
