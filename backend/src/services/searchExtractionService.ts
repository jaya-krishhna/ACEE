import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config';
import { getExtractionEnums } from './referenceCache';

export interface ExtractedFilters {
  semantic_search_term: string;
  event_type: 'hackathon' | 'workshop' | 'internship' | null;
  location_city_ids: string[];
  eligibility_category_ids: string[];
  tag_ids: string[];
  is_paid: boolean | null;
  fee_max: number | null;
  date_range_start: string | null;
  date_range_end: string | null;
}

export interface ResolvedFilters {
  semantic_search_term: string;
  event_type: 'hackathon' | 'workshop' | 'internship' | null;
  location_city_ids: number[];
  eligibility_category_ids: number[];
  tag_ids: number[];
  is_paid: boolean | null;
  fee_max: number | null;
  date_range_start: string | null;
  date_range_end: string | null;
  raw_extracted: ExtractedFilters;
}

/**
 * Performs structured extraction on a natural-language search query using Gemini SDK responseSchema mode.
 */
export async function extractSearchFilters(rawQuery: string): Promise<ExtractedFilters> {
  const enums = getExtractionEnums();
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const modelName = config.geminiFlashModel || 'gemini-2.5-flash';

  const todayStr = new Date().toISOString().split('T')[0];

  const systemInstruction = `You are a search query extraction assistant for a college event platform in India. Today's date is ${todayStr}.
Extract only what is explicitly stated or unambiguously implied. Never select a value not present in the provided enum lists. When uncertain, prefer null/empty over guessing.
For relative date expressions (e.g. "this week", "next month", "in October"), resolve them relative to today's date (${todayStr}).
Output JSON matching the strict schema.`;

  // Dynamic schema definition for Gemini SDK
  const jsonSchema = {
    type: Type.OBJECT,
    properties: {
      semantic_search_term: {
        type: Type.STRING,
        description: 'The meaningful descriptive phrase left after structured fields are extracted. Empty string if purely structural.',
      },
      event_type: {
        type: Type.STRING,
        enum: ['hackathon', 'workshop', 'internship'],
        nullable: true,
      },
      location_city_ids: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          enum: enums.cityLabels.length > 0 ? enums.cityLabels : ['Bengaluru', 'Chennai', 'Coimbatore', 'Mumbai', 'Delhi'],
        },
      },
      eligibility_category_ids: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          enum: enums.eligibilityNames.length > 0 ? enums.eligibilityNames : ['Undergraduate', 'Postgraduate', 'School Student', 'Open to All'],
        },
      },
      tag_ids: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          enum: enums.tagNames.length > 0 ? enums.tagNames : ['AI', 'Web3', 'FinTech', 'HealthTech', 'React', 'Python', 'Beginner-friendly'],
        },
      },
      is_paid: {
        type: Type.BOOLEAN,
        nullable: true,
      },
      fee_max: {
        type: Type.NUMBER,
        nullable: true,
      },
      date_range_start: {
        type: Type.STRING,
        nullable: true,
      },
      date_range_end: {
        type: Type.STRING,
        nullable: true,
      },
    },
    required: [
      'semantic_search_term',
      'event_type',
      'location_city_ids',
      'eligibility_category_ids',
      'tag_ids',
      'is_paid',
      'fee_max',
      'date_range_start',
      'date_range_end',
    ],
  };

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return fallbackExtraction(rawQuery, enums);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        { role: 'system', parts: [{ text: systemInstruction }] },
        { role: 'user', parts: [{ text: rawQuery }] },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: jsonSchema as any,
      },
    });

    const text = response.text;
    if (!text) {
      return fallbackExtraction(rawQuery, enums);
    }

    const parsed = JSON.parse(text) as ExtractedFilters;
    return sanitizeExtractionResult(parsed);
  } catch (err: any) {
    console.warn(`[SearchExtraction] Gemini extraction API call failed (${err.message}). Using fallback extraction.`);
    return fallbackExtraction(rawQuery, enums);
  }
}

