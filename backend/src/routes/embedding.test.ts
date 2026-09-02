import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sql, eq } from 'drizzle-orm';
import app from '../app';
import { db } from '../db/client';
import { organizations, organizerAccounts } from '../db/schema/organizations';
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
import { config } from '../config';
import * as embeddingService from '../services/embeddingService';
import { drainEmbeddingJobs } from '../services/embeddingJob';

jest.setTimeout(30000);

let testTag1Id: number;
let testTag2Id: number;
let testCategoryId: number;
let testLocationId: number;

let orgToken: string;
let orgId: string;
let organizerId: string;

// Helper to generate a 1536-dim dummy vector
const mockVector = new Array(1536).fill(0.05);

async function waitForEmbeddingUpdate(
  eventId: string,
  prevTimestamp: Date | null = null,
  timeoutMs = 5000,
): Promise<any> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const [row] = await db
      .select({
        embedding: events.embedding,
        embeddingSourceText: events.embeddingSourceText,
        embeddingUpdatedAt: events.embeddingUpdatedAt,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (row && row.embeddingUpdatedAt) {
      if (!prevTimestamp || new Date(row.embeddingUpdatedAt).getTime() > new Date(prevTimestamp).getTime()) {
        return row;
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for embedding update for event ${eventId}`);
}

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
      eligibility_categories
    RESTART IDENTITY CASCADE;
  `);

  // Seed reference location, tags, eligibility category
  const [loc] = await db
    .insert(locations)
    .values({ city: 'Bengaluru', state: 'Karnataka', country: 'India' })
    .returning();
  testLocationId = loc.id;

  const [tag1] = await db
    .insert(tags)
    .values({ name: 'AI', slug: 'ai', category: 'domain', isSystem: true })
    .returning();
  const [tag2] = await db
    .insert(tags)
    .values({ name: 'Web3', slug: 'web3', category: 'domain', isSystem: true })
    .returning();
  testTag1Id = tag1.id;
  testTag2Id = tag2.id;

  const [cat] = await db
    .insert(eligibilityCategories)
    .values({ name: 'Undergraduate', slug: 'undergraduate', isSystem: true })
    .returning();
  testCategoryId = cat.id;

  // Seed Organization and Organizer
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Embedding Test Org',
      orgType: 'company',
      contactEmail: 'contact@embedtest.com',
      isVerified: true,
    })
    .returning();
  orgId = org.id;

  const passwordHash = await bcrypt.hash('password123', 10);
  const [account] = await db
    .insert(organizerAccounts)
    .values({
      organizationId: orgId,
      name: 'Embed Admin',
      email: 'admin@embedtest.com',
      passwordHash,
      role: 'owner',
    })
    .returning();
  organizerId = account.id;

  orgToken = jwt.sign(
    {
      id: organizerId,
      role: 'organizer',
      organizationId: orgId,
      membershipRole: 'owner',
    },
    config.jwtSecret,
    { expiresIn: '1h' },
  );
});

