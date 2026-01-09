import { Router, Request, Response } from 'express';
import { SubscribeRequestSchema } from '../types/index.js';
import { subscribeToConvertKit } from '../services/convertkit.js';
import { asyncHandler, createAppError } from '../middleware/errorHandler.js';
import { subscribeRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post(
  '/',
  subscribeRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const validation = SubscribeRequestSchema.safeParse(req.body);

    if (!validation.success) {
      throw createAppError(
        validation.error.errors.map(e => e.message).join(', '),
        400
      );
    }

    const { email } = validation.data;

    console.log('Subscribe request received');

    const result = await subscribeToConvertKit(email);

    console.log('Subscribe complete');

    res.json({ data: result });
  })
);

export default router;
