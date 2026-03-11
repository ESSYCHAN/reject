import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { DecodeRequestSchema } from '../types/index.js';
import { decodeRejectionEmail } from '../services/openai.js';
import { asyncHandler, createAppError } from '../middleware/errorHandler.js';
import { decodeRateLimiter } from '../middleware/rateLimiter.js';
import { saveToKnowledgeBase, saveToRejectionArchive } from '../db/index.js';
import { storeDecodedRejection } from '../services/vectordb.js';

const router = Router();

/**
 * Extract a safe email snippet (no PII) for archiving
 * Takes first 200 chars, removes potential PII patterns
 */
function extractSafeSnippet(emailText: string): string {
  // Remove potential email addresses
  let safe = emailText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');
  // Remove potential phone numbers
  safe = safe.replace(/(\+?[\d\s\-().]{10,})/g, '[phone]');
  // Remove potential names after "Dear" or "Hi"
  safe = safe.replace(/(Dear|Hi|Hello)\s+[A-Z][a-z]+/gi, '$1 [name]');
  // Take first 200 chars
  return safe.substring(0, 200);
}

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

    const { emailText, interviewStage } = validation.data;

    // Optional: extract company/role if provided in request for knowledge base
    const { company, role, seniorityLevel } = req.body;

    // Check if user is authenticated (optional for decode)
    const auth = getAuth(req);
    const userId = auth?.userId || null;

    // Log request metadata only - never log the actual email content
    console.log(`[decode] Request received - ${emailText.length} chars, interview stage: ${interviewStage || 'not specified'}, authenticated: ${!!userId}`);

    try {
      const result = await decodeRejectionEmail(emailText, interviewStage);
      console.log(`[decode] Success - category: ${result.category}, confidence: ${result.confidence}`);

      // Save to knowledge base (anonymized, always)
      try {
        await saveToKnowledgeBase({
          company: company || result.extracted_company || 'unknown',
          role: role || result.extracted_role,
          seniorityLevel: seniorityLevel,
          rejectionCategory: result.category,
          atsStage: result.ats_assessment?.stage_reached,
          signals: result.signals,
          daysToResponse: undefined // Will be filled when linked to application
        });
        console.log(`[decode] Saved to knowledge base`);

        // FLYWHEEL: Also store in Pinecone for semantic search
        // This makes every decode improve the system's pattern recognition
        await storeDecodedRejection({
          company: company || result.extracted_company || 'unknown',
          role: role || result.extracted_role,
          category: result.category,
          stage: result.ats_assessment?.stage_reached,
          signals: result.signals || [],
          confidence: result.confidence,
        });
      } catch (kbError) {
        // Don't fail the request if knowledge base save fails
        console.error(`[decode] Failed to save to knowledge base:`, kbError);
      }

      // Save to user's archive if authenticated
      if (userId) {
        try {
          await saveToRejectionArchive({
            userId,
            company: company || result.extracted_company || 'Unknown Company',
            role: role || result.extracted_role,
            seniorityLevel: seniorityLevel,
            rejectionCategory: result.category,
            confidence: result.confidence,
            signals: result.signals,
            atsStage: result.ats_assessment?.stage_reached,
            replyWorthIt: result.reply_worth_it,
            emailSnippet: extractSafeSnippet(emailText)
          });
          console.log(`[decode] Saved to user archive for ${userId}`);
        } catch (archiveError) {
          // Don't fail the request if archive save fails
          console.error(`[decode] Failed to save to archive:`, archiveError);
        }
      }

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
