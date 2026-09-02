import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, desc, and, count, inArray, asc, or } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/client';
import {
  events,
  hackathonDetails,
  workshopDetails,
  internshipDetails,
  eventEligibility,
  eventTags,
  eventContacts,
  organizerAccounts,
  organizationInvitations,
  organizations,
  locations,
  tags,
  eligibilityCategories,
  eventCustomFields,
  eventRegistrations,
  eventRegistrationResponses,
  users,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { generateRandomToken, hashToken } from '../utils/token';
import { generateUniqueSlug } from '../utils/slug';
import { getOrCreateTag, getOrCreateEligibilityCategory } from '../utils/taxonomy';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../errors/AppError';
import { enqueueEmbeddingJob, hasEmbeddingRelevantChanges } from '../services/embeddingJob';

const router = Router();

// Helper: Validate that tag_ids and eligibility_category_ids belong to system tier or current org
async function validateTaxonomyOwnership(
  dbOrTx: any,
  organizationId: string,
  tagIds: number[],
  eligibilityCategoryIds: number[],
) {
  if (tagIds && tagIds.length > 0) {
    const foundTags = await dbOrTx
      .select({ id: tags.id, isSystem: tags.isSystem, organizationId: tags.organizationId })
      .from(tags)
      .where(inArray(tags.id, tagIds));

    const validTagIdSet = new Set(
      foundTags
        .filter((t: any) => t.isSystem || t.organizationId === organizationId)
        .map((t: any) => t.id),
    );

    const invalidTagIds = tagIds.filter((id) => !validTagIdSet.has(id));
    if (invalidTagIds.length > 0) {
      throw new ValidationError(
        `Invalid tag_ids: [${invalidTagIds.join(', ')}] are either invalid or belong to another organization`,
      );
    }
  }

  if (eligibilityCategoryIds && eligibilityCategoryIds.length > 0) {
    const foundCategories = await dbOrTx
      .select({
        id: eligibilityCategories.id,
        isSystem: eligibilityCategories.isSystem,
        organizationId: eligibilityCategories.organizationId,
      })
      .from(eligibilityCategories)
      .where(inArray(eligibilityCategories.id, eligibilityCategoryIds));

    const validCatIdSet = new Set(
      foundCategories
        .filter((c: any) => c.isSystem || c.organizationId === organizationId)
        .map((c: any) => c.id),
    );

    const invalidCategoryIds = eligibilityCategoryIds.filter((id) => !validCatIdSet.has(id));
    if (invalidCategoryIds.length > 0) {
      throw new ValidationError(
        `Invalid eligibility_category_ids: [${invalidCategoryIds.join(', ')}] are either invalid or belong to another organization`,
      );
    }
  }
}

// Helper to recursively check if organization_id or organizationId exists in request body
function hasOrganizationId(obj: any): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  if ('organization_id' in obj || 'organizationId' in obj) {
    return true;
  }
  for (const key of Object.keys(obj)) {
    if (hasOrganizationId(obj[key])) {
      return true;
    }
  }
  return false;
}

// Helper to recursively check if slug exists in request body
function hasSlugInBody(obj: any): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  if ('slug' in obj) {
    return true;
  }
  for (const key of Object.keys(obj)) {
    if (hasSlugInBody(obj[key])) {
      return true;
    }
  }
  return false;
}

// Multer Storage Configuration for Banner Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `banner-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const uploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('banner')(req, res, (err) => {
    if (err) {
      return next(err);
    }
    next();
  });
};

// Zod Preprocessor helpers for Date Parsing
const optionalDateSchema = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (val instanceof Date) return val;
  return val;
}, z.date().nullable().optional());

const requiredDateSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (val instanceof Date) return val;
  return val;
}, z.date());

// Zod schemas for event-type-specific details
const hackathonDetailsSchema = z
  .object({
    max_participants: z.number().int().positive().optional().nullable(),
    prize_summary_text: z.string().optional().nullable(),
    tracks: z.array(z.string()).optional().default([]),
    submission_type: z.string().optional().nullable(),
  })
  .strict();

const workshopDetailsSchema = z
  .object({
    speaker_name: z.string().optional().nullable(),
    speaker_bio: z.string().optional().nullable(),
    duration_hours: z.number().positive().optional().nullable(),
    seats_available: z.number().int().positive().optional().nullable(),
    certificate_provided: z.boolean().default(false),
    prerequisite_skills: z.array(z.string()).optional().default([]),
  })
  .strict();

const internshipDetailsSchema = z
  .object({
    stipend_min: z.number().nonnegative().optional().nullable(),
    stipend_max: z.number().nonnegative().optional().nullable(),
    duration_months: z.number().positive().optional().nullable(),
    work_mode: z.enum(['remote', 'onsite', 'hybrid']),
    positions_available: z.number().int().positive().optional().nullable(),
    min_experience_months: z.number().int().nonnegative().default(0),
    perks: z.array(z.string()).optional().default([]),
  })
  .strict();

const baseEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  tagline: z.string().optional().nullable(),
  description: z.string().min(1, 'Description is required'),
  mode: z.enum(['online', 'offline', 'hybrid']),
  venue: z.string().optional().nullable(),
  location_id: z.number().int().optional().nullable(),
  timezone: z.string().default('Asia/Kolkata'),
  is_paid: z.boolean().default(false),
  registration_fee: z.number().nonnegative('Registration fee cannot be negative').default(0),
  currency: z.string().default('INR'),
  resume_required: z.boolean().default(false),
  registration_open_at: optionalDateSchema,
  registration_close_at: optionalDateSchema,
  event_start_at: requiredDateSchema,
  event_end_at: optionalDateSchema,
  eligibility_notes: z.string().optional().nullable(),
  eligibility_category_ids: z.array(z.number().int()).optional().default([]),
  tag_ids: z.array(z.number().int()).optional().default([]),
  contacts: z
    .array(
      z
        .object({
          name: z.string().min(1, 'Contact name is required'),
          phone: z.string().min(1, 'Contact phone is required'),
          email: z.string().email('Invalid contact email address'),
          role_label: z.string().optional().nullable(),
          sort_order: z.number().int().optional().nullable(),
        })
        .strict(),
    )
    .optional()
    .default([]),
});

const eventValidationSchema = z
  .discriminatedUnion('event_type', [
    baseEventSchema.extend({
      event_type: z.literal('hackathon'),
      hackathon_details: hackathonDetailsSchema,
    }),
    baseEventSchema.extend({
      event_type: z.literal('workshop'),
      workshop_details: workshopDetailsSchema,
    }),
    baseEventSchema.extend({
      event_type: z.literal('internship'),
      internship_details: internshipDetailsSchema,
    }),
  ])
  .refine(
    (data) => {
      if (data.event_end_at && data.event_start_at) {
        return data.event_end_at >= data.event_start_at;
      }
      return true;
    },
    {
      message: 'event_end_at must be after or equal to event_start_at',
      path: ['event_end_at'],
    },
  )
  .refine(
    (data) => {
      if (data.registration_close_at && data.event_start_at) {
        return data.registration_close_at <= data.event_start_at;
      }
      return true;
    },
    {
      message: 'registration_close_at must be before or equal to event_start_at',
      path: ['registration_close_at'],
    },
  )
  .refine(
    (data) => {
      if (data.registration_open_at && data.registration_close_at) {
        return data.registration_open_at <= data.registration_close_at;
      }
      return true;
    },
    {
      message: 'registration_open_at must be before or equal to registration_close_at',
      path: ['registration_open_at'],
    },
  )
  .refine(
    (data) => {
      if (data.event_type === 'internship' && data.internship_details) {
        const min = data.internship_details.stipend_min;
        const max = data.internship_details.stipend_max;
        if (min !== undefined && min !== null && max !== undefined && max !== null) {
          return Number(min) <= Number(max);
        }
      }
      return true;
    },
    {
      message: 'stipend_min cannot be greater than stipend_max',
      path: ['internship_details', 'stipend_min'],
    },
  )
  .superRefine((data, ctx) => {
    if (data.mode === 'online') {
      if (data.venue != null || data.location_id != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Online events must not include venue or location_id',
          path: ['mode'],
        });
      }
    } else {
      if (data.location_id == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Offline/hybrid events must include a location_id',
          path: ['mode'],
        });
      }
    }
  });

const listQuerySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().int().min(1)),
  limit: z.preprocess((val) => (val ? Number(val) : 10), z.number().int().min(1).max(100)),
});

// Helper: enrich an event row with organizationName and, for offline/hybrid, location details
async function enrichEventResponse(eventRow: any) {
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, eventRow.organizationId))
    .limit(1);

  let location: { city: string; state: string | null; country: string } | null = null;
  if (eventRow.locationId != null) {
    const [loc] = await db
      .select({ city: locations.city, state: locations.state, country: locations.country })
      .from(locations)
      .where(eq(locations.id, eventRow.locationId))
      .limit(1);
    if (loc) location = loc;
  }

  return {
    ...eventRow,
    organizationName: org?.name ?? null,
    ...(location ? { location } : {}),
  };
}

/**
 * @openapi
 * /api/organizer/tags:
 *   get:
 *     summary: List all system tags and current organization's custom tags
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of accessible tags
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/tags',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      const availableTags = await db
        .select()
        .from(tags)
        .where(
          or(
            eq(tags.isSystem, true),
            and(eq(tags.isSystem, false), eq(tags.organizationId, organizationId)),
          ),
        )
        .orderBy(asc(tags.name));

      return res.status(200).json(availableTags);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/tags:
 *   post:
 *     summary: Create or get an org-scoped custom tag
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label, category]
 *             properties:
 *               label:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [domain, technology, theme]
 *     responses:
 *       201:
 *         description: Tag created or reused
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
const createTagSchema = z.object({
  label: z.string().min(1, 'Tag label is required'),
  category: z.enum(['domain', 'technology', 'theme']),
});

router.post(
  '/tags',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      const validated = createTagSchema.parse(req.body);
      const tagRow = await getOrCreateTag(db, validated.label, validated.category, organizationId);

      return res.status(201).json(tagRow);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/eligibility-categories:
 *   get:
 *     summary: List all system eligibility categories and current organization's custom categories
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of accessible eligibility categories
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/eligibility-categories',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      const availableCategories = await db
        .select()
        .from(eligibilityCategories)
        .where(
          or(
            eq(eligibilityCategories.isSystem, true),
            and(
              eq(eligibilityCategories.isSystem, false),
              eq(eligibilityCategories.organizationId, organizationId),
            ),
          ),
        )
        .orderBy(asc(eligibilityCategories.name));

      return res.status(200).json(availableCategories);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/eligibility-categories:
 *   post:
 *     summary: Create or get an org-scoped custom eligibility category
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label]
 *             properties:
 *               label:
 *                 type: string
 *     responses:
 *       201:
 *         description: Eligibility category created or reused
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
const createEligibilityCategorySchema = z.object({
  label: z.string().min(1, 'Category label is required'),
});

router.post(
  '/eligibility-categories',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      const validated = createEligibilityCategorySchema.parse(req.body);
      const categoryRow = await getOrCreateEligibilityCategory(
        db,
        validated.label,
        organizationId,
      );

      return res.status(201).json(categoryRow);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/members/invite:
 *   post:
 *     summary: Invite a new member to the organization (Owner-only)
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: member@techinnovators.com
 *     responses:
 *       201:
 *         description: Member invited successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                   description: Raw invite token (development/testing only).
 *       400:
 *         description: Invalid input or user already registered/invited.
 *       403:
 *         description: Forbidden (only owners can invite members).
 *       401:
 *         description: Unauthorized.
 */
