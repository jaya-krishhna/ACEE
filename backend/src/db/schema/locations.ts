import { pgTable, serial, text, doublePrecision, unique } from 'drizzle-orm/pg-core';

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

export const eligibilityCategories = pgTable('eligibility_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});
