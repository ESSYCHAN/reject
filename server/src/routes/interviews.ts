import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { asyncHandler, createAppError } from '../middleware/errorHandler.js';
import { saveInterviewExperience, getInterviewIntel, InterviewExperience } from '../db/index.js';

const router = Router();

/**
 * POST /api/interviews - Save an interview experience
 * Anyone can contribute (logged in users get their user_id attached)
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const userId = auth?.userId || null;

    const {
      company,
      role,
      totalRounds,
      interviewStages,
      interviewFormat,
      durationWeeks,
      questionsAsked,
      prepMaterials,
      interviewerTitles,
      difficultyRating,
      interviewerFriendliness,
      processTransparency,
      outcome,
      tipsForOthers,
      wouldInterviewAgain
    } = req.body;

    // Validate required fields
    if (!company || !role) {
      throw createAppError('Company and role are required', 400);
    }

    const experience: InterviewExperience = {
      userId: userId || undefined,
      company,
      role,
      totalRounds,
      interviewStages,
      interviewFormat,
      durationWeeks,
      questionsAsked,
      prepMaterials,
      interviewerTitles,
      difficultyRating,
      interviewerFriendliness,
      processTransparency,
      outcome,
      tipsForOthers,
      wouldInterviewAgain
    };

    await saveInterviewExperience(experience);

    console.log(`[interviews] Saved interview experience for ${company} - ${role}`);

    res.json({
      success: true,
      message: 'Interview experience saved! Thanks for helping the community.'
    });
  })
);

/**
 * GET /api/interviews/intel/:company - Get interview intel for a company
 */
router.get(
  '/intel/:company',
  asyncHandler(async (req: Request, res: Response) => {
    const { company } = req.params;
    const { role } = req.query;

    const intel = await getInterviewIntel(company, role as string | undefined);

    if (!intel) {
      res.json({
        company,
        hasData: false,
        message: `No interview data for ${company} yet. Be the first to share your experience!`
      });
      return;
    }

    res.json({
      hasData: true,
      ...intel
    });
  })
);

export default router;