const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
});

router.post(
  '/members/invite',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.membershipRole !== 'owner') {
        throw new ForbiddenError('Forbidden: Only organization owners can invite members');
      }

      const validated = inviteMemberSchema.parse(req.body);
      const organizationId = req.user.organizationId;
      const invitedById = req.user.id;

      if (!organizationId) {
        throw new ValidationError('Owner has no organization ID associated');
      }

      const [existingAccount] = await db
        .select()
        .from(organizerAccounts)
        .where(eq(organizerAccounts.email, validated.email))
        .limit(1);

      if (existingAccount) {
        throw new ValidationError('User is already an organizer');
      }

      const rawToken = generateRandomToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

      await db.insert(organizationInvitations).values({
        organizationId,
        email: validated.email,
        tokenHash,
        invitedById,
        status: 'pending',
        expiresAt,
      });

      const responsePayload: { message: string; token?: string } = {
        message: 'Invitation created successfully',
      };

      if (process.env.NODE_ENV !== 'production') {
        responsePayload.token = rawToken;
      }

      return res.status(201).json(responsePayload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events:
 *   post:
 *     summary: Create a new draft event
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, event_type, description, mode, event_start_at]
 *             properties:
 *               title:
 *                 type: string
 *               event_type:
 *                 type: string
 *                 enum: [hackathon, workshop, internship]
 *               tagline:
 *                 type: string
 *               description:
 *                 type: string
 *               mode:
 *                 type: string
 *                 enum: [online, offline, hybrid]
 *               venue:
 *                 type: string
 *               location_id:
 *                 type: integer
 *               timezone:
 *                 type: string
 *                 default: Asia/Kolkata
 *               is_paid:
 *                 type: boolean
 *               registration_fee:
 *                 type: number
 *               currency:
 *                 type: string
 *                 default: INR
 *               resume_required:
 *                 type: boolean
 *               registration_open_at:
 *                 type: string
 *                 format: date-time
 *               registration_close_at:
 *                 type: string
 *                 format: date-time
 *               event_start_at:
 *                 type: string
 *                 format: date-time
 *               event_end_at:
 *                 type: string
 *                 format: date-time
 *               eligibility_notes:
 *                 type: string
 *               eligibility_category_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               tag_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               contacts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, phone, email]
 *                   properties:
 *                     name:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     role_label:
 *                       type: string
 *                     sort_order:
 *                       type: integer
 *               hackathon_details:
 *                 type: object
 *                 properties:
 *                   max_participants:
 *                     type: integer
 *                   prize_summary_text:
 *                     type: string
 *                   tracks:
 *                     type: array
 *                     items:
 *                       type: string
 *                   submission_type:
 *                     type: string
 *               workshop_details:
 *                 type: object
 *                 properties:
 *                   speaker_name:
 *                     type: string
 *                   speaker_bio:
 *                     type: string
 *                   duration_hours:
 *                     type: number
 *                   seats_available:
 *                     type: integer
 *                   certificate_provided:
 *                     type: boolean
 *                   prerequisite_skills:
 *                     type: array
 *                     items:
 *                       type: string
 *               internship_details:
 *                 type: object
 *                 properties:
 *                   stipend_min:
 *                     type: number
 *                   stipend_max:
 *                     type: number
 *                   duration_months:
 *                     type: number
 *                   work_mode:
 *                     type: string
 *                     enum: [remote, onsite, hybrid]
 *                   positions_available:
 *                     type: integer
 *                   min_experience_months:
 *                     type: integer
 *                   perks:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       201:
 *         description: Event created successfully
 *       400:
 *         description: Validation error or forbidden fields in request body
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post(
  '/events',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Reject if organization_id is in request body
      if (hasOrganizationId(req.body)) {
        throw new ValidationError('Forbidden field: organization_id is not allowed in body');
      }

      // Reject if client-supplied slug is in request body
      if (hasSlugInBody(req.body)) {
        throw new ValidationError('Forbidden field: slug is not allowed in body');
      }

      const validated = eventValidationSchema.parse(req.body);
      const organizationId = req.user?.organizationId;
      const createdBy = req.user?.id;

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      let createdEvent: any;

      await db.transaction(async (tx) => {
        // Validate taxonomy ownership (tags and eligibility categories must be system-level or own org's)
        await validateTaxonomyOwnership(
          tx,
          organizationId,
          validated.tag_ids,
          validated.eligibility_category_ids,
        );

        // Generate unique, collision-free slug
        const generatedSlug = await generateUniqueSlug(validated.title, tx);

        // 1. Insert core event
        const [insertedEvent] = await tx
          .insert(events)
          .values({
            organizationId,
            createdBy,
            eventType: validated.event_type,
            title: validated.title,
            slug: generatedSlug,
            tagline: validated.tagline,
            description: validated.description,
            mode: validated.mode,
            venue: validated.venue,
            locationId: validated.location_id,
            timezone: validated.timezone,
            isPaid: validated.is_paid,
            registrationFee: String(validated.registration_fee),
            currency: validated.currency,
            resumeRequired: validated.resume_required,
            registrationOpenAt: validated.registration_open_at,
            registrationCloseAt: validated.registration_close_at,
            eventStartAt: validated.event_start_at,
            eventEndAt: validated.event_end_at,
            eligibilityNotes: validated.eligibility_notes,
            status: 'draft',
          })
          .returning();

        createdEvent = insertedEvent;

        // 2. Insert details
        if (validated.event_type === 'hackathon') {
          await tx.insert(hackathonDetails).values({
            eventId: insertedEvent.id,
            maxParticipants: validated.hackathon_details.max_participants,
            prizeSummaryText: validated.hackathon_details.prize_summary_text,
            tracks: validated.hackathon_details.tracks,
            submissionType: validated.hackathon_details.submission_type,
          });
        } else if (validated.event_type === 'workshop') {
          await tx.insert(workshopDetails).values({
            eventId: insertedEvent.id,
            speakerName: validated.workshop_details.speaker_name,
            speakerBio: validated.workshop_details.speaker_bio,
            durationHours: validated.workshop_details.duration_hours
              ? String(validated.workshop_details.duration_hours)
              : null,
            seatsAvailable: validated.workshop_details.seats_available,
            certificateProvided: validated.workshop_details.certificate_provided,
            prerequisiteSkills: validated.workshop_details.prerequisite_skills,
          });
        } else if (validated.event_type === 'internship') {
          await tx.insert(internshipDetails).values({
            eventId: insertedEvent.id,
            stipendMin: validated.internship_details.stipend_min
              ? String(validated.internship_details.stipend_min)
              : null,
            stipendMax: validated.internship_details.stipend_max
              ? String(validated.internship_details.stipend_max)
              : null,
            durationMonths: validated.internship_details.duration_months
              ? String(validated.internship_details.duration_months)
              : null,
            workMode: validated.internship_details.work_mode,
            positionsAvailable: validated.internship_details.positions_available,
            minExperienceMonths: validated.internship_details.min_experience_months,
            perks: validated.internship_details.perks,
          });
        }

        // 3. Insert tags
        if (validated.tag_ids && validated.tag_ids.length > 0) {
          const tagValues = validated.tag_ids.map((tagId) => ({
            eventId: insertedEvent.id,
            tagId,
          }));
          await tx.insert(eventTags).values(tagValues);
        }

        // 4. Insert eligibility
        if (validated.eligibility_category_ids && validated.eligibility_category_ids.length > 0) {
          const eligibilityValues = validated.eligibility_category_ids.map(
            (eligibilityCategoryId) => ({
              eventId: insertedEvent.id,
              eligibilityCategoryId,
            }),
          );
          await tx.insert(eventEligibility).values(eligibilityValues);
        }

        // 5. Insert contacts
        if (validated.contacts && validated.contacts.length > 0) {
          const contactValues = validated.contacts.map((contact, idx) => ({
            eventId: insertedEvent.id,
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            roleLabel: contact.role_label,
            sortOrder: contact.sort_order ?? idx,
          }));
          await tx.insert(eventContacts).values(contactValues);
        }
      });

      const enriched = await enrichEventResponse(createdEvent);
      return res.status(201).json(enriched);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events:
 *   get:
 *     summary: List events for the authenticated organizer's organization
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *     responses:
 *       200:
 *         description: Successfully retrieved list of events
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/events',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = listQuerySchema.parse(req.query);
      const organizationId = req.user?.organizationId;

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      // Query total count
      const [countResult] = await db
        .select({ count: count() })
        .from(events)
        .where(eq(events.organizationId, organizationId));

      const totalItems = Number(countResult.count);
      const offset = (page - 1) * limit;

      const orgEvents = await db
        .select()
        .from(events)
        .where(eq(events.organizationId, organizationId))
        .orderBy(desc(events.createdAt))
        .limit(limit)
        .offset(offset);

      const enrichedEvents = await Promise.all(orgEvents.map(enrichEventResponse));

      return res.status(200).json({
        data: enrichedEvents,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events/{id}:
 *   put:
 *     summary: Update an existing event
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, event_type, description, mode, event_start_at]
 *             properties:
 *               title:
 *                 type: string
 *               event_type:
 *                 type: string
 *                 enum: [hackathon, workshop, internship]
 *               tagline:
 *                 type: string
 *               description:
 *                 type: string
 *               mode:
 *                 type: string
 *                 enum: [online, offline, hybrid]
 *               venue:
 *                 type: string
 *               location_id:
 *                 type: integer
 *               timezone:
 *                 type: string
 *                 default: Asia/Kolkata
 *               is_paid:
 *                 type: boolean
 *               registration_fee:
 *                 type: number
 *               currency:
 *                 type: string
 *                 default: INR
 *               resume_required:
 *                 type: boolean
 *               registration_open_at:
 *                 type: string
 *                 format: date-time
 *               registration_close_at:
 *                 type: string
 *                 format: date-time
 *               event_start_at:
 *                 type: string
 *                 format: date-time
 *               event_end_at:
 *                 type: string
 *                 format: date-time
 *               eligibility_notes:
 *                 type: string
 *               eligibility_category_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               tag_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               contacts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, phone, email]
 *                   properties:
 *                     name:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     role_label:
 *                       type: string
 *                     sort_order:
 *                       type: integer
 *               hackathon_details:
 *                 type: object
 *                 properties:
 *                   max_participants:
 *                     type: integer
 *                   prize_summary_text:
 *                     type: string
 *                   tracks:
 *                     type: array
 *                     items:
 *                       type: string
 *                   submission_type:
 *                     type: string
 *               workshop_details:
 *                 type: object
 *                 properties:
 *                   speaker_name:
 *                     type: string
 *                   speaker_bio:
 *                     type: string
 *                   duration_hours:
 *                     type: number
 *                   seats_available:
 *                     type: integer
 *                   certificate_provided:
 *                     type: boolean
 *                   prerequisite_skills:
 *                     type: array
 *                     items:
 *                       type: string
 *               internship_details:
 *                 type: object
 *                 properties:
 *                   stipend_min:
 *                     type: number
 *                   stipend_max:
 *                     type: number
 *                   duration_months:
 *                     type: number
 *                   work_mode:
 *                     type: string
 *                     enum: [remote, onsite, hybrid]
 *                   positions_available:
 *                     type: integer
 *                   min_experience_months:
 *                     type: integer
 *                   perks:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: Event updated successfully
 *       400:
 *         description: Validation error or forbidden fields in request body
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner organization)
 *       404:
 *         description: Event not found
 */