/**
 * Ensures nulls and empty arrays are normalized correctly.
 */
function sanitizeExtractionResult(parsed: any): ExtractedFilters {
  return {
    semantic_search_term: typeof parsed.semantic_search_term === 'string' ? parsed.semantic_search_term.trim() : '',
    event_type: ['hackathon', 'workshop', 'internship'].includes(parsed.event_type) ? parsed.event_type : null,
    location_city_ids: Array.isArray(parsed.location_city_ids) ? parsed.location_city_ids.filter((x: any) => typeof x === 'string') : [],
    eligibility_category_ids: Array.isArray(parsed.eligibility_category_ids)
      ? parsed.eligibility_category_ids.filter((x: any) => typeof x === 'string')
      : [],
    tag_ids: Array.isArray(parsed.tag_ids) ? parsed.tag_ids.filter((x: any) => typeof x === 'string') : [],
    is_paid: typeof parsed.is_paid === 'boolean' ? parsed.is_paid : null,
    fee_max: typeof parsed.fee_max === 'number' ? parsed.fee_max : null,
    date_range_start: typeof parsed.date_range_start === 'string' ? parsed.date_range_start : null,
    date_range_end: typeof parsed.date_range_end === 'string' ? parsed.date_range_end : null,
  };
}

/**
 * Deterministic rule-based fallback extraction when GEMINI_API_KEY is not configured or fails.
 */
export function fallbackExtraction(
  rawQuery: string,
  enums: { cityLabels: string[]; tagNames: string[]; eligibilityNames: string[] },
): ExtractedFilters {
  const lowerQuery = rawQuery.toLowerCase();

  let eventType: 'hackathon' | 'workshop' | 'internship' | null = null;
  if (lowerQuery.includes('hackathon')) eventType = 'hackathon';
  else if (lowerQuery.includes('workshop')) eventType = 'workshop';
  else if (lowerQuery.includes('internship')) eventType = 'internship';

  const matchedCities: string[] = [];
  for (const cityLabel of enums.cityLabels) {
    const mainCity = cityLabel.split(',')[0].trim().toLowerCase();
    if (lowerQuery.includes(mainCity)) {
      matchedCities.push(cityLabel);
    }
  }

  const matchedTags: string[] = [];
  for (const tagName of enums.tagNames) {
    if (lowerQuery.includes(tagName.toLowerCase())) {
      matchedTags.push(tagName);
    }
  }

  const matchedEligibility: string[] = [];
  for (const catName of enums.eligibilityNames) {
    if (lowerQuery.includes(catName.toLowerCase())) {
      matchedEligibility.push(catName);
    }
  }

  let isPaid: boolean | null = null;
  if (lowerQuery.includes('free')) {
    isPaid = false;
  } else if (lowerQuery.includes('paid')) {
    isPaid = true;
  }

  // Remove matched structural terms to form semantic_search_term
  let semanticTerm = rawQuery;
  const structuralWords = ['hackathon', 'hackathons', 'workshop', 'workshops', 'internship', 'internships', 'free', 'paid', 'in', 'for', 'online', 'offline'];
  for (const city of matchedCities) {
    const mainCity = city.split(',')[0].trim();
    semanticTerm = semanticTerm.replace(new RegExp(mainCity, 'gi'), '');
  }
  for (const tag of matchedTags) {
    semanticTerm = semanticTerm.replace(new RegExp(tag, 'gi'), '');
  }
  for (const cat of matchedEligibility) {
    semanticTerm = semanticTerm.replace(new RegExp(cat, 'gi'), '');
  }
  for (const word of structuralWords) {
    semanticTerm = semanticTerm.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  }
  semanticTerm = semanticTerm.replace(/\s+/g, ' ').trim();

  return {
    semantic_search_term: semanticTerm,
    event_type: eventType,
    location_city_ids: matchedCities,
    eligibility_category_ids: matchedEligibility,
    tag_ids: matchedTags,
    is_paid: isPaid,
    fee_max: null,
    date_range_start: null,
    date_range_end: null,
  };
}
