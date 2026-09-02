import request from 'supertest';
import { sql, eq } from 'drizzle-orm';
import app from '../app';
import { db } from '../db/client';
import { organizations } from '../db/schema/organizations';
import {
  events,
  hackathonDetails,
  workshopDetails,
  internshipDetails,
  eventTags,
  eventEligibility,
} from '../db/schema/events';
import { tags } from '../db/schema/tags';
import { locations, eligibilityCategories } from '../db/schema/locations';
import { searchQueryLog } from '../db/schema/analytics';
import {
  refreshReferenceCache,
  stopReferenceCacheTimer,
  getExtractionEnums,
} from '../services/referenceCache';
import * as searchExtractionService from '../services/searchExtractionService';

jest.setTimeout(30000);

let orgId: string;
let locBengaluruId: number;
let locChennaiId: number;

let sysTagAI: number;
let sysTagWeb3: number;
let customTagOrg: number;

let sysCatUndergrad: number;
let customCatOrg: number;

let hackathon1Id: string;
let workshop1Id: string;
let internship1Id: string;
let draftEventId: string;

afterAll(() => {
  stopReferenceCacheTimer();
});

beforeAll(async () => {
  // Clear tables
  await db.execute(sql`
    TRUNCATE TABLE 
      users, 
      organizations, 
      organizer_accounts, 
      organization_invitations, 
      refresh_tokens,
      events,
      hackathon_details,
      workshop_details,
      internship_details,
      event_tags,
      event_eligibility,
      locations,
      tags,
      eligibility_categories,
      search_query_log
    RESTART IDENTITY CASCADE;
  `);

  // 1. Seed Locations
  const [bengaluru] = await db
    .insert(locations)
    .values({ city: 'Bengaluru', state: 'Karnataka', country: 'India' })
    .returning();
  locBengaluruId = bengaluru.id;

  const [chennai] = await db
    .insert(locations)
    .values({ city: 'Chennai', state: 'Tamil Nadu', country: 'India' })
    .returning();
  locChennaiId = chennai.id;

  // 2. Seed Organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Search Test Organization',
      orgType: 'company',
      contactEmail: 'contact@searchtest.com',
      isVerified: true,
    })
    .returning();
  orgId = org.id;

  // 3. Seed System Tags & Custom Non-System Tag
  const [tagAI] = await db
    .insert(tags)
    .values({ name: 'AI', slug: 'ai', category: 'domain', isSystem: true })
    .returning();
  sysTagAI = tagAI.id;

  const [tagWeb3] = await db
    .insert(tags)
    .values({ name: 'Web3', slug: 'web3', category: 'domain', isSystem: true })
    .returning();
  sysTagWeb3 = tagWeb3.id;

  const [tagCustom] = await db
    .insert(tags)
    .values({
      name: 'CustomOrgTag',
      slug: 'custom-org-tag',
      category: 'domain',
      organizationId: orgId,
      isSystem: false,
    })
    .returning();
  customTagOrg = tagCustom.id;

  // 4. Seed System Eligibility & Custom Non-System Eligibility Category
  const [catUndergrad] = await db
    .insert(eligibilityCategories)
    .values({ name: 'Undergraduate', slug: 'undergraduate', isSystem: true })
    .returning();
  sysCatUndergrad = catUndergrad.id;

  const [catCustom] = await db
    .insert(eligibilityCategories)
    .values({
      name: 'CustomOrgCategory',
      slug: 'custom-org-category',
      organizationId: orgId,
      isSystem: false,
    })
    .returning();
  customCatOrg = catCustom.id;

  // 5. Seed Events
  const dummyEmbedding = new Array(1536).fill(0.01);
  const now = new Date();

  // Published Hackathons in Bengaluru with AI tag, Undergrad category, free (3 events to reach >= 3 strict candidate threshold)
  const [h1] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      eventType: 'hackathon',
      title: 'AI Grand Hackathon 2026',
      slug: 'ai-grand-hackathon-2026',
      tagline: 'Build AI apps',
      description: 'A 48-hour hackathon focused on generative AI and LLM agents in Bengaluru.',
      mode: 'offline',
      venue: 'Tech Park Auditorium',
      locationId: locBengaluruId,
      isPaid: false,
      registrationFee: '0.00',
      status: 'published',
      eventStartAt: new Date(now.getTime() + 86400000 * 3),
      publishedAt: now,
      embedding: dummyEmbedding,
      embeddingSourceText: 'AI Grand Hackathon 2026. Build AI apps. A 48-hour hackathon focused on generative AI and LLM agents in Bengaluru. AI. Undergraduate. 100k INR pool',
      embeddingUpdatedAt: now,
    })
    .returning();
  hackathon1Id = h1.id;

  await db.insert(hackathonDetails).values({
    eventId: hackathon1Id,
    tracks: ['AI/ML'],
    prizeSummaryText: '100k INR pool',
  });
  await db.insert(eventTags).values([{ eventId: hackathon1Id, tagId: sysTagAI }]);
  await db.insert(eventEligibility).values([{ eventId: hackathon1Id, eligibilityCategoryId: sysCatUndergrad }]);

  const [h2] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      eventType: 'hackathon',
      title: 'AI Sprint Bengaluru',
      slug: 'ai-sprint-bengaluru',
      tagline: 'Fast prototyping',
      description: 'Fast prototyping hackathon in Bengaluru.',
      mode: 'offline',
      venue: 'Main Hall',
      locationId: locBengaluruId,
      isPaid: false,
      registrationFee: '0.00',
      status: 'published',
      eventStartAt: new Date(now.getTime() + 86400000 * 4),
      publishedAt: now,
      embedding: dummyEmbedding,
      embeddingSourceText: 'AI Sprint Bengaluru. Fast prototyping. Fast prototyping hackathon in Bengaluru. AI. Undergraduate',
      embeddingUpdatedAt: now,
    })
    .returning();
  await db.insert(hackathonDetails).values({ eventId: h2.id });
  await db.insert(eventTags).values([{ eventId: h2.id, tagId: sysTagAI }]);
  await db.insert(eventEligibility).values([{ eventId: h2.id, eligibilityCategoryId: sysCatUndergrad }]);

  const [h3] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      eventType: 'hackathon',
      title: 'LLM Builder Fest',
      slug: 'llm-builder-fest',
      tagline: 'Build agents',
      description: 'LLM Builder Fest hackathon in Bengaluru.',
      mode: 'offline',
      venue: 'Lab 3',
      locationId: locBengaluruId,
      isPaid: false,
      registrationFee: '0.00',
      status: 'published',
      eventStartAt: new Date(now.getTime() + 86400000 * 5),
      publishedAt: now,
      embedding: dummyEmbedding,
      embeddingSourceText: 'LLM Builder Fest. Build agents. LLM Builder Fest hackathon in Bengaluru. AI. Undergraduate',
      embeddingUpdatedAt: now,
    })
    .returning();
  await db.insert(hackathonDetails).values({ eventId: h3.id });
  await db.insert(eventTags).values([{ eventId: h3.id, tagId: sysTagAI }]);
  await db.insert(eventEligibility).values([{ eventId: h3.id, eligibilityCategoryId: sysCatUndergrad }]);

  // Published Workshop in Chennai with Web3 tag, Undergrad category, paid (fee=500)
  const [w1] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      eventType: 'workshop',
      title: 'Web3 & Smart Contracts Workshop',
      slug: 'web3-smart-contracts-workshop',
      tagline: 'Master Solidity',
      description: 'Hands-on workshop teaching Ethereum and Solidity smart contracts in Chennai.',
      mode: 'offline',
      venue: 'Hall B',
      locationId: locChennaiId,
      isPaid: true,
      registrationFee: '500.00',
      status: 'published',
      eventStartAt: new Date(now.getTime() + 86400000 * 15),
      publishedAt: now,
      embedding: dummyEmbedding,
      embeddingSourceText: 'Web3 & Smart Contracts Workshop. Master Solidity. Hands-on workshop teaching Ethereum and Solidity smart contracts in Chennai. Web3. Undergraduate',
      embeddingUpdatedAt: now,
    })
    .returning();
  workshop1Id = w1.id;

  await db.insert(workshopDetails).values({
    eventId: workshop1Id,
    speakerName: 'Dr. Blockchain',
    speakerBio: 'Ethereum developer',
  });
  await db.insert(eventTags).values([{ eventId: workshop1Id, tagId: sysTagWeb3 }]);
  await db.insert(eventEligibility).values([{ eventId: workshop1Id, eligibilityCategoryId: sysCatUndergrad }]);

  // Published Internships online with AI tag, paid (stipend) - 3 events starting after day 12 for partial date range testing
  const [i1] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      eventType: 'internship',
      title: 'AI Research Intern 1',
      slug: 'ai-research-intern-1',
      tagline: 'Remote Research',
      description: 'Remote 6-month software engineering internship building AI infrastructure.',
      mode: 'online',
      locationId: null,
      isPaid: false,
      registrationFee: '0.00',
      status: 'published',
      eventStartAt: new Date(now.getTime() + 86400000 * 15),
      publishedAt: now,
      embedding: dummyEmbedding,
      embeddingSourceText: 'AI Research Intern 1. Remote Research. Remote 6-month software engineering internship building AI infrastructure. AI',
      embeddingUpdatedAt: now,
    })
    .returning();
  internship1Id = i1.id;

  await db.insert(internshipDetails).values({
    eventId: internship1Id,
    workMode: 'remote',
    stipendMin: '20000.00',
    perks: ['Certificate', 'PPO'],
  });
  await db.insert(eventTags).values([{ eventId: internship1Id, tagId: sysTagAI }]);

  const [i2] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      eventType: 'internship',
      title: 'AI Research Intern 2',
      slug: 'ai-research-intern-2',
      tagline: 'Remote Research',
      description: 'Remote software engineering internship building AI infrastructure.',
      mode: 'online',
      locationId: null,
      isPaid: false,
      registrationFee: '0.00',
      status: 'published',
      eventStartAt: new Date(now.getTime() + 86400000 * 16),
      publishedAt: now,
      embedding: dummyEmbedding,
      embeddingSourceText: 'AI Research Intern 2. Remote Research. Remote software engineering internship building AI infrastructure. AI',
      embeddingUpdatedAt: now,
    })
    .returning();
  await db.insert(internshipDetails).values({ eventId: i2.id });
  await db.insert(eventTags).values([{ eventId: i2.id, tagId: sysTagAI }]);

  const [i3] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      eventType: 'internship',
      title: 'AI Research Intern 3',
      slug: 'ai-research-intern-3',
      tagline: 'Remote Research',
      description: 'Remote software engineering internship building AI infrastructure.',
      mode: 'online',
      locationId: null,
      isPaid: false,
      registrationFee: '0.00',
      status: 'published',
      eventStartAt: new Date(now.getTime() + 86400000 * 17),
      publishedAt: now,
      embedding: dummyEmbedding,
      embeddingSourceText: 'AI Research Intern 3. Remote Research. Remote software engineering internship building AI infrastructure. AI',
      embeddingUpdatedAt: now,
    })
    .returning();
  await db.insert(internshipDetails).values({ eventId: i3.id });
  await db.insert(eventTags).values([{ eventId: i3.id, tagId: sysTagAI }]);

  // Draft event (must NEVER be returned)
  const [draft] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      eventType: 'hackathon',
      title: 'Secret Draft Hackathon',
      slug: 'secret-draft-hackathon',
      description: 'Unpublished draft hackathon event',
      mode: 'online',
      status: 'draft',
      eventStartAt: new Date(now.getTime() + 86400000 * 20),
    })
    .returning();
  draftEventId = draft.id;

  await db.insert(hackathonDetails).values({ eventId: draftEventId });

  // Refresh in-memory reference cache
  await refreshReferenceCache();
});

