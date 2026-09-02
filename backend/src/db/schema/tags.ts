import { pgTable, serial, text, uuid, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations';

export const tags = pgTable(
  'tags',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    category: text('category').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    isSystem: boolean('is_system').notNull().default(false),
  },
  (table) => [
    sql`CONSTRAINT "tags_category_check" CHECK (category IN ('domain','technology','theme'))`,
    uniqueIndex('idx_tags_slug_system').on(table.slug).where(sql`is_system = true`),
    uniqueIndex('idx_tags_org_slug_custom').on(table.organizationId, table.slug).where(sql`is_system = false`),
  ],
);
