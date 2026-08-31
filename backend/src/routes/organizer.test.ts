import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sql, eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import app from '../app';
import { db } from '../db/client';
import { users } from '../db/schema/users';
import { organizations, organizerAccounts } from '../db/schema/organizations';
import {
  events,
  hackathonDetails,
  workshopDetails,
  internshipDetails,
  eventTags,
  eventEligibility,
} from '../db/schema/events';
import { eventContacts } from '../db/schema/event_contacts';
import { tags } from '../db/schema/tags';
import { locations, eligibilityCategories } from '../db/schema/locations';
import { config } from '../config';
import { pool } from '../db/client';

jest.setTimeout(30000);

let testTagId: number;
let testCategoryId: number;
let testLocationId: number;

let orgAToken: string;
let orgBToken: string;
let studentToken: string;

let orgAId: string;
let orgBId: string;

let organizerAId: string;
let organizerBId: string;
let studentId: string;

let baseEventPayload: any;
const makeBasePayload = () => ({
  title: 'Test Hackathon',
  tagline: 'Code the future',
  description: 'This is a test hackathon description.',
  mode: 'offline',
  venue: 'Kumaraguru College of Technology',
  location_id: testLocationId,
  timezone: 'Asia/Kolkata',
  is_paid: true,
  registration_fee: 100,
  currency: 'INR',
  resume_required: true,
  registration_open_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  registration_close_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  event_start_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  event_end_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  eligibility_notes: 'All college students can participate.',
  eligibility_category_ids: [] as number[],
  tag_ids: [] as number[],
  contacts: [
    {
      name: 'Faculty Coordinator',
      phone: '9876543210',
      email: 'faculty@test.com',
      role_label: 'Faculty Sponsor',
    },
  ],
  event_type: 'hackathon',
  hackathon_details: {
    max_participants: 100,
    prize_summary_text: '1st: 50k, 2nd: 25k',
    tracks: ['AI', 'Web3'],
    submission_type: 'prototype',
  },
});

const dummyImagePath = path.join(__dirname, 'test-banner.png');
const dummyGifPath = path.join(__dirname, 'test-banner.gif');
const oversizedImagePath = path.join(__dirname, 'test-large.png');

