import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema/users';
import {
  organizations,
  organizerAccounts,
  organizationInvitations,
} from '../db/schema/organizations';
import { refreshTokens } from '../db/schema/refresh_tokens';
import { hashToken, generateRandomToken, generateAccessToken } from '../utils/token';
import { AuthUser } from '../middleware/auth';

const router = Router();

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
}

// Student Validation Schemas
const studentRegisterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  confirmPassword: z.string().optional(),
});

const studentLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const organizerRegisterSchema = z.object({
  organization: z
    .object({
      name: z.string().min(1, 'Organization name is required'),
      org_type: z.enum(['college', 'company', 'community', 'individual']),
      contact_email: z.string().email('Invalid organization contact email'),
      website_url: z.string().optional(),
      logo_url: z.string().optional(),
    })
    .strict(),
  owner: z.object({
    name: z.string().min(1, 'Owner name is required'),
    email: z.string().email('Invalid owner email address'),
    password: z.string().min(6, 'Owner password must be at least 6 characters long'),
    confirmPassword: z.string().optional(),
  }),
});

const organizerLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Accept Invite Validation Schema
const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

/**
 * @openapi
 * /api/auth/student/register:
 *   post:
 *     summary: Register a new student user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Alice Student
 *               email:
 *                 type: string
 *                 format: email
 *                 example: alice@student.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: studentpassword123
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 example: studentpassword123
 *     responses:
 *       201:
 *         description: Student registered successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       400:
 *         description: Invalid input or email already registered.
 */
