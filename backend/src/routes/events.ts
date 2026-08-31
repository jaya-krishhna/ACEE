import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, desc, asc, and, count, inArray, lte, gte, SQL, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  events,
  hackathonDetails,
  workshopDetails,
  internshipDetails,
  eventTags,
  eventEligibility,
  eventContacts,
  organizations,
  locations,
  savedEvents,
  tags,
  eligibilityCategories,
  eventRegistrations,
  eventRegistrationResponses,
  eventCustomFields,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

const isBoolean = z.preprocess((val) => {
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  return val;
}, z.boolean());

const isNumeric = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return isNaN(num) ? val : num;
}, z.number());

const tagIdsSchema = z.preprocess(
  (val) => {
    if (!val || typeof val !== 'string') return undefined;
    return val.split(',').map((part) => {
      const num = Number(part.trim());
      if (isNaN(num) || !Number.isInteger(num)) {
        return NaN;
      }
      return num;
    });
  },
  z.array(z.number().int()).refine((arr) => !arr.includes(NaN), {
    message: 'tag_ids must be a comma-separated list of integers',
  }),
);

const optionalDateSchema = z.preprocess((val) => {
  if (!val) return undefined;
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return val;
}, z.date());

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().int().min(1)).default(1),
  limit: z
    .preprocess((val) => (val ? Number(val) : 20), z.number().int().min(1).max(100))
    .default(20),
  event_type: z.enum(['hackathon', 'workshop', 'internship']).optional(),
  city_id: z
    .preprocess((val) => {
      if (val === undefined || val === null || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) || !Number.isInteger(num) ? val : num;
    }, z.number().int())
    .optional(),
  mode: z.enum(['online', 'offline', 'hybrid']).optional(),
  is_paid: isBoolean.optional(),
  fee_max: isNumeric.optional(),
  date_from: optionalDateSchema.optional(),
  date_to: optionalDateSchema.optional(),
  tag_ids: tagIdsSchema.optional(),
  sort: z.enum(['newest']).optional(),
});

const uuidSchema = z.string().uuid();

