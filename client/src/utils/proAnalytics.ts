// Pro Analytics - Progress Tracking, Company Intelligence, Rejection Pattern Aggregation
import { ApplicationRecord } from '../types/pro';

// ============ MONTHLY STATS HISTORY ============

export interface MonthlyStats {
  month: string; // YYYY-MM format
  totalApplications: number;
  responses: number;
  responseRate: number;
  ghosted: number;
  ghostRate: number;
  interviews: number; // rejected_recruiter, rejected_hm, rejected_final, offer
  interviewRate: number;
  offers: number;
  avgDaysToResponse: number | null;
}

export function getMonthFromDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function calculateMonthlyStats(applications: ApplicationRecord[]): MonthlyStats[] {
  // Group applications by month
  const byMonth: Record<string, ApplicationRecord[]> = {};

  for (const app of applications) {
    if (!app.dateApplied) continue;
    const month = getMonthFromDate(app.dateApplied);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(app);
  }

  // Calculate stats for each month
  const stats: MonthlyStats[] = [];

  for (const [month, apps] of Object.entries(byMonth)) {
    const total = apps.length;
    const resolved = apps.filter(a => a.outcome !== 'pending');
    const responses = resolved.filter(a => a.outcome !== 'ghosted').length;
    const ghosted = resolved.filter(a => a.outcome === 'ghosted').length;
    const interviews = apps.filter(a =>
      ['rejected_recruiter', 'rejected_hm', 'rejected_final', 'offer'].includes(a.outcome)
    ).length;
    const offers = apps.filter(a => a.outcome === 'offer').length;

    const withResponseTime = apps.filter(a => a.daysToResponse != null && a.daysToResponse > 0);
    const avgDays = withResponseTime.length > 0
      ? Math.round(withResponseTime.reduce((sum, a) => sum + (a.daysToResponse || 0), 0) / withResponseTime.length)
      : null;

    stats.push({
      month,
      totalApplications: total,
      responses,
      responseRate: resolved.length > 0 ? Math.round((responses / resolved.length) * 100) : 0,
      ghosted,
      ghostRate: resolved.length > 0 ? Math.round((ghosted / resolved.length) * 100) : 0,
      interviews,
      interviewRate: total > 0 ? Math.round((interviews / total) * 100) : 0,
      offers,
      avgDaysToResponse: avgDays
    });
  }

  // Sort by month descending (most recent first)
  return stats.sort((a, b) => b.month.localeCompare(a.month));
}

export interface ProgressComparison {
  current: MonthlyStats | null;
  previous: MonthlyStats | null;
  changes: {
    responseRate: { value: number; trend: 'up' | 'down' | 'same' } | null;
    interviewRate: { value: number; trend: 'up' | 'down' | 'same' } | null;
    ghostRate: { value: number; trend: 'up' | 'down' | 'same' } | null;
    volume: { value: number; trend: 'up' | 'down' | 'same' } | null;
  };
  summary: string;
}

export function calculateProgress(applications: ApplicationRecord[]): ProgressComparison {
  const monthlyStats = calculateMonthlyStats(applications);

  const current = monthlyStats[0] || null;
  const previous = monthlyStats[1] || null;

  const changes: ProgressComparison['changes'] = {
    responseRate: null,
    interviewRate: null,
    ghostRate: null,
    volume: null
  };

  let summaryParts: string[] = [];

  if (current && previous) {
    // Response rate change
    const responseChange = current.responseRate - previous.responseRate;
    changes.responseRate = {
      value: Math.abs(responseChange),
      trend: responseChange > 0 ? 'up' : responseChange < 0 ? 'down' : 'same'
    };

    // Interview rate change
    const interviewChange = current.interviewRate - previous.interviewRate;
    changes.interviewRate = {
      value: Math.abs(interviewChange),
      trend: interviewChange > 0 ? 'up' : interviewChange < 0 ? 'down' : 'same'
    };

    // Ghost rate change (lower is better)
    const ghostChange = current.ghostRate - previous.ghostRate;
    changes.ghostRate = {
      value: Math.abs(ghostChange),
      trend: ghostChange > 0 ? 'up' : ghostChange < 0 ? 'down' : 'same'
    };

    // Volume change
    const volumeChange = current.totalApplications - previous.totalApplications;
    changes.volume = {
      value: Math.abs(volumeChange),
      trend: volumeChange > 0 ? 'up' : volumeChange < 0 ? 'down' : 'same'
    };

    // Build summary
    if (changes.responseRate.trend === 'up' && changes.responseRate.value >= 5) {
      summaryParts.push(`Response rate improved by ${changes.responseRate.value}%`);
    } else if (changes.responseRate.trend === 'down' && changes.responseRate.value >= 5) {
      summaryParts.push(`Response rate dropped by ${changes.responseRate.value}%`);
    }

    if (changes.interviewRate.trend === 'up' && changes.interviewRate.value >= 3) {
      summaryParts.push(`Interview rate up ${changes.interviewRate.value}%`);
    }

    if (changes.ghostRate.trend === 'down' && changes.ghostRate.value >= 5) {
      summaryParts.push(`Fewer ghosted applications`);
    }
  }

  return {
    current,
    previous,
    changes,
    summary: summaryParts.length > 0
      ? summaryParts.join('. ') + '.'
      : current
        ? 'Not enough data for month-over-month comparison yet.'
        : 'Start tracking applications to see your progress.'
  };
}

