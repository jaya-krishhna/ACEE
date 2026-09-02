import { eq, and } from 'drizzle-orm';
import { tags, eligibilityCategories } from '../db/schema';

/**
 * Normalizes a display label into a clean, canonical slug.
 * Trims leading/trailing whitespace, converts to lowercase,
 * replaces runs of whitespace with a single hyphen, strips characters
 * that aren't alphanumeric or hyphen, collapses repeated hyphens,
 * and trims leading/trailing hyphens.
 */
export function normalizeToSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Gets an existing system-level or org-scoped custom tag, or creates a new org-scoped custom tag.
 * Dedups on slug. Preserves display casing for newly created custom tags.
 */
export async function getOrCreateTag(
  dbOrTx: any,
  label: string,
  category: 'domain' | 'technology' | 'theme',
  organizationId: string,
): Promise<any> {
  const trimmedLabel = label.trim();
  const slug = normalizeToSlug(trimmedLabel);

  // 1. Look for an existing system-level row first
  const [existingSystem] = await dbOrTx
    .select()
    .from(tags)
    .where(and(eq(tags.slug, slug), eq(tags.isSystem, true)))
    .limit(1);

  if (existingSystem) {
    return existingSystem;
  }

  // 2. Look for an existing org-scoped custom row
  const [existingOrg] = await dbOrTx
    .select()
    .from(tags)
    .where(
      and(
        eq(tags.slug, slug),
        eq(tags.isSystem, false),
        eq(tags.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (existingOrg) {
    return existingOrg;
  }

  // 3. Insert a new org-scoped custom row
  try {
    const [inserted] = await dbOrTx
      .insert(tags)
      .values({
        name: trimmedLabel,
        slug,
        category,
        organizationId,
        isSystem: false,
      })
      .returning();
    return inserted;
  } catch (err: any) {
    // 4. Handle race-condition unique constraint violation gracefully
    const [sysMatch] = await dbOrTx
      .select()
      .from(tags)
      .where(and(eq(tags.slug, slug), eq(tags.isSystem, true)))
      .limit(1);
    if (sysMatch) return sysMatch;

    const [orgMatch] = await dbOrTx
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.slug, slug),
          eq(tags.isSystem, false),
          eq(tags.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (orgMatch) return orgMatch;

    throw err;
  }
}

/**
 * Gets an existing system-level or org-scoped custom eligibility category, or creates a new org-scoped custom category.
 * Dedups on slug. Preserves display casing for newly created custom categories.
 */
export async function getOrCreateEligibilityCategory(
  dbOrTx: any,
  label: string,
  organizationId: string,
): Promise<any> {
  const trimmedLabel = label.trim();
  const slug = normalizeToSlug(trimmedLabel);

  // 1. Look for an existing system-level row first
  const [existingSystem] = await dbOrTx
    .select()
    .from(eligibilityCategories)
    .where(and(eq(eligibilityCategories.slug, slug), eq(eligibilityCategories.isSystem, true)))
    .limit(1);

  if (existingSystem) {
    return existingSystem;
  }

  // 2. Look for an existing org-scoped custom row
  const [existingOrg] = await dbOrTx
    .select()
    .from(eligibilityCategories)
    .where(
      and(
        eq(eligibilityCategories.slug, slug),
        eq(eligibilityCategories.isSystem, false),
        eq(eligibilityCategories.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (existingOrg) {
    return existingOrg;
  }

  // 3. Insert a new org-scoped custom row
  try {
    const [inserted] = await dbOrTx
      .insert(eligibilityCategories)
      .values({
        name: trimmedLabel,
        slug,
        organizationId,
        isSystem: false,
      })
      .returning();
    return inserted;
  } catch (err: any) {
    // 4. Handle race-condition unique constraint violation gracefully
    const [sysMatch] = await dbOrTx
      .select()
      .from(eligibilityCategories)
      .where(and(eq(eligibilityCategories.slug, slug), eq(eligibilityCategories.isSystem, true)))
      .limit(1);
    if (sysMatch) return sysMatch;

    const [orgMatch] = await dbOrTx
      .select()
      .from(eligibilityCategories)
      .where(
        and(
          eq(eligibilityCategories.slug, slug),
          eq(eligibilityCategories.isSystem, false),
          eq(eligibilityCategories.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (orgMatch) return orgMatch;

    throw err;
  }
}
