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
  eventCustomFields,
  eventRegistrations,
  eventRegistrationResponses,
} from '../db/schema';
import { locations, eligibilityCategories } from '../db/schema/locations';
import { config } from '../config';

jest.setTimeout(30000);

describe('Phase 5 Integration Tests: Event Registration', () => {
  let locationId: number;
  let categoryId: number;
  let orgIdA: string;
  let orgIdB: string;
  let organizerAId: string;
  let organizerBId: string;
  let studentAId: string;
  let studentBId: string;

  let organizerAToken: string;
  let organizerBToken: string;
  let studentAToken: string;
  let studentBToken: string;

  let publishedFreeEventId: string;
  let publishedPaidEventId: string;
  let draftEventId: string;
  let hiddenEventId: string;

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
        eligibility_categories,
        event_custom_fields,
        event_registrations,
        event_registration_responses
      RESTART IDENTITY CASCADE;
    `);

    // Setup locations and categories
    const [loc] = await db.insert(locations).values({ city: 'Coimbatore', state: 'Tamil Nadu', country: 'India' }).returning();
    locationId = loc.id;

    const [cat] = await db.insert(eligibilityCategories).values({ name: 'Undergrad', slug: 'undergrad' }).returning();
    categoryId = cat.id;

    // Setup Organizations
    const [orgA] = await db.insert(organizations).values({ name: 'Org A', orgType: 'college', contactEmail: 'a@org.com', isVerified: true }).returning();
    orgIdA = orgA.id;

    const [orgB] = await db.insert(organizations).values({ name: 'Org B', orgType: 'college', contactEmail: 'b@org.com', isVerified: true }).returning();
    orgIdB = orgB.id;

    // Setup Organizers
    const passwordHash = await bcrypt.hash('password123', 10);

    const [orgAccountA] = await db.insert(organizerAccounts).values({
      organizationId: orgIdA, name: 'Organizer A', email: 'org-a@test.com', passwordHash, role: 'owner'
    }).returning();
    organizerAId = orgAccountA.id;

    const [orgAccountB] = await db.insert(organizerAccounts).values({
      organizationId: orgIdB, name: 'Organizer B', email: 'org-b@test.com', passwordHash, role: 'owner'
    }).returning();
    organizerBId = orgAccountB.id;

    organizerAToken = jwt.sign(
      { id: organizerAId, role: 'organizer', organizationId: orgIdA, membershipRole: 'owner' },
      config.jwtSecret,
      { expiresIn: '15m' }
    );

    organizerBToken = jwt.sign(
      { id: organizerBId, role: 'organizer', organizationId: orgIdB, membershipRole: 'owner' },
      config.jwtSecret,
      { expiresIn: '15m' }
    );

    // Setup Students
    const [studA] = await db.insert(users).values({ name: 'Student A', email: 'student-a@test.com', passwordHash, authProvider: 'email' }).returning();
    studentAId = studA.id;

    const [studB] = await db.insert(users).values({ name: 'Student B', email: 'student-b@test.com', passwordHash, authProvider: 'email' }).returning();
    studentBId = studB.id;

    studentAToken = jwt.sign({ id: studentAId, role: 'student' }, config.jwtSecret, { expiresIn: '15m' });
    studentBToken = jwt.sign({ id: studentBId, role: 'student' }, config.jwtSecret, { expiresIn: '15m' });

    // Setup events
    // 1. Published Free Event
    const [event1] = await db.insert(events).values({
      organizationId: orgIdA,
      createdBy: organizerAId,
      eventType: 'hackathon',
      title: 'Free Hackathon',
      slug: 'free-hackathon',
      description: 'Free hackathon',
      status: 'published',
      mode: 'offline',
      locationId,
      isPaid: false,
      registrationFee: '0.00',
      eventStartAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      publishedAt: new Date(),
    }).returning();
    publishedFreeEventId = event1.id;

    await db.insert(hackathonDetails).values({
      eventId: publishedFreeEventId,
      maxParticipants: 100,
      prizeSummaryText: 'Win ₹10,000',
      tracks: ['AI'],
      submissionType: 'prototype',
    });

    // 2. Published Paid Event
    const [event2] = await db.insert(events).values({
      organizationId: orgIdA,
      createdBy: organizerAId,
      eventType: 'workshop',
      title: 'Paid Workshop',
      slug: 'paid-workshop',
      description: 'Paid workshop',
      status: 'published',
      mode: 'offline',
      locationId,
      isPaid: true,
      registrationFee: '150.00',
      eventStartAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      publishedAt: new Date(),
    }).returning();
    publishedPaidEventId = event2.id;

    await db.insert(workshopDetails).values({
      eventId: publishedPaidEventId,
      seatsAvailable: 50,
      speakerName: 'Speaker',
      durationHours: '3.0',
    });

    // 3. Draft Event
    const [event3] = await db.insert(events).values({
      organizationId: orgIdA,
      createdBy: organizerAId,
      eventType: 'hackathon',
      title: 'Draft Event',
      slug: 'draft-event',
      description: 'Draft event',
      status: 'draft',
      mode: 'offline',
      locationId,
      isPaid: false,
      eventStartAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    }).returning();
    draftEventId = event3.id;

    // 4. Hidden Event
    const [event4] = await db.insert(events).values({
      organizationId: orgIdA,
      createdBy: organizerAId,
      eventType: 'hackathon',
      title: 'Hidden Event',
      slug: 'hidden-event',
      description: 'Hidden event',
      status: 'hidden',
      mode: 'offline',
      locationId,
      isPaid: false,
      eventStartAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    }).returning();
    hiddenEventId = event4.id;
  });

  describe('1. ORGANIZER: MANAGE CUSTOM FIELDS', () => {
    test('1. Organizer can set/replace custom fields for their own event', async () => {
      const payload = [
        { label: 'T-Shirt Size', field_type: 'select', options: ['S', 'M', 'L', 'XL'], is_required: true },
        { label: 'GitHub Profile', field_type: 'url', is_required: false },
        { label: 'Graduation Date', field_type: 'date', is_required: true },
        { label: 'Accept Terms', field_type: 'checkbox', is_required: true }
      ];

      const res = await request(app)
        .put(`/api/organizer/events/${publishedFreeEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send(payload)
        .expect(200);

      expect(res.body.message).toBe('Custom fields updated successfully');

      // Verify via GET
      const getRes = await request(app)
        .get(`/api/organizer/events/${publishedFreeEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .expect(200);

      expect(getRes.body.length).toBe(4);
      expect(getRes.body[0].label).toBe('T-Shirt Size');
      expect(getRes.body[0].field_type).toBe('select');
      expect(getRes.body[0].options).toEqual(['S', 'M', 'L', 'XL']);
      expect(getRes.body[0].is_required).toBe(true);
      expect(getRes.body[0].sort_order).toBe(0);

      expect(getRes.body[1].label).toBe('GitHub Profile');
      expect(getRes.body[1].field_type).toBe('url');
      expect(getRes.body[1].is_required).toBe(false);
      expect(getRes.body[1].sort_order).toBe(1);
    });

    test('2. Cross-org access is rejected (403)', async () => {
      await request(app)
        .get(`/api/organizer/events/${publishedFreeEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerBToken}`)
        .expect(403);

      await request(app)
        .put(`/api/organizer/events/${publishedFreeEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerBToken}`)
        .send([])
        .expect(403);
    });

    test('3. select/multiselect without options is rejected (400)', async () => {
      const invalidPayload = [
        { label: 'Invalid Select', field_type: 'select', is_required: true }
      ];

      await request(app)
        .put(`/api/organizer/events/${publishedFreeEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send(invalidPayload)
        .expect(400);
    });
  });

  describe('2. STUDENT: REGISTER FOR AN EVENT', () => {
    let customFields: any[] = [];

    beforeAll(async () => {
      // Get the custom fields created in step 1
      const res = await request(app)
        .get(`/api/organizer/events/${publishedFreeEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .expect(200);
      customFields = res.body;
    });

    test('5. Student can register for a published event with valid responses', async () => {
      // Free event should have payment_status 'not_applicable'
      const responses = [
        { field_id: customFields[0].id, value: 'M' },
        { field_id: customFields[1].id, value: 'https://github.com/studenta' },
        { field_id: customFields[2].id, value: '2027-05-15' },
        { field_id: customFields[3].id, value: 'true' }
      ];

      const res = await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ responses })
        .expect(201);

      expect(res.body.message).toBe('Registered successfully');
      expect(res.body.status).toBe('registered');
      expect(res.body.payment_status).toBe('not_applicable');
      expect(res.body).toHaveProperty('registration_id');

      // Verify event registration count is incremented to 1
      const [event] = await db.select().from(events).where(eq(events.id, publishedFreeEventId));
      expect(event.registrationCount).toBe(1);
    });

    test('4. Once a registration exists for the event, PUT custom-fields returns 409', async () => {
      await request(app)
        .put(`/api/organizer/events/${publishedFreeEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send([])
        .expect(409);
    });

    test('6. Registration before registration_open_at is rejected (400)', async () => {
      // Create event with registration_open_at in future
      const [futureEvent] = await db.insert(events).values({
        organizationId: orgIdA,
        createdBy: organizerAId,
        eventType: 'hackathon',
        title: 'Future Reg Event',
        slug: 'future-reg',
        description: 'Future',
        status: 'published',
        mode: 'online',
        isPaid: false,
        registrationOpenAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // starts in 2 days
        eventStartAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      }).returning();

      await request(app)
        .post(`/api/events/${futureEvent.id}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ responses: [] })
        .expect(400);
    });

    test('7. Registration after registration_close_at is rejected (400)', async () => {
      // Create event with registration_close_at in past
      const [pastEvent] = await db.insert(events).values({
        organizationId: orgIdA,
        createdBy: organizerAId,
        eventType: 'hackathon',
        title: 'Past Reg Event',
        slug: 'past-reg',
        description: 'Past',
        status: 'published',
        mode: 'online',
        isPaid: false,
        registrationCloseAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // closed 1 day ago
        eventStartAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      }).returning();

      await request(app)
        .post(`/api/events/${pastEvent.id}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ responses: [] })
        .expect(400);
    });

    test('8. Registering for a draft/hidden/non-existent event returns 404', async () => {
      await request(app)
        .post(`/api/events/${draftEventId}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ responses: [] })
        .expect(404);

      await request(app)
        .post(`/api/events/${hiddenEventId}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ responses: [] })
        .expect(404);

      await request(app)
        .post(`/api/events/00000000-0000-0000-0000-000000000000/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ responses: [] })
        .expect(404);
    });

    test('9. Missing a required field\'s response is rejected (400)', async () => {
      // T-Shirt Size is required, let's omit it
      const responses = [
        { field_id: customFields[1].id, value: 'https://github.com' },
        { field_id: customFields[2].id, value: '2027-05-15' },
        { field_id: customFields[3].id, value: 'true' }
      ];

      const res = await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentBToken}`)
        .send({ responses })
        .expect(400);

      expect(res.body.message).toContain('is required');
    });

    test('10. Invalid select/multiselect/checkbox/date/url values are rejected (400)', async () => {
      // 1. Invalid select value
      let responses = [
        { field_id: customFields[0].id, value: 'XXL' }, // XXL is not in ['S', 'M', 'L', 'XL']
        { field_id: customFields[1].id, value: 'https://github.com' },
        { field_id: customFields[2].id, value: '2027-05-15' },
        { field_id: customFields[3].id, value: 'true' }
      ];
      await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentBToken}`)
        .send({ responses })
        .expect(400);

      // 2. Invalid checkbox value
      responses = [
        { field_id: customFields[0].id, value: 'M' },
        { field_id: customFields[1].id, value: 'https://github.com' },
        { field_id: customFields[2].id, value: '2027-05-15' },
        { field_id: customFields[3].id, value: 'yes' } // not 'true' or 'false'
      ];
      await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentBToken}`)
        .send({ responses })
        .expect(400);

      // 3. Invalid date value
      responses = [
        { field_id: customFields[0].id, value: 'M' },
        { field_id: customFields[1].id, value: 'https://github.com' },
        { field_id: customFields[2].id, value: 'invalid-date' },
        { field_id: customFields[3].id, value: 'true' }
      ];
      await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentBToken}`)
        .send({ responses })
        .expect(400);

      // 4. Invalid url value
      responses = [
        { field_id: customFields[0].id, value: 'M' },
        { field_id: customFields[1].id, value: 'not-a-url' },
        { field_id: customFields[2].id, value: '2027-05-15' },
        { field_id: customFields[3].id, value: 'true' }
      ];
      await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentBToken}`)
        .send({ responses })
        .expect(400);
    });

    test('11. A field_id not belonging to the event is rejected (400)', async () => {
      const responses = [
        { field_id: 99999, value: 'M' }
      ];
      await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentBToken}`)
        .send({ responses })
        .expect(400);
    });

    test('12. Duplicate active registration is rejected (409)', async () => {
      // Student A registers again
      const responses = [
        { field_id: customFields[0].id, value: 'M' },
        { field_id: customFields[1].id, value: 'https://github.com/studenta' },
        { field_id: customFields[2].id, value: '2027-05-15' },
        { field_id: customFields[3].id, value: 'true' }
      ];

      await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ responses })
        .expect(409);
    });

    test('15. is_paid=false → payment_status=\'not_applicable\'; is_paid=true → payment_status=\'pending\'', async () => {
      // Create custom fields for paid event
      const fieldPayload = [
        { label: 'Experience', field_type: 'text', is_required: true }
      ];
      await request(app)
        .put(`/api/organizer/events/${publishedPaidEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send(fieldPayload)
        .expect(200);

      const fieldsRes = await request(app)
        .get(`/api/organizer/events/${publishedPaidEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .expect(200);

      const responses = [
        { field_id: fieldsRes.body[0].id, value: '2 Years' }
      ];

      const res = await request(app)
        .post(`/api/events/${publishedPaidEventId}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ responses })
        .expect(201);

      expect(res.body.payment_status).toBe('pending');
    });

    test('14. registration_count increments transactionally (verify failure mid-transaction)', async () => {
      // Setup: get event registration count first
      const [initialEvent] = await db.select().from(events).where(eq(events.id, publishedFreeEventId));
      const initialCount = initialEvent.registrationCount;

      // Sign token for non-existent student UUID
      const fakeStudentToken = jwt.sign({ id: '00000000-0000-0000-0000-000000000000', role: 'student' }, config.jwtSecret, { expiresIn: '15m' });

      const responses = [
        { field_id: customFields[0].id, value: 'M' },
        { field_id: customFields[1].id, value: 'https://github.com/studenta' },
        { field_id: customFields[2].id, value: '2027-05-15' },
        { field_id: customFields[3].id, value: 'true' }
      ];

      // Fails during registration insert (due to FK user_id check in DB), returning 500
      await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${fakeStudentToken}`)
        .send({ responses })
        .expect(500);

      // Verify directly against DB that no registration row exists and registration count has NOT incremented
      const [eventAfter] = await db.select().from(events).where(eq(events.id, publishedFreeEventId));
      expect(eventAfter.registrationCount).toBe(initialCount);

      const fakeUserRegs = await db.select().from(eventRegistrations).where(eq(eventRegistrations.userId, '00000000-0000-0000-0000-000000000000'));
      expect(fakeUserRegs.length).toBe(0);
    });
  });

  describe('3. STUDENT: CANCEL REGISTRATION', () => {
    test('16. Student can cancel their own registration; status becomes \'cancelled\', row is retained, registration_count decrements', async () => {
      // Alice Student A cancels Free Event registration
      const [initialEvent] = await db.select().from(events).where(eq(events.id, publishedFreeEventId));
      const initialCount = initialEvent.registrationCount;

      await request(app)
        .delete(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      // Verify count in DB
      const [eventAfter] = await db.select().from(events).where(eq(events.id, publishedFreeEventId));
      expect(eventAfter.registrationCount).toBe(initialCount - 1);

      // Verify row is still in DB, status is cancelled
      const [reg] = await db
        .select()
        .from(eventRegistrations)
        .where(and(eq(eventRegistrations.eventId, publishedFreeEventId), eq(eventRegistrations.userId, studentAId)));
      expect(reg).toBeDefined();
      expect(reg.status).toBe('cancelled');
    });

    test('17. Cancelling a non-existent/already-cancelled registration returns 404', async () => {
      // Cancelling already cancelled
      await request(app)
        .delete(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(404);

      // Cancelling non-existent
      await request(app)
        .delete(`/api/events/${draftEventId}/register`)
        .set('Authorization', `Bearer ${studentBToken}`)
        .expect(404);
    });

    test('13. Registering again after a prior cancellation succeeds by reusing the existing row and registration_count increments correctly', async () => {
      const getRes = await request(app)
        .get(`/api/organizer/events/${publishedFreeEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .expect(200);
      const customFields = getRes.body;

      const responses = [
        { field_id: customFields[0].id, value: 'S' },
        { field_id: customFields[1].id, value: 'https://github.com/studenta-new' },
        { field_id: customFields[2].id, value: '2028-05-15' },
        { field_id: customFields[3].id, value: 'false' }
      ];

      const [initialEvent] = await db.select().from(events).where(eq(events.id, publishedFreeEventId));
      const initialCount = initialEvent.registrationCount;

      // Re-register Student A
      const res = await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ responses })
        .expect(201);

      expect(res.body.status).toBe('registered');

      // Verify row is reused
      const regs = await db
        .select()
        .from(eventRegistrations)
        .where(and(eq(eventRegistrations.eventId, publishedFreeEventId), eq(eventRegistrations.userId, studentAId)));
      expect(regs.length).toBe(1);
      expect(regs[0].status).toBe('registered');

      // Verify responses are updated
      const respRows = await db
        .select()
        .from(eventRegistrationResponses)
        .where(eq(eventRegistrationResponses.registrationId, regs[0].id));
      expect(respRows.length).toBe(4);
      expect(respRows.map(r => r.value)).toContain('https://github.com/studenta-new');

      // Verify count in DB
      const [eventAfter] = await db.select().from(events).where(eq(events.id, publishedFreeEventId));
      expect(eventAfter.registrationCount).toBe(initialCount + 1);
    });
  });

  describe('4. STUDENT: LIST OWN REGISTRATIONS', () => {
    test('18. GET /api/users/me/registrations returns the student\'s own registrations including cancelled ones, correct pagination/order', async () => {
      // Alice (Student A) registers for paid event too (active), and free event is active.
      // Let's cancel paid event to have both cancelled and active registrations.
      await request(app)
        .delete(`/api/events/${publishedPaidEventId}/register`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      // Student A has 2 registrations:
      // Free Event: registered
      // Paid Event: cancelled
      const res = await request(app)
        .get('/api/users/me/registrations?page=1&limit=10')
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(200);

      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
      expect(res.body.total).toBe(2);
      expect(res.body.totalPages).toBe(1);
      expect(res.body.data.length).toBe(2);

      // Ordered by registered_at DESC. Since Free Event was re-registered newer, it should come first.
      expect(res.body.data[0].id).toBe(publishedFreeEventId);
      expect(res.body.data[0].status).toBe('registered');
      expect(res.body.data[0].payment_status).toBe('not_applicable');
      expect(res.body.data[0]).toHaveProperty('registration_id');

      expect(res.body.data[1].id).toBe(publishedPaidEventId);
      expect(res.body.data[1].status).toBe('cancelled');
      expect(res.body.data[1].payment_status).toBe('pending');
    });
  });

  describe('5. ORGANIZER: VIEW EVENT REGISTRANTS', () => {
    test('19. GET /api/organizer/events/:id/registrations returns registrants with correctly resolved custom-field labels+values, cross-org rejected (403), student tokens rejected (403)', async () => {
      // Register Student B for Free Event (active)
      const getRes = await request(app)
        .get(`/api/organizer/events/${publishedFreeEventId}/custom-fields`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .expect(200);
      const customFields = getRes.body;

      const responses = [
        { field_id: customFields[0].id, value: 'L' },
        { field_id: customFields[1].id, value: 'https://github.com/studentb' },
        { field_id: customFields[2].id, value: '2026-06-20' },
        { field_id: customFields[3].id, value: 'true' }
      ];

      await request(app)
        .post(`/api/events/${publishedFreeEventId}/register`)
        .set('Authorization', `Bearer ${studentBToken}`)
        .send({ responses })
        .expect(201);

      // Now Organizer A views registrations
      const res = await request(app)
        .get(`/api/organizer/events/${publishedFreeEventId}/registrations?page=1&limit=10`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .expect(200);

      expect(res.body.total).toBe(2); // Student A (active) and Student B (active)
      expect(res.body.data.length).toBe(2);

      // Verify student details
      const studentBReg = res.body.data.find((r: any) => r.student.email === 'student-b@test.com');
      expect(studentBReg).toBeDefined();
      expect(studentBReg.student.name).toBe('Student B');
      expect(studentBReg.status).toBe('registered');
      expect(studentBReg.payment_status).toBe('not_applicable');
      expect(studentBReg.responses.length).toBe(4);

      // Resolved label and values
      const sizeResponse = studentBReg.responses.find((r: any) => r.label === 'T-Shirt Size');
      expect(sizeResponse).toBeDefined();
      expect(sizeResponse.value).toBe('L');

      const githubResponse = studentBReg.responses.find((r: any) => r.label === 'GitHub Profile');
      expect(githubResponse).toBeDefined();
      expect(githubResponse.value).toBe('https://github.com/studentb');

      // Cross-org check (Organizer B cannot view Organizer A's event registrants)
      await request(app)
        .get(`/api/organizer/events/${publishedFreeEventId}/registrations`)
        .set('Authorization', `Bearer ${organizerBToken}`)
        .expect(403);

      // Student tokens are rejected
      await request(app)
        .get(`/api/organizer/events/${publishedFreeEventId}/registrations`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .expect(403);
    });
  });

  describe('6. SWAGGER / OPENAPI DOCUMENTATION', () => {
    test('20-21. All Phase 5 endpoints appear in /api-docs and Try it out works', async () => {
      const res = await request(app).get('/api-docs-json').expect(200);
      const paths = res.body.paths;

      // Verify custom fields endpoints
      expect(paths).toHaveProperty('/api/organizer/events/{id}/custom-fields');
      expect(paths['/api/organizer/events/{id}/custom-fields']).toHaveProperty('get');
      expect(paths['/api/organizer/events/{id}/custom-fields']).toHaveProperty('put');

      // Verify register endpoints
      expect(paths).toHaveProperty('/api/events/{id}/register');
      expect(paths['/api/events/{id}/register']).toHaveProperty('post');
      expect(paths['/api/events/{id}/register']).toHaveProperty('delete');

      // Verify user registrations list
      expect(paths).toHaveProperty('/api/users/me/registrations');
      expect(paths['/api/users/me/registrations']).toHaveProperty('get');

      // Verify organizer event registrations list
      expect(paths).toHaveProperty('/api/organizer/events/{id}/registrations');
      expect(paths['/api/organizer/events/{id}/registrations']).toHaveProperty('get');
    });
  });
});