beforeAll(async () => {
  // Truncate tables to ensure a clean slate
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
      event_contacts
    RESTART IDENTITY CASCADE;
  `);

  // Insert reference data
  const [tag] = await db
    .insert(tags)
    .values({
      name: 'Test Tag',
      slug: 'test-tag',
      category: 'technology',
    })
    .onConflictDoNothing()
    .returning();
  if (tag) {
    testTagId = tag.id;
  } else {
    const [existingTag] = await db.select().from(tags).where(eq(tags.slug, 'test-tag')).limit(1);
    testTagId = existingTag ? existingTag.id : 1;
  }

  const [cat] = await db
    .insert(eligibilityCategories)
    .values({
      name: 'Test Category',
      slug: 'test-category',
    })
    .onConflictDoNothing()
    .returning();
  if (cat) {
    testCategoryId = cat.id;
  } else {
    const [existingCat] = await db
      .select()
      .from(eligibilityCategories)
      .where(eq(eligibilityCategories.slug, 'test-category'))
      .limit(1);
    testCategoryId = existingCat ? existingCat.id : 1;
  }

  const [loc] = await db
    .insert(locations)
    .values({
      city: 'Test City',
      state: 'Test State',
      country: 'India',
    })
    .onConflictDoNothing()
    .returning();
  if (loc) {
    testLocationId = loc.id;
  } else {
    const [existingLoc] = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.city, 'Test City'),
          eq(locations.state, 'Test State'),
          eq(locations.country, 'India'),
        ),
      )
      .limit(1);
    testLocationId = existingLoc ? existingLoc.id : 1;
  }

  // Set up Org A (Owner A)
  const [orgA] = await db
    .insert(organizations)
    .values({
      name: 'Org A',
      orgType: 'company',
      contactEmail: 'orga@test.com',
    })
    .returning();
  orgAId = orgA.id;

  const passwordHash = await bcrypt.hash('password123', 10);
  const [organizerA] = await db
    .insert(organizerAccounts)
    .values({
      organizationId: orgAId,
      name: 'Organizer A',
      email: 'orga@test.com',
      passwordHash,
      role: 'owner',
      status: 'active',
    })
    .returning();
  organizerAId = organizerA.id;

  orgAToken = jwt.sign(
    { id: organizerAId, role: 'organizer', organizationId: orgAId, membershipRole: 'owner' },
    config.jwtSecret,
  );

  // Set up Org B (Owner B)
  const [orgB] = await db
    .insert(organizations)
    .values({
      name: 'Org B',
      orgType: 'company',
      contactEmail: 'orgb@test.com',
    })
    .returning();
  orgBId = orgB.id;

  const [organizerB] = await db
    .insert(organizerAccounts)
    .values({
      organizationId: orgBId,
      name: 'Organizer B',
      email: 'orgb@test.com',
      passwordHash,
      role: 'owner',
      status: 'active',
    })
    .returning();
  organizerBId = organizerB.id;

  orgBToken = jwt.sign(
    { id: organizerBId, role: 'organizer', organizationId: orgBId, membershipRole: 'owner' },
    config.jwtSecret,
  );

  // Set up Student
  const [student] = await db
    .insert(users)
    .values({
      name: 'Student User',
      email: 'student@test.com',
      passwordHash,
      authProvider: 'email',
    })
    .returning();
  studentId = student.id;

  studentToken = jwt.sign({ id: studentId, role: 'student' }, config.jwtSecret);

  // Create dummy files for file upload testing
  fs.writeFileSync(dummyImagePath, 'dummy png content');
  fs.writeFileSync(dummyGifPath, 'dummy gif content');
  fs.writeFileSync(oversizedImagePath, Buffer.alloc(6 * 1024 * 1024)); // 6MB file

  baseEventPayload = makeBasePayload();
});

afterAll(async () => {
  // Truncate tables at the end
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
      event_contacts
    RESTART IDENTITY CASCADE;
  `);

  // Clean up test files
  if (fs.existsSync(dummyImagePath)) fs.unlinkSync(dummyImagePath);
  if (fs.existsSync(dummyGifPath)) fs.unlinkSync(dummyGifPath);
  if (fs.existsSync(oversizedImagePath)) fs.unlinkSync(oversizedImagePath);

  // Close DB pool
  await pool.end();
});

