import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sql, eq } from 'drizzle-orm';
import app from '../app';
import { db } from '../db/client';
import { users } from '../db/schema/users';
import {
  organizations,
  organizerAccounts,
  organizationInvitations,
} from '../db/schema/organizations';
import { refreshTokens } from '../db/schema/refresh_tokens';
import { config } from '../config';
import { pool } from '../db/client';

jest.setTimeout(30000);

beforeEach(async () => {
  // Clean up database tables before each test to ensure a clean state
  await db.execute(sql`
    TRUNCATE TABLE 
      users, 
      organizations, 
      organizer_accounts, 
      organization_invitations, 
      refresh_tokens 
    RESTART IDENTITY CASCADE;
  `);
});

afterAll(async () => {
  // Final cleanup
  await db.execute(sql`
    TRUNCATE TABLE 
      users, 
      organizations, 
      organizer_accounts, 
      organization_invitations, 
      refresh_tokens 
    RESTART IDENTITY CASCADE;
  `);
  // Close DB pool to avoid open handles
  await pool.end();
});

describe('Student Authentication', () => {
  const studentData = {
    name: 'Alice Student',
    email: 'alice@student.com',
    password: 'studentpassword123',
  };

  test('1. Register with only name, email, password', async () => {
    const res = await request(app).post('/api/auth/student/register').send(studentData).expect(201);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.headers['set-cookie']).toBeDefined();

    // Verify user is in DB
    const [user] = await db.select().from(users).where(eq(users.email, studentData.email)).limit(1);
    expect(user).toBeDefined();
    expect(user.name).toBe(studentData.name);
  });

  test('2. college_name/branch/year_of_study/city_id are NOT required and NOT saved', async () => {
    // Attempt registration
    await request(app).post('/api/auth/student/register').send(studentData).expect(201);

    // Verify DB does not contain the extra fields
    const [user] = await db.select().from(users).where(eq(users.email, studentData.email)).limit(1);
    expect(user.collegeName).toBeNull();
    expect(user.branch).toBeNull();
    expect(user.yearOfStudy).toBeNull();
    expect(user.cityId).toBeNull();
  });

  test('3. Duplicate student email is rejected', async () => {
    await request(app).post('/api/auth/student/register').send(studentData).expect(201);

    const res = await request(app).post('/api/auth/student/register').send(studentData).expect(400);

    expect(res.body.message).toContain('already registered');
  });

  test('4. Correct login succeeds; incorrect password fails', async () => {
    // Register first
    await request(app).post('/api/auth/student/register').send(studentData).expect(201);

    // Correct Login
    const loginRes = await request(app)
      .post('/api/auth/student/login')
      .send({ email: studentData.email, password: studentData.password })
      .expect(200);

    expect(loginRes.body).toHaveProperty('accessToken');

    // Incorrect Login
    await request(app)
      .post('/api/auth/student/login')
      .send({ email: studentData.email, password: 'wrongpassword' })
      .expect(401);
  });

  test('5. Password is stored as a bcrypt hash', async () => {
    await request(app).post('/api/auth/student/register').send(studentData).expect(201);

    const [user] = await db.select().from(users).where(eq(users.email, studentData.email)).limit(1);
    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash).not.toBe(studentData.password);
    expect(bcrypt.compareSync(studentData.password, user.passwordHash!)).toBe(true);
  });
});

