import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { executeSearch } from '../services/searchService';
import { ValidationError } from '../errors/AppError';

const router = Router();

const searchRequestSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, 'query is required'),
  page: z
    .preprocess((val) => (val === undefined ? 1 : Number(val)), z.number().int().min(1))
    .default(1),
  limit: z
    .preprocess((val) => (val === undefined ? 10 : Number(val)), z.number().int().min(1).max(100))
    .default(10),
  sort: z.enum(['upcoming', 'newest']).optional(),
});

/**
 * @openapi
 * /api/search:
 *   post:
 *     summary: Student-facing natural-language hybrid search
 *     description: Perform hybrid search (metadata filtering + BM25 + pgvector RRF ranking) across published events using natural-language queries.
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 example: "AI hackathons in Bengaluru this month"
 *               page:
 *                 type: integer
 *                 minimum: 1
 *                 default: 1
 *               limit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 default: 10
 *               sort:
 *                 type: string
 *                 enum: [upcoming, newest]
 *     responses:
 *       200:
 *         description: Ranked search results with extracted filters and pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
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
 *                       relaxed_match:
 *                         type: boolean
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                 extracted_filters:
 *                   type: object
 *                 filters_relaxed:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Request validation error
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = searchRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue ? issue.message : 'Invalid search request');
    }

    const { query, page, limit, sort } = parseResult.data;

    // Optional user ID from token if provided, but public endpoint works unauthenticated
    const userId = (req as any).user?.id || null;

    const result = await executeSearch({
      rawQuery: query,
      page,
      limit,
      sort,
      userId,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
