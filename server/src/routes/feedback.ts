import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { saveReportFeedback } from '../db/index.js';
import { asyncHandler, createAppError } from '../middleware/errorHandler.js';
import { subscribeRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const ReportFeedbackSchema = z.object({
  userId: z.string().max(128).optional(),
  bottleneck: z.string().max(64).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  helpful: z.boolean().optional(),
  matchedExperience: z.boolean().optional(),
  note: z.string().max(2000).optional()
});

// POST /api/feedback/report — Founding User beta signal:
// does the diagnosis match experience, and is it helpful?
router.post(
  '/report',
  subscribeRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const validation = ReportFeedbackSchema.safeParse(req.body);

    if (!validation.success) {
      throw createAppError(
        validation.error.errors.map(e => e.message).join(', '),
        400
      );
    }

    await saveReportFeedback(validation.data);
    res.json({ data: { success: true } });
  })
);

export default router;
