import { Router, Request, Response } from 'express';
import { DecodeRequestSchema } from '../types/index.js';
import { decodeRejectionEmail } from '../services/openai.js';
import { asyncHandler, createAppError } from '../middleware/errorHandler.js';
import { decodeRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post(
  '/',
  decodeRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const validation = DecodeRequestSchema.safeParse(req.body);

    if (!validation.success) {
      throw createAppError(
        validation.error.errors.map(e => e.message).join(', '),
        400
      );
    }

    const { emailText } = validation.data;

    // Log request metadata only - never log the actual email content
    console.log(`[decode] Request received - ${emailText.length} chars`);

    try {
      const result = await decodeRejectionEmail(emailText);
      console.log(`[decode] Success - category: ${result.category}, confidence: ${result.confidence}`);
      res.json({ data: result });
    } catch (error) {
      // Log error type but not details that might contain email content
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[decode] Failed - ${errorMessage.substring(0, 100)}`);

      // Return safe error message
      if (errorMessage.includes('OPENAI_API_KEY')) {
        throw createAppError('Service temporarily unavailable', 503);
      }
      if (errorMessage.includes('rate limit')) {
        throw createAppError('Too many requests. Please try again later.', 429);
      }
      throw createAppError('Failed to analyze email. Please try again.', 500);
    }
  })
);

export default router;
