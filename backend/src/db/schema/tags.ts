import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tags = pgTable(
  'tags',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
    category: text('category').notNull(),
  },
  (table) => [
    sql`CONSTRAINT "tags_category_check" CHECK (category IN ('domain','technology','theme'))`,
  ],
);
