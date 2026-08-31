/* eslint-disable @typescript-eslint/no-explicit-any */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sql, eq, and } from 'drizzle-orm';
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
import { savedEvents } from '../db/schema/users';
import { config } from '../config';
import { pool } from '../db/client';

jest.setTimeout(30000);

let tagIdA: number;
let tagIdB: number;
let categoryIdA: number;
let locationIdA: number;
let locationIdB: number;

let studentTokenA: string;
let studentTokenB: string;
let organizerToken: string;

let studentIdA: string;
let studentIdB: string;
let organizerId: string;
let orgId: string;

let publishedHackathonId: string;
let publishedHackathonSlug: string;
let publishedWorkshopId: string;
let publishedWorkshopSlug: string;
let publishedInternshipId: string;
let publishedInternshipSlug: string;
let draftEventId: string;
let draftEventSlug: string;
let hiddenEventId: string;
let hiddenEventSlug: string;

beforeAll(async () => {
  // Truncate tables to ensure clean slate
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
      event_contacts,
      saved_events,
      locations,
      tags,
      eligibility_categories
    RESTART IDENTITY CASCADE;
  `);

  // Insert locations
  const [locA] = await db
    .insert(locations)
    .values({
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      country: 'India',
    })
    .returning();
  locationIdA = locA.id;

  const [locB] = await db
    .insert(locations)
    .values({
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
    })
    .returning();
  locationIdB = locB.id;

  // Insert tags
  const [tagA] = await db
    .insert(tags)
    .values({
      name: 'React',
      slug: 'react',
      category: 'technology',
    })
    .returning();
  tagIdA = tagA.id;

  const [tagB] = await db
    .insert(tags)
    .values({
      name: 'AI',
      slug: 'ai',
      category: 'technology',
    })
    .returning();
  tagIdB = tagB.id;

  // Insert eligibility categories
  const [catA] = await db
    .insert(eligibilityCategories)
    .values({
      name: 'Undergrad',
      slug: 'undergrad',
    })
    .returning();
  categoryIdA = catA.id;

  // Set up Organization and Organizer Account
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Kumaraguru Tech Club',
      orgType: 'college',
      contactEmail: 'techclub@kct.ac.in',
      websiteUrl: 'https://kct.ac.in',
      logoUrl: 'https://kct.ac.in/logo.png',
      isVerified: true,
    })
    .returning();
  orgId = org.id;

  const passwordHash = await bcrypt.hash('password123', 10);
  const [organizer] = await db
    .insert(organizerAccounts)
    .values({
      organizationId: orgId,
      name: 'Faculty Admin',
      email: 'admin@kct.ac.in',
      passwordHash,
      role: 'owner',
    })
    .returning();
  organizerId = organizer.id;

  // Create JWT for organizer
  organizerToken = jwt.sign(
    { id: organizerId, role: 'organizer', organizationId: orgId, membershipRole: 'owner' },
    config.jwtSecret,
    { expiresIn: '15m' },
  );

  // Set up Students
  const [studentA] = await db
    .insert(users)
    .values({
      name: 'Alice Student',
      email: 'alice@student.com',
      passwordHash,
      authProvider: 'email',
    })
    .returning();
  studentIdA = studentA.id;

  studentTokenA = jwt.sign({ id: studentIdA, role: 'student' }, config.jwtSecret, {
    expiresIn: '15m',
  });

  const [studentB] = await db
    .insert(users)
    .values({
      name: 'Bob Student',
      email: 'bob@student.com',
      passwordHash,
      authProvider: 'email',
    })
    .returning();
  studentIdB = studentB.id;

  studentTokenB = jwt.sign({ id: studentIdB, role: 'student' }, config.jwtSecret, {
    expiresIn: '15m',
  });

  // Create published hackathon: offline, Coimbatore, with prize_summary_text
  const [hack] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      createdBy: organizerId,
      eventType: 'hackathon',
      title: 'HackGURU 2026',
      slug: 'hackguru-2026',
      tagline: 'Code the future at KCT',
      description: 'A 36-hour hackathon for student developers.',
      status: 'published',
      mode: 'offline',
      venue: 'Kumaraguru College of Technology',
      locationId: locationIdA,
      isPaid: false,
      registrationFee: '0.00',
      currency: 'INR',
      eligibilityNotes: 'All college students can participate.',
      eventStartAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // starts in 10 days
      registrationCloseAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // published 2 days ago
    })
    .returning();
  publishedHackathonId = hack.id;
  publishedHackathonSlug = hack.slug;

  await db.insert(hackathonDetails).values({
    eventId: publishedHackathonId,
    maxParticipants: 300,
    prizeSummaryText: 'Total prizes worth ₹1,00,000 across 3 tracks',
    tracks: ['Web3', 'AI', 'FinTech'],
    submissionType: 'prototype',
  });

  await db.insert(eventTags).values([
    { eventId: publishedHackathonId, tagId: tagIdA },
    { eventId: publishedHackathonId, tagId: tagIdB },
  ]);

  await db.insert(eventEligibility).values({
    eventId: publishedHackathonId,
    eligibilityCategoryId: categoryIdA,
  });

  await db.insert(eventContacts).values([
    {
      eventId: publishedHackathonId,
      name: 'Dr. Ramesh',
      phone: '9876543210',
      email: 'ramesh@kct.ac.in',
      roleLabel: 'Faculty Coordinator',
      sortOrder: 1,
    },
    {
      eventId: publishedHackathonId,
      name: 'Suresh Kumar',
      phone: '9123456789',
      email: 'suresh@kct.ac.in',
      roleLabel: 'Student Lead',
      sortOrder: 2,
    },
  ]);

  // Create published workshop: online, free, zero contacts
  const [work] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      createdBy: organizerId,
      eventType: 'workshop',
      title: 'React Bootcamp 2026',
      slug: 'react-bootcamp-2026',
      tagline: 'Master React in 3 hours',
      description: 'Hands-on React workshop for beginners.',
      status: 'published',
      mode: 'online',
      venue: null,
      locationId: null,
      isPaid: false,
      registrationFee: '0.00',
      currency: 'INR',
      eventStartAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // starts in 15 days
      registrationCloseAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // published 1 day ago
    })
    .returning();
  publishedWorkshopId = work.id;
  publishedWorkshopSlug = work.slug;

  await db.insert(workshopDetails).values({
    eventId: publishedWorkshopId,
    speakerName: 'Jane Doe',
    speakerBio: 'Google Developer Expert',
    durationHours: '3.0',
    seatsAvailable: 1000,
    certificateProvided: true,
    prerequisiteSkills: ['HTML', 'CSS', 'JavaScript'],
  });

  await db.insert(eventTags).values({
    eventId: publishedWorkshopId,
    tagId: tagIdA,
  });

  // Create published internship: hybrid, Chennai, paid (fee = 500)
  const [intern] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      createdBy: organizerId,
      eventType: 'internship',
      title: 'AI Engineering Internship',
      slug: 'ai-internship-2026',
      tagline: 'Work on cutting-edge LLMs',
      description: '6 months internship program.',
      status: 'published',
      mode: 'hybrid',
      venue: 'KCT AI Lab',
      locationId: locationIdB,
      isPaid: true,
      registrationFee: '500.00',
      currency: 'INR',
      eventStartAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // starts in 20 days
      registrationCloseAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // published 3 days ago
    })
    .returning();
  publishedInternshipId = intern.id;
  publishedInternshipSlug = intern.slug;

  await db.insert(internshipDetails).values({
    eventId: publishedInternshipId,
    stipendMin: '15000.00',
    stipendMax: '25000.00',
    durationMonths: '6.0',
    workMode: 'hybrid',
    positionsAvailable: 5,
    minExperienceMonths: 0,
    perks: ['Certificate', 'LOR'],
  });

  await db.insert(eventTags).values({
    eventId: publishedInternshipId,
    tagId: tagIdB,
  });

  // Create draft event
  const [draft] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      createdBy: organizerId,
      eventType: 'hackathon',
      title: 'Draft Hackathon',
      slug: 'draft-hackathon',
      tagline: 'Draft tagline',
      description: 'This is a draft hackathon description.',
      status: 'draft',
      mode: 'online',
      venue: null,
      locationId: null,
      isPaid: false,
      registrationFee: '0.00',
      currency: 'INR',
      eventStartAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();
  draftEventId = draft.id;
  draftEventSlug = draft.slug;

  // Create hidden event
  const [hidden] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      createdBy: organizerId,
      eventType: 'workshop',
      title: 'Hidden Workshop',
      slug: 'hidden-workshop',
      tagline: 'Hidden tagline',
      description: 'This is a hidden workshop description.',
      status: 'hidden',
      mode: 'online',
      venue: null,
      locationId: null,
      isPaid: false,
      registrationFee: '0.00',
      currency: 'INR',
      eventStartAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
    })
    .returning();
  hiddenEventId = hidden.id;
  hiddenEventSlug = hidden.slug;
});

afterAll(async () => {
  // Clean up
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
      event_contacts,
      saved_events,
      locations,
      tags,
      eligibility_categories
    RESTART IDENTITY CASCADE;
  `);
  await pool.end();
});