describe('Reference Cache Scoping (Correction 4)', () => {
  test('Reference cache strictly includes is_system = true rows ONLY and excludes custom is_system = false rows', async () => {
    await refreshReferenceCache();
    const enums = getExtractionEnums();

    expect(enums.tagNames).toContain('AI');
    expect(enums.tagNames).toContain('Web3');
    expect(enums.tagNames).not.toContain('CustomOrgTag');

    expect(enums.eligibilityNames).toContain('Undergraduate');
    expect(enums.eligibilityNames).not.toContain('CustomOrgCategory');
  });
});

describe('POST /api/search API Endpoint', () => {
  test('1. Pure structured query (no semantic term) returns filtered-only results ordered by start date', async () => {
    jest.spyOn(searchExtractionService, 'extractSearchFilters').mockResolvedValueOnce({
      semantic_search_term: '',
      event_type: 'hackathon',
      location_city_ids: ['Bengaluru'],
      eligibility_category_ids: ['Undergraduate'],
      tag_ids: ['AI'],
      is_paid: false,
      fee_max: null,
      date_range_start: null,
      date_range_end: null,
    });

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'hackathons in Bengaluru for undergraduates' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].id).toBe(hackathon1Id);
    expect(res.body.data[0].title).toBe('AI Grand Hackathon 2026');
    expect(res.body.data[0].relaxed_match).toBe(false);
    expect(res.body.filters_relaxed).toHaveLength(0);
  });

  test('2. Pure semantic query (no filters extracted) invokes BM25+vector+RRF across published set', async () => {
    jest.spyOn(searchExtractionService, 'extractSearchFilters').mockResolvedValueOnce({
      semantic_search_term: 'generative AI agents',
      event_type: null,
      location_city_ids: [],
      eligibility_category_ids: [],
      tag_ids: [],
      is_paid: null,
      fee_max: null,
      date_range_start: null,
      date_range_end: null,
    });

    const res = await request(app).post('/api/search').send({ query: 'generative AI agents' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    // Draft event must not be returned
    const ids = res.body.data.map((item: any) => item.id);
    expect(ids).not.toContain(draftEventId);
  });

  test('3. Combined query restricts candidate set for BOTH ranking legs (non-matching event_type is excluded)', async () => {
    jest.spyOn(searchExtractionService, 'extractSearchFilters').mockResolvedValueOnce({
      semantic_search_term: 'Ethereum smart contracts',
      event_type: 'workshop',
      location_city_ids: [],
      eligibility_category_ids: [],
      tag_ids: [],
      is_paid: null,
      fee_max: null,
      date_range_start: null,
      date_range_end: null,
    });

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'workshop on Ethereum smart contracts' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(workshop1Id);
    expect(res.body.data[0].event_type).toBe('workshop');
  });

  test('4. Empty-array filter fields do not exclude all results (regression test for ANY(ARRAY[]) bug)', async () => {
    jest.spyOn(searchExtractionService, 'extractSearchFilters').mockResolvedValueOnce({
      semantic_search_term: 'AI',
      event_type: null,
      location_city_ids: [],
      eligibility_category_ids: [],
      tag_ids: [],
      is_paid: null,
      fee_max: null,
      date_range_start: null,
      date_range_end: null,
    });

    const res = await request(app).post('/api/search').send({ query: 'AI' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('5. Partial date range works correctly (start bound only)', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 12).toISOString().split('T')[0];

    jest.spyOn(searchExtractionService, 'extractSearchFilters').mockResolvedValueOnce({
      semantic_search_term: '',
      event_type: null,
      location_city_ids: [],
      eligibility_category_ids: [],
      tag_ids: [],
      is_paid: null,
      fee_max: null,
      date_range_start: futureDate,
      date_range_end: null,
    });

    const res = await request(app).post('/api/search').send({ query: `events after ${futureDate}` });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data[0].relaxed_match).toBe(false);
    // Verify hackathons starting before futureDate (days 3, 4, 5) were strictly excluded
    const ids = res.body.data.map((item: any) => item.id);
    expect(ids).not.toContain(hackathon1Id);
  });

  test('6. Progressive relaxation drops optional filters in correct priority order and flags relaxed_match: true', async () => {
    // Request a workshop in Bengaluru with Undergraduate eligibility and Web3 tag
    // No single workshop matches all of these strictly, so relaxation will trigger
    jest.spyOn(searchExtractionService, 'extractSearchFilters').mockResolvedValueOnce({
      semantic_search_term: '',
      event_type: 'workshop',
      location_city_ids: ['Bengaluru'],
      eligibility_category_ids: ['Undergraduate'],
      tag_ids: ['Web3'],
      is_paid: null,
      fee_max: null,
      date_range_start: null,
      date_range_end: null,
    });

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'Web3 workshop in Bengaluru for undergraduates' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].relaxed_match).toBe(true);
    expect(res.body.filters_relaxed.length).toBeGreaterThan(0);
    // Relaxed priority: eligibility_category_ids -> tag_ids -> date_range -> location_city_ids
    expect(res.body.filters_relaxed[0]).toBe('eligibility_category_ids');
  });

  test('7. Hard filters event_type and status = published are NEVER relaxed even when results are 0', async () => {
    // Request a workshop in Bengaluru with fee_max = 10 (our workshop in Chennai costs 500)
    jest.spyOn(searchExtractionService, 'extractSearchFilters').mockResolvedValueOnce({
      semantic_search_term: '',
      event_type: 'workshop',
      location_city_ids: ['Bengaluru'],
      eligibility_category_ids: [],
      tag_ids: [],
      is_paid: true,
      fee_max: 10,
      date_range_start: null,
      date_range_end: null,
    });

    const res = await request(app)
      .post('/api/search')
      .send({ query: 'paid workshop under 10 INR in Bengaluru' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test('8. search_query_log table receives a log row per request', async () => {
    const uniqueQuery = 'Logging test query ' + Date.now();

    jest.spyOn(searchExtractionService, 'extractSearchFilters').mockResolvedValueOnce({
      semantic_search_term: 'Logging test query',
      event_type: null,
      location_city_ids: [],
      eligibility_category_ids: [],
      tag_ids: [],
      is_paid: null,
      fee_max: null,
      date_range_start: null,
      date_range_end: null,
    });

    const res = await request(app).post('/api/search').send({ query: uniqueQuery });
    expect(res.status).toBe(200);

    const [logRow] = await db
      .select()
      .from(searchQueryLog)
      .where(eq(searchQueryLog.rawQuery, uniqueQuery))
      .limit(1);

    expect(logRow).toBeDefined();
    expect(logRow.rawQuery).toBe(uniqueQuery);
    expect(logRow.resultsCount).toBe(res.body.pagination.total);
  });

  test('9. Validation error when query field is missing or empty', async () => {
    const resMissing = await request(app).post('/api/search').send({});
    expect(resMissing.status).toBe(400);

    const resEmpty = await request(app).post('/api/search').send({ query: '   ' });
    expect(resEmpty.status).toBe(400);
  });
});
