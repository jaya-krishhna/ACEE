/**
 * Migration runner script - applies all pending Drizzle migrations
 * including the raw-SQL migrations (vector extension, tsvector trigger).
 * Run via: npx ts-node src/db/migrate.ts  (from /backend directory)
 */
import path from 'path';
import dotenv from 'dotenv';

// Must load env BEFORE importing anything that uses DATABASE_URL
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Make sure .env exists in /backend.');
  process.exit(1);
}

console.log(`Connecting to: ${DATABASE_URL.replace(/:([^@]+)@/, ':****@')}`);

const pool = new Pool({ connectionString: DATABASE_URL });

async function runMigrations() {
  const db = drizzle(pool);
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

  console.log(`Running migrations from: ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('✅ Migrations applied successfully.');

  await pool.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
