import { ApplicationRecord } from '../types/pro.js';

export interface ComputedStats {
  total: number;
  outcome_distribution: Record<string, number>;
  source_stats: Record<string, { total: number; success_rate: number; ghost_rate: number }>;
  seniority_stats: Record<string, { total: number; success_rate: number }>;
  company_size_stats: Record<string, { total: number; success_rate: number }>;
  overall_ghost_rate: number;
  overall_rejection_rate: number;
  avg_days_to_response: number | null;
  failure_stage_distribution: Record<string, number>;
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function isSuccessOutcome(outcome: string): boolean {
  return ['offer', 'rejected_final', 'rejected_hm'].includes(outcome);
}

function isRejectionOutcome(outcome: string): boolean {
  return outcome.startsWith('rejected_') || outcome === 'ghosted';
}

export function computeStats(applications: ApplicationRecord[]): ComputedStats {
  const total = applications.length;

  if (total === 0) {
    return {
      total: 0,
      outcome_distribution: {},
      source_stats: {},
      seniority_stats: {},
      company_size_stats: {},
      overall_ghost_rate: 0,
      overall_rejection_rate: 0,
      avg_days_to_response: null,
      failure_stage_distribution: {}
    };
  }

  const byOutcome = groupBy(applications, 'outcome');
  const bySource = groupBy(applications, 'source');
  const bySeniority = groupBy(applications, 'seniorityLevel');
  const byCompanySize = groupBy(applications, 'companySize');

  // Outcome distribution
  const outcome_distribution: Record<string, number> = {};
  for (const [outcome, apps] of Object.entries(byOutcome)) {
    outcome_distribution[outcome] = apps.length / total;
  }

  // Source stats
  const source_stats: Record<string, { total: number; success_rate: number; ghost_rate: number }> = {};
  for (const [source, apps] of Object.entries(bySource)) {
    const successes = apps.filter(a => isSuccessOutcome(a.outcome)).length;
    const ghosts = apps.filter(a => a.outcome === 'ghosted').length;
    source_stats[source] = {
      total: apps.length,
      success_rate: apps.length > 0 ? successes / apps.length : 0,
      ghost_rate: apps.length > 0 ? ghosts / apps.length : 0
    };
  }

  // Seniority stats
  const seniority_stats: Record<string, { total: number; success_rate: number }> = {};
  for (const [seniority, apps] of Object.entries(bySeniority)) {
    const successes = apps.filter(a => isSuccessOutcome(a.outcome)).length;
    seniority_stats[seniority] = {
      total: apps.length,
      success_rate: apps.length > 0 ? successes / apps.length : 0
    };
  }

  // Company size stats
  const company_size_stats: Record<string, { total: number; success_rate: number }> = {};
  for (const [size, apps] of Object.entries(byCompanySize)) {
    const successes = apps.filter(a => isSuccessOutcome(a.outcome)).length;
    company_size_stats[size] = {
      total: apps.length,
      success_rate: apps.length > 0 ? successes / apps.length : 0
    };
  }

  // Overall rates
  const ghosted = byOutcome['ghosted']?.length || 0;
  const rejected = applications.filter(a => isRejectionOutcome(a.outcome)).length;

  // Avg response time
  const withResponse = applications.filter(a => a.daysToResponse !== null && a.daysToResponse > 0);
  const avg_days_to_response = withResponse.length > 0
    ? withResponse.reduce((sum, a) => sum + (a.daysToResponse || 0), 0) / withResponse.length
    : null;

  // Failure stage distribution
  const failure_stage_distribution: Record<string, number> = {
    ats: (byOutcome['rejected_ats']?.length || 0) / total,
    recruiter: (byOutcome['rejected_recruiter']?.length || 0) / total,
    hiring_manager: (byOutcome['rejected_hm']?.length || 0) / total,
    final_round: (byOutcome['rejected_final']?.length || 0) / total,
    ghosted: ghosted / total
  };

  return {
    total,
    outcome_distribution,
    source_stats,
    seniority_stats,
    company_size_stats,
    overall_ghost_rate: ghosted / total,
    overall_rejection_rate: rejected / total,
    avg_days_to_response,
    failure_stage_distribution
  };
}

export function findBestSource(stats: ComputedStats): { source: string; rate: number } | null {
  let best: { source: string; rate: number } | null = null;

  for (const [source, data] of Object.entries(stats.source_stats)) {
    if (data.total >= 2 && (!best || data.success_rate > best.rate)) {
      best = { source, rate: data.success_rate };
    }
  }

  return best;
}

export function findWorstSource(stats: ComputedStats): { source: string; rate: number } | null {
  let worst: { source: string; rate: number } | null = null;

  for (const [source, data] of Object.entries(stats.source_stats)) {
    if (data.total >= 2 && (!worst || data.success_rate < worst.rate)) {
      worst = { source, rate: data.success_rate };
    }
  }

  return worst;
}

export function detectSeniorityMismatch(
  stats: ComputedStats,
  currentSeniority: string
): { detected: boolean; suggestion: string | null; evidence: string[] } {
  const levels = ['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'director', 'vp', 'c-level'];
  const currentIndex = levels.indexOf(currentSeniority);

  const evidence: string[] = [];
  let betterLevelFound: string | null = null;
  let betterRate = 0;

  for (const [level, data] of Object.entries(stats.seniority_stats)) {
    if (data.total >= 2) {
      evidence.push(`${level}: ${(data.success_rate * 100).toFixed(0)}% success (n=${data.total})`);

      const levelIndex = levels.indexOf(level);
      if (levelIndex < currentIndex && data.success_rate > betterRate) {
        betterRate = data.success_rate;
        betterLevelFound = level;
      }
    }
  }

  const currentStats = stats.seniority_stats[currentSeniority];
  const currentRate = currentStats?.success_rate || 0;

  if (betterLevelFound && betterRate > currentRate * 2 && currentStats?.total >= 2) {
    return {
      detected: true,
      suggestion: betterLevelFound,
      evidence
    };
  }

  return { detected: false, suggestion: null, evidence };
}