/**
 * @openapi
 * /api/events:
 *   get:
 *     summary: Discover and list published events
 *     description: Retrieve a paginated list of published events with optional filters.
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: event_type
 *         schema:
 *           type: string
 *           enum: [hackathon, workshop, internship]
 *         description: Filter by event type
 *       - in: query
 *         name: city_id
 *         schema:
 *           type: integer
 *         description: Filter by normalized city location ID
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [online, offline, hybrid]
 *         description: Filter by mode of event
 *       - in: query
 *         name: is_paid
 *         schema:
 *           type: boolean
 *         description: Filter by paid vs free events
 *       - in: query
 *         name: fee_max
 *         schema:
 *           type: number
 *         description: Filter events with registration fee less than or equal to this value
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date filter (events starting after or on this date)
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date filter (events starting before or on this date)
 *       - in: query
 *         name: tag_ids
 *         schema:
 *           type: string
 *         description: Comma-separated list of tag IDs (matches events with ANY of these tags)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest]
 *         description: Sort order. Defaults to event_start_at ASC. 'newest' sorts by published_at DESC.
 *     responses:
 *       200:
 *         description: A paginated list of events
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
 *                       slug:
 *                         type: string
 *                       title:
 *                         type: string
 *                       tagline:
 *                         type: string
 *                       event_type:
 *                         type: string
 *                       banner_image_url:
 *                         type: string
 *                       organization:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                       location:
 *                         type: string
 *                       event_start_at:
 *                         type: string
 *                         format: date-time
 *                       registration_close_at:
 *                         type: string
 *                         format: date-time
 *                       is_paid:
 *                         type: boolean
 *                       registration_fee:
 *                         type: number
 *                       prize_summary_text:
 *                         type: string
 *       400:
 *         description: Validation error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = querySchema.parse(req.query);
    const conditions: (SQL | undefined)[] = [eq(events.status, 'published')];

    if (parsed.event_type) {
      conditions.push(eq(events.eventType, parsed.event_type));
    }
    if (parsed.city_id !== undefined) {
      conditions.push(eq(events.locationId, parsed.city_id));
    }
    if (parsed.mode) {
      conditions.push(eq(events.mode, parsed.mode));
    }
    if (parsed.is_paid !== undefined) {
      conditions.push(eq(events.isPaid, parsed.is_paid));
    }
    if (parsed.fee_max !== undefined) {
      conditions.push(lte(events.registrationFee, String(parsed.fee_max)));
    }
    if (parsed.date_from) {
      conditions.push(gte(events.eventStartAt, parsed.date_from));
    }
    if (parsed.date_to) {
      conditions.push(lte(events.eventStartAt, parsed.date_to));
    }
    if (parsed.tag_ids && parsed.tag_ids.length > 0) {
      const tagSubquery = db
        .select({ eventId: eventTags.eventId })
        .from(eventTags)
        .where(inArray(eventTags.tagId, parsed.tag_ids));
      conditions.push(inArray(events.id, tagSubquery));
    }

    const [countResult] = await db
      .select({ count: count() })
      .from(events)
      .where(and(...conditions));

    const total = Number(countResult.count);
    const totalPages = Math.ceil(total / parsed.limit);
    const offset = (parsed.page - 1) * parsed.limit;

    const orderClause =
      parsed.sort === 'newest'
        ? [desc(events.publishedAt), desc(events.id)]
        : [asc(events.eventStartAt), asc(events.id)];

    const results = await db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        tagline: events.tagline,
        eventType: events.eventType,
        bannerImageUrl: events.bannerImageUrl,
        orgName: organizations.name,
        city: locations.city,
        mode: events.mode,
        eventStartAt: events.eventStartAt,
        registrationCloseAt: events.registrationCloseAt,
        isPaid: events.isPaid,
        registrationFee: events.registrationFee,
        prizeSummaryText: hackathonDetails.prizeSummaryText,
      })
      .from(events)
      .innerJoin(organizations, eq(events.organizationId, organizations.id))
      .leftJoin(locations, eq(events.locationId, locations.id))
      .leftJoin(hackathonDetails, eq(events.id, hackathonDetails.eventId))
      .where(and(...conditions))
      .orderBy(...orderClause)
      .limit(parsed.limit)
      .offset(offset);

    const formattedData = results.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      tagline: row.tagline,
      event_type: row.eventType,
      banner_image_url: row.bannerImageUrl,
      organization: {
        name: row.orgName,
      },
      location: row.mode === 'online' ? 'Online Event' : (row.city ?? null),
      event_start_at: row.eventStartAt,
      registration_close_at: row.registrationCloseAt,
      is_paid: row.isPaid,
      registration_fee: row.registrationFee ? Number(row.registrationFee) : 0,
      ...(row.eventType === 'hackathon'
        ? { prize_summary_text: row.prizeSummaryText ?? null }
        : {}),
    }));

    return res.status(200).json({
      page: parsed.page,
      limit: parsed.limit,
      total,
      totalPages,
      data: formattedData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/events/{slug}:
 *   get:
 *     summary: Retrieve full details of a published event
 *     description: Fetch core event, location, public organization details, type-specific details, tags, eligibility categories, and contacts by event slug.
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Event unique slug
 *     responses:
 *       200:
 *         description: Detailed event information
 *       404:
 *         description: Event not found or not published
 */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const [eventRow] = await db
      .select()
      .from(events)
      .where(and(eq(events.slug, req.params.slug), eq(events.status, 'published')))
      .limit(1);

    if (!eventRow) {
      return res.status(404).json({ message: 'Event not found' });
    }

    let location: { city: string; state: string | null; country: string } | 'Online Event' | null =
      'Online Event';
    if (eventRow.mode !== 'online') {
      if (eventRow.locationId) {
        const [loc] = await db
          .select({ city: locations.city, state: locations.state, country: locations.country })
          .from(locations)
          .where(eq(locations.id, eventRow.locationId))
          .limit(1);
        if (loc) {
          location = {
            city: loc.city,
            state: loc.state,
            country: loc.country,
          };
        } else {
          location = null;
        }
      } else {
        location = null;
      }
    }

    const [org] = await db
      .select({
        name: organizations.name,
        logoUrl: organizations.logoUrl,
        isVerified: organizations.isVerified,
        orgType: organizations.orgType,
        websiteUrl: organizations.websiteUrl,
      })
      .from(organizations)
      .where(eq(organizations.id, eventRow.organizationId))
      .limit(1);

    const organization = org
      ? {
          name: org.name,
          logo_url: org.logoUrl,
          is_verified: org.isVerified,
          org_type: org.orgType,
          website_url: org.websiteUrl,
        }
      : null;

    let details: Record<string, unknown> | null = null;
    if (eventRow.eventType === 'hackathon') {
      const [h] = await db
        .select()
        .from(hackathonDetails)
        .where(eq(hackathonDetails.eventId, eventRow.id))
        .limit(1);
      if (h) {
        details = {
          hackathon_details: {
            max_participants: h.maxParticipants,
            prize_summary_text: h.prizeSummaryText,
            tracks: h.tracks ?? [],
            submission_type: h.submissionType,
          },
        };
      }
    } else if (eventRow.eventType === 'workshop') {
      const [w] = await db
        .select()
        .from(workshopDetails)
        .where(eq(workshopDetails.eventId, eventRow.id))
        .limit(1);
      if (w) {
        details = {
          workshop_details: {
            speaker_name: w.speakerName,
            speaker_bio: w.speakerBio,
            duration_hours: w.durationHours ? Number(w.durationHours) : null,
            seats_available: w.seatsAvailable,
            certificate_provided: w.certificateProvided,
            prerequisite_skills: w.prerequisiteSkills ?? [],
          },
        };
      }
    } else if (eventRow.eventType === 'internship') {
      const [i] = await db
        .select()
        .from(internshipDetails)
        .where(eq(internshipDetails.eventId, eventRow.id))
        .limit(1);
      if (i) {
        details = {
          internship_details: {
            stipend_min: i.stipendMin ? Number(i.stipendMin) : null,
            stipend_max: i.stipendMax ? Number(i.stipendMax) : null,
            duration_months: i.durationMonths ? Number(i.durationMonths) : null,
            work_mode: i.workMode,
            positions_available: i.positionsAvailable,
            min_experience_months: i.minExperienceMonths,
            perks: i.perks ?? [],
          },
        };
      }
    }

    const eventTagsRows = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        category: tags.category,
      })
      .from(eventTags)
      .innerJoin(tags, eq(eventTags.tagId, tags.id))
      .where(eq(eventTags.eventId, eventRow.id));

    const eligibilityRows = await db
      .select({
        id: eligibilityCategories.id,
        name: eligibilityCategories.name,
        slug: eligibilityCategories.slug,
      })
      .from(eventEligibility)
      .innerJoin(
        eligibilityCategories,
        eq(eventEligibility.eligibilityCategoryId, eligibilityCategories.id),
      )
      .where(eq(eventEligibility.eventId, eventRow.id));

    const contactsRows = await db
      .select({
        name: eventContacts.name,
        phone: eventContacts.phone,
        email: eventContacts.email,
        role_label: eventContacts.roleLabel,
      })
      .from(eventContacts)
      .where(eq(eventContacts.eventId, eventRow.id))
      .orderBy(asc(eventContacts.sortOrder));

    const response = {
      id: eventRow.id,
      title: eventRow.title,
      tagline: eventRow.tagline,
      description: eventRow.description,
      event_type: eventRow.eventType,
      mode: eventRow.mode,
      venue: eventRow.venue ?? null,
      location,
      timezone: eventRow.timezone,
      is_paid: eventRow.isPaid,
      registration_fee: eventRow.registrationFee ? Number(eventRow.registrationFee) : 0,
      currency: eventRow.currency,
      resume_required: eventRow.resumeRequired,
      registration_open_at: eventRow.registrationOpenAt,
      registration_close_at: eventRow.registrationCloseAt,
      event_start_at: eventRow.eventStartAt,
      event_end_at: eventRow.eventEndAt,
      eligibility_notes: eventRow.eligibilityNotes,
      organization,
      ...details,
      tags: eventTagsRows,
      eligibility_categories: eligibilityRows,
      contacts: contactsRows ?? [],
    };

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/events/{id}/save:
 *   post:
 *     summary: Bookmark/save an event
 *     description: Save a published event to the authenticated student's saved list.
 *     tags: [Events]
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
 *         description: Event saved successfully
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (only students can save events)
 *       404:
 *         description: Event not found or not published
 */