router.put(
  '/events/:id',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = req.params.id;

      // Reject if organization_id is in request body
      if (hasOrganizationId(req.body)) {
        throw new ValidationError('Forbidden field: organization_id is not allowed in body');
      }

      // Reject if client-supplied slug is in request body
      if (hasSlugInBody(req.body)) {
        throw new ValidationError('Forbidden field: slug is not allowed in body');
      }

      const validated = eventValidationSchema.parse(req.body);
      const organizationId = req.user?.organizationId;

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      // Check event existence and ownership
      const [existingEvent] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

      if (!existingEvent) {
        throw new NotFoundError('Event not found');
      }

      if (existingEvent.organizationId !== organizationId) {
        throw new ForbiddenError('Forbidden: You do not own this event');
      }

      // If event is published, check if any embedding-relevant fields changed
      let shouldReEmbed = false;
      if (existingEvent.status === 'published') {
        const oldTags = await db.select({ tagId: eventTags.tagId }).from(eventTags).where(eq(eventTags.eventId, eventId));
        const oldCats = await db
          .select({ categoryId: eventEligibility.eligibilityCategoryId })
          .from(eventEligibility)
          .where(eq(eventEligibility.eventId, eventId));

        let oldPrizeSummary: string | null = null;
        if (existingEvent.eventType === 'hackathon') {
          const [h] = await db
            .select({ prizeSummaryText: hackathonDetails.prizeSummaryText })
            .from(hackathonDetails)
            .where(eq(hackathonDetails.eventId, eventId))
            .limit(1);
          if (h) oldPrizeSummary = h.prizeSummaryText;
        }

        const oldState = {
          title: existingEvent.title,
          tagline: existingEvent.tagline,
          description: existingEvent.description,
          tagIds: oldTags.map((t) => t.tagId),
          eligibilityCategoryIds: oldCats.map((c) => c.categoryId),
          eligibilityNotes: existingEvent.eligibilityNotes,
          prizeSummaryText: oldPrizeSummary,
        };

        const newState = {
          title: validated.title,
          tagline: validated.tagline,
          description: validated.description,
          tag_ids: validated.tag_ids,
          eligibility_category_ids: validated.eligibility_category_ids,
          eligibility_notes: validated.eligibility_notes,
          prize_summary_text:
            validated.event_type === 'hackathon' ? validated.hackathon_details?.prize_summary_text : null,
        };

        shouldReEmbed = hasEmbeddingRelevantChanges(oldState, newState);
      }

      let updatedEvent: any;

      await db.transaction(async (tx) => {
        // Validate taxonomy ownership (tags and eligibility categories must be system-level or own org's)
        await validateTaxonomyOwnership(
          tx,
          organizationId,
          validated.tag_ids,
          validated.eligibility_category_ids,
        );

        // 1. Update core fields on events
        // NOTE: The slug field is intentionally excluded from updates below.
        // Slug is generated ONCE at creation time, from the title supplied in POST /api/organizer/events.
        // It must NEVER be regenerated or changed by PUT /api/organizer/events/:id, even if the organizer
        // edits the title in an update — the slug is the event's stable public URL identifier, and changing
        // it would break any link already shared to GET /api/events/:slug.
        const [updated] = await tx
          .update(events)
          .set({
            eventType: validated.event_type,
            title: validated.title,
            tagline: validated.tagline ?? null,
            description: validated.description,
            mode: validated.mode,
            venue: validated.venue ?? null,
            locationId: validated.location_id ?? null,
            timezone: validated.timezone,
            isPaid: validated.is_paid,
            registrationFee: String(validated.registration_fee),
            currency: validated.currency,
            resumeRequired: validated.resume_required,
            registrationOpenAt: validated.registration_open_at ?? null,
            registrationCloseAt: validated.registration_close_at ?? null,
            eventStartAt: validated.event_start_at,
            eventEndAt: validated.event_end_at ?? null,
            eligibilityNotes: validated.eligibility_notes ?? null,
            updatedAt: new Date(),
          })
          .where(eq(events.id, eventId))
          .returning();

        updatedEvent = updated;

        // 2. Replace type-specific details row
        await tx.delete(hackathonDetails).where(eq(hackathonDetails.eventId, eventId));
        await tx.delete(workshopDetails).where(eq(workshopDetails.eventId, eventId));
        await tx.delete(internshipDetails).where(eq(internshipDetails.eventId, eventId));

        if (validated.event_type === 'hackathon') {
          await tx.insert(hackathonDetails).values({
            eventId,
            maxParticipants: validated.hackathon_details.max_participants,
            prizeSummaryText: validated.hackathon_details.prize_summary_text,
            tracks: validated.hackathon_details.tracks,
            submissionType: validated.hackathon_details.submission_type,
          });
        } else if (validated.event_type === 'workshop') {
          await tx.insert(workshopDetails).values({
            eventId,
            speakerName: validated.workshop_details.speaker_name,
            speakerBio: validated.workshop_details.speaker_bio,
            durationHours: validated.workshop_details.duration_hours
              ? String(validated.workshop_details.duration_hours)
              : null,
            seatsAvailable: validated.workshop_details.seats_available,
            certificateProvided: validated.workshop_details.certificate_provided,
            prerequisiteSkills: validated.workshop_details.prerequisite_skills,
          });
        } else if (validated.event_type === 'internship') {
          await tx.insert(internshipDetails).values({
            eventId,
            stipendMin: validated.internship_details.stipend_min
              ? String(validated.internship_details.stipend_min)
              : null,
            stipendMax: validated.internship_details.stipend_max
              ? String(validated.internship_details.stipend_max)
              : null,
            durationMonths: validated.internship_details.duration_months
              ? String(validated.internship_details.duration_months)
              : null,
            workMode: validated.internship_details.work_mode,
            positionsAvailable: validated.internship_details.positions_available,
            minExperienceMonths: validated.internship_details.min_experience_months,
            perks: validated.internship_details.perks,
          });
        }

        // 3. Replace tags
        await tx.delete(eventTags).where(eq(eventTags.eventId, eventId));
        if (validated.tag_ids && validated.tag_ids.length > 0) {
          const tagValues = validated.tag_ids.map((tagId) => ({
            eventId,
            tagId,
          }));
          await tx.insert(eventTags).values(tagValues);
        }

        // 4. Replace eligibility categories
        await tx.delete(eventEligibility).where(eq(eventEligibility.eventId, eventId));
        if (validated.eligibility_category_ids && validated.eligibility_category_ids.length > 0) {
          const eligibilityValues = validated.eligibility_category_ids.map(
            (eligibilityCategoryId) => ({
              eventId,
              eligibilityCategoryId,
            }),
          );
          await tx.insert(eventEligibility).values(eligibilityValues);
        }

        // 5. Replace contacts (cleared and replaced consistently)
        await tx.delete(eventContacts).where(eq(eventContacts.eventId, eventId));
        const contactsToInsert = validated.contacts || [];
        if (contactsToInsert.length > 0) {
          const contactValues = contactsToInsert.map((contact, idx) => ({
            eventId,
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            roleLabel: contact.role_label,
            sortOrder: contact.sort_order ?? idx,
          }));
          await tx.insert(eventContacts).values(contactValues);
        }
      });

      if (shouldReEmbed) {
        enqueueEmbeddingJob(eventId);
      }

      const enriched = await enrichEventResponse(updatedEvent);
      return res.status(200).json(enriched);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events/{id}/publish:
 *   patch:
 *     summary: Publish a draft event
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Event published successfully
 *       400:
 *         description: Invalid state transition (only drafts can be published)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner organization)
 *       404:
 *         description: Event not found
 */