describe('Organizer Onboarding & Authentication', () => {
  const registerPayload = {
    organization: {
      name: 'Tech Innovators College Club',
      org_type: 'college' as const,
      contact_email: 'club@college.edu',
    },
    owner: {
      name: 'Bob Owner',
      email: 'bob@college.edu',
      password: 'ownerpassword123',
    },
  };

  test('6. Registration creates exactly one organizations row and one owner organizer_accounts row, transactionally', async () => {
    const res = await request(app)
      .post('/api/auth/organizer/register')
      .send(registerPayload)
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');

    // Check DB
    const orgs = await db.select().from(organizations);
    expect(orgs).toHaveLength(1);
    expect(orgs[0].name).toBe(registerPayload.organization.name);

    const accounts = await db.select().from(organizerAccounts);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe(registerPayload.owner.name);
    expect(accounts[0].role).toBe('owner');
  });

  test('7. A simulated mid-transaction failure leaves no partial rows in Postgres', async () => {
    // We will run a direct transaction test that throws an error after inserting an organization but before inserting the owner account.
    let transactionFailed = false;
    try {
      await db.transaction(async (tx) => {
        await tx.insert(organizations).values({
          name: 'Failing Transaction Org',
          orgType: 'company',
          contactEmail: 'fail@fail.com',
        });

        // Throw error to simulate mid-transaction failure
        throw new Error('Simulated database write crash');
      });
    } catch (err: any) {
      if (err.message === 'Simulated database write crash') {
        transactionFailed = true;
      }
    }

    expect(transactionFailed).toBe(true);

    // Verify nothing was written to Postgres
    const orgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, 'Failing Transaction Org'));
    expect(orgs).toHaveLength(0);
  });

  test('8. Organizer login works for the owner', async () => {
    // Register
    await request(app).post('/api/auth/organizer/register').send(registerPayload).expect(201);

    // Login
    const res = await request(app)
      .post('/api/auth/organizer/login')
      .send({ email: registerPayload.owner.email, password: registerPayload.owner.password })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
  });

  test('9. A client cannot register an organization via any endpoint while specifying role or organization_id', async () => {
    // Try to send role: member and custom organizationId in owner object
    const maliciousPayload = {
      organization: {
        name: 'Malicious Org',
        org_type: 'college' as const,
        contact_email: 'malicious@college.edu',
      },
      owner: {
        role: 'member',
        organizationId: '22222222-2222-2222-2222-222222222222',
        name: 'Malicious Owner',
        email: 'malicious@college.edu',
        password: 'password123',
      },
    };

    await request(app).post('/api/auth/organizer/register').send(maliciousPayload).expect(201);

    const [account] = await db
      .select()
      .from(organizerAccounts)
      .where(eq(organizerAccounts.email, maliciousPayload.owner.email))
      .limit(1);

    // Verify it ignored client-supplied role/organization ID and set them on the backend
    expect(account.role).toBe('owner');
    expect(account.id).not.toBe('22222222-2222-2222-2222-222222222222');
  });

  test('9b. A client trying to send contact_name, contact_phone or other unexpected organization fields is rejected with 400', async () => {
    const payloadWithContactName = {
      organization: {
        name: 'Strict Org 1',
        org_type: 'college' as const,
        contact_email: 'strict1@college.edu',
        contact_name: 'John Doe',
      },
      owner: {
        name: 'Owner 1',
        email: 'owner1@college.edu',
        password: 'password123',
      },
    };

    const res1 = await request(app)
      .post('/api/auth/organizer/register')
      .send(payloadWithContactName)
      .expect(400);

    expect(JSON.stringify(res1.body)).toContain('contact_name');

    const payloadWithContactPhone = {
      organization: {
        name: 'Strict Org 2',
        org_type: 'college' as const,
        contact_email: 'strict2@college.edu',
        contact_phone: '1234567890',
      },
      owner: {
        name: 'Owner 2',
        email: 'owner2@college.edu',
        password: 'password123',
      },
    };

    const res2 = await request(app)
      .post('/api/auth/organizer/register')
      .send(payloadWithContactPhone)
      .expect(400);

    expect(JSON.stringify(res2.body)).toContain('contact_phone');

    const payloadWithUnexpectedField = {
      organization: {
        name: 'Strict Org 3',
        org_type: 'college' as const,
        contact_email: 'strict3@college.edu',
        invalid_field: 'unexpected',
      },
      owner: {
        name: 'Owner 3',
        email: 'owner3@college.edu',
        password: 'password123',
      },
    };

    const res3 = await request(app)
      .post('/api/auth/organizer/register')
      .send(payloadWithUnexpectedField)
      .expect(400);

    expect(JSON.stringify(res3.body)).toContain('invalid_field');
  });

  test('10-14. Organizer member invitation flow (invite -> accept -> login -> bcrypt)', async () => {
    // 1. Register owner
    const regRes = await request(app)
      .post('/api/auth/organizer/register')
      .send(registerPayload)
      .expect(201);

    const ownerToken = regRes.body.accessToken;

    // 2. Owner invites a member
    const inviteRes = await request(app)
      .post('/api/organizer/members/invite')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'member@college.edu' })
      .expect(201);

    const rawInviteToken = inviteRes.body.token;
    expect(rawInviteToken).toBeDefined();

    // Verify invitation in DB
    const [invitation] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.email, 'member@college.edu'))
      .limit(1);
    expect(invitation).toBeDefined();
    expect(invitation.status).toBe('pending');

    // 3. Member accepts invitation
    const acceptRes = await request(app)
      .post('/api/auth/organizer/accept-invite')
      .send({
        token: rawInviteToken,
        name: 'Charlie Member',
        password: 'memberpassword123',
      })
      .expect(200);

    // Verify account created with role='member'
    const [memberAccount] = await db
      .select()
      .from(organizerAccounts)
      .where(eq(organizerAccounts.email, 'member@college.edu'))
      .limit(1);
    expect(memberAccount).toBeDefined();
    expect(memberAccount.role).toBe('member');

    // Verify bcrypt hashing of member credentials
    expect(memberAccount.passwordHash).not.toBe('memberpassword123');
    expect(bcrypt.compareSync('memberpassword123', memberAccount.passwordHash)).toBe(true);

    // Verify invitation is marked accepted
    const [acceptedInvitation] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.email, 'member@college.edu'))
      .limit(1);
    expect(acceptedInvitation.status).toBe('accepted');
    expect(acceptedInvitation.acceptedAt).toBeDefined();

    // 4. Same invitation cannot be accepted twice
    await request(app)
      .post('/api/auth/organizer/accept-invite')
      .send({
        token: rawInviteToken,
        name: 'Charlie Member Again',
        password: 'memberpassword123',
      })
      .expect(400);

    // 5. Member logs in through SAME endpoint
    const loginRes = await request(app)
      .post('/api/auth/organizer/login')
      .send({ email: 'member@college.edu', password: 'memberpassword123' })
      .expect(200);

    expect(loginRes.body).toHaveProperty('accessToken');
    const decoded = jwt.decode(loginRes.body.accessToken) as any;
    expect(decoded.role).toBe('organizer');
    expect(decoded.membershipRole).toBe('member');
  });

  test('12. Expired/invalid/revoked invitations are rejected', async () => {
    // Setup owner
    const regRes = await request(app)
      .post('/api/auth/organizer/register')
      .send(registerPayload)
      .expect(201);
    const ownerToken = regRes.body.accessToken;

    // 1. Test invalid token
    await request(app)
      .post('/api/auth/organizer/accept-invite')
      .send({
        token: 'invalidtoken123',
        name: 'Test',
        password: 'password123',
      })
      .expect(400);

    // 2. Create invitation and make it expired
    const inviteRes = await request(app)
      .post('/api/organizer/members/invite')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'expired@college.edu' })
      .expect(201);
    const expiredRawToken = inviteRes.body.token;

    // Manually modify expires_at to past in DB
    await db
      .update(organizationInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organizationInvitations.email, 'expired@college.edu'));

    await request(app)
      .post('/api/auth/organizer/accept-invite')
      .send({
        token: expiredRawToken,
        name: 'Test Expired',
        password: 'password123',
      })
      .expect(400);

    // 3. Create invitation and revoke it
    const inviteRes2 = await request(app)
      .post('/api/organizer/members/invite')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'revoked@college.edu' })
      .expect(201);
    const revokedRawToken = inviteRes2.body.token;

    // Manually revoke in DB
    await db
      .update(organizationInvitations)
      .set({ status: 'revoked' })
      .where(eq(organizationInvitations.email, 'revoked@college.edu'));

    await request(app)
      .post('/api/auth/organizer/accept-invite')
      .send({
        token: revokedRawToken,
        name: 'Test Revoked',
        password: 'password123',
      })
      .expect(400);
  });
});