describe('buildEmbeddingSourceText Composition Logic', () => {
  test('1. Minimal event with every optional field null/empty produces clean title + description with no null/undefined tokens', async () => {
    const [minEvent] = await db
      .insert(events)
      .values({
        organizationId: orgId,
        eventType: 'hackathon',
        title: 'Minimal Event Title',
        slug: 'minimal-event-title-' + Math.random().toString(36).substring(2, 8),
        description: 'Minimal event description without optional fields.',
        mode: 'online',
        eventStartAt: new Date(),
        status: 'draft',
      })
      .returning();

    await db.insert(hackathonDetails).values({
      eventId: minEvent.id,
      prizeSummaryText: null,
      tracks: [],
    });

    const sourceText = await embeddingService.buildEmbeddingSourceText(minEvent.id);
    expect(sourceText).toBe('Minimal Event Title. Minimal event description without optional fields.');
    expect(sourceText).not.toContain('null');
    expect(sourceText).not.toContain('undefined');
    expect(sourceText).not.toContain('..');
  });

  test('2. Fully populated Hackathon event includes tracks, prize_summary_text, and comma-joined tags/eligibility', async () => {
    const [hEvent] = await db
      .insert(events)
      .values({
        organizationId: orgId,
        eventType: 'hackathon',
        title: 'Full Hackathon',
        slug: 'full-hackathon-' + Math.random().toString(36).substring(2, 8),
        tagline: 'Code and Win',
        description: 'A grand coding competition.',
        eligibilityNotes: 'Students only.',
        mode: 'online',
        eventStartAt: new Date(),
        status: 'draft',
      })
      .returning();

    await db.insert(hackathonDetails).values({
      eventId: hEvent.id,
      tracks: ['AI/ML', 'Web3'],
      prizeSummaryText: '100k INR pool',
    });

    await db.insert(eventTags).values([
      { eventId: hEvent.id, tagId: testTag1Id },
      { eventId: hEvent.id, tagId: testTag2Id },
    ]);
    await db.insert(eventEligibility).values([{ eventId: hEvent.id, eligibilityCategoryId: testCategoryId }]);

    const sourceText = await embeddingService.buildEmbeddingSourceText(hEvent.id);
    expect(sourceText).toBe(
      'Full Hackathon. Code and Win. A grand coding competition. AI, Web3. Undergraduate. Students only. AI/ML, Web3. 100k INR pool',
    );
  });

  test('2b. Fully populated Workshop event includes speaker_bio and prerequisite_skills', async () => {
    const [wEvent] = await db
      .insert(events)
      .values({
        organizationId: orgId,
        eventType: 'workshop',
        title: 'Full Workshop',
        slug: 'full-workshop-' + Math.random().toString(36).substring(2, 8),
        tagline: 'Learn AI',
        description: 'Hands-on workshop on generative AI.',
        eligibilityNotes: 'Beginners welcome.',
        mode: 'online',
        eventStartAt: new Date(),
        status: 'draft',
      })
      .returning();

    await db.insert(workshopDetails).values({
      eventId: wEvent.id,
      speakerName: 'Dr. Smith',
      speakerBio: 'Expert in Generative AI and ML models.',
      prerequisiteSkills: ['Python', 'Basic Math'],
    });

    await db.insert(eventTags).values([{ eventId: wEvent.id, tagId: testTag1Id }]);
    await db.insert(eventEligibility).values([{ eventId: wEvent.id, eligibilityCategoryId: testCategoryId }]);

    const sourceText = await embeddingService.buildEmbeddingSourceText(wEvent.id);
    expect(sourceText).toBe(
      'Full Workshop. Learn AI. Hands-on workshop on generative AI. AI. Undergraduate. Beginners welcome. Expert in Generative AI and ML models. Python, Basic Math',
    );
  });

  test('2c. Fully populated Internship event includes perks', async () => {
    const [iEvent] = await db
      .insert(events)
      .values({
        organizationId: orgId,
        eventType: 'internship',
        title: 'Full Internship',
        slug: 'full-internship-' + Math.random().toString(36).substring(2, 8),
        tagline: 'Build Real Apps',
        description: '6-month software engineering internship.',
        eligibilityNotes: 'Final year students.',
        mode: 'online',
        eventStartAt: new Date(),
        status: 'draft',
      })
      .returning();

    await db.insert(internshipDetails).values({
      eventId: iEvent.id,
      workMode: 'remote',
      perks: ['Certificate', 'PPO Opportunity', 'Mentorship'],
    });

    await db.insert(eventTags).values([{ eventId: iEvent.id, tagId: testTag1Id }]);
    await db.insert(eventEligibility).values([{ eventId: iEvent.id, eligibilityCategoryId: testCategoryId }]);

    const sourceText = await embeddingService.buildEmbeddingSourceText(iEvent.id);
    expect(sourceText).toBe(
      'Full Internship. Build Real Apps. 6-month software engineering internship. AI. Undergraduate. Final year students. Certificate, PPO Opportunity, Mentorship',
    );
  });
});

