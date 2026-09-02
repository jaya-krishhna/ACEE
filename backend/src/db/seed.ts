/**
 * Seed script — populates reference data and realistic dummy data.
 * Idempotent: safe to run multiple times.
 * Run via: npm run db:seed (from /backend directory)
 */
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql, eq, count } from 'drizzle-orm';
import {
  users,
  organizations,
  organizerAccounts,
  events,
  hackathonDetails,
  workshopDetails,
  internshipDetails,
  eventTags,
  eventCustomFields,
  eventRegistrations,
  eventRegistrationResponses,
  savedEvents,
  locations,
  tags,
  eligibilityCategories,
  eventEligibility,
} from './schema';
import { generateUniqueSlug } from '../utils/slug';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// ──────────────────────────────────────────────────────────────
// Reference data
// ──────────────────────────────────────────────────────────────

const CITIES = [
  { city: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777 },
  { city: 'Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.209 },
  { city: 'Bengaluru', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
  { city: 'Hyderabad', state: 'Telangana', latitude: 17.385, longitude: 78.4867 },
  { city: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707 },
  { city: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
  { city: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567 },
  { city: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714 },
  { city: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
  { city: 'Surat', state: 'Gujarat', latitude: 21.1702, longitude: 72.8311 },
  { city: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
  { city: 'Kanpur', state: 'Uttar Pradesh', latitude: 26.4499, longitude: 80.3319 },
  { city: 'Nagpur', state: 'Maharashtra', latitude: 21.1458, longitude: 79.0882 },
  { city: 'Indore', state: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577 },
  { city: 'Coimbatore', state: 'Tamil Nadu', latitude: 11.0168, longitude: 76.9558 },
  { city: 'Kochi', state: 'Kerala', latitude: 9.9312, longitude: 76.2673 },
  { city: 'Bhubaneswar', state: 'Odisha', latitude: 20.2961, longitude: 85.8245 },
  { city: 'Chandigarh', state: 'Punjab', latitude: 30.7333, longitude: 76.7794 },
];

const TAGS = [
  // Domain
  { name: 'AI', slug: 'ai', category: 'domain' as const },
  { name: 'Web3', slug: 'web3', category: 'domain' as const },
  { name: 'FinTech', slug: 'fintech', category: 'domain' as const },
  { name: 'HealthTech', slug: 'healthtech', category: 'domain' as const },
  { name: 'Sustainability', slug: 'sustainability', category: 'domain' as const },
  { name: 'EdTech', slug: 'edtech', category: 'domain' as const },
  { name: 'IoT', slug: 'iot', category: 'domain' as const },
  // Technology
  { name: 'React', slug: 'react', category: 'technology' as const },
  { name: 'Python', slug: 'python', category: 'technology' as const },
  { name: 'Blockchain', slug: 'blockchain', category: 'technology' as const },
  { name: 'ML', slug: 'ml', category: 'technology' as const },
  // Theme
  { name: 'Beginner-friendly', slug: 'beginner-friendly', category: 'theme' as const },
  { name: 'Open Source', slug: 'open-source', category: 'theme' as const },
  { name: 'Social Good', slug: 'social-good', category: 'theme' as const },
];

const ELIGIBILITY_CATEGORIES = [
  { name: 'All years welcome', slug: 'all-years-welcome' },
  { name: 'Final year only', slug: 'final-year-only' },
  { name: 'Open to all colleges', slug: 'open-to-all-colleges' },
  { name: 'Open to students only', slug: 'open-to-students-only' },
  { name: 'Working professionals allowed', slug: 'working-professionals-allowed' },
];

async function seedLocations() {
  console.log('Seeding locations...');
  for (const city of CITIES) {
    await db
      .insert(locations)
      .values({ ...city, country: 'India' })
      .onConflictDoNothing();
  }
  const allLocs = await db.select().from(locations);
  console.log(`  ✅ ${allLocs.length} locations active.`);
  return allLocs;
}

async function seedTags() {
  console.log('Seeding tags...');
  for (const tag of TAGS) {
    await db.insert(tags).values(tag).onConflictDoNothing();
  }
  const allTags = await db.select().from(tags);
  console.log(`  ✅ ${allTags.length} tags active.`);
  return allTags;
}

async function seedEligibilityCategories() {
  console.log('Seeding eligibility categories...');
  for (const cat of ELIGIBILITY_CATEGORIES) {
    await db.insert(eligibilityCategories).values(cat).onConflictDoNothing();
  }
  const allCats = await db.select().from(eligibilityCategories);
  console.log(`  ✅ ${allCats.length} eligibility categories active.`);
  return allCats;
}

async function main() {
  console.log('Starting seed database run...');
  
  console.log('Clearing old database tables...');
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
      event_custom_fields,
      event_registrations,
      event_registration_responses,
      saved_events,
      locations,
      tags,
      eligibility_categories
    RESTART IDENTITY CASCADE;
  `);

  const locs = await seedLocations();
  const seededTags = await seedTags();
  const seededCats = await seedEligibilityCategories();

  console.log('Seeding mock transactional data...');

  // 1. Seed Organizations
  const orgPayloads = [
    { name: 'Tech Innovators Corp', slug: 'tech-innovators', orgType: 'company' as const, contactEmail: 'info@techinnovators.com', websiteUrl: 'https://techinnovators.com', logoUrl: null, isVerified: true },
    { name: 'Global Hack Club', slug: 'global-hack-club', orgType: 'community' as const, contactEmail: 'info@globalhackclub.org', websiteUrl: 'https://globalhackclub.org', logoUrl: null, isVerified: true },
    { name: 'Local Workshop Hub', slug: 'local-workshop-hub', orgType: 'community' as const, contactEmail: 'info@workshophub.in', websiteUrl: 'https://workshophub.in', logoUrl: null, isVerified: false },
    { name: 'Beta Labs', slug: 'beta-labs', orgType: 'company' as const, contactEmail: 'info@betalabs.dev', websiteUrl: 'https://betalabs.dev', logoUrl: null, isVerified: false },
  ];

  const seededOrgs: any[] = [];
  for (const org of orgPayloads) {
    const [inserted] = await db.insert(organizations).values(org).returning();
    seededOrgs.push(inserted);
  }
  console.log(`  ✅ Seeded ${seededOrgs.length} organizations.`);

  // Hash password for organizers & students
  const passwordHash = bcrypt.hashSync('password123', 10);

  // 2. Seed Organizer Accounts
  const organizerPayloads = [
    { email: 'owner1@tech.com', passwordHash, name: 'John Tech Owner', organizationId: seededOrgs[0].id, role: 'owner' as const, status: 'active' as const },
    { email: 'admin1@tech.com', passwordHash, name: 'Alice Tech Admin', organizationId: seededOrgs[0].id, role: 'member' as const, status: 'active' as const },
    { email: 'owner2@hack.com', passwordHash, name: 'Bob Hack Owner', organizationId: seededOrgs[1].id, role: 'owner' as const, status: 'active' as const },
    { email: 'owner3@workshop.com', passwordHash, name: 'Charlie Workshop Owner', organizationId: seededOrgs[2].id, role: 'owner' as const, status: 'active' as const },
  ];

  for (const orgAcc of organizerPayloads) {
    await db.insert(organizerAccounts).values(orgAcc);
  }
  console.log(`  ✅ Seeded ${organizerPayloads.length} organizer accounts.`);

  // 3. Seed Students
  const studentPayloads = [
    { email: 'student1@test.com', passwordHash, name: 'Alice Student', cityId: locs[0].id, collegeName: 'IIT Bombay', branch: 'Computer Science', yearOfStudy: 3 },
    { email: 'student2@test.com', passwordHash, name: 'Bob Student', cityId: locs[1].id, collegeName: 'Delhi University', branch: 'Mathematics', yearOfStudy: 4 },
    { email: 'student3@test.com', passwordHash, name: 'Charlie Student', cityId: locs[2].id, collegeName: 'PES University', branch: 'Information Technology', yearOfStudy: 2 },
    { email: 'student4@test.com', passwordHash, name: 'David Student', cityId: locs[3].id, collegeName: 'BITS Pilani', branch: 'Electrical Engineering', yearOfStudy: 3 },
    { email: 'student5@test.com', passwordHash, name: 'Eva Student', cityId: locs[4].id, collegeName: 'VIT Vellore', branch: 'Software Engineering', yearOfStudy: 4 },
  ];

  const seededStudents: any[] = [];
  for (const stud of studentPayloads) {
    const [inserted] = await db.insert(users).values(stud).returning();
    seededStudents.push(inserted);
  }
  console.log(`  ✅ Seeded ${seededStudents.length} student accounts.`);

  // 4. Seed 75 Events
  console.log('Generating 75 events...');
  const types = ['hackathon', 'workshop', 'internship'];
  const modes = ['online', 'offline', 'hybrid'];
  
  const seededEvents: any[] = [];

  for (let i = 0; i < 75; i++) {
    const eventType = types[i % 3];
    const mode = modes[i % 3];
    
    // Mix status: 20% draft, 80% published
    const status = i % 5 === 0 ? 'draft' : 'published';
    
    // Mix fee: 80% free, 20% paid
    const isPaid = i % 5 === 4;
    const registrationFee = isPaid ? String((i + 1) * 50) : '0';

    // Mix dates: past, ongoing, upcoming
    let eventStartAt = new Date();
    let eventEndAt = new Date();
    let registrationOpenAt = new Date();
    let registrationCloseAt = new Date();

    if (i % 3 === 0) {
      // Past event
      eventStartAt.setDate(eventStartAt.getDate() - 30);
      eventEndAt.setDate(eventEndAt.getDate() - 28);
      registrationOpenAt.setDate(registrationOpenAt.getDate() - 45);
      registrationCloseAt.setDate(registrationCloseAt.getDate() - 31);
    } else if (i % 3 === 1) {
      // Ongoing event
      eventStartAt.setDate(eventStartAt.getDate() - 1);
      eventEndAt.setDate(eventEndAt.getDate() + 2);
      registrationOpenAt.setDate(registrationOpenAt.getDate() - 15);
      registrationCloseAt.setDate(registrationCloseAt.getDate() - 2);
    } else {
      // Upcoming event
      eventStartAt.setDate(eventStartAt.getDate() + 15);
      eventEndAt.setDate(eventEndAt.getDate() + 17);
      registrationOpenAt.setDate(registrationOpenAt.getDate() - 5);
      registrationCloseAt.setDate(registrationCloseAt.getDate() + 14);
    }

    const title = `${seededOrgs[i % 4].name} ${eventType.toUpperCase()} #${Math.floor(i / 3) + 1}`;
    const slug = await generateUniqueSlug(title, db);
    const locationId = mode !== 'online' ? locs[i % locs.length].id : null;
    const venue = mode !== 'online' ? `Main Campus Room ${i + 100}` : null;

    const [insertedEvent] = await db.insert(events).values({
      organizationId: seededOrgs[i % 4].id,
      createdBy: organizerPayloads[i % 4].email === 'admin1@tech.com' ? null : null, // Not checking user relation directly for creator, can use null or link to organizer table later if required
      eventType,
      title,
      slug,
      tagline: `An exciting ${eventType} on latest tech trends.`,
      description: `Join us for this amazing ${eventType} hosted by ${seededOrgs[i % 4].name}. Expand your skills and connect with peers.`,
      mode: mode as any,
      venue,
      locationId,
      timezone: 'Asia/Kolkata',
      isPaid,
      registrationFee,
      currency: 'INR',
      resumeRequired: i % 4 === 0,
      registrationOpenAt,
      registrationCloseAt,
      eventStartAt,
      eventEndAt,
      eligibilityNotes: 'Open to all university students and early career professionals.',
      status,
      publishedAt: status === 'published' ? new Date() : null,
    }).returning();

    seededEvents.push(insertedEvent);

    // Seed event type details
    if (eventType === 'hackathon') {
      await db.insert(hackathonDetails).values({
        eventId: insertedEvent.id,
        maxParticipants: 100 + (i * 10),
        prizeSummaryText: 'Exciting cash prizes and internship offers for the top 3 teams!',
        tracks: ['AI/ML', 'Blockchain', 'Social Good', 'Fintech'],
        submissionType: 'github_and_demo',
      });
    } else if (eventType === 'workshop') {
      await db.insert(workshopDetails).values({
        eventId: insertedEvent.id,
        speakerName: `Dr. Speaker ${i}`,
        speakerBio: `Renowned industry veteran and researcher in modern technologies.`,
        durationHours: '3.5',
        seatsAvailable: 50,
        certificateProvided: i % 2 === 0,
        prerequisiteSkills: ['Basic Programming', 'Analytical Thinking'],
      });
    } else if (eventType === 'internship') {
      await db.insert(internshipDetails).values({
        eventId: insertedEvent.id,
        stipendMin: isPaid ? '0' : '15000',
        stipendMax: isPaid ? '0' : '35000',
        durationMonths: '6',
        workMode: mode === 'online' ? 'remote' : 'onsite',
        positionsAvailable: 5,
        minExperienceMonths: 0,
        perks: ['Flexible hours', 'Letter of Recommendation', 'Mentor Support'],
      });
    }

    // Seed 2 tags per event
    await db.insert(eventTags).values([
      { eventId: insertedEvent.id, tagId: seededTags[i % seededTags.length].id },
      { eventId: insertedEvent.id, tagId: seededTags[(i + 3) % seededTags.length].id },
    ]);

    // Seed 1 eligibility category per event
    await db.insert(eventEligibility).values([
      { eventId: insertedEvent.id, eligibilityCategoryId: seededCats[i % seededCats.length].id },
    ]);
  }
  console.log('  ✅ Seeded 75 events with details and tags.');

  // 5. Seed Custom Fields (for first 10 published events)
  const publishedEvents = seededEvents.filter(e => e.status === 'published');
  const customFieldsEvents = publishedEvents.slice(0, 10);
  const createdCustomFields: any[] = [];

  console.log('Seeding custom fields...');
  for (const ev of customFieldsEvents) {
    const [cf1] = await db.insert(eventCustomFields).values({
      eventId: ev.id,
      label: 'T-Shirt Size',
      fieldType: 'select',
      options: ['S', 'M', 'L', 'XL'],
      isRequired: true,
      sortOrder: 0,
    }).returning();

    const [cf2] = await db.insert(eventCustomFields).values({
      eventId: ev.id,
      label: 'GitHub Profile Link',
      fieldType: 'url',
      options: null,
      isRequired: true,
      sortOrder: 1,
    }).returning();

    const [cf3] = await db.insert(eventCustomFields).values({
      eventId: ev.id,
      label: 'Graduation Year',
      fieldType: 'text',
      options: null,
      isRequired: false,
      sortOrder: 2,
    }).returning();

    createdCustomFields.push(cf1, cf2, cf3);
  }
  console.log(`  ✅ Seeded ${createdCustomFields.length} custom fields.`);

  // 6. Seed registrations and custom field responses (for 5 of those events)
  const registrationEvents = customFieldsEvents.slice(0, 5);
  console.log('Seeding registrations...');
  let totalRegistrations = 0;

  for (const ev of registrationEvents) {
    // Get fields for this event
    const fields = createdCustomFields.filter(f => f.eventId === ev.id);
    
    // Register 3 of the students for this event
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const student = seededStudents[sIdx];
      const status = sIdx === 2 ? 'waitlisted' : 'confirmed';
      const paymentStatus = ev.isPaid ? (status === 'confirmed' ? 'paid' : 'pending') : 'not_applicable';

      const [reg] = await db.insert(eventRegistrations).values({
        eventId: ev.id,
        userId: student.id,
        status,
        paymentStatus,
        registeredAt: new Date(),
      }).returning();

      totalRegistrations++;

      // Seed responses
      const responses = [
        { registrationId: reg.id, fieldId: fields[0].id, value: 'M' },
        { registrationId: reg.id, fieldId: fields[1].id, value: `https://github.com/student-${sIdx}` },
        { registrationId: reg.id, fieldId: fields[2].id, value: String(student.graduationYear) },
      ];

      for (const resp of responses) {
        await db.insert(eventRegistrationResponses).values(resp);
      }
    }

    // Update event registrationCount
    await db.update(events).set({
      registrationCount: 3
    }).where(eq(events.id, ev.id));
  }
  console.log(`  ✅ Seeded ${totalRegistrations} registrations and corresponding responses.`);

  // 7. Seed Student Saved Events
  console.log('Seeding student saved events bookmarks...');
  let totalSaved = 0;
  for (const student of seededStudents) {
    // Bookmarks 5 random published events
    const savedCandidates = publishedEvents.filter(e => e.organizationId !== student.id); // just ensure they are published
    for (let k = 0; k < 5; k++) {
      const candidateEvent = savedCandidates[(k + parseInt(student.id.substring(0, 2), 16) || 0) % savedCandidates.length];
      await db.insert(savedEvents).values({
        userId: student.id,
        eventId: candidateEvent.id,
      }).onConflictDoNothing();
      totalSaved++;
    }
  }
  console.log(`  ✅ Seeded ${totalSaved} saved event bookmarks.`);

  console.log('\n🌱 Seed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
