import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  ApplicationRecordSchema,
  SeniorityLevelSchema
} from '../types/pro.js';
import { assessRoleFitV2 } from '../services/roleFitV2.js';
import { analyzeJobDescription } from '../services/jdAnalyzer.js';
import { inferProfile } from '../services/profileInference.js';
import { analyzeApplications } from '../services/unifiedAnalytics.js';
import { decodeRateLimiter, biasAuditRateLimiter, proBatchRateLimiter } from '../middleware/rateLimiter.js';
import {
  getCommunityCompanyStats,
  getCompanyStats,
  getSubscription,
  getCommunityBenchmarks,
  saveHoldingEmail,
  updateHoldingOutcome,
  getCompanyHoldingStats,
  getAllCompanyHoldingStats,
  getPendingHoldingEmails
} from '../db/index.js';
import { analyzeBias } from '../services/biasAudit.js';
import { BiasAuditRequestSchema, BatchDecodeRequestSchema } from '../types/bias.js';
import { decodeRejectionEmail } from '../services/openai.js';
import { redactPII } from '../services/piiRedactor.js';
import { getAuth } from '@clerk/express';

const router = Router();

// Minimal profile schema for v2 endpoints
const MinimalProfileSchema = z.object({
  yearsExperience: z.number().min(0).max(50),
  currentSeniority: SeniorityLevelSchema
});

// Unified analysis request schema
const AnalyzeRequestSchema = z.object({
  profile: MinimalProfileSchema,
  applications: z.array(ApplicationRecordSchema)
});

/**
 * POST /api/pro/analyze
 * Unified pattern analysis + strategic guidance with inferred profile
 */
router.post(
  '/analyze',
  decodeRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = AnalyzeRequestSchema.safeParse(req.body);

      if (!validation.success) {
        const errorDetails = validation.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        console.log('[pro/analyze] Validation error:', errorDetails);
        res.status(400).json({
          error: 'Validation error',
          details: errorDetails
        });
        return;
      }

      const { profile, applications } = validation.data;
      console.log(`[pro/analyze] Analyzing ${applications.length} applications`);

      const result = await analyzeApplications(profile, applications);

      console.log(`[pro/analyze] Complete - ${result.analysis.insights.length} insights generated`);
      res.json({ data: result });
    } catch (error) {
      console.error('[pro/analyze] Error:', error);
      next(error);
    }
  }
);

// Role Fit V2 request schema
const RoleFitV2RequestSchema = z.object({
  jobDescription: z.string().min(50, 'Job description must be at least 50 characters'),
  profile: MinimalProfileSchema,
  applications: z.array(ApplicationRecordSchema)
});

/**
 * POST /api/pro/role-fit-v2
 * Improved role fit with sample-size awareness and constructive messaging
 */
router.post(
  '/role-fit-v2',
  decodeRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = RoleFitV2RequestSchema.safeParse(req.body);

      if (!validation.success) {
        const errorDetails = validation.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        res.status(400).json({
          error: 'Validation error',
          details: errorDetails
        });
        return;
      }

      const { jobDescription, profile, applications } = validation.data;

      console.log(`[role-fit-v2] Assessing fit (${applications.length} apps, ${profile.yearsExperience} yrs exp)`);

      // Build full profile from minimal profile + applications
      const fullProfile = inferProfile(profile, applications);

      const result = await assessRoleFitV2(jobDescription, fullProfile);

      console.log(`[role-fit-v2] Complete - verdict: ${result.verdict}, company: ${result.company}`);
      res.json({ data: result });
    } catch (error) {
      console.error('[role-fit-v2] Error:', error);
      next(error);
    }
  }
);

// JD Analyzer request schema
const JDAnalyzeRequestSchema = z.object({
  jobDescription: z.string().min(50, 'Job description must be at least 50 characters')
});

/**
 * POST /api/pro/jd-analyze
 * Analyze a job description for red flags, requirements, and application strategy
 */