describe('Phase 4: PUBLIC LISTING', () => {
  test('1. Published events appear; draft and hidden events do not', async () => {
    const res = await request(app).get('/api/events').expect(200);

    const eventSlugs = res.body.data.map((e: any) => e.slug);
    expect(eventSlugs).toContain(publishedHackathonSlug);
    expect(eventSlugs).toContain(publishedWorkshopSlug);
    expect(eventSlugs).toContain(publishedInternshipSlug);
    expect(eventSlugs).not.toContain(draftEventSlug);
    expect(eventSlugs).not.toContain(hiddenEventSlug);
  });

  test('2. event_type filtering works', async () => {
    const res = await request(app).get('/api/events?event_type=hackathon').expect(200);

    const eventTypes = res.body.data.map((e: any) => e.event_type);
    expect(eventTypes.length).toBeGreaterThan(0);
    eventTypes.forEach((t: string) => expect(t).toBe('hackathon'));
  });

  test('3. city_id filtering works; non-existent returns empty; malformed returns 400', async () => {
    // Valid and matches Coimbatore
    const resA = await request(app).get(`/api/events?city_id=${locationIdA}`).expect(200);
    expect(resA.body.data.length).toBe(1);
    expect(resA.body.data[0].slug).toBe(publishedHackathonSlug);

    // Valid but non-existent city_id
    const resB = await request(app).get('/api/events?city_id=99999').expect(200);
    expect(resB.body.data.length).toBe(0);

    // Malformed city_id
    await request(app).get('/api/events?city_id=abc').expect(400);
  });

  test('4. mode filtering works for online/offline/hybrid', async () => {
    const onlineRes = await request(app).get('/api/events?mode=online').expect(200);
    expect(onlineRes.body.data.every((e: any) => e.location === 'Online Event')).toBe(true);

    const offlineRes = await request(app).get('/api/events?mode=offline').expect(200);
    expect(offlineRes.body.data.every((e: any) => e.location === 'Coimbatore')).toBe(true);

    const hybridRes = await request(app).get('/api/events?mode=hybrid').expect(200);
    expect(hybridRes.body.data.every((e: any) => e.location === 'Chennai')).toBe(true);
  });

  test('5. is_paid filtering works', async () => {
    const freeRes = await request(app).get('/api/events?is_paid=false').expect(200);
    expect(freeRes.body.data.some((e: any) => e.slug === publishedHackathonSlug)).toBe(true);
    expect(freeRes.body.data.some((e: any) => e.slug === publishedInternshipSlug)).toBe(false);

    const paidRes = await request(app).get('/api/events?is_paid=true').expect(200);
    expect(paidRes.body.data.some((e: any) => e.slug === publishedInternshipSlug)).toBe(true);
    expect(paidRes.body.data.some((e: any) => e.slug === publishedHackathonSlug)).toBe(false);
  });

  test('6. fee_max filtering works', async () => {
    const resA = await request(app).get('/api/events?fee_max=400').expect(200);
    // Should return hackathon & workshop (fee = 0) but not internship (fee = 500)
    const slugsA = resA.body.data.map((e: any) => e.slug);
    expect(slugsA).toContain(publishedHackathonSlug);
    expect(slugsA).toContain(publishedWorkshopSlug);
    expect(slugsA).not.toContain(publishedInternshipSlug);

    const resB = await request(app).get('/api/events?fee_max=500').expect(200);
    // Should return all
    const slugsB = resB.body.data.map((e: any) => e.slug);
    expect(slugsB).toContain(publishedHackathonSlug);
    expect(slugsB).toContain(publishedWorkshopSlug);
    expect(slugsB).toContain(publishedInternshipSlug);
  });

  test('7. date_from/date_to range filtering works', async () => {
    const targetDate = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();

    const fromRes = await request(app).get(`/api/events?date_from=${targetDate}`).expect(200);
    // Hackathon starts in 10 days (before target), workshop starts in 15 days, internship starts in 20 days
    const slugsFrom = fromRes.body.data.map((e: any) => e.slug);
    expect(slugsFrom).not.toContain(publishedHackathonSlug);
    expect(slugsFrom).toContain(publishedWorkshopSlug);
    expect(slugsFrom).toContain(publishedInternshipSlug);

    const toRes = await request(app).get(`/api/events?date_to=${targetDate}`).expect(200);
    const slugsTo = toRes.body.data.map((e: any) => e.slug);
    expect(slugsTo).toContain(publishedHackathonSlug);
    expect(slugsTo).not.toContain(publishedWorkshopSlug);
    expect(slugsTo).not.toContain(publishedInternshipSlug);
  });

  test('8. tag_ids matches ANY supplied tag (OR within the filter)', async () => {
    // tag A = React (matches hackathon & workshop)
    // tag B = AI (matches hackathon & internship)
    // Querying with tag_ids = A, B should match all three
    const res = await request(app).get(`/api/events?tag_ids=${tagIdA},${tagIdB}`).expect(200);

    const slugs = res.body.data.map((e: any) => e.slug);
    expect(slugs).toContain(publishedHackathonSlug);
    expect(slugs).toContain(publishedWorkshopSlug);
    expect(slugs).toContain(publishedInternshipSlug);

    // Querying with just tag A should match hackathon and workshop
    const resA = await request(app).get(`/api/events?tag_ids=${tagIdA}`).expect(200);
    const slugsA = resA.body.data.map((e: any) => e.slug);
    expect(slugsA).toContain(publishedHackathonSlug);
    expect(slugsA).toContain(publishedWorkshopSlug);
    expect(slugsA).not.toContain(publishedInternshipSlug);
  });

  test('9. Different filter categories combine with AND', async () => {
    // Mode = online AND event_type = hackathon -> None (hackathon is offline)
    const res = await request(app).get('/api/events?mode=online&event_type=hackathon').expect(200);
    expect(res.body.data.length).toBe(0);
  });

  test('10. Pagination limits are enforced', async () => {
    await request(app).get('/api/events?page=0').expect(400);
    await request(app).get('/api/events?limit=101').expect(400);

    const res = await request(app).get('/api/events?page=1&limit=2').expect(200);

    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(2);
    expect(res.body.total).toBe(3);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.data.length).toBe(2);
  });

  test('11. Sorting options work with deterministic tiebreaks', async () => {
    // Default: event_start_at ASC, id ASC
    // Dates order: Hackathon (10 days), Workshop (15 days), Internship (20 days)
    const resDefault = await request(app).get('/api/events').expect(200);

    expect(resDefault.body.data[0].slug).toBe(publishedHackathonSlug);
    expect(resDefault.body.data[1].slug).toBe(publishedWorkshopSlug);
    expect(resDefault.body.data[2].slug).toBe(publishedInternshipSlug);

    // Newest: published_at DESC, id DESC
    // Published dates order:
    // Workshop: 1 day ago
    // Hackathon: 2 days ago
    // Internship: 3 days ago
    // So order should be: Workshop, Hackathon, Internship
    const resNewest = await request(app).get('/api/events?sort=newest').expect(200);

    expect(resNewest.body.data[0].slug).toBe(publishedWorkshopSlug);
    expect(resNewest.body.data[1].slug).toBe(publishedHackathonSlug);
    expect(resNewest.body.data[2].slug).toBe(publishedInternshipSlug);
  });
});