describe('Automatic Embedding Generation Background Jobs', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(embeddingService, 'fetchGeminiEmbedding').mockResolvedValue(mockVector);
  });

  afterEach(async () => {
    await drainEmbeddingJobs();
    fetchSpy.mockRestore();
  });

  test('4. Creating or updating a draft event does NOT trigger embedding generation', async () => {
    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Draft Hackathon',
        tagline: 'Build fast',
        description: 'Draft description for testing',
        mode: 'offline',
        venue: 'Hall A',
        location_id: testLocationId,
        event_start_at: new Date(Date.now() + 86400000).toISOString(),
        tag_ids: [testTag1Id],
        eligibility_category_ids: [testCategoryId],
        eligibility_notes: 'Draft eligibility',
        event_type: 'hackathon',
        hackathon_details: {
          prize_summary_text: '100k INR',
        },
      });

    expect(createRes.status).toBe(201);
    const draftEventId = createRes.body.id;

    await new Promise((r) => setTimeout(r, 100));

    expect(fetchSpy).not.toHaveBeenCalled();

    let [draftRow] = await db.select().from(events).where(eq(events.id, draftEventId));
    expect(draftRow.embeddingUpdatedAt).toBeNull();
    expect(draftRow.embedding).toBeNull();

    const updateRes = await request(app)
      .put(`/api/organizer/events/${draftEventId}`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Updated Draft Hackathon',
        tagline: 'Build fast and loud',
        description: 'Updated draft description for testing',
        mode: 'offline',
        venue: 'Hall A',
        location_id: testLocationId,
        event_start_at: new Date(Date.now() + 86400000).toISOString(),
        tag_ids: [testTag1Id],
        eligibility_category_ids: [testCategoryId],
        eligibility_notes: 'Draft eligibility updated',
        event_type: 'hackathon',
        hackathon_details: {
          prize_summary_text: '150k INR',
        },
      });

    expect(updateRes.status).toBe(200);

    await new Promise((r) => setTimeout(r, 100));
    expect(fetchSpy).not.toHaveBeenCalled();

    [draftRow] = await db.select().from(events).where(eq(events.id, draftEventId));
    expect(draftRow.embeddingUpdatedAt).toBeNull();
  });

  test('1. Publishing a draft event triggers embedding generation and populates 1536-dim vector + source_text', async () => {
    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'AI & Web3 Summit',
        tagline: 'Future of Tech',
        description: 'Comprehensive summit on AI and decentralized applications.',
        mode: 'offline',
        venue: 'Campus Auditorium',
        location_id: testLocationId,
        event_start_at: new Date(Date.now() + 86400000).toISOString(),
        tag_ids: [testTag1Id, testTag2Id],
        eligibility_category_ids: [testCategoryId],
        eligibility_notes: 'Open to all college undergrads.',
        event_type: 'hackathon',
        hackathon_details: {
          prize_summary_text: 'Grand prize 50,000 INR',
        },
      });

    const eventId = createRes.body.id;

    const publishRes = await request(app)
      .patch(`/api/organizer/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${orgToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.status).toBe('published');

    const eventRow = await waitForEmbeddingUpdate(eventId);

    expect(fetchSpy).toHaveBeenCalled();
    expect(eventRow.embeddingUpdatedAt).toBeDefined();
    expect(eventRow.embedding).toHaveLength(1536);

    const expectedComposition = [
      'AI & Web3 Summit',
      'Future of Tech',
      'Comprehensive summit on AI and decentralized applications.',
      'AI, Web3',
      'Undergraduate',
      'Open to all college undergrads.',
      'Grand prize 50,000 INR',
    ].join('. ');

    expect(eventRow.embeddingSourceText).toBe(expectedComposition);
  });

  test('2. Updating a published event title re-triggers generation and updates embedding_updated_at', async () => {
    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Original Title',
        tagline: 'Original Tagline',
        description: 'Original Description',
        mode: 'offline',
        venue: 'Hall B',
        location_id: testLocationId,
        event_start_at: new Date(Date.now() + 86400000).toISOString(),
        event_type: 'hackathon',
        hackathon_details: { prize_summary_text: '10k' },
      });

    const eventId = createRes.body.id;

    await request(app)
      .patch(`/api/organizer/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${orgToken}`);

    const initialRow = await waitForEmbeddingUpdate(eventId);
    const initialTimestamp = initialRow.embeddingUpdatedAt;

    fetchSpy.mockClear();

    const updateRes = await request(app)
      .put(`/api/organizer/events/${eventId}`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Brand New Updated Title',
        tagline: 'Original Tagline',
        description: 'Original Description',
        mode: 'offline',
        venue: 'Hall B',
        location_id: testLocationId,
        event_start_at: new Date(Date.now() + 86400000).toISOString(),
        event_type: 'hackathon',
        hackathon_details: { prize_summary_text: '10k' },
      });

    expect(updateRes.status).toBe(200);

    const updatedRow = await waitForEmbeddingUpdate(eventId, initialTimestamp);
    expect(fetchSpy).toHaveBeenCalled();
    expect(updatedRow.embeddingSourceText).toContain('Brand New Updated Title');
    expect(new Date(updatedRow.embeddingUpdatedAt!).getTime()).toBeGreaterThan(
      new Date(initialTimestamp!).getTime(),
    );
  });

  test('3. Updating a published event venue (embedding-irrelevant field) does NOT re-trigger generation', async () => {
    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Venue Change Event',
        description: 'Testing venue updates',
        mode: 'offline',
        venue: 'Old Venue 101',
        location_id: testLocationId,
        event_start_at: new Date(Date.now() + 86400000).toISOString(),
        event_type: 'hackathon',
        hackathon_details: { prize_summary_text: '5k' },
      });

    const eventId = createRes.body.id;

    await request(app)
      .patch(`/api/organizer/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${orgToken}`);

    const initialRow = await waitForEmbeddingUpdate(eventId);
    const initialTimestamp = initialRow.embeddingUpdatedAt;

    fetchSpy.mockClear();

    const updateRes = await request(app)
      .put(`/api/organizer/events/${eventId}`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Venue Change Event',
        description: 'Testing venue updates',
        mode: 'offline',
        venue: 'New Venue 999',
        location_id: testLocationId,
        event_start_at: new Date(Date.now() + 86400000).toISOString(),
        event_type: 'hackathon',
        hackathon_details: { prize_summary_text: '5k' },
      });

    expect(updateRes.status).toBe(200);

    await new Promise((r) => setTimeout(r, 200));

    expect(fetchSpy).not.toHaveBeenCalled();

    const [currentDbRow] = await db.select().from(events).where(eq(events.id, eventId));
    expect(currentDbRow.embeddingUpdatedAt).not.toBeNull();
    expect(new Date(currentDbRow.embeddingUpdatedAt!).getTime()).toBe(
      new Date(initialTimestamp!).getTime(),
    );
  });

  test('5. The publish HTTP response returns before embedding generation completes (non-blocking)', async () => {
    fetchSpy.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 400));
      return mockVector;
    });

    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Non-blocking Timing Test Event',
        description: 'Checking HTTP response latency',
        mode: 'offline',
        venue: 'Lab 1',
        location_id: testLocationId,
        event_start_at: new Date(Date.now() + 86400000).toISOString(),
        event_type: 'hackathon',
        hackathon_details: { prize_summary_text: '20k' },
      });

    const eventId = createRes.body.id;

    const startTime = Date.now();
    const publishRes = await request(app)
      .patch(`/api/organizer/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${orgToken}`);
    const elapsedTime = Date.now() - startTime;

    expect(publishRes.status).toBe(200);
    expect(elapsedTime).toBeLessThan(200);

    await waitForEmbeddingUpdate(eventId, null, 2000);
  });

  test('6. Simulated embedding provider failure does not crash server and does not block publish/update', async () => {
    fetchSpy.mockRejectedValue(new Error('Simulated Gemini API 500 Error'));

    const createRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Resilience Test Event',
        description: 'Should publish even when Gemini API fails',
        mode: 'offline',
        venue: 'Lab 2',
        location_id: testLocationId,
        event_start_at: new Date(Date.now() + 86400000).toISOString(),
        event_type: 'hackathon',
        hackathon_details: { prize_summary_text: '5k' },
      });

    const eventId = createRes.body.id;

    const publishRes = await request(app)
      .patch(`/api/organizer/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${orgToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.status).toBe('published');

    await drainEmbeddingJobs();

    const [row] = await db.select().from(events).where(eq(events.id, eventId));
    expect(row.status).toBe('published');
    expect(row.embeddingUpdatedAt).toBeNull();
  });
});
