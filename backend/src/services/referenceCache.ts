import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { locations, eligibilityCategories } from '../db/schema/locations';
import { tags } from '../db/schema/tags';

// In-memory cache structures
let cityCache: Map<string, number> = new Map();
let tagCache: Map<string, number> = new Map();
let eligibilityCache: Map<string, number> = new Map();

let cacheRefreshTimer: NodeJS.Timeout | null = null;

/**
 * Refreshes the in-memory reference data caches:
 * - cityCache: Map<cityDisplayLabel, location_id> from locations.
 *   Disambiguates duplicate city names across states to "City, State".
 * - tagCache: Map<tagName, tag_id> from tags WHERE is_system = true ONLY.
 * - eligibilityCache: Map<categoryName, category_id> from eligibility_categories WHERE is_system = true ONLY.
 */
export async function refreshReferenceCache(): Promise<void> {
  // 1. Refresh city cache
  const allLocations = await db
    .select({
      id: locations.id,
      city: locations.city,
      state: locations.state,
      country: locations.country,
    })
    .from(locations);

  const cityCounts = new Map<string, number>();
  for (const loc of allLocations) {
    const cityName = loc.city.trim();
    cityCounts.set(cityName, (cityCounts.get(cityName) || 0) + 1);
  }

  const newCityCache = new Map<string, number>();
  for (const loc of allLocations) {
    const cityName = loc.city.trim();
    let label = cityName;
    if ((cityCounts.get(cityName) || 0) > 1 && loc.state) {
      label = `${cityName}, ${loc.state.trim()}`;
    }
    newCityCache.set(label, loc.id);
    // Also set case-insensitive fallback key in map if needed
    newCityCache.set(label.toLowerCase(), loc.id);
  }
  cityCache = newCityCache;

  // 2. Refresh tag cache (is_system = true ONLY)
  const systemTags = await db
    .select({
      id: tags.id,
      name: tags.name,
    })
    .from(tags)
    .where(eq(tags.isSystem, true));

  const newTagCache = new Map<string, number>();
  for (const t of systemTags) {
    newTagCache.set(t.name.trim(), t.id);
    newTagCache.set(t.name.trim().toLowerCase(), t.id);
  }
  tagCache = newTagCache;

  // 3. Refresh eligibility cache (is_system = true ONLY)
  const systemEligibility = await db
    .select({
      id: eligibilityCategories.id,
      name: eligibilityCategories.name,
    })
    .from(eligibilityCategories)
    .where(eq(eligibilityCategories.isSystem, true));

  const newEligibilityCache = new Map<string, number>();
  for (const e of systemEligibility) {
    newEligibilityCache.set(e.name.trim(), e.id);
    newEligibilityCache.set(e.name.trim().toLowerCase(), e.id);
  }
  eligibilityCache = newEligibilityCache;
}

/**
 * Returns current live enums for Gemini extraction JSON Schema generation.
 */
export function getExtractionEnums(): {
  cityLabels: string[];
  tagNames: string[];
  eligibilityNames: string[];
} {
  // Collect non-lowercase exact display labels for the schema
  const cityLabels: string[] = [];
  for (const key of cityCache.keys()) {
    // Only include keys that are not strictly lowercased duplicates unless the key itself was lowercased
    if (!cityLabels.includes(key)) {
      cityLabels.push(key);
    }
  }

  const tagNames: string[] = [];
  for (const key of tagCache.keys()) {
    if (!tagNames.includes(key)) {
      tagNames.push(key);
    }
  }

  const eligibilityNames: string[] = [];
  for (const key of eligibilityCache.keys()) {
    if (!eligibilityNames.includes(key)) {
      eligibilityNames.push(key);
    }
  }

  return {
    cityLabels: Array.from(new Set(cityLabels)),
    tagNames: Array.from(new Set(tagNames)),
    eligibilityNames: Array.from(new Set(eligibilityNames)),
  };
}

/**
 * Resolves extracted city display labels to integer location_ids.
 */
export function resolveCityIds(labels: string[]): number[] {
  if (!labels || !Array.isArray(labels)) return [];
  const ids: number[] = [];
  for (const label of labels) {
    if (!label || typeof label !== 'string') continue;
    const trimmed = label.trim();
    const id = cityCache.get(trimmed) ?? cityCache.get(trimmed.toLowerCase());
    if (id !== undefined && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Resolves extracted tag names to integer tag_ids.
 */
export function resolveTagIds(names: string[]): number[] {
  if (!names || !Array.isArray(names)) return [];
  const ids: number[] = [];
  for (const name of names) {
    if (!name || typeof name !== 'string') continue;
    const trimmed = name.trim();
    const id = tagCache.get(trimmed) ?? tagCache.get(trimmed.toLowerCase());
    if (id !== undefined && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Resolves extracted eligibility category names to integer eligibility_category_ids.
 */
export function resolveEligibilityIds(names: string[]): number[] {
  if (!names || !Array.isArray(names)) return [];
  const ids: number[] = [];
  for (const name of names) {
    if (!name || typeof name !== 'string') continue;
    const trimmed = name.trim();
    const id = eligibilityCache.get(trimmed) ?? eligibilityCache.get(trimmed.toLowerCase());
    if (id !== undefined && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Starts the 5-minute cache auto-refresh timer.
 */
export function startReferenceCacheTimer(intervalMs = 300000): void {
  if (cacheRefreshTimer) return;
  cacheRefreshTimer = setInterval(() => {
    refreshReferenceCache().catch((err) => {
      console.error('[ReferenceCache] Auto-refresh failed:', err);
    });
  }, intervalMs);
}

/**
 * Stops the cache auto-refresh timer (useful for tests/teardown).
 */
export function stopReferenceCacheTimer(): void {
  if (cacheRefreshTimer) {
    clearInterval(cacheRefreshTimer);
    cacheRefreshTimer = null;
  }
}