router.post('/student/register', async (req: Request, res: Response) => {
  try {
    const validated = studentRegisterSchema.parse(req.body);

    // Check duplicate in users
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, validated.email))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(validated.password, 10);

    // Insert student user
    const [newUser] = await db
      .insert(users)
      .values({
        name: validated.name,
        email: validated.email,
        passwordHash,
        authProvider: 'email',
      })
      .returning();

    // Generate JWT access token
    const authClaims: AuthUser = {
      id: newUser.id,
      role: 'student',
    };
    const accessToken = generateAccessToken(authClaims);

    // Generate Refresh Token
    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);

    await db.insert(refreshTokens).values({
      tokenHash,
      userId: newUser.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    setRefreshCookie(res, rawRefreshToken);

    return res.status(201).json({ accessToken });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/student/login:
 *   post:
 *     summary: Log in a student user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: alice@student.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: studentpassword123
 *     responses:
 *       200:
 *         description: Login successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: Incorrect credentials.
 */
router.post('/student/login', async (req: Request, res: Response) => {
  try {
    const validated = studentLoginSchema.parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.email, validated.email)).limit(1);

    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(validated.password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT access token
    const authClaims: AuthUser = {
      id: user.id,
      role: 'student',
    };
    const accessToken = generateAccessToken(authClaims);

    // Generate Refresh Token
    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);

    await db.insert(refreshTokens).values({
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    setRefreshCookie(res, rawRefreshToken);

    return res.status(200).json({ accessToken });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/organizer/register:
 *   post:
 *     summary: Register a new organization and owner account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organization, owner]
 *             properties:
 *               organization:
 *                 type: object
 *                 required: [name, org_type, contact_email]
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: Tech Innovators Org
 *                   org_type:
 *                     type: string
 *                     enum: [college, company, community, individual]
 *                     example: company
 *                   contact_email:
 *                     type: string
 *                     format: email
 *                     example: info@techinnovators.com
 *                   website_url:
 *                     type: string
 *                     example: https://techinnovators.com
 *                   logo_url:
 *                     type: string
 *                     example: https://techinnovators.com/logo.png
 *               owner:
 *                 type: object
 *                 required: [name, email, password]
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: Bob Owner
 *                   email:
 *                     type: string
 *                     format: email
 *                     example: bob@techinnovators.com
 *                   password:
 *                     type: string
 *                     format: password
 *                     example: ownerpassword123
 *                   confirmPassword:
 *                     type: string
 *                     format: password
 *                     example: ownerpassword123
 *     responses:
 *       201:
 *         description: Organization and owner account registered successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       400:
 *         description: Invalid input or email already registered.
 */
router.post('/organizer/register', async (req: Request, res: Response) => {
  try {
    const validated = organizerRegisterSchema.parse(req.body);

    // Reject duplicate emails in organizer_accounts
    const [existingAccount] = await db
      .select()
      .from(organizerAccounts)
      .where(eq(organizerAccounts.email, validated.owner.email))
      .limit(1);

    if (existingAccount) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    let createdOwnerId: string | undefined;
    let createdOrgId: string | undefined;

    // Use transaction to ensure either both organizations and owner rows are created or neither.
    await db.transaction(async (tx) => {
      // 1. Insert organization
      const [newOrg] = await tx
        .insert(organizations)
        .values({
          name: validated.organization.name,
          orgType: validated.organization.org_type,
          contactEmail: validated.organization.contact_email,
          websiteUrl: validated.organization.website_url,
          logoUrl: validated.organization.logo_url,
        })
        .returning();

      createdOrgId = newOrg.id;

      // 2. Hash password
      const passwordHash = await bcrypt.hash(validated.owner.password, 10);

      // 3. Insert organizer_accounts (always role='owner', client cannot specify this)
      const [newOwner] = await tx
        .insert(organizerAccounts)
        .values({
          organizationId: newOrg.id,
          name: validated.owner.name,
          email: validated.owner.email,
          passwordHash,
          role: 'owner',
          status: 'active',
        })
        .returning();

      createdOwnerId = newOwner.id;
    });

    if (!createdOwnerId || !createdOrgId) {
      throw new Error('Registration transaction failed to return records');
    }

    // Generate JWT access token
    const authClaims: AuthUser = {
      id: createdOwnerId,
      role: 'organizer',
      organizationId: createdOrgId,
      membershipRole: 'owner',
    };
    const accessToken = generateAccessToken(authClaims);

    // Generate Refresh Token
    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);

    await db.insert(refreshTokens).values({
      tokenHash,
      organizerAccountId: createdOwnerId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    setRefreshCookie(res, rawRefreshToken);

    return res.status(201).json({ accessToken });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/organizer/login:
 *   post:
 *     summary: Log in an organizer user (works for both owner and member accounts)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: bob@techinnovators.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: ownerpassword123
 *     responses:
 *       200:
 *         description: Login successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: Incorrect credentials.
 */
router.post('/organizer/login', async (req: Request, res: Response) => {
  try {
    const validated = organizerLoginSchema.parse(req.body);

    const [account] = await db
      .select()
      .from(organizerAccounts)
      .where(eq(organizerAccounts.email, validated.email))
      .limit(1);

    if (!account || account.status === 'removed') {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(validated.password, account.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT access token
    const authClaims: AuthUser = {
      id: account.id,
      role: 'organizer',
      organizationId: account.organizationId,
      membershipRole: account.role as 'owner' | 'member',
    };
    const accessToken = generateAccessToken(authClaims);

    // Generate Refresh Token
    const rawRefreshToken = generateRandomToken();
    const tokenHash = hashToken(rawRefreshToken);

    await db.insert(refreshTokens).values({
      tokenHash,
      organizerAccountId: account.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    setRefreshCookie(res, rawRefreshToken);

    return res.status(200).json({ accessToken });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh the access token and rotate the refresh token
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Refresh successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: Missing, invalid, or expired refresh token.
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const rawRefreshToken = req.cookies.refreshToken;
    if (!rawRefreshToken) {
      return res.status(401).json({ message: 'Unauthorized: Missing refresh token' });
    }

    const tokenHash = hashToken(rawRefreshToken);

    // Find token reference in database
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!storedToken) {
      return res.status(401).json({ message: 'Unauthorized: Invalid refresh token' });
    }

    // Check expiration
    if (storedToken.expiresAt < new Date()) {
      // Invalidate expired token
      await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Unauthorized: Refresh token expired' });
    }

    // Invalidate/consume the existing refresh token before generating new ones (Token Rotation)
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));

    // Determine payload based on association
    let authClaims: AuthUser;

    if (storedToken.userId) {
      const [student] = await db
        .select()
        .from(users)
        .where(eq(users.id, storedToken.userId))
        .limit(1);

      if (!student) {
        clearRefreshCookie(res);
        return res.status(401).json({ message: 'Unauthorized: Student account not found' });
      }

      authClaims = {
        id: student.id,
        role: 'student',
      };
    } else if (storedToken.organizerAccountId) {
      const [organizer] = await db
        .select()
        .from(organizerAccounts)
        .where(eq(organizerAccounts.id, storedToken.organizerAccountId))
        .limit(1);

      if (!organizer || organizer.status === 'removed') {
        clearRefreshCookie(res);
        return res
          .status(401)
          .json({ message: 'Unauthorized: Organizer account not found or disabled' });
      }

      authClaims = {
        id: organizer.id,
        role: 'organizer',
        organizationId: organizer.organizationId,
        membershipRole: organizer.role as 'owner' | 'member',
      };
    } else {
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Unauthorized: Invalid token mapping' });
    }

    // Generate new Access and Refresh tokens
    const newAccessToken = generateAccessToken(authClaims);
    const newRawRefreshToken = generateRandomToken();
    const newHash = hashToken(newRawRefreshToken);

    // Save the new refresh token reference
    await db.insert(refreshTokens).values({
      tokenHash: newHash,
      userId: storedToken.userId,
      organizerAccountId: storedToken.organizerAccountId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    setRefreshCookie(res, newRawRefreshToken);

    return res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Log out a user by invalidating their refresh token reference
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout successful.
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const rawRefreshToken = req.cookies.refreshToken;
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      // Invalidate the stored reference
      await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    }

    clearRefreshCookie(res);

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/organizer/accept-invite:
 *   post:
 *     summary: Accept a member invitation to join an organization
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, name, password]
 *             properties:
 *               token:
 *                 type: string
 *                 example: a0b1c2d3e4f5...
 *               name:
 *                 type: string
 *                 example: Charlie Member
 *               password:
 *                 type: string
 *                 format: password
 *                 example: memberpassword123
 *     responses:
 *       200:
 *         description: Invitation accepted, organizer account created.
 *       400:
 *         description: Invalid or expired token.
 */
router.post('/organizer/accept-invite', async (req: Request, res: Response) => {
  try {
    const validated = acceptInviteSchema.parse(req.body);
    const tokenHash = hashToken(validated.token);

    // Query invitation
    const [invitation] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.tokenHash, tokenHash))
      .limit(1);

    if (!invitation) {
      return res.status(400).json({ message: 'Invalid invitation token' });
    }

    // Check if invitation is expired, already used, or revoked
    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: `Invitation has already been ${invitation.status}` });
    }

    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Invitation has expired' });
    }

    // Verify user doesn't already exist with this email
    const [existingAccount] = await db
      .select()
      .from(organizerAccounts)
      .where(eq(organizerAccounts.email, invitation.email))
      .limit(1);

    if (existingAccount) {
      return res
        .status(400)
        .json({ message: 'An organizer account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(validated.password, 10);

    // Execute transaction: create account and mark invitation accepted
    await db.transaction(async (tx) => {
      // 1. Create member organizer account
      await tx.insert(organizerAccounts).values({
        organizationId: invitation.organizationId,
        name: validated.name,
        email: invitation.email,
        passwordHash,
        role: 'member',
        status: 'active',
      });

      // 2. Mark invitation accepted
      await tx
        .update(organizationInvitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
        })
        .where(eq(organizationInvitations.id, invitation.id));
    });

    return res
      .status(200)
      .json({ message: 'Invitation accepted and account created successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