router.patch(
  '/events/:id/publish',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = req.params.id;
      const organizationId = req.user?.organizationId;

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      // Check event existence and ownership
      const [existingEvent] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

      if (!existingEvent) {
        throw new NotFoundError('Event not found');
      }

      if (existingEvent.organizationId !== organizationId) {
        throw new ForbiddenError('Forbidden: You do not own this event');
      }

      if (existingEvent.status !== 'draft') {
        throw new ValidationError('Only draft events can be published');
      }

      // Only set publishedAt on the first publish
      const publishedAt = existingEvent.publishedAt || new Date();

      const [updatedEvent] = await db
        .update(events)
        .set({
          status: 'published',
          publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
        .returning();

      // Trigger non-blocking background embedding job
      enqueueEmbeddingJob(eventId);

      return res.status(200).json(updatedEvent);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events/{id}/unpublish:
 *   patch:
 *     summary: Unpublish a published event back to draft status
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Event unpublished successfully
 *       400:
 *         description: Invalid state transition (only published events can be unpublished)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner organization)
 *       404:
 *         description: Event not found
 */
router.patch(
  '/events/:id/unpublish',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = req.params.id;
      const organizationId = req.user?.organizationId;

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      // Check event existence and ownership
      const [existingEvent] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

      if (!existingEvent) {
        throw new NotFoundError('Event not found');
      }

      if (existingEvent.organizationId !== organizationId) {
        throw new ForbiddenError('Forbidden: You do not own this event');
      }

      if (existingEvent.status !== 'published') {
        throw new ValidationError('Only published events can be unpublished');
      }

      const [updatedEvent] = await db
        .update(events)
        .set({
          status: 'draft',
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
        .returning();

      return res.status(200).json(updatedEvent);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events/{id}:
 *   delete:
 *     summary: Delete an event and all its details (hard delete)
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Event deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner organization)
 *       404:
 *         description: Event not found
 */
router.delete(
  '/events/:id',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = req.params.id;
      const organizationId = req.user?.organizationId;

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      // Check event existence and ownership
      const [existingEvent] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

      if (!existingEvent) {
        throw new NotFoundError('Event not found');
      }

      if (existingEvent.organizationId !== organizationId) {
        throw new ForbiddenError('Forbidden: You do not own this event');
      }

      // Hard delete core event - cascades automatically
      await db.delete(events).where(eq(events.id, eventId));

      return res.status(200).json({ message: 'Event deleted successfully' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events/{id}/banner:
 *   post:
 *     summary: Upload a banner image for the event
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [banner]
 *             properties:
 *               banner:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Banner uploaded successfully
 *       400:
 *         description: Invalid image, size limit exceeded, or validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner organization)
 *       404:
 *         description: Event not found
 */
router.post(
  '/events/:id/banner',
  requireAuth,
  requireRole('organizer'),
  uploadMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = req.params.id;
      const organizationId = req.user?.organizationId;

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      if (!req.file) {
        throw new ValidationError('Missing file: banner is required');
      }

      // Check event existence and ownership
      const [existingEvent] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

      if (!existingEvent) {
        // Clean up file if event not found
        fs.unlinkSync(req.file.path);
        throw new NotFoundError('Event not found');
      }

      if (existingEvent.organizationId !== organizationId) {
        // Clean up file if unauthorized
        fs.unlinkSync(req.file.path);
        throw new ForbiddenError('Forbidden: You do not own this event');
      }

      // Build relative URL/path for local storage.
      // NOTE: This local file storage path MUST be replaced with S3, Cloudinary,
      // or another cloud-based object storage solution before deploying to production.
      const bannerImageUrl = `/uploads/${req.file.filename}`;

      await db
        .update(events)
        .set({
          bannerImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId));

      return res.status(200).json({
        message: 'Banner uploaded successfully',
        banner_image_url: bannerImageUrl,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events/{id}/custom-fields:
 *   get:
 *     summary: Retrieve custom fields for an event
 *     description: Fetch all dynamic registration custom fields defined for the specified event.
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Event ID
 *     responses:
 *       200:
 *         description: List of custom fields returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   event_id:
 *                     type: string
 *                     format: uuid
 *                   label:
 *                     type: string
 *                   field_type:
 *                     type: string
 *                     enum: [text, textarea, select, multiselect, file, checkbox, date, url]
 *                   options:
 *                     type: array
 *                     items:
 *                       type: string
 *                     nullable: true
 *                   is_required:
 *                     type: boolean
 *                   sort_order:
 *                     type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner organization)
 *       404:
 *         description: Event not found
 */
router.get(
  '/events/:id/custom-fields',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = req.params.id;
      const organizationId = req.user?.organizationId;

      const parsedId = z.string().uuid().safeParse(eventId);
      if (!parsedId.success) {
        throw new NotFoundError('Event not found');
      }

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      const [existingEvent] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!existingEvent) {
        throw new NotFoundError('Event not found');
      }

      if (existingEvent.organizationId !== organizationId) {
        throw new ForbiddenError('Forbidden: You do not own this event');
      }

      const fields = await db
        .select()
        .from(eventCustomFields)
        .where(eq(eventCustomFields.eventId, eventId))
        .orderBy(asc(eventCustomFields.sortOrder), asc(eventCustomFields.id));

      const formatted = fields.map((f) => ({
        id: f.id,
        event_id: f.eventId,
        label: f.label,
        field_type: f.fieldType,
        options: f.options,
        is_required: f.isRequired,
        sort_order: f.sortOrder,
      }));

      return res.status(200).json(formatted);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events/{id}/custom-fields:
 *   put:
 *     summary: Set or replace custom fields for an event
 *     description: Performs a full replace of the dynamic custom fields for the event. Rejected if registrations already exist.
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required: [label, field_type]
 *               properties:
 *                 label:
 *                   type: string
 *                   example: College Year
 *                 field_type:
 *                   type: string
 *                   enum: [text, textarea, select, multiselect, file, checkbox, date, url]
 *                   example: select
 *                 options:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["1st Year", "2nd Year", "3rd Year", "4th Year"]
 *                   description: Required for select/multiselect types, must be omitted or null for others.
 *                 is_required:
 *                   type: boolean
 *                   default: false
 *                 sort_order:
 *                   type: integer
 *                   description: Sorting position. Defaults to array index if not specified.
 *     responses:
 *       200:
 *         description: Custom fields replaced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error or invalid schema
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner organization)
 *       404:
 *         description: Event not found
 *       409:
 *         description: Cannot modify registration form after registrations exist
 */
const customFieldInputSchema = z.object({
  label: z.string().min(1, 'Label must not be empty'),
  field_type: z.enum(['text', 'textarea', 'select', 'multiselect', 'file', 'checkbox', 'date', 'url']),
  options: z.array(z.string()).nullable().optional(),
  is_required: z.boolean().default(false),
  sort_order: z.number().int().optional(),
}).refine(
  (data) => {
    if (data.field_type === 'select' || data.field_type === 'multiselect') {
      return Array.isArray(data.options) && data.options.length > 0;
    }
    return data.options === null || data.options === undefined;
  },
  {
    message: 'options is required and must be a non-empty array of strings for select/multiselect types, and must be null or omitted for other types',
    path: ['options'],
  }
);

const customFieldsPutSchema = z.array(customFieldInputSchema);

router.put(
  '/events/:id/custom-fields',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = req.params.id;
      const organizationId = req.user?.organizationId;

      const parsedId = z.string().uuid().safeParse(eventId);
      if (!parsedId.success) {
        throw new NotFoundError('Event not found');
      }

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      const [existingEvent] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!existingEvent) {
        throw new NotFoundError('Event not found');
      }

      if (existingEvent.organizationId !== organizationId) {
        throw new ForbiddenError('Forbidden: You do not own this event');
      }

      const validated = customFieldsPutSchema.parse(req.body);

      // DB-level transaction
      let registrationExists = false;
      await db.transaction(async (tx) => {
        const [existingReg] = await tx
          .select()
          .from(eventRegistrations)
          .where(eq(eventRegistrations.eventId, eventId))
          .limit(1);

        if (existingReg) {
          registrationExists = true;
          return;
        }

        // Replaced dynamic fields
        await tx.delete(eventCustomFields).where(eq(eventCustomFields.eventId, eventId));

        if (validated.length > 0) {
          await tx.insert(eventCustomFields).values(
            validated.map((field, idx) => ({
              eventId,
              label: field.label,
              fieldType: field.field_type,
              options: field.options ?? null,
              isRequired: field.is_required,
              sortOrder: field.sort_order ?? idx,
            }))
          );
        }
      });

      if (registrationExists) {
        throw new ConflictError('cannot modify registration form after registrations exist');
      }

      return res.status(200).json({ message: 'Custom fields updated successfully' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/organizer/events/{id}/registrations:
 *   get:
 *     summary: View registrations for an event
 *     description: Retrieve all registrations for the specified event, including student profiles and their custom-field responses.
 *     tags: [Organizer]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Event ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [registered, confirmed, waitlisted, cancelled]
 *         description: Optional registration status filter
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Registrations list returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       student:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                       status:
 *                         type: string
 *                       payment_status:
 *                         type: string
 *                       registered_at:
 *                         type: string
 *                         format: date-time
 *                       responses:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             label:
 *                               type: string
 *                             value:
 *                               type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner organization or wrong token role)
 *       404:
 *         description: Event not found
 */
const registrationsQuerySchema = z.object({
  status: z.enum(['registered', 'confirmed', 'waitlisted', 'cancelled']).optional(),
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().int().min(1)).default(1),
  limit: z.preprocess((val) => (val ? Number(val) : 20), z.number().int().min(1).max(100)).default(20),
});

router.get(
  '/events/:id/registrations',
  requireAuth,
  requireRole('organizer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = req.params.id;
      const organizationId = req.user?.organizationId;

      const parsedId = z.string().uuid().safeParse(eventId);
      if (!parsedId.success) {
        throw new NotFoundError('Event not found');
      }

      if (!organizationId) {
        throw new ValidationError('Organizer has no organization ID associated');
      }

      const [existingEvent] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!existingEvent) {
        throw new NotFoundError('Event not found');
      }

      if (existingEvent.organizationId !== organizationId) {
        throw new ForbiddenError('Forbidden: You do not own this event');
      }

      const parsedQuery = registrationsQuerySchema.parse(req.query);
      const conditions = [eq(eventRegistrations.eventId, eventId)];

      if (parsedQuery.status) {
        conditions.push(eq(eventRegistrations.status, parsedQuery.status));
      }

      const [countResult] = await db
        .select({ count: count() })
        .from(eventRegistrations)
        .where(and(...conditions));

      const total = Number(countResult.count);
      const totalPages = Math.ceil(total / parsedQuery.limit);

      const results = await db
        .select({
          id: eventRegistrations.id,
          status: eventRegistrations.status,
          paymentStatus: eventRegistrations.paymentStatus,
          registeredAt: eventRegistrations.registeredAt,
          studentName: users.name,
          studentEmail: users.email,
        })
        .from(eventRegistrations)
        .innerJoin(users, eq(eventRegistrations.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(eventRegistrations.registeredAt), desc(eventRegistrations.id))
        .limit(parsedQuery.limit)
        .offset((parsedQuery.page - 1) * parsedQuery.limit);

      const registrationIds = results.map((r) => r.id);
      const responsesMap: Record<string, { label: string; value: string | null }[]> = {};

      if (registrationIds.length > 0) {
        const allResponses = await db
          .select({
            registrationId: eventRegistrationResponses.registrationId,
            label: eventCustomFields.label,
            value: eventRegistrationResponses.value,
          })
          .from(eventRegistrationResponses)
          .innerJoin(eventCustomFields, eq(eventRegistrationResponses.fieldId, eventCustomFields.id))
          .where(inArray(eventRegistrationResponses.registrationId, registrationIds))
          .orderBy(asc(eventCustomFields.sortOrder), asc(eventCustomFields.id));

        for (const resp of allResponses) {
          if (!responsesMap[resp.registrationId]) {
            responsesMap[resp.registrationId] = [];
          }
          responsesMap[resp.registrationId].push({
            label: resp.label,
            value: resp.value,
          });
        }
      }

      const data = results.map((r) => ({
        id: r.id,
        student: {
          name: r.studentName,
          email: r.studentEmail,
        },
        status: r.status,
        payment_status: r.paymentStatus,
        registered_at: r.registeredAt,
        responses: responsesMap[r.id] ?? [],
      }));

      return res.status(200).json({
        page: parsedQuery.page,
        limit: parsedQuery.limit,
        total,
        totalPages,
        data,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