// ============ COMPANY INTELLIGENCE ============

export interface CompanyIntelligence {
  company: string;
  totalApplications: number;
  outcomes: {
    pending: number;
    ghosted: number;
    rejected_ats: number;
    rejected_recruiter: number;
    rejected_hm: number;
    rejected_final: number;
    offer: number;
  };
  avgDaysToResponse: number | null;
  rejectionStage: string | null; // Most common rejection stage
  rejectionCategories: { category: string; count: number }[]; // From decoder
  insight: string;
}

export function analyzeCompanies(applications: ApplicationRecord[]): CompanyIntelligence[] {
  // Group by company (normalized)
  const byCompany: Record<string, ApplicationRecord[]> = {};

  for (const app of applications) {
    const company = app.company.toLowerCase().trim();
    if (!company || company === 'unknown company') continue;
    if (!byCompany[company]) byCompany[company] = [];
    byCompany[company].push(app);
  }

  const intelligence: CompanyIntelligence[] = [];

  for (const [, apps] of Object.entries(byCompany)) {
    // Only include companies with 2+ applications
    if (apps.length < 2) continue;

    const outcomes = {
      pending: 0,
      ghosted: 0,
      rejected_ats: 0,
      rejected_recruiter: 0,
      rejected_hm: 0,
      rejected_final: 0,
      offer: 0
    };

    const rejectionCategories: Record<string, number> = {};
    let totalDays = 0;
    let daysCount = 0;

    for (const app of apps) {
      outcomes[app.outcome]++;

      if (app.daysToResponse != null && app.daysToResponse > 0) {
        totalDays += app.daysToResponse;
        daysCount++;
      }

      // Aggregate rejection categories from decoder
      if (app.rejectionAnalysis?.category) {
        const cat = app.rejectionAnalysis.category;
        rejectionCategories[cat] = (rejectionCategories[cat] || 0) + 1;
      }
    }

    // Find most common rejection stage
    const rejectionStages = ['rejected_ats', 'rejected_recruiter', 'rejected_hm', 'rejected_final'];
    let maxRejections = 0;
    let mostCommonStage: string | null = null;
    for (const stage of rejectionStages) {
      if (outcomes[stage as keyof typeof outcomes] > maxRejections) {
        maxRejections = outcomes[stage as keyof typeof outcomes];
        mostCommonStage = stage;
      }
    }

    // Generate insight
    let insight = '';
    const displayName = apps[0].company; // Use original casing

    if (outcomes.offer > 0) {
      insight = `You've received ${outcomes.offer} offer(s) from ${displayName}. Strong track record!`;
    } else if (mostCommonStage === 'rejected_ats' && maxRejections >= 2) {
      insight = `${displayName} has rejected you ${maxRejections} times at ATS stage. Consider getting a referral or trying different role types.`;
    } else if (mostCommonStage === 'rejected_recruiter' && maxRejections >= 2) {
      insight = `You're passing ${displayName}'s ATS but getting filtered at recruiter screen. Your resume fits but something in your background isn't matching.`;
    } else if (mostCommonStage === 'rejected_hm' && maxRejections >= 2) {
      insight = `You're reaching hiring managers at ${displayName} but not converting. Focus on interview prep for this company's style.`;
    } else if (outcomes.ghosted >= 2) {
      insight = `${displayName} has ghosted you ${outcomes.ghosted} times. They may have slow processes or poor candidate communication.`;
    } else {
      insight = `You've applied to ${displayName} ${apps.length} times with mixed results.`;
    }

    intelligence.push({
      company: displayName,
      totalApplications: apps.length,
      outcomes,
      avgDaysToResponse: daysCount > 0 ? Math.round(totalDays / daysCount) : null,
      rejectionStage: mostCommonStage,
      rejectionCategories: Object.entries(rejectionCategories)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      insight
    });
  }

  // Sort by total applications descending
  return intelligence.sort((a, b) => b.totalApplications - a.totalApplications);
}

