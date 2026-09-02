import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, asc, desc, and, count } from 'drizzle-orm';
import { db } from '../db/client';
import { events, hackathonDetails, organizations, locations, savedEvents, eventRegistrations } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

const listQuerySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().int().min(1)).default(1),
  limit: z
    .preprocess((val) => (val ? Number(val) : 20), z.number().int().min(1).max(100))
    .default(20),
});

/**
 * @openapi
 * /api/users/me/saved:
 *   get:
 *     summary: List authenticated student's saved events
 *     description: Retrieve a paginated list of published events that the authenticated student has saved.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
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
 *     responses:
 *       200:
 *         description: A paginated list of student's saved events
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (only students can view saved list)
 */
router.get(
  '/me/saved',
  requireAuth,
  requireRole('student'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listQuerySchema.parse(req.query);
      const offset = (parsed.page - 1) * parsed.limit;

      const conditions = [eq(savedEvents.userId, req.user!.id), eq(events.status, 'published')];

      const [countResult] = await db
        .select({ count: count() })
        .from(savedEvents)
        .innerJoin(events, eq(savedEvents.eventId, events.id))
        .where(and(...conditions));

      const total = Number(countResult.count);
      const totalPages = Math.ceil(total / parsed.limit);

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
        .from(savedEvents)
        .innerJoin(events, eq(savedEvents.eventId, events.id))
        .innerJoin(organizations, eq(events.organizationId, organizations.id))
        .leftJoin(locations, eq(events.locationId, locations.id))
        .leftJoin(hackathonDetails, eq(events.id, hackathonDetails.eventId))
        .where(and(...conditions))
        .orderBy(asc(events.eventStartAt), asc(events.id))
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
      next(error);
    }
  },
);

/**
 * @openapi
 * /api/users/me/registrations:
 *   get:
 *     summary: List authenticated student's registrations
 *     description: Retrieve a paginated list of all registrations (including cancelled ones) for the authenticated student.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
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
 *     responses:
 *       200:
 *         description: A paginated list of student's registrations
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
 *                         description: Event ID
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
 *                       status:
 *                         type: string
 *                         description: Registration status
 *                       payment_status:
 *                         type: string
 *                         description: Registration payment status
 *                       registered_at:
 *                         type: string
 *                         format: date-time
 *                         description: Registration timestamp
 *                       registration_id:
 *                         type: string
 *                         format: uuid
 *                         description: Registration ID
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (only students can view)
 */
router.get(
  '/me/registrations',
  requireAuth,
  requireRole('student'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listQuerySchema.parse(req.query);
      const offset = (parsed.page - 1) * parsed.limit;

      const conditions = [eq(eventRegistrations.userId, req.user!.id)];

      const [countResult] = await db
        .select({ count: count() })
        .from(eventRegistrations)
        .where(and(...conditions));

      const total = Number(countResult.count);
      const totalPages = Math.ceil(total / parsed.limit);

      const results = await db
        .select({
          id: eventRegistrations.id,
          status: eventRegistrations.status,
          paymentStatus: eventRegistrations.paymentStatus,
          registeredAt: eventRegistrations.registeredAt,
          eventId: events.id,
          eventSlug: events.slug,
          eventTitle: events.title,
          eventTagline: events.tagline,
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
        .from(eventRegistrations)
        .innerJoin(events, eq(eventRegistrations.eventId, events.id))
        .innerJoin(organizations, eq(events.organizationId, organizations.id))
        .leftJoin(locations, eq(events.locationId, locations.id))
        .leftJoin(hackathonDetails, eq(events.id, hackathonDetails.eventId))
        .where(and(...conditions))
        .orderBy(desc(eventRegistrations.registeredAt), desc(eventRegistrations.id))
        .limit(parsed.limit)
        .offset(offset);

      const formattedData = results.map((row) => ({
        id: row.eventId,
        slug: row.eventSlug,
        title: row.eventTitle,
        tagline: row.eventTagline,
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
        status: row.status,
        payment_status: row.paymentStatus,
        registered_at: row.registeredAt,
        registration_id: row.id,
      }));

      return res.status(200).json({
        page: parsed.page,
        limit: parsed.limit,
        total,
        totalPages,
        data: formattedData,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