describe('Phase 4: LOCATION', () => {
  test('12. Offline and hybrid event cards return city only', async () => {
    const res = await request(app).get('/api/events').expect(200);

    const hackathon = res.body.data.find((e: any) => e.slug === publishedHackathonSlug);
    expect(hackathon.location).toBe('Coimbatore');
    expect(hackathon.venue).toBeUndefined();

    const internship = res.body.data.find((e: any) => e.slug === publishedInternshipSlug);
    expect(internship.location).toBe('Chennai');
    expect(internship.venue).toBeUndefined();
  });

  test('13. Online event cards return "Online Event"', async () => {
    const res = await request(app).get('/api/events').expect(200);

    const workshop = res.body.data.find((e: any) => e.slug === publishedWorkshopSlug);
    expect(workshop.location).toBe('Online Event');
    expect(workshop.venue).toBeUndefined();
  });

  test('14. Full detail returns venue + city/state/country for offline/hybrid', async () => {
    const res = await request(app).get(`/api/events/${publishedHackathonSlug}`).expect(200);

    expect(res.body.venue).toBe('Kumaraguru College of Technology');
    expect(res.body.location).toEqual({
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      country: 'India',
    });
  });

  test('15. Full detail returns "Online Event" with venue: null for online', async () => {
    const res = await request(app).get(`/api/events/${publishedWorkshopSlug}`).expect(200);

    expect(res.body.venue).toBeNull();
    expect(res.body.location).toBe('Online Event');
  });

  test('16. Offline/hybrid event with no venue set returns venue: null', async () => {
    // Let's create an offline event with location_id but no venue
    const [noVenueEvent] = await db
      .insert(events)
      .values({
        organizationId: orgId,
        createdBy: organizerId,
        eventType: 'workshop',
        title: 'No Venue Event',
        slug: 'no-venue-event',
        description: 'Test event with location but no venue string.',
        status: 'published',
        mode: 'offline',
        venue: null,
        locationId: locationIdA,
        eventStartAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const res = await request(app).get(`/api/events/${noVenueEvent.slug}`).expect(200);

    expect(res.body.venue).toBeNull();
    expect(res.body.location).toEqual({
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      country: 'India',
    });

    // Cleanup
    await db.delete(events).where(eq(events.id, noVenueEvent.id));
  });

  test('Lightweight event cards return organization.name correctly for all modes', async () => {
    const res = await request(app).get('/api/events').expect(200);

    res.body.data.forEach((e: any) => {
      expect(e.organization).toBeDefined();
      expect(e.organization.name).toBe('Kumaraguru Tech Club');
    });
  });
});

describe('Phase 4: EVENT DETAIL', () => {
  test('17. Published event is accessible; correct fields returned', async () => {
    const res = await request(app).get(`/api/events/${publishedHackathonSlug}`).expect(200);

    const body = res.body;
    expect(body.title).toBe('HackGURU 2026');
    expect(body.tagline).toBe('Code the future at KCT');
    expect(body.description).toBe('A 36-hour hackathon for student developers.');
    expect(body.event_type).toBe('hackathon');
    expect(body.mode).toBe('offline');
    expect(body.timezone).toBe('Asia/Kolkata');
    expect(body.is_paid).toBe(false);
    expect(body.registration_fee).toBe(0);
    expect(body.currency).toBe('INR');
    expect(body.resume_required).toBe(false);
    expect(body.registration_open_at).toBeDefined();
    expect(body.registration_close_at).toBeDefined();
    expect(body.event_start_at).toBeDefined();
    expect(body.event_end_at).toBeDefined();
    expect(body.eligibility_notes).toBe('All college students can participate.');
  });

  test('18. Draft event returns 404, even with organizer JWT', async () => {
    // Unauthenticated
    await request(app).get(`/api/events/${draftEventSlug}`).expect(404);

    // Authenticated organizer
    await request(app)
      .get(`/api/events/${draftEventSlug}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(404);
  });

  test('19. Hidden event returns 404', async () => {
    await request(app).get(`/api/events/${hiddenEventSlug}`).expect(404);
  });

  test('20. Non-existent slug returns 404', async () => {
    await request(app).get('/api/events/does-not-exist').expect(404);
  });

  test('21. Organization data is scoped to public fields only', async () => {
    const res = await request(app).get(`/api/events/${publishedHackathonSlug}`).expect(200);

    const org = res.body.organization;
    expect(org).toBeDefined();
    expect(org.name).toBe('Kumaraguru Tech Club');
    expect(org.logo_url).toBe('https://kct.ac.in/logo.png');
    expect(org.is_verified).toBe(true);
    expect(org.org_type).toBe('college');
    expect(org.website_url).toBe('https://kct.ac.in');

    // Sensitive organizer data should not leak
    expect(org.contact_email).toBeUndefined();
    expect(org.contact_phone).toBeUndefined();
    expect(res.body.organizer_accounts).toBeUndefined();
  });

  test('22. Type-specific details are correct per event_type', async () => {
    // Hackathon details
    const resHack = await request(app).get(`/api/events/${publishedHackathonSlug}`).expect(200);
    expect(resHack.body.hackathon_details).toBeDefined();
    expect(resHack.body.hackathon_details.max_participants).toBe(300);
    expect(resHack.body.hackathon_details.prize_summary_text).toBe(
      'Total prizes worth ₹1,00,000 across 3 tracks',
    );
    expect(resHack.body.hackathon_details.tracks).toEqual(['Web3', 'AI', 'FinTech']);
    expect(resHack.body.hackathon_details.submission_type).toBe('prototype');
    expect(resHack.body.workshop_details).toBeUndefined();
    expect(resHack.body.internship_details).toBeUndefined();

    // Workshop details
    const resWork = await request(app).get(`/api/events/${publishedWorkshopSlug}`).expect(200);
    expect(resWork.body.workshop_details).toBeDefined();
    expect(resWork.body.workshop_details.speaker_name).toBe('Jane Doe');
    expect(resWork.body.workshop_details.speaker_bio).toBe('Google Developer Expert');
    expect(resWork.body.workshop_details.duration_hours).toBe(3);
    expect(resWork.body.workshop_details.seats_available).toBe(1000);
    expect(resWork.body.workshop_details.certificate_provided).toBe(true);
    expect(resWork.body.workshop_details.prerequisite_skills).toEqual([
      'HTML',
      'CSS',
      'JavaScript',
    ]);
    expect(resWork.body.hackathon_details).toBeUndefined();
    expect(resWork.body.internship_details).toBeUndefined();

    // Internship details
    const resIntern = await request(app).get(`/api/events/${publishedInternshipSlug}`).expect(200);
    expect(resIntern.body.internship_details).toBeDefined();
    expect(resIntern.body.internship_details.stipend_min).toBe(15000);
    expect(resIntern.body.internship_details.stipend_max).toBe(25000);
    expect(resIntern.body.internship_details.duration_months).toBe(6);
    expect(resIntern.body.internship_details.work_mode).toBe('hybrid');
    expect(resIntern.body.internship_details.positions_available).toBe(5);
    expect(resIntern.body.internship_details.min_experience_months).toBe(0);
    expect(resIntern.body.internship_details.perks).toEqual(['Certificate', 'LOR']);
    expect(resIntern.body.hackathon_details).toBeUndefined();
    expect(resIntern.body.workshop_details).toBeUndefined();
  });

  test('23. Tags and eligibility_categories arrays are correct', async () => {
    const res = await request(app).get(`/api/events/${publishedHackathonSlug}`).expect(200);

    expect(res.body.tags).toBeDefined();
    expect(res.body.tags.length).toBe(2);
    const tagSlugs = res.body.tags.map((t: any) => t.slug);
    expect(tagSlugs).toContain('react');
    expect(tagSlugs).toContain('ai');

    expect(res.body.eligibility_categories).toBeDefined();
    expect(res.body.eligibility_categories.length).toBe(1);
    expect(res.body.eligibility_categories[0].slug).toBe('undergrad');
  });

  test('24. Contacts array is correct and ordered; returns [] if zero', async () => {
    // Has 2 contacts
    const resA = await request(app).get(`/api/events/${publishedHackathonSlug}`).expect(200);

    expect(resA.body.contacts).toBeDefined();
    expect(resA.body.contacts.length).toBe(2);
    expect(resA.body.contacts[0].name).toBe('Dr. Ramesh'); // sort_order 1
    expect(resA.body.contacts[1].name).toBe('Suresh Kumar'); // sort_order 2

    // Has 0 contacts
    const resB = await request(app).get(`/api/events/${publishedWorkshopSlug}`).expect(200);
    expect(resB.body.contacts).toBeDefined();
    expect(resB.body.contacts).toEqual([]);
  });
});

describe('Phase 4: SAVED EVENTS & LISTING', () => {
  test('25. Student can save a published event', async () => {
    await request(app)
      .post(`/api/events/${publishedHackathonId}/save`)
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    // Verify in DB
    const saved = await db
      .select()
      .from(savedEvents)
      .where(
        and(eq(savedEvents.userId, studentIdA), eq(savedEvents.eventId, publishedHackathonId)),
      );
    expect(saved.length).toBe(1);
  });

  test('26. Repeated save is idempotent', async () => {
    await request(app)
      .post(`/api/events/${publishedHackathonId}/save`)
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    await request(app)
      .post(`/api/events/${publishedHackathonId}/save`)
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    const saved = await db
      .select()
      .from(savedEvents)
      .where(
        and(eq(savedEvents.userId, studentIdA), eq(savedEvents.eventId, publishedHackathonId)),
      );
    expect(saved.length).toBe(1);
  });

  test('27. Student can unsave', async () => {
    // Save first
    await request(app)
      .post(`/api/events/${publishedWorkshopId}/save`)
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    // Unsave
    await request(app)
      .delete(`/api/events/${publishedWorkshopId}/save`)
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    const saved = await db
      .select()
      .from(savedEvents)
      .where(and(eq(savedEvents.userId, studentIdA), eq(savedEvents.eventId, publishedWorkshopId)));
    expect(saved.length).toBe(0);
  });

  test('28. Saving a draft/hidden/non-existent event returns 404', async () => {
    await request(app)
      .post(`/api/events/${draftEventId}/save`)
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(404);

    await request(app)
      .post(`/api/events/${hiddenEventId}/save`)
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(404);

    await request(app)
      .post('/api/events/00000000-0000-0000-0000-000000000000/save')
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(404);
  });

  test('29. Saved list contains only currently published events', async () => {
    // Student A saves published internship
    await request(app)
      .post(`/api/events/${publishedInternshipId}/save`)
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    // Verify in list
    const resA = await request(app)
      .get('/api/users/me/saved')
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    let slugs = resA.body.data.map((e: any) => e.slug);
    expect(slugs).toContain(publishedInternshipSlug);

    // Unpublish internship (set status to 'draft')
    await db.update(events).set({ status: 'draft' }).where(eq(events.id, publishedInternshipId));

    // Get list again - should not contain internship, but row in savedEvents still exists
    const resB = await request(app)
      .get('/api/users/me/saved')
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    slugs = resB.body.data.map((e: any) => e.slug);
    expect(slugs).not.toContain(publishedInternshipSlug);

    const dbSaved = await db
      .select()
      .from(savedEvents)
      .where(
        and(eq(savedEvents.userId, studentIdA), eq(savedEvents.eventId, publishedInternshipId)),
      );
    expect(dbSaved.length).toBe(1);

    // Restore published status
    await db
      .update(events)
      .set({ status: 'published' })
      .where(eq(events.id, publishedInternshipId));
  });

  test("30. Student isolation — one student cannot see another's saved list", async () => {
    // Student A has saved events (Hackathon)
    // Student B has saved nothing
    const resA = await request(app)
      .get('/api/users/me/saved')
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);
    expect(resA.body.data.some((e: any) => e.slug === publishedHackathonSlug)).toBe(true);

    const resB = await request(app)
      .get('/api/users/me/saved')
      .set('Authorization', `Bearer ${studentTokenB}`)
      .expect(200);
    expect(resB.body.data.length).toBe(0);
  });

  test('31. Organizer token is rejected (403) on save/unsave/list', async () => {
    await request(app)
      .post(`/api/events/${publishedHackathonId}/save`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(403);

    await request(app)
      .delete(`/api/events/${publishedHackathonId}/save`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(403);

    await request(app)
      .get('/api/users/me/saved')
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(403);
  });

  test('32. Unauthenticated requests are rejected (401)', async () => {
    await request(app).post(`/api/events/${publishedHackathonId}/save`).expect(401);

    await request(app).delete(`/api/events/${publishedHackathonId}/save`).expect(401);

    await request(app).get('/api/users/me/saved').expect(401);
  });

  test('33. Pagination on GET /api/users/me/saved works', async () => {
    // Student A saves workshop as well
    await request(app)
      .post(`/api/events/${publishedWorkshopId}/save`)
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    const res = await request(app)
      .get('/api/users/me/saved?page=1&limit=1')
      .set('Authorization', `Bearer ${studentTokenA}`)
      .expect(200);

    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(1);
    expect(res.body.totalPages).toBe(3); // Hackathon, Internship (restored), Workshop
    expect(res.body.data.length).toBe(1);
  });
});

describe('Phase 4: SWAGGER', () => {
  test('34-35. All Phase 4 endpoints appear in /api-docs and Try it out works', async () => {
    const res = await request(app).get('/api-docs-json').expect(200);

    const paths = res.body.paths;
    expect(paths).toHaveProperty('/api/events');
    expect(paths['/api/events']).toHaveProperty('get');

    expect(paths).toHaveProperty('/api/events/{slug}');
    expect(paths['/api/events/{slug}']).toHaveProperty('get');

    expect(paths).toHaveProperty('/api/events/{id}/save');
    expect(paths['/api/events/{id}/save']).toHaveProperty('post');
    expect(paths['/api/events/{id}/save']).toHaveProperty('delete');

    expect(paths).toHaveProperty('/api/users/me/saved');
    expect(paths['/api/users/me/saved']).toHaveProperty('get');
  });
});
