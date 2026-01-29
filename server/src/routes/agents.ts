import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import * as db from '../db/index.js';

const router = Router();

/**
 * GET /api/agents/context
 * Returns aggregated user context for AI agents
 * Includes: applications summary, rejection patterns, company intel, user stats
 */
router.get('/context', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // 1. Get user's applications
    const appsResult = await db.query(
      `SELECT id, company, role, seniority_level, company_size, industry, source,
              date_applied, outcome, days_to_response, rejection_analysis, fit_analysis
       FROM applications
       WHERE user_id = $1
       ORDER BY COALESCE(date_applied, created_at) DESC
       LIMIT 50`,
      [userId]
    );

    const applications = appsResult.rows.map(row => ({
      id: row.id,
      company: row.company,
      role: row.role,
      seniorityLevel: row.seniority_level,
      companySize: row.company_size,
      industry: row.industry,
      source: row.source,
      dateApplied: row.date_applied
        ? (row.date_applied instanceof Date
            ? row.date_applied.toISOString().split('T')[0]
            : String(row.date_applied).split('T')[0])
        : null,
      outcome: row.outcome,
      daysToResponse: row.days_to_response,
      rejectionCategory: row.rejection_analysis?.category || null,
      atsStage: row.rejection_analysis?.ats_assessment?.stage_reached || null,
      fitScore: row.fit_analysis?.overall_fit_score || null
    }));

    // 2. Calculate rejection patterns
    const rejectedApps = applications.filter(a => a.outcome?.startsWith('rejected'));
    const rejectionPatterns = {
      total: rejectedApps.length,
      byStage: {
        ats: rejectedApps.filter(a => a.outcome === 'rejected_ats').length,
        recruiter: rejectedApps.filter(a => a.outcome === 'rejected_recruiter').length,
        hiringManager: rejectedApps.filter(a => a.outcome === 'rejected_hm').length,
        finalRound: rejectedApps.filter(a => a.outcome === 'rejected_final').length
      },
      byCategory: rejectedApps.reduce((acc, a) => {
        const cat = a.rejectionCategory || 'unknown';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      avgDaysToResponse: rejectedApps.filter(a => a.daysToResponse)
        .reduce((sum, a) => sum + (a.daysToResponse || 0), 0) /
        Math.max(1, rejectedApps.filter(a => a.daysToResponse).length)
    };

    // 3. Calculate success metrics
    const totalApps = applications.length;
    const offers = applications.filter(a => a.outcome === 'offer').length;
    const interviewing = applications.filter(a => a.outcome === 'interviewing').length;
    const ghosted = applications.filter(a => a.outcome === 'ghosted').length;
    const applied = applications.filter(a => a.outcome === 'applied').length;

    const successMetrics = {
      totalApplications: totalApps,
      offers,
      interviewing,
      ghosted,
      rejected: rejectedApps.length,
      pending: applied,
      offerRate: totalApps > 0 ? ((offers / totalApps) * 100).toFixed(1) + '%' : '0%',
      interviewRate: totalApps > 0 ? (((offers + interviewing) / totalApps) * 100).toFixed(1) + '%' : '0%',
      ghostRate: totalApps > 0 ? ((ghosted / totalApps) * 100).toFixed(1) + '%' : '0%'
    };

    // 4. Infer user profile from applications
    const seniorityLevels = applications.filter(a => a.seniorityLevel).map(a => a.seniorityLevel);
    const mostCommonSeniority = seniorityLevels.length > 0
      ? seniorityLevels.sort((a, b) =>
          seniorityLevels.filter(v => v === a).length - seniorityLevels.filter(v => v === b).length
        ).pop()
      : null;

    const industries = applications.filter(a => a.industry).map(a => a.industry);
    const topIndustries = [...new Set(industries)].slice(0, 3);

    const companySizes = applications.filter(a => a.companySize).map(a => a.companySize);
    const preferredCompanySizes = [...new Set(companySizes)].slice(0, 2);

    const roles = applications.map(a => a.role).filter(Boolean);
    const topRoles = [...new Set(roles)].slice(0, 3);

    const userProfile = {
      inferredSeniority: mostCommonSeniority,
      topIndustries,
      preferredCompanySizes,
      topRoles,
      applicationCount: totalApps
    };

    // 5. Get top companies applied to (for company-specific insights)
    const companyFrequency = applications.reduce((acc, a) => {
      acc[a.company] = (acc[a.company] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topCompanies = Object.entries(companyFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([company, count]) => {
        const companyApps = applications.filter(a => a.company === company);
        const companyRejections = companyApps.filter(a => a.outcome?.startsWith('rejected'));
        return {
          company,
          applications: count,
          rejections: companyRejections.length,
          lastOutcome: companyApps[0]?.outcome || null,
          mostCommonStage: companyRejections.length > 0
            ? companyRejections[0]?.outcome?.replace('rejected_', '') || null
            : null
        };
      });

    // 6. Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentApps = applications.filter(a => {
      if (!a.dateApplied) return false;
      return new Date(a.dateApplied) >= thirtyDaysAgo;
    });

    const recentActivity = {
      applicationsLast30Days: recentApps.length,
      rejectionsLast30Days: recentApps.filter(a => a.outcome?.startsWith('rejected')).length,
      responsesLast30Days: recentApps.filter(a => a.outcome && a.outcome !== 'applied').length
    };

    // Return aggregated context
    res.json({
      userProfile,
      successMetrics,
      rejectionPatterns,
      topCompanies,
      recentActivity,
      // Include recent applications for specific context
      recentApplications: applications.slice(0, 10).map(a => ({
        company: a.company,
        role: a.role,
        outcome: a.outcome,
        dateApplied: a.dateApplied,
        rejectionCategory: a.rejectionCategory,
        fitScore: a.fitScore
      }))
    });
  } catch (error) {
    console.error('Error fetching agent context:', error);
    res.status(500).json({ error: 'Failed to fetch agent context' });
  }
});

/**
 * GET /api/agents/company/:name
 * Returns company-specific intelligence for agents
 */
router.get('/company/:name', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const companyName = req.params.name;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Get user's history with this company
    const userHistory = await db.query(
      `SELECT company, role, outcome, days_to_response, rejection_analysis, date_applied
       FROM applications
       WHERE user_id = $1 AND LOWER(company) = LOWER($2)
       ORDER BY date_applied DESC`,
      [userId, companyName]
    );

    // Get community stats for this company
    const communityStats = await db.getCompanyStats(companyName);

    res.json({
      company: companyName,
      userHistory: userHistory.rows.map(row => ({
        role: row.role,
        outcome: row.outcome,
        daysToResponse: row.days_to_response,
        rejectionCategory: row.rejection_analysis?.category,
        dateApplied: row.date_applied
      })),
      communityStats: communityStats ? {
        totalApplications: communityStats.totalApplications,
        uniqueApplicants: communityStats.uniqueApplicants,
        avgDaysToResponse: communityStats.avgDaysToResponse,
        ghostRate: communityStats.ghostRate,
        mostCommonOutcome: communityStats.mostCommonOutcome,
        topSignals: communityStats.topSignals
      } : null
    });
  } catch (error) {
    console.error('Error fetching company context:', error);
    res.status(500).json({ error: 'Failed to fetch company context' });
  }
});

export default router;
