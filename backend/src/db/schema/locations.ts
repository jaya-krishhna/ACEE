import { pgTable, serial, text, doublePrecision, unique, uuid, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations';

export const locations = pgTable(
  'locations',
  {
    id: serial('id').primaryKey(),
    city: text('city').notNull(),
    state: text('state'),
    country: text('country').notNull().default('India'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
  },
  (table) => [
    unique('locations_city_state_country_unique').on(table.city, table.state, table.country),
  ],
);

export const eligibilityCategories = pgTable(
  'eligibility_categories',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    isSystem: boolean('is_system').notNull().default(false),
  },
  (table) => [
    uniqueIndex('idx_eligibility_categories_slug_system').on(table.slug).where(sql`is_system = true`),
    uniqueIndex('idx_eligibility_categories_org_slug_custom')
      .on(table.organizationId, table.slug)
      .where(sql`is_system = false`),
  ],
);
