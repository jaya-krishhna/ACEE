import { GoogleGenAI } from '@google/genai';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db/client';
import {
  events,
  hackathonDetails,
  workshopDetails,
  internshipDetails,
  eventTags,
  tags,
  eventEligibility,
  eligibilityCategories,
} from '../db/schema';
import { config } from '../config';

/**
 * Builds the embedding_source_text string for an event by concatenating non-empty text parts:
 * Always included if present:
 * - title
 * - tagline (skip if null/empty)
 * - description
 *
 * Always included (skip if resolved list is empty):
 * - resolved tag names, comma-joined (via event_tags -> tags)
 * - resolved eligibility_category names, comma-joined (via event_eligibility -> eligibility_categories)
 * - eligibility_notes (skip if null/empty)
 *
 * Appended based on event_type (skip if null/empty):
 * - hackathon: tracks (comma-joined), prize_summary_text
 * - workshop: speaker_bio, prerequisite_skills (comma-joined)
 * - internship: perks (comma-joined)
 *
 * Joined with ". " (period + space).
 */
export async function buildEmbeddingSourceText(eventId: string): Promise<string | null> {
  const [event] = await db
    .select({
      id: events.id,
      title: events.title,
      tagline: events.tagline,
      description: events.description,
      eventType: events.eventType,
      eligibilityNotes: events.eligibilityNotes,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    return null;
  }

  // Resolved tag names (comma-joined)
  const tagRows = await db
    .select({ name: tags.name })
    .from(eventTags)
    .innerJoin(tags, eq(eventTags.tagId, tags.id))
    .where(eq(eventTags.eventId, eventId))
    .orderBy(asc(tags.name));
  const tagNames = tagRows
    .map((t) => t.name)
    .filter((n): n is string => Boolean(n && typeof n === 'string' && n.trim().length > 0));

  // Resolved eligibility category names (comma-joined)
  const categoryRows = await db
    .select({ name: eligibilityCategories.name })
    .from(eventEligibility)
    .innerJoin(eligibilityCategories, eq(eventEligibility.eligibilityCategoryId, eligibilityCategories.id))
    .where(eq(eventEligibility.eventId, eventId))
    .orderBy(asc(eligibilityCategories.name));
  const categoryNames = categoryRows
    .map((c) => c.name)
    .filter((c): c is string => Boolean(c && typeof c === 'string' && c.trim().length > 0));

  const parts: string[] = [];

  const addPart = (val: string | null | undefined) => {
    if (val && typeof val === 'string' && val.trim().length > 0) {
      parts.push(val.trim());
    }
  };

  // Always include, if present:
  addPart(event.title);
  addPart(event.tagline);
  addPart(event.description);

  // Always include (skip individually if resolved list is empty):
  if (tagNames.length > 0) {
    parts.push(tagNames.join(', '));
  }

  if (categoryNames.length > 0) {
    parts.push(categoryNames.join(', '));
  }

  addPart(event.eligibilityNotes);

  // Append type-specific fields:
  if (event.eventType === 'hackathon') {
    const [hDetails] = await db
      .select({
        tracks: hackathonDetails.tracks,
        prizeSummaryText: hackathonDetails.prizeSummaryText,
      })
      .from(hackathonDetails)
      .where(eq(hackathonDetails.eventId, eventId))
      .limit(1);

    if (hDetails) {
      if (hDetails.tracks && Array.isArray(hDetails.tracks)) {
        const tracks = hDetails.tracks.filter(
          (t): t is string => Boolean(t && typeof t === 'string' && t.trim().length > 0),
        );
        if (tracks.length > 0) {
          parts.push(tracks.join(', '));
        }
      }
      addPart(hDetails.prizeSummaryText);
    }
  } else if (event.eventType === 'workshop') {
    const [wDetails] = await db
      .select({
        speakerBio: workshopDetails.speakerBio,
        prerequisiteSkills: workshopDetails.prerequisiteSkills,
      })
      .from(workshopDetails)
      .where(eq(workshopDetails.eventId, eventId))
      .limit(1);

    if (wDetails) {
      addPart(wDetails.speakerBio);
      if (wDetails.prerequisiteSkills && Array.isArray(wDetails.prerequisiteSkills)) {
        const skills = wDetails.prerequisiteSkills.filter(
          (s): s is string => Boolean(s && typeof s === 'string' && s.trim().length > 0),
        );
        if (skills.length > 0) {
          parts.push(skills.join(', '));
        }
      }
    }
  } else if (event.eventType === 'internship') {
    const [iDetails] = await db
      .select({
        perks: internshipDetails.perks,
      })
      .from(internshipDetails)
      .where(eq(internshipDetails.eventId, eventId))
      .limit(1);

    if (iDetails && iDetails.perks && Array.isArray(iDetails.perks)) {
      const perks = iDetails.perks.filter(
        (p): p is string => Boolean(p && typeof p === 'string' && p.trim().length > 0),
      );
      if (perks.length > 0) {
        parts.push(perks.join(', '));
      }
    }
  }

  const cleanedParts = parts.map((p) => p.trim().replace(/\.+$/, ''));
  const lastPart = parts[parts.length - 1];
  const trailingPeriod = lastPart && lastPart.trim().endsWith('.') ? '.' : '';
  return cleanedParts.join('. ') + trailingPeriod;
}

/**
 * Calls Gemini's embedding API requesting explicit output_dimensionality = 1536.
 */
export async function fetchGeminiEmbedding(text: string): Promise<number[]> {
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const modelName = config.geminiEmbeddingModel || 'gemini-embedding-001';

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.embedContent({
    model: modelName,
    contents: text,
    config: {
      outputDimensionality: 1536,
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || !Array.isArray(values)) {
    throw new Error('Gemini embedding API returned no vector values');
  }

  return values;
}

/**
 * Builds the source text, fetches the 1536-dim embedding vector, and updates the database row.
 */
export async function generateAndSaveEmbedding(eventId: string): Promise<void> {
  const sourceText = await buildEmbeddingSourceText(eventId);
  if (!sourceText) {
    return;
  }

  let embeddingVector: number[];
  try {
    embeddingVector = await exports.fetchGeminiEmbedding(sourceText);
  } catch (err: any) {
    if (
      config.nodeEnv === 'development' ||
      config.nodeEnv === 'test' ||
      !config.geminiApiKey ||
      config.geminiApiKey === 'your_gemini_api_key_here' ||
      err.message?.includes('GEMINI_API_KEY') ||
      err.message?.includes('fetch failed')
    ) {
      console.warn(`[EmbeddingService] Using 1536-dim placeholder vector for event ${eventId} (${err.message}).`);
      embeddingVector = new Array(1536).fill(0.01);
    } else {
      throw err;
    }
  }

  await db
    .update(events)
    .set({
      embedding: embeddingVector,
      embeddingSourceText: sourceText,
      embeddingUpdatedAt: new Date(),
    })
    .where(eq(events.id, eventId));
}
