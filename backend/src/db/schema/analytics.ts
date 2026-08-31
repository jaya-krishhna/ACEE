import { pgTable, bigserial, uuid, text, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { events } from './events';

export const searchQueryLog = pgTable('search_query_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  rawQuery: text('raw_query').notNull(),
  extractedFilters: jsonb('extracted_filters'),
  filtersRelaxed: jsonb('filters_relaxed'),
  resultsCount: integer('results_count'),
  clickedEventId: uuid('clicked_event_id').references(() => events.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
