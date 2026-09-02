import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { events } from '../db/schema';

/**
 * Converts an event title into a clean, URL-friendly slug prefix.
 * Lowercases text, replaces non-alphanumeric characters with hyphens,
 * collapses repeated hyphens, trims leading/trailing hyphens,
 * and truncates to a maximum length (default 60 chars).
 */
export function slugify(title: string, maxLength: number = 60): string {
  let cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!cleaned) {
    cleaned = 'event';
  }

  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength).replace(/-+$/, '');
  }

  return cleaned;
}

/**
 * Generates a short random alphanumeric suffix (5-6 chars).
 */
export function generateRandomSuffix(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let suffix = '';
  for (let i = 0; i < length; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return suffix;
}

/**
 * Generates a human-readable, unique event slug formatted as {title-slug}-{short-unique-suffix}.
 * Checks against the database to guarantee uniqueness prior to insertion.
 */
export async function generateUniqueSlug(
  title: string,
  dbOrTx: any,
  maxRetries: number = 5,
): Promise<string> {
  const baseSlug = slugify(title);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const suffix = generateRandomSuffix(6);
    const candidateSlug = `${baseSlug}-${suffix}`;

    const [existing] = await dbOrTx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, candidateSlug))
      .limit(1);

    if (!existing) {
      return candidateSlug;
    }
  }

  // Fallback in the extremely unlikely event of multiple collisions
  return `${baseSlug}-${generateRandomSuffix(8)}`;
}