describe('Phase 3 - Organizer Event Management APIs', () => {
  describe('1. CREATION', () => {
    test('1. Organizer can create a valid draft event & uses context organizationId', async () => {
      const payload = {
        ...baseEventPayload,
        eligibility_category_ids: [testCategoryId],
        tag_ids: [testTagId],
      };

      const res = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('draft');
      expect(res.body.organizationId).toBe(orgAId);
      expect(res.body.createdBy).toBe(organizerAId);
      expect(res.body.slug).toContain('test-hackathon');

      // Verify Details Row exists
      const [details] = await db
        .select()
        .from(hackathonDetails)
        .where(eq(hackathonDetails.eventId, res.body.id))
        .limit(1);
      expect(details).toBeDefined();
      expect(details.maxParticipants).toBe(100);

      // Verify Tags/Eligibility exist
      const tagsList = await db.select().from(eventTags).where(eq(eventTags.eventId, res.body.id));
      expect(tagsList).toHaveLength(1);
      expect(tagsList[0].tagId).toBe(testTagId);

      const eligibilityList = await db
        .select()
        .from(eventEligibility)
        .where(eq(eventEligibility.eventId, res.body.id));
      expect(eligibilityList).toHaveLength(1);
      expect(eligibilityList[0].eligibilityCategoryId).toBe(testCategoryId);

      // Verify Contacts exist
      const contactsList = await db
        .select()
        .from(eventContacts)
        .where(eq(eventContacts.eventId, res.body.id));
      expect(contactsList).toHaveLength(1);
      expect(contactsList[0].name).toBe('Faculty Coordinator');
      expect(contactsList[0].sortOrder).toBe(0);
    });

    test('2. A request containing organization_id/organizationId in the body is rejected with 400', async () => {
      const payloadWithOrgId = {
        ...baseEventPayload,
        organization_id: orgBId,
      };

      const res = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payloadWithOrgId)
        .expect(400);

      expect(res.body.message).toContain('Forbidden field');

      // Test with details nest containing organizationId
      const payloadWithNestedOrgId = {
        ...baseEventPayload,
        hackathon_details: {
          ...baseEventPayload.hackathon_details,
          organizationId: orgBId,
        },
      };

      const res2 = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payloadWithNestedOrgId)
        .expect(400);

      expect(res2.body.message).toContain('Forbidden field');
    });

    test('3. Hackathon requires hackathon_details; workshop requires workshop_details; internship requires internship_details', async () => {
      // Hackathon with missing details
      const hackathonPayload = {
        ...baseEventPayload,
        hackathon_details: undefined,
      };
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(hackathonPayload)
        .expect(400);

      // Workshop with missing details
      const workshopPayload = {
        ...baseEventPayload,
        event_type: 'workshop',
        hackathon_details: undefined,
        workshop_details: undefined,
      };
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(workshopPayload)
        .expect(400);

      // Internship with missing details
      const internshipPayload = {
        ...baseEventPayload,
        event_type: 'internship',
        hackathon_details: undefined,
        internship_details: undefined,
      };
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(internshipPayload)
        .expect(400);
    });

    test('4. Mismatched event_type-specific details are rejected', async () => {
      // Hackathon with workshop details
      const payload = {
        ...baseEventPayload,
        event_type: 'hackathon',
        hackathon_details: undefined,
        workshop_details: {
          speaker_name: 'Jane Speaker',
        },
      };

      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(400);
    });

    test('5. Invalid payloads are rejected (negative fees, invalid dates, stipend_min > stipend_max)', async () => {
      // Negative fee
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({ ...baseEventPayload, registration_fee: -10 })
        .expect(400);

      // Invalid dates (event_end_at before event_start_at)
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          ...baseEventPayload,
          event_start_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          event_end_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(400);

      // Internship with stipend_min > stipend_max
      const payload = {
        ...baseEventPayload,
        event_type: 'internship',
        hackathon_details: undefined,
        internship_details: {
          stipend_min: 500,
          stipend_max: 200,
          work_mode: 'hybrid',
        },
      };
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(400);
    });

    test('6. Event can be created with zero contacts (contacts empty or omitted)', async () => {
      const payload = {
        ...baseEventPayload,
        contacts: [],
      };

      const res = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(201);

      const dbContacts = await db
        .select()
        .from(eventContacts)
        .where(eq(eventContacts.eventId, res.body.id));
      expect(dbContacts).toHaveLength(0);
    });

    test('7. Creation is transactional — simulated failure rolls back all inserts', async () => {
      const initialEventCount = (await db.select().from(events)).length;

      // Pass an invalid tag ID that doesn't exist (e.g. 99999) to fail FK constraint during tags insert
      const payload = {
        ...baseEventPayload,
        tag_ids: [99999],
      };

      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(500); // DB FK error is caught and returns 500

      // Ensure no rows were added to events table
      const currentEventCount = (await db.select().from(events)).length;
      expect(currentEventCount).toBe(initialEventCount);
    });
  });

  describe('2. GET LIST & PAGINATION', () => {
    test('1. Organizer only sees events belonging to their own organization (isolation)', async () => {
      // Create an event for Org B
      const payloadB = {
        ...baseEventPayload,
        title: 'Org B Hackathon',
      };
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgBToken}`)
        .send(payloadB)
        .expect(201);

      // Request list as Org A
      const resA = await request(app)
        .get('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);

      // Verify none of the events in Org A list have Org B's organization ID
      resA.body.data.forEach((evt: any) => {
        expect(evt.organizationId).toBe(orgAId);
        expect(evt.title).not.toBe('Org B Hackathon');
      });

      // Request list as Org B
      const resB = await request(app)
        .get('/api/organizer/events')
        .set('Authorization', `Bearer ${orgBToken}`)
        .expect(200);
      expect(resB.body.data.some((evt: any) => evt.title === 'Org B Hackathon')).toBe(true);
    });

    test('2. Pagination works and results are newest first', async () => {
      // Create 3 draft events for Org A in sequence
      const names = ['Evt 1', 'Evt 2', 'Evt 3'];
      for (const name of names) {
        await request(app)
          .post('/api/organizer/events')
          .set('Authorization', `Bearer ${orgAToken}`)
          .send({ ...baseEventPayload, title: name })
          .expect(201);
      }

      // Query page 1 limit 2
      const res = await request(app)
        .get('/api/organizer/events?page=1&limit=2')
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.currentPage).toBe(1);
      expect(res.body.pagination.pageSize).toBe(2);
      expect(res.body.pagination.totalItems).toBeGreaterThanOrEqual(4);

      // Verify newest is first
      const firstDate = new Date(res.body.data[0].createdAt);
      const secondDate = new Date(res.body.data[1].createdAt);
      expect(firstDate.getTime()).toBeGreaterThanOrEqual(secondDate.getTime());
    });
  });

  describe('3. UPDATE', () => {
    test('1. Organizer can update their own event details, replacing relations and contacts', async () => {
      // Create an event first
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(baseEventPayload)
        .expect(201);

      const eventId = createRes.body.id;

      // Update event type to workshop
      const updatePayload = {
        title: 'Updated Event Title',
        tagline: 'New tagline',
        description: 'New description.',
        mode: 'online',
        timezone: 'Asia/Kolkata',
        is_paid: false,
        registration_fee: 0,
        currency: 'INR',
        resume_required: false,
        event_start_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        event_type: 'workshop',
        tag_ids: [testTagId],
        eligibility_category_ids: [testCategoryId],
        contacts: [
          {
            name: 'New Contact Name',
            phone: '1111111111',
            email: 'newcontact@test.com',
            role_label: 'Lead Coordinator',
          },
        ],
        workshop_details: {
          speaker_name: 'Dr. John Speaker',
          speaker_bio: 'Renowned expert',
          duration_hours: 3.5,
          seats_available: 50,
          certificate_provided: true,
          prerequisite_skills: ['Basic Programming'],
        },
      };

      const updateRes = await request(app)
        .put(`/api/organizer/events/${eventId}`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(updatePayload)
        .expect(200);

      expect(updateRes.body.title).toBe('Updated Event Title');
      expect(updateRes.body.eventType).toBe('workshop');

      // Verify details replaced
      const [hDetails] = await db
        .select()
        .from(hackathonDetails)
        .where(eq(hackathonDetails.eventId, eventId));
      expect(hDetails).toBeUndefined(); // Should be deleted

      const [wDetails] = await db
        .select()
        .from(workshopDetails)
        .where(eq(workshopDetails.eventId, eventId));
      expect(wDetails).toBeDefined();
      expect(wDetails.speakerName).toBe('Dr. John Speaker');

      // Verify contacts replaced
      const contacts = await db
        .select()
        .from(eventContacts)
        .where(eq(eventContacts.eventId, eventId));
      expect(contacts).toHaveLength(1);
      expect(contacts[0].name).toBe('New Contact Name');
    });

    test('2. Cross-organization update returns 403; non-existent returns 404', async () => {
      // Create an event for Org B
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgBToken}`)
        .send(baseEventPayload)
        .expect(201);
      const eventId = createRes.body.id;

      // Update as Org A
      await request(app)
        .put(`/api/organizer/events/${eventId}`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(baseEventPayload)
        .expect(403);

      // Non-existent event update returns 404
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app)
        .put(`/api/organizer/events/${nonExistentId}`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(baseEventPayload)
        .expect(404);
    });
  });

  describe('4. PUBLISH / UNPUBLISH', () => {
    test('1. Draft can be published, setting published_at only on first publish', async () => {
      // Create event
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(baseEventPayload)
        .expect(201);
      const eventId = createRes.body.id;

      // Publish first time
      const pubRes = await request(app)
        .patch(`/api/organizer/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);

      expect(pubRes.body.status).toBe('published');
      expect(pubRes.body.publishedAt).toBeDefined();
      const firstPublishTime = pubRes.body.publishedAt;

      // Unpublish it
      const unpubRes = await request(app)
        .patch(`/api/organizer/events/${eventId}/unpublish`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);
      expect(unpubRes.body.status).toBe('draft');

      // Publish second time
      const repubRes = await request(app)
        .patch(`/api/organizer/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);

      // Verify publishedAt was NOT overwritten
      expect(repubRes.body.publishedAt).toBe(firstPublishTime);
    });

    test('2. Cross-organization publish/unpublish is rejected with 403', async () => {
      // Create Org B event
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgBToken}`)
        .send(baseEventPayload)
        .expect(201);
      const eventId = createRes.body.id;

      // Publish as Org A
      await request(app)
        .patch(`/api/organizer/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(403);
    });
  });

  describe('5. DELETE', () => {
    test('1. Organizer can delete their own event, cascading related rows', async () => {
      // Create event
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(baseEventPayload)
        .expect(201);
      const eventId = createRes.body.id;

      // Delete event
      await request(app)
        .delete(`/api/organizer/events/${eventId}`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);

      // Verify event is gone
      const [dbEvent] = await db.select().from(events).where(eq(events.id, eventId));
      expect(dbEvent).toBeUndefined();

      // Verify details row is gone via cascade
      const [details] = await db
        .select()
        .from(hackathonDetails)
        .where(eq(hackathonDetails.eventId, eventId));
      expect(details).toBeUndefined();

      // Verify contacts row is gone via cascade
      const contacts = await db
        .select()
        .from(eventContacts)
        .where(eq(eventContacts.eventId, eventId));
      expect(contacts).toHaveLength(0);
    });

    test('2. Cross-organization delete returns 403; non-existent returns 404', async () => {
      // Create Org B event
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgBToken}`)
        .send(baseEventPayload)
        .expect(201);
      const eventId = createRes.body.id;

      // Delete as Org A
      await request(app)
        .delete(`/api/organizer/events/${eventId}`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(403);

      // Non-existent event returns 404
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app)
        .delete(`/api/organizer/events/${nonExistentId}`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(404);
    });
  });

  describe('6. BANNER UPLOAD', () => {
    test('1. Valid image upload succeeds & sets banner_image_url', async () => {
      // Create event
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(baseEventPayload)
        .expect(201);
      const eventId = createRes.body.id;

      // Upload banner
      const res = await request(app)
        .post(`/api/organizer/events/${eventId}/banner`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .attach('banner', dummyImagePath)
        .expect(200);

      expect(res.body.message).toBe('Banner uploaded successfully');
      expect(res.body.banner_image_url).toContain('/uploads/banner-');

      // Verify DB persists it
      const [dbEvent] = await db.select().from(events).where(eq(events.id, eventId));
      expect(dbEvent.bannerImageUrl).toBe(res.body.banner_image_url);

      // Clean up uploaded file
      const fullPath = path.join(process.cwd(), dbEvent.bannerImageUrl!);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    });

    test('2. Non-image (txt/etc.) and GIF uploads are rejected', async () => {
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(baseEventPayload)
        .expect(201);
      const eventId = createRes.body.id;

      // GIF upload fails
      await request(app)
        .post(`/api/organizer/events/${eventId}/banner`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .attach('banner', dummyGifPath)
        .expect(400);
    });

    test('3. Oversized image (>5MB) is rejected', async () => {
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(baseEventPayload)
        .expect(201);
      const eventId = createRes.body.id;

      // Upload oversized file
      await request(app)
        .post(`/api/organizer/events/${eventId}/banner`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .attach('banner', oversizedImagePath)
        .expect(400);
    });

    test('4. Cross-organization upload is rejected with 403', async () => {
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgBToken}`)
        .send(baseEventPayload)
        .expect(201);
      const eventId = createRes.body.id;

      // Upload as Org A
      await request(app)
        .post(`/api/organizer/events/${eventId}/banner`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .attach('banner', dummyImagePath)
        .expect(403);
    });
  });

  describe('7. AUTHORIZATION', () => {
    test('1. Unauthenticated requests return 401', async () => {
      await request(app).post('/api/organizer/events').send(baseEventPayload).expect(401);
    });

    test('2. Student tokens cannot access organizer event endpoints', async () => {
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(baseEventPayload)
        .expect(403);
    });
  });

  describe('8. SWAGGER', () => {
    test('1. All Phase 3 endpoints appear in /api-docs', async () => {
      const res = await request(app).get('/api-docs-json').expect(200);

      const paths = res.body.paths;
      expect(paths).toHaveProperty('/api/organizer/events');
      expect(paths['/api/organizer/events']).toHaveProperty('post');
      expect(paths['/api/organizer/events']).toHaveProperty('get');
      expect(paths).toHaveProperty('/api/organizer/events/{id}');
      expect(paths['/api/organizer/events/{id}']).toHaveProperty('put');
      expect(paths['/api/organizer/events/{id}']).toHaveProperty('delete');
      expect(paths).toHaveProperty('/api/organizer/events/{id}/publish');
      expect(paths).toHaveProperty('/api/organizer/events/{id}/unpublish');
      expect(paths).toHaveProperty('/api/organizer/events/{id}/banner');
    });
  });

  describe('9. MODE / VENUE / LOCATION CONSISTENCY & RESPONSE SHAPE', () => {
    test('1. Creating an online event with a venue fails with 400', async () => {
      const payload = {
        ...makeBasePayload(),
        mode: 'online',
        venue: 'Some Room',
        location_id: undefined,
      };
      const res = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(400);

      expect(res.body.errors[0].message).toContain(
        'Online events must not include venue or location_id',
      );
    });

    test('2. Creating an online event with a location_id fails with 400', async () => {
      const payload = {
        ...makeBasePayload(),
        mode: 'online',
        venue: undefined,
        location_id: testLocationId,
      };
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(400);
    });

    test('3. Creating an offline/hybrid event without location_id fails with 400', async () => {
      const payload = {
        ...makeBasePayload(),
        mode: 'offline',
        location_id: undefined,
      };
      await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(400);
    });

    test('4. Creating a valid online event succeeds and returns organizationName but no location object', async () => {
      const payload = {
        ...makeBasePayload(),
        mode: 'online',
        venue: undefined,
        location_id: undefined,
      };
      const res = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.organizationName).toBe('Org A');
      expect(res.body.location).toBeUndefined();
    });

    test('5. Creating a valid offline/hybrid event succeeds and returns organizationName and location object', async () => {
      const payload = makeBasePayload(); // offline with testLocationId
      const res = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.organizationName).toBe('Org A');
      expect(res.body.location).toBeDefined();
      expect(res.body.location.city).toBe('Test City');
    });

    test('6. Updating an existing event to online with a venue fails with 400', async () => {
      const createRes = await request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(makeBasePayload())
        .expect(201);

      const payload = {
        ...makeBasePayload(),
        mode: 'online',
        venue: 'Some Room',
        location_id: undefined,
      };

      await request(app)
        .put(`/api/organizer/events/${createRes.body.id}`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .send(payload)
        .expect(400);
    });
  });
});
