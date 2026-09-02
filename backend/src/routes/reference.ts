import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import { locations, tags, eligibilityCategories } from '../db/schema';
import { asc } from 'drizzle-orm';

const router = Router();

/**
 * @openapi
 * /api/locations:
 *   get:
 *     summary: List all available locations
 *     description: Returns all location rows (city, state, country, lat/lng) for use in filter dropdowns and event forms.
 *     tags: [Reference]
 *     responses:
 *       200:
 *         description: Array of location objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   country:
 *                     type: string
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 */
router.get('/locations', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db
      .select({
        id: locations.id,
        city: locations.city,
        state: locations.state,
        country: locations.country,
        latitude: locations.latitude,
        longitude: locations.longitude,
      })
      .from(locations)
      .orderBy(asc(locations.country), asc(locations.state), asc(locations.city));

    return res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/tags:
 *   get:
 *     summary: List all available tags
 *     description: Returns all tags (domain, technology, theme categories) for use in event filters and organizer forms.
 *     tags: [Reference]
 *     responses:
 *       200:
 *         description: Array of tag objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   slug:
 *                     type: string
 *                   category:
 *                     type: string
 *                     enum: [domain, technology, theme]
 */
router.get('/tags', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        category: tags.category,
      })
      .from(tags)
      .orderBy(asc(tags.category), asc(tags.name));

    return res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/eligibility-categories:
 *   get:
 *     summary: List all eligibility categories
 *     description: Returns all eligibility category rows for use in the organizer event form.
 *     tags: [Reference]
 *     responses:
 *       200:
 *         description: Array of eligibility category objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   slug:
 *                     type: string
 */
router.get('/eligibility-categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db
      .select({
        id: eligibilityCategories.id,
        name: eligibilityCategories.name,
        slug: eligibilityCategories.slug,
      })
      .from(eligibilityCategories)
      .orderBy(asc(eligibilityCategories.name));

    return res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