// ============ REJECTION PATTERN AGGREGATION ============

export interface RejectionPatternSummary {
  totalDecoded: number;
  categoryBreakdown: { category: string; count: number; percentage: number }[];
  topSignals: { signal: string; count: number }[];
  atsFilteredPercentage: number;
  humanReviewedPercentage: number;
  templateRejectionPercentage: number;
  insight: string;
}

export function aggregateRejectionPatterns(applications: ApplicationRecord[]): RejectionPatternSummary {
  const withAnalysis = applications.filter(a => a.rejectionAnalysis);
  const totalDecoded = withAnalysis.length;

  if (totalDecoded === 0) {
    return {
      totalDecoded: 0,
      categoryBreakdown: [],
      topSignals: [],
      atsFilteredPercentage: 0,
      humanReviewedPercentage: 0,
      templateRejectionPercentage: 0,
      insight: 'No rejection emails decoded yet. Use the Decoder to analyze your rejections and unlock pattern insights.'
    };
  }

  // Category breakdown
  const categoryCounts: Record<string, number> = {};
  const signalCounts: Record<string, number> = {};

  for (const app of withAnalysis) {
    const analysis = app.rejectionAnalysis!;

    // Count categories
    const cat = analysis.category || 'unknown';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    // Count signals
    for (const signal of analysis.signals || []) {
      signalCounts[signal] = (signalCounts[signal] || 0) + 1;
    }
  }

  const categoryBreakdown = Object.entries(categoryCounts)
    .map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / totalDecoded) * 100)
    }))
    .sort((a, b) => b.count - a.count);

  const topSignals = Object.entries(signalCounts)
    .map(([signal, count]) => ({ signal, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Calculate ATS vs human reviewed
  // Template and Hard No often indicate ATS filtering
  const atsCategories = ['Template', 'Hard No'];
  const humanCategories = ['Soft No', 'Door Open', 'Polite Pass'];

  const atsCount = atsCategories.reduce((sum, cat) => sum + (categoryCounts[cat] || 0), 0);
  const humanCount = humanCategories.reduce((sum, cat) => sum + (categoryCounts[cat] || 0), 0);

  const atsFilteredPercentage = Math.round((atsCount / totalDecoded) * 100);
  const humanReviewedPercentage = Math.round((humanCount / totalDecoded) * 100);
  const templateRejectionPercentage = Math.round(((categoryCounts['Template'] || 0) / totalDecoded) * 100);

  // Generate insight
  let insight = '';

  if (templateRejectionPercentage >= 60) {
    insight = `${templateRejectionPercentage}% of your rejections are template responses. You're likely being filtered by ATS systems before a human sees your application. Focus on referrals and direct applications.`;
  } else if (humanReviewedPercentage >= 50) {
    insight = `${humanReviewedPercentage}% of your rejections show signs of human review. Your applications are getting through ATS - focus on improving your pitch and interview skills.`;
  } else if (categoryCounts['Door Open'] && categoryCounts['Door Open'] >= 2) {
    insight = `You have ${categoryCounts['Door Open']} "door open" rejections - companies that left room for future opportunities. Consider following up with these.`;
  } else {
    insight = `Based on ${totalDecoded} decoded rejections, your results are mixed. Keep tracking to identify clearer patterns.`;
  }

  return {
    totalDecoded,
    categoryBreakdown,
    topSignals,
    atsFilteredPercentage,
    humanReviewedPercentage,
    templateRejectionPercentage,
    insight
  };
}

// ============ COMBINED PRO INSIGHTS ============

export interface ProInsightsData {
  progress: ProgressComparison;
  companies: CompanyIntelligence[];
  rejectionPatterns: RejectionPatternSummary;
  monthlyHistory: MonthlyStats[];
}

export function generateProInsights(applications: ApplicationRecord[]): ProInsightsData {
  return {
    progress: calculateProgress(applications),
    companies: analyzeCompanies(applications),
    rejectionPatterns: aggregateRejectionPatterns(applications),
    monthlyHistory: calculateMonthlyStats(applications)
  };
}