describe('JWT claims, authorization limits, and refresh flow', () => {
  const registerPayload = {
    organization: {
      name: 'Auth Testing Org',
      org_type: 'company' as const,
      contact_email: 'auth@test.com',
    },
    owner: {
      name: 'Auth Owner',
      email: 'owner@auth.com',
      password: 'password123',
    },
  };

  test('15. Access token is issued with expected claims', async () => {
    const res = await request(app)
      .post('/api/auth/organizer/register')
      .send(registerPayload)
      .expect(201);

    const decoded = jwt.decode(res.body.accessToken) as any;
    expect(decoded.id).toBeDefined();
    expect(decoded.role).toBe('organizer');
    expect(decoded.membershipRole).toBe('owner');
    expect(decoded.organizationId).toBeDefined();
  });

  test('16. Access token lifetime is 15 minutes', async () => {
    const res = await request(app)
      .post('/api/auth/organizer/register')
      .send(registerPayload)
      .expect(201);

    const decoded = jwt.decode(res.body.accessToken) as any;
    const exp = decoded.exp;
    const iat = decoded.iat;
    expect(exp - iat).toBe(15 * 60); // 15 minutes in seconds
  });

  test('17. Refresh flow works; logout invalidates stored token', async () => {
    const res = await request(app)
      .post('/api/auth/organizer/register')
      .send(registerPayload)
      .expect(201);

    // Get cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieHeader = cookies[0];

    // Refresh token request
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader)
      .expect(200);

    expect(refreshRes.body).toHaveProperty('accessToken');
    const newCookies = refreshRes.headers['set-cookie'];
    expect(newCookies).toBeDefined();

    // Verify token rotation: old refresh token cookie must fail now
    await request(app).post('/api/auth/refresh').set('Cookie', cookieHeader).expect(401);

    // Logout using the newly issued rotated cookie
    await request(app).post('/api/auth/logout').set('Cookie', newCookies[0]).expect(200);

    // Subsequent refresh fails
    await request(app).post('/api/auth/refresh').set('Cookie', newCookies[0]).expect(401);
  });

  test('18. Missing/invalid access tokens are rejected by requireAuth', async () => {
    // No auth
    await request(app)
      .post('/api/organizer/members/invite')
      .send({ email: 'test@test.com' })
      .expect(401);

    // Invalid format
    await request(app)
      .post('/api/organizer/members/invite')
      .set('Authorization', 'InvalidFormatJWT')
      .send({ email: 'test@test.com' })
      .expect(401);

    // Invalid/bad signature
    await request(app)
      .post('/api/organizer/members/invite')
      .set('Authorization', 'Bearer invalidtoken')
      .send({ email: 'test@test.com' })
      .expect(401);
  });

  test('19. Owner-only actions (invite) reject members with 403', async () => {
    // 1. Register owner
    const regRes = await request(app)
      .post('/api/auth/organizer/register')
      .send(registerPayload)
      .expect(201);
    const ownerToken = regRes.body.accessToken;

    // 2. Invite member
    const inviteRes = await request(app)
      .post('/api/organizer/members/invite')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'member@auth.com' })
      .expect(201);

    // 3. Accept invite
    await request(app)
      .post('/api/auth/organizer/accept-invite')
      .send({
        token: inviteRes.body.token,
        name: 'Charlie Member',
        password: 'memberpassword123',
      })
      .expect(200);

    // 4. Log in member
    const loginRes = await request(app)
      .post('/api/auth/organizer/login')
      .send({ email: 'member@auth.com', password: 'memberpassword123' })
      .expect(200);
    const memberToken = loginRes.body.accessToken;

    // 5. Try to invite someone else using member's token -> must return 403
    await request(app)
      .post('/api/organizer/members/invite')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ email: 'another@auth.com' })
      .expect(403);
  });
});

describe('Swagger Documentation', () => {
  test('21. Every Phase 2 endpoint appears in /api-docs', async () => {
    const res = await request(app).get('/api-docs-json').expect(200);

    const doc = res.body;
    expect(doc.paths).toHaveProperty('/api/auth/student/register');
    expect(doc.paths).toHaveProperty('/api/auth/student/login');
    expect(doc.paths).toHaveProperty('/api/auth/organizer/register');
    expect(doc.paths).toHaveProperty('/api/auth/organizer/login');
    expect(doc.paths).toHaveProperty('/api/auth/refresh');
    expect(doc.paths).toHaveProperty('/api/auth/logout');
    expect(doc.paths).toHaveProperty('/api/organizer/members/invite');
    expect(doc.paths).toHaveProperty('/api/auth/organizer/accept-invite');
  });
});
