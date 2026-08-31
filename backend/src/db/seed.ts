/**
 * Seed script — populates locations and tags with reference data.
 * Idempotent: safe to run multiple times (uses ON CONFLICT DO NOTHING).
 * Run via: npm run db:seed   (from /backend directory)
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { locations, tags } from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// ──────────────────────────────────────────────────────────────
// Reference data
// ──────────────────────────────────────────────────────────────

const CITIES = [
  { city: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777 },
  { city: 'Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.209 },
  { city: 'Bengaluru', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
  { city: 'Hyderabad', state: 'Telangana', latitude: 17.385, longitude: 78.4867 },
  { city: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707 },
  { city: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
  { city: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567 },
  { city: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714 },
  { city: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
  { city: 'Surat', state: 'Gujarat', latitude: 21.1702, longitude: 72.8311 },
  { city: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
  { city: 'Kanpur', state: 'Uttar Pradesh', latitude: 26.4499, longitude: 80.3319 },
  { city: 'Nagpur', state: 'Maharashtra', latitude: 21.1458, longitude: 79.0882 },
  { city: 'Indore', state: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577 },
  { city: 'Coimbatore', state: 'Tamil Nadu', latitude: 11.0168, longitude: 76.9558 },
  { city: 'Kochi', state: 'Kerala', latitude: 9.9312, longitude: 76.2673 },
  { city: 'Bhubaneswar', state: 'Odisha', latitude: 20.2961, longitude: 85.8245 },
  { city: 'Chandigarh', state: 'Punjab', latitude: 30.7333, longitude: 76.7794 },
];

const TAGS = [
  // Domain
  { name: 'AI', slug: 'ai', category: 'domain' as const },
  { name: 'Web3', slug: 'web3', category: 'domain' as const },
  { name: 'FinTech', slug: 'fintech', category: 'domain' as const },
  { name: 'HealthTech', slug: 'healthtech', category: 'domain' as const },
  { name: 'Sustainability', slug: 'sustainability', category: 'domain' as const },
  { name: 'EdTech', slug: 'edtech', category: 'domain' as const },
  { name: 'IoT', slug: 'iot', category: 'domain' as const },
  // Technology
  { name: 'React', slug: 'react', category: 'technology' as const },
  { name: 'Python', slug: 'python', category: 'technology' as const },
  { name: 'Blockchain', slug: 'blockchain', category: 'technology' as const },
  { name: 'ML', slug: 'ml', category: 'technology' as const },
  // Theme
  { name: 'Beginner-friendly', slug: 'beginner-friendly', category: 'theme' as const },
  { name: 'Open Source', slug: 'open-source', category: 'theme' as const },
  { name: 'Social Good', slug: 'social-good', category: 'theme' as const },
];

// ──────────────────────────────────────────────────────────────
// Seed functions
// ──────────────────────────────────────────────────────────────

async function seedLocations() {
  console.log('Seeding locations...');
  for (const city of CITIES) {
    await db
      .insert(locations)
      .values({ ...city, country: 'India' })
      .onConflictDoNothing();
  }
  console.log(`  ✅ ${CITIES.length} cities inserted (or already existed).`);
}

async function seedTags() {
  console.log('Seeding tags...');
  for (const tag of TAGS) {
    await db.insert(tags).values(tag).onConflictDoNothing();
  }
  console.log(`  ✅ ${TAGS.length} tags inserted (or already existed).`);
}

async function main() {
  console.log('Starting seed...');
  await seedLocations();
  await seedTags();
  console.log('\n🌱 Seed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