router.post(
  '/:id/save',
  requireAuth,
  requireRole('student'),
  async (req: Request, res: Response) => {
    try {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(404).json({ message: 'Event not found' });
      }

      const [eventRow] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, req.params.id), eq(events.status, 'published')))
        .limit(1);

      if (!eventRow) {
        return res.status(404).json({ message: 'Event not found or not published' });
      }

      await db
        .insert(savedEvents)
        .values({
          userId: req.user!.id,
          eventId: eventRow.id,
        })
        .onConflictDoNothing();

      return res.status(200).json({ message: 'Event saved successfully' });
    } catch (error) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

/**
 * @openapi
 * /api/events/{id}/save:
 *   delete:
 *     summary: Unsave a bookmarked event
 *     description: Remove a saved event from the authenticated student's saved list.
 *     tags: [Events]
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
 *         description: Event unsaved successfully
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Event not found
 */
router.delete(
  '/:id/save',
  requireAuth,
  requireRole('student'),
  async (req: Request, res: Response) => {
    try {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(404).json({ message: 'Event not found' });
      }

      await db
        .delete(savedEvents)
        .where(and(eq(savedEvents.userId, req.user!.id), eq(savedEvents.eventId, req.params.id)));

      return res.status(200).json({ message: 'Event unsaved successfully' });
    } catch (error) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

/**
 * @openapi
 * /api/events/{id}/register:
 *   post:
 *     summary: Register for an event (Student-only)
 *     description: Submit registration for a published event, providing answers to dynamic custom fields.
 *     tags: [Events]
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
 *             type: object
 *             properties:
 *               responses:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [field_id, value]
 *                   properties:
 *                     field_id:
 *                       type: integer
 *                       example: 1
 *                     value:
 *                       type: string
 *                       example: "3rd Year"
 *     responses:
 *       201:
 *         description: Registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 registration_id:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                 payment_status:
 *                   type: string
 *       400:
 *         description: Validation error, window not open, closed, or invalid field response format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (only students can register)
 *       404:
 *         description: Event not found or not published
 *       409:
 *         description: Duplicate active registration for the event
 */
const responseItemSchema = z.object({
  field_id: z.number().int(),
  value: z.string(),
});

const registerBodySchema = z.object({
  responses: z.array(responseItemSchema).optional().default([]),
});

router.post(
  '/:id/register',
  requireAuth,
  requireRole('student'),
  async (req: Request, res: Response) => {
    try {
      const eventId = req.params.id;
      const userId = req.user!.id;

      const parsedId = uuidSchema.safeParse(eventId);
      if (!parsedId.success) {
        return res.status(404).json({ message: 'Event not found' });
      }

      let resultMessage = 'Registered successfully';
      let registrationId: string = '';
      let returnStatus = 'registered';
      let returnPaymentStatus = 'not_applicable';

      await db.transaction(async (tx) => {
        // 1. Fetch event status and registration window
        const [event] = await tx
          .select()
          .from(events)
          .where(eq(events.id, eventId))
          .limit(1);

        if (!event || event.status !== 'published') {
          // Throw error to trigger rollback and respond with 404
          throw new Error('EVENT_NOT_FOUND');
        }

        const now = new Date();
        if (event.registrationOpenAt && now < event.registrationOpenAt) {
          throw new Error('REGISTRATION_NOT_OPEN');
        }
        if (event.registrationCloseAt && now > event.registrationCloseAt) {
          throw new Error('REGISTRATION_CLOSED');
        }

        // 2. Check for duplicate registration
        const [existingReg] = await tx
          .select()
          .from(eventRegistrations)
          .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
          .limit(1);

        if (existingReg && existingReg.status !== 'cancelled') {
          throw new Error('DUPLICATE_REGISTRATION');
        }

        // 3. Fetch custom fields for validation
        const customFields = await tx
          .select()
          .from(eventCustomFields)
          .where(eq(eventCustomFields.eventId, eventId))
          .orderBy(asc(eventCustomFields.sortOrder), asc(eventCustomFields.id));

        const parsedBody = registerBodySchema.parse(req.body);
        const userResponses = parsedBody.responses;
        const fieldsMap = new Map(customFields.map((f) => [f.id, f]));

        // Check for responses belonging to other events
        for (const resp of userResponses) {
          if (!fieldsMap.has(resp.field_id)) {
            throw new Error(`FIELD_NOT_BELONGING:${resp.field_id}`);
          }
        }

        // Check for duplicate field responses in payload
        const fieldIdsInPayload = userResponses.map((r) => r.field_id);
        const uniqueFieldIds = new Set(fieldIdsInPayload);
        if (fieldIdsInPayload.length !== uniqueFieldIds.size) {
          throw new Error('DUPLICATE_FIELD_RESPONSES');
        }

        // Check required fields
        for (const field of customFields) {
          const resp = userResponses.find((r) => r.field_id === field.id);
          const val = resp?.value;
          const isEmpty = val === undefined || val === null || val === '';
          if (field.isRequired && isEmpty) {
            throw new Error(`REQUIRED_FIELD_MISSING:${field.label}`);
          }
        }

        // Validate values according to field types
        for (const resp of userResponses) {
          const field = fieldsMap.get(resp.field_id)!;
          const val = resp.value;
          const isEmpty = val === undefined || val === null || val === '';
          if (isEmpty) continue;

          if (field.fieldType === 'select') {
            const options = Array.isArray(field.options) ? (field.options as string[]) : [];
            if (!options.includes(val)) {
              throw new Error(`INVALID_SELECT_VALUE:${field.label}`);
            }
          } else if (field.fieldType === 'multiselect') {
            let parsedVal: any;
            try {
              parsedVal = JSON.parse(val);
            } catch (e) {
              throw new Error(`INVALID_MULTISELECT_JSON:${field.label}`);
            }
            if (!Array.isArray(parsedVal) || !parsedVal.every((item) => typeof item === 'string')) {
              throw new Error(`INVALID_MULTISELECT_FORMAT:${field.label}`);
            }
            const options = Array.isArray(field.options) ? (field.options as string[]) : [];
            for (const item of parsedVal) {
              if (!options.includes(item)) {
                throw new Error(`INVALID_MULTISELECT_VALUE:${field.label}:${item}`);
              }
            }
          } else if (field.fieldType === 'checkbox') {
            if (val !== 'true' && val !== 'false') {
              throw new Error(`INVALID_CHECKBOX_VALUE:${field.label}`);
            }
          } else if (field.fieldType === 'date') {
            if (isNaN(Date.parse(val))) {
              throw new Error(`INVALID_DATE_VALUE:${field.label}`);
            }
          } else if (field.fieldType === 'url') {
            const urlParse = z.string().url().safeParse(val);
            if (!urlParse.success) {
              throw new Error(`INVALID_URL_VALUE:${field.label}`);
            }
          }
          // 'file' type accepts any URL string in this phase, handled by Zod (value is a string)
        }

        // 4. Perform Insert or Update
        returnPaymentStatus = event.isPaid ? 'pending' : 'not_applicable';

        if (existingReg) {
          registrationId = existingReg.id;
          await tx
            .update(eventRegistrations)
            .set({
              status: 'registered',
              paymentStatus: returnPaymentStatus,
              registeredAt: new Date(),
            })
            .where(eq(eventRegistrations.id, registrationId));

          await tx
            .delete(eventRegistrationResponses)
            .where(eq(eventRegistrationResponses.registrationId, registrationId));
        } else {
          const [newReg] = await tx
            .insert(eventRegistrations)
            .values({
              eventId,
              userId,
              status: 'registered',
              paymentStatus: returnPaymentStatus,
              registeredAt: new Date(),
            })
            .returning({ id: eventRegistrations.id });
          registrationId = newReg.id;
        }

        // Insert responses
        if (userResponses.length > 0) {
          await tx.insert(eventRegistrationResponses).values(
            userResponses.map((r) => ({
              registrationId,
              fieldId: r.field_id,
              value: r.value,
            }))
          );
        }

        // Increment event registration count
        await tx
          .update(events)
          .set({
            registrationCount: sql`${events.registrationCount} + 1`,
          })
          .where(eq(events.id, eventId));
      });

      return res.status(201).json({
        message: resultMessage,
        registration_id: registrationId,
        status: returnStatus,
        payment_status: returnPaymentStatus,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.issues });
      }
      // Map transactional error markers to HTTP statuses
      if (error.message === 'EVENT_NOT_FOUND') {
        return res.status(404).json({ message: 'Event not found' });
      }
      if (error.message === 'REGISTRATION_NOT_OPEN') {
        return res.status(400).json({ message: 'registration not yet open' });
      }
      if (error.message === 'REGISTRATION_CLOSED') {
        return res.status(400).json({ message: 'registration closed' });
      }
      if (error.message === 'DUPLICATE_REGISTRATION') {
        return res.status(409).json({ message: 'You are already registered for this event' });
      }
      if (error.message === 'DUPLICATE_FIELD_RESPONSES') {
        return res.status(400).json({ message: 'Duplicate responses for the same field are not allowed' });
      }
      if (error.message.startsWith('FIELD_NOT_BELONGING:')) {
        const fieldId = error.message.split(':')[1];
        return res.status(400).json({ message: `Field ID ${fieldId} does not belong to this event` });
      }
      if (error.message.startsWith('REQUIRED_FIELD_MISSING:')) {
        const label = error.message.split(':')[1];
        return res.status(400).json({ message: `Field "${label}" is required` });
      }
      if (error.message.startsWith('INVALID_SELECT_VALUE:')) {
        const label = error.message.split(':')[1];
        return res.status(400).json({ message: `Value for field "${label}" is not a valid option` });
      }
      if (error.message.startsWith('INVALID_MULTISELECT_JSON:')) {
        const label = error.message.split(':')[1];
        return res.status(400).json({ message: `Value for multiselect field "${label}" must be a valid JSON array` });
      }
      if (error.message.startsWith('INVALID_MULTISELECT_FORMAT:')) {
        const label = error.message.split(':')[1];
        return res.status(400).json({ message: `Value for multiselect field "${label}" must be a JSON array of strings` });
      }
      if (error.message.startsWith('INVALID_MULTISELECT_VALUE:')) {
        const parts = error.message.split(':');
        return res.status(400).json({ message: `Multiselect value "${parts[2]}" is not a valid option for field "${parts[1]}"` });
      }
      if (error.message.startsWith('INVALID_CHECKBOX_VALUE:')) {
        const label = error.message.split(':')[1];
        return res.status(400).json({ message: `Value for checkbox field "${label}" must be "true" or "false"` });
      }
      if (error.message.startsWith('INVALID_DATE_VALUE:')) {
        const label = error.message.split(':')[1];
        return res.status(400).json({ message: `Value for date field "${label}" must be a valid date string` });
      }
      if (error.message.startsWith('INVALID_URL_VALUE:')) {
        const label = error.message.split(':')[1];
        return res.status(400).json({ message: `Value for url field "${label}" must be a valid URL` });
      }
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

/**
 * @openapi
 * /api/events/{id}/register:
 *   delete:
 *     summary: Cancel registration for an event (Student-only)
 *     description: Cancel an active registration for the specified event. Retains the row but updates status to 'cancelled'.
 *     tags: [Events]
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
 *         description: Registration cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (only students can cancel)
 *       404:
 *         description: Registration not found or already cancelled
 */
router.delete(
  '/:id/register',
  requireAuth,
  requireRole('student'),
  async (req: Request, res: Response) => {
    try {
      const eventId = req.params.id;
      const userId = req.user!.id;

      const parsedId = uuidSchema.safeParse(eventId);
      if (!parsedId.success) {
        return res.status(404).json({ message: 'Event not found' });
      }

      let notFound = false;

      await db.transaction(async (tx) => {
        const [existingReg] = await tx
          .select()
          .from(eventRegistrations)
          .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
          .limit(1);

        if (!existingReg || existingReg.status === 'cancelled') {
          notFound = true;
          return;
        }

        // Set status to cancelled
        await tx
          .update(eventRegistrations)
          .set({ status: 'cancelled' })
          .where(eq(eventRegistrations.id, existingReg.id));

        // Decrement registration count
        await tx
          .update(events)
          .set({
            registrationCount: sql`${events.registrationCount} - 1`,
          })
          .where(eq(events.id, eventId));
      });

      if (notFound) {
        return res.status(404).json({ message: 'Active registration not found for this event' });
      }

      return res.status(200).json({ message: 'Registration cancelled successfully' });
    } catch (error) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

export default router;