router.post(
  '/jd-analyze',
  decodeRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = JDAnalyzeRequestSchema.safeParse(req.body);

      if (!validation.success) {
        const errorDetails = validation.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        res.status(400).json({
          error: 'Validation error',
          details: errorDetails
        });
        return;
      }

      const { jobDescription } = validation.data;

      console.log(`[jd-analyze] Analyzing JD (${jobDescription.length} chars)`);

      const result = await analyzeJobDescription(jobDescription);

      console.log(`[jd-analyze] Complete - ${result.company} / ${result.role_title}, ${result.red_flags.length} red flags`);
      res.json({ data: result });
    } catch (error) {
      console.error('[jd-analyze] Error:', error);
      next(error);
    }
  }
);

/**
 * GET /api/pro/journey-benchmarks
 * Get community benchmarks for Journey Card comparison
 * Privacy: Only aggregate stats, no individual user data
 */
router.get(
  '/journey-benchmarks',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[journey-benchmarks] Fetching community benchmarks');

      const benchmarks = await getCommunityBenchmarks();

      if (!benchmarks) {
        res.json({
          data: null,
          message: 'Not enough community data yet'
        });
        return;
      }

      console.log(`[journey-benchmarks] Returning benchmarks from ${benchmarks.totalJobSeekers} job seekers`);
      res.json({ data: benchmarks });
    } catch (error) {
      console.error('[journey-benchmarks] Error:', error);
      next(error);
    }
  }
);

/**
 * GET /api/pro/company-intel
 * Get aggregated company intelligence from all users (Pro feature)
 * Privacy: Only shows companies with 10+ data points, never individual user data
 */
router.get(
  '/company-intel',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[company-intel] Fetching community company stats');

      const stats = await getCommunityCompanyStats(10);

      console.log(`[company-intel] Returning ${stats.length} companies`);
      res.json({ data: stats });
    } catch (error) {
      console.error('[company-intel] Error:', error);
      next(error);
    }
  }
);

/**
 * GET /api/pro/company-intel/:company
 * Get stats for a specific company
 */
router.get(
  '/company-intel/:company',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyName = req.params.company;
      console.log(`[company-intel] Looking up: ${companyName}`);

      const stats = await getCompanyStats(companyName);

      if (!stats) {
        res.status(404).json({
          error: 'Not enough data',
          message: 'We need more applications to this company before showing insights (privacy threshold: 5+)'
        });
        return;
      }

      res.json({ data: stats });
    } catch (error) {
      console.error('[company-intel] Error:', error);
      next(error);
    }
  }
);

/**
 * POST /api/pro/bias-audit
 * Analyze a rejection email for potential bias signals
 * UK Equality Act 2010 context included by default
 */
router.post(
  '/bias-audit',
  biasAuditRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = BiasAuditRequestSchema.safeParse(req.body);

      if (!validation.success) {
        const errorDetails = validation.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        res.status(400).json({
          error: 'Validation error',
          details: errorDetails
        });
        return;
      }

      const { emailText, includeUKContext, interviewStage } = validation.data;

      console.log(`[bias-audit] Analyzing email (${emailText.length} chars, UK context: ${includeUKContext})`);

      const result = await analyzeBias(emailText, { includeUKContext, interviewStage });

      console.log(`[bias-audit] Complete - risk: ${result.overall_risk}, signals: ${result.signals.length}`);
      res.json({ data: result });
    } catch (error) {
      console.error('[bias-audit] Error:', error);
      next(error);
    }
  }
);

/**
 * POST /api/pro/batch-decode
 * Batch decode multiple rejection emails (Pro feature)
 * Max 20 rejections per batch
 */
router.post(
  '/batch-decode',
  proBatchRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Require authentication for batch operations
      const auth = getAuth(req);
      if (!auth?.userId) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'Please sign in to use batch decode'
        });
        return;
      }

      // Check Pro status
      const subscription = await getSubscription(auth.userId);
      const isPro = subscription?.status === 'pro' || subscription?.status === 'active';

      if (!isPro) {
        res.status(403).json({
          error: 'Pro feature',
          message: 'Batch decode is a Pro feature. Upgrade to analyze multiple rejections at once.',
          upgrade: true
        });
        return;
      }

      const validation = BatchDecodeRequestSchema.safeParse(req.body);

      if (!validation.success) {
        const errorDetails = validation.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        res.status(400).json({
          error: 'Validation error',
          details: errorDetails
        });
        return;
      }

      const { rejections } = validation.data;

      console.log(`[batch-decode] Processing ${rejections.length} rejections for user ${auth.userId.slice(0, 8)}...`);

      // Process all rejections in parallel with PII redaction
      const results = await Promise.all(
        rejections.map(async (r, index) => {
          try {
            // PII redaction before AI processing
            const { redacted, totalRedactions } = redactPII(r.emailText);
            if (totalRedactions > 0) {
              console.log(`[batch-decode] Item ${index + 1}: Redacted ${totalRedactions} PII items`);
            }

            const result = await decodeRejectionEmail(redacted, r.interviewStage);
            return { success: true, data: result, index };
          } catch (error) {
            console.error(`[batch-decode] Item ${index + 1} failed:`, error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Analysis failed',
              index
            };
          }
        })
      );

      const successful = results.filter(r => r.success).length;
      console.log(`[batch-decode] Complete - ${successful}/${rejections.length} successful`);

      res.json({
        data: {
          results,
          summary: {
            total: rejections.length,
            successful,
            failed: rejections.length - successful
          }
        }
      });
    } catch (error) {
      console.error('[batch-decode] Error:', error);
      next(error);
    }
  }
);

// ============ HOLDING EMAIL FLYWHEEL ============

/**
 * POST /api/pro/holding-email
 * Save a holding email for outcome tracking
 */
router.post(
  '/holding-email',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);
      const { companyName, role, emailSnippet } = req.body;

      if (!companyName) {
        res.status(400).json({ error: 'Company name required' });
        return;
      }

      console.log(`[holding-email] Saving holding email for ${companyName}`);

      const id = await saveHoldingEmail({
        userId: auth?.userId || undefined,
        companyName,
        role,
        emailSnippet,
        heldAt: new Date()
      });

      // Check if we have stats for this company
      const stats = await getCompanyHoldingStats(companyName);

      res.json({
        data: {
          id,
          saved: true,
          companyStats: stats // null if not enough data yet
        }
      });
    } catch (error) {
      console.error('[holding-email] Error:', error);
      next(error);
    }
  }
);

/**
 * PATCH /api/pro/holding-email/:id/outcome
 * Update a holding email with its outcome
 */
router.patch(
  '/holding-email/:id/outcome',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { outcome } = req.body;

      if (!['ghosted', 'rejected', 'interview', 'offer'].includes(outcome)) {
        res.status(400).json({ error: 'Invalid outcome. Must be: ghosted, rejected, interview, or offer' });
        return;
      }

      console.log(`[holding-email] Updating outcome for ${id}: ${outcome}`);

      await updateHoldingOutcome(parseInt(id), outcome);

      res.json({ data: { updated: true, outcome } });
    } catch (error) {
      console.error('[holding-email] Error:', error);
      next(error);
    }
  }
);

/**
 * GET /api/pro/holding-stats/:company
 * Get holding email stats for a specific company
 */
router.get(
  '/holding-stats/:company',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { company } = req.params;
      console.log(`[holding-stats] Getting stats for ${company}`);

      const stats = await getCompanyHoldingStats(company);

      if (!stats) {
        res.json({
          data: null,
          message: 'Not enough data yet for this company'
        });
        return;
      }

      res.json({ data: stats });
    } catch (error) {
      console.error('[holding-stats] Error:', error);
      next(error);
    }
  }
);

/**
 * GET /api/pro/holding-stats
 * Get all company holding stats (ghost rate leaderboard)
 */
router.get(
  '/holding-stats',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[holding-stats] Getting all company stats');

      const stats = await getAllCompanyHoldingStats(3); // Min 3 samples

      res.json({ data: stats });
    } catch (error) {
      console.error('[holding-stats] Error:', error);
      next(error);
    }
  }
);

/**
 * GET /api/pro/pending-holding-emails
 * Get user's pending holding emails that need follow-up
 */
router.get(
  '/pending-holding-emails',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);
      if (!auth?.userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      console.log(`[pending-holding] Getting pending for user ${auth.userId.slice(0, 8)}...`);

      const pending = await getPendingHoldingEmails(auth.userId, 14);

      res.json({ data: pending });
    } catch (error) {
      console.error('[pending-holding] Error:', error);
      next(error);
    }
  }
);

export default router;
