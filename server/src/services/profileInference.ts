import { ApplicationRecord, SeniorityLevel, CompanySize, ApplicationSource, Outcome } from '../types/pro.js';

/**
 * Minimal profile - only what we MUST ask the user
 */
export interface MinimalProfile {
  yearsExperience: number;
  currentSeniority: SeniorityLevel;
}

/**
 * Inferred profile - derived from application history
 */
export interface InferredProfile {
  // What they're targeting (from applications)
  targetSeniorities: { level: SeniorityLevel; count: number; percentage: number }[];
  targetCompanySizes: { size: CompanySize; count: number; percentage: number }[];
  targetIndustries: { industry: string; count: number; percentage: number }[];
  preferredSources: { source: ApplicationSource; count: number; percentage: number }[];

  // What's working (from outcomes)
  successBySeniority: { level: SeniorityLevel; applied: number; succeeded: number; rate: number }[];
  successByCompanySize: { size: CompanySize; applied: number; succeeded: number; rate: number }[];
  successBySource: { source: ApplicationSource; applied: number; succeeded: number; rate: number }[];
  successByIndustry: { industry: string; applied: number; succeeded: number; rate: number }[];

  // Key mismatches detected
  mismatches: ProfileMismatch[];
}

export interface ProfileMismatch {
  type: 'seniority_gap' | 'source_inefficiency' | 'company_size_mismatch' | 'industry_mismatch';
  description: string;
  recommendation: string;
  confidence: number;
}

/**
 * Full profile combining user input + inference
 */
export interface FullProfile {
  // User provided
  yearsExperience: number;
  currentSeniority: SeniorityLevel;

  // Inferred
  inferred: InferredProfile;

  // Summary stats
  totalApplications: number;
  overallSuccessRate: number;
  overallGhostRate: number;
  avgDaysToResponse: number | null;
}

// Success = got past ATS (interview, offer, or late-stage rejection)
function isSuccess(outcome: Outcome): boolean {
  return ['offer', 'rejected_final', 'rejected_hm', 'rejected_recruiter'].includes(outcome);
}

function countBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, number> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<K, number>);
}

function toPercentageArray<K extends string>(
  counts: Record<K, number>,
  total: number
): { key: K; count: number; percentage: number }[] {
  return Object.entries(counts)
    .map(([key, count]) => ({
      key: key as K,
      count: count as number,
      percentage: total > 0 ? Math.round(((count as number) / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);
}

function calculateSuccessRates<K extends string>(
  applications: ApplicationRecord[],
  keyFn: (app: ApplicationRecord) => K
): { key: K; applied: number; succeeded: number; rate: number }[] {
  const grouped: Record<K, { applied: number; succeeded: number }> = {} as Record<K, { applied: number; succeeded: number }>;

  for (const app of applications) {
    const key = keyFn(app);
    if (!grouped[key]) {
      grouped[key] = { applied: 0, succeeded: 0 };
    }
    grouped[key].applied++;
    if (isSuccess(app.outcome)) {
      grouped[key].succeeded++;
    }
  }

  return Object.entries(grouped)
    .map(([key, data]) => ({
      key: key as K,
      applied: (data as { applied: number; succeeded: number }).applied,
      succeeded: (data as { applied: number; succeeded: number }).succeeded,
      rate: (data as { applied: number; succeeded: number }).applied > 0
        ? Math.round(((data as { applied: number; succeeded: number }).succeeded / (data as { applied: number; succeeded: number }).applied) * 100)
        : 0
    }))
    .sort((a, b) => b.applied - a.applied);
}

function detectMismatches(
  minimal: MinimalProfile,
  applications: ApplicationRecord[]
): ProfileMismatch[] {
  const mismatches: ProfileMismatch[] = [];
  const total = applications.length;

  if (total < 3) return mismatches;

  // 1. Seniority gap detection
  const senioritySuccess = calculateSuccessRates(applications, app => app.seniorityLevel);
  const lowerLevels = ['intern', 'junior', 'mid'];
  const higherLevels = ['senior', 'staff', 'principal', 'director', 'vp', 'c-level'];
  const allLevels = [...lowerLevels, ...higherLevels];

  const currentIndex = allLevels.indexOf(minimal.currentSeniority);

  // Check if applying above level with poor results
  const aboveLevelApps = senioritySuccess.filter(s => {
    const idx = allLevels.indexOf(s.key);
    return idx > currentIndex && s.applied >= 2;
  });

  const atOrBelowLevelApps = senioritySuccess.filter(s => {
    const idx = allLevels.indexOf(s.key);
    return idx <= currentIndex && s.applied >= 2;
  });

  if (aboveLevelApps.length > 0 && atOrBelowLevelApps.length > 0) {
    const aboveAvgRate = aboveLevelApps.reduce((sum, s) => sum + s.rate, 0) / aboveLevelApps.length;
    const atBelowAvgRate = atOrBelowLevelApps.reduce((sum, s) => sum + s.rate, 0) / atOrBelowLevelApps.length;

    if (aboveAvgRate < atBelowAvgRate * 0.5 && atBelowAvgRate > 20) {
      mismatches.push({
        type: 'seniority_gap',
        description: `You're seeing ${Math.round(aboveAvgRate)}% success rate at levels above ${minimal.currentSeniority}, vs ${Math.round(atBelowAvgRate)}% at your level or below.`,
        recommendation: `Focus more applications at ${minimal.currentSeniority} level where you're seeing better traction.`,
        confidence: Math.min(0.9, 0.5 + (total / 20))
      });
    }
  }

  // 2. Source inefficiency
  const sourceSuccess = calculateSuccessRates(applications, app => app.source);
  const bestSource = sourceSuccess.filter(s => s.applied >= 2).sort((a, b) => b.rate - a.rate)[0];
  const mostUsedSource = sourceSuccess[0];

  if (bestSource && mostUsedSource && bestSource.key !== mostUsedSource.key) {
    if (bestSource.rate > mostUsedSource.rate * 1.5 && bestSource.applied >= 2) {
      mismatches.push({
        type: 'source_inefficiency',
        description: `${bestSource.key} has ${bestSource.rate}% success rate but you only use it ${Math.round((bestSource.applied / total) * 100)}% of the time. ${mostUsedSource.key} (${mostUsedSource.rate}% success) is your most used source.`,
        recommendation: `Shift more applications to ${bestSource.key} channel.`,
        confidence: Math.min(0.85, 0.4 + (bestSource.applied / 10))
      });
    }
  }

  // 3. Company size mismatch
  const sizeSuccess = calculateSuccessRates(applications, app => app.companySize);
  const bestSize = sizeSuccess.filter(s => s.applied >= 2).sort((a, b) => b.rate - a.rate)[0];
  const mostTargetedSize = sizeSuccess[0];

  if (bestSize && mostTargetedSize && bestSize.key !== mostTargetedSize.key) {
    if (bestSize.rate > mostTargetedSize.rate * 1.5 && bestSize.applied >= 2) {
      mismatches.push({
        type: 'company_size_mismatch',
        description: `${bestSize.key} companies: ${bestSize.rate}% success. ${mostTargetedSize.key} companies (your most targeted): ${mostTargetedSize.rate}% success.`,
        recommendation: `Consider targeting more ${bestSize.key} sized companies.`,
        confidence: Math.min(0.8, 0.4 + (bestSize.applied / 10))
      });
    }
  }

  return mismatches;
}

/**
 * Main function: Build full profile from minimal input + application history
 */
export function inferProfile(
  minimal: MinimalProfile,
  applications: ApplicationRecord[]
): FullProfile {
  const total = applications.length;

  // Calculate overall stats
  const succeeded = applications.filter(app => isSuccess(app.outcome)).length;
  const ghosted = applications.filter(app => app.outcome === 'ghosted').length;
  const withResponse = applications.filter(app => app.daysToResponse != null && app.daysToResponse > 0);
  const avgDays = withResponse.length > 0
    ? Math.round(withResponse.reduce((sum, app) => sum + (app.daysToResponse || 0), 0) / withResponse.length)
    : null;

  // Build target distributions
  const seniorityCounts = countBy(applications, app => app.seniorityLevel);
  const sizeCounts = countBy(applications, app => app.companySize);
  const sourceCounts = countBy(applications, app => app.source);
  const industryCounts = countBy(
    applications.filter(app => app.industry && app.industry.trim()),
    app => app.industry.toLowerCase().trim()
  );

  // Build success rates
  const successBySeniority = calculateSuccessRates(applications, app => app.seniorityLevel);
  const successBySize = calculateSuccessRates(applications, app => app.companySize);
  const successBySource = calculateSuccessRates(applications, app => app.source);
  const successByIndustry = calculateSuccessRates(
    applications.filter(app => app.industry && app.industry.trim()),
    app => app.industry.toLowerCase().trim()
  );

  // Detect mismatches
  const mismatches = detectMismatches(minimal, applications);

  return {
    yearsExperience: minimal.yearsExperience,
    currentSeniority: minimal.currentSeniority,

    inferred: {
      targetSeniorities: toPercentageArray(seniorityCounts, total).map(x => ({
        level: x.key as SeniorityLevel,
        count: x.count,
        percentage: x.percentage
      })),
      targetCompanySizes: toPercentageArray(sizeCounts, total).map(x => ({
        size: x.key as CompanySize,
        count: x.count,
        percentage: x.percentage
      })),
      targetIndustries: toPercentageArray(industryCounts, total).map(x => ({
        industry: x.key,
        count: x.count,
        percentage: x.percentage
      })),
      preferredSources: toPercentageArray(sourceCounts, total).map(x => ({
        source: x.key as ApplicationSource,
        count: x.count,
        percentage: x.percentage
      })),

      successBySeniority: successBySeniority.map(x => ({
        level: x.key as SeniorityLevel,
        applied: x.applied,
        succeeded: x.succeeded,
        rate: x.rate
      })),
      successByCompanySize: successBySize.map(x => ({
        size: x.key as CompanySize,
        applied: x.applied,
        succeeded: x.succeeded,
        rate: x.rate
      })),
      successBySource: successBySource.map(x => ({
        source: x.key as ApplicationSource,
        applied: x.applied,
        succeeded: x.succeeded,
        rate: x.rate
      })),
      successByIndustry: successByIndustry.map(x => ({
        industry: x.key,
        applied: x.applied,
        succeeded: x.succeeded,
        rate: x.rate
      })),

      mismatches
    },

    totalApplications: total,
    overallSuccessRate: total > 0 ? Math.round((succeeded / total) * 100) : 0,
    overallGhostRate: total > 0 ? Math.round((ghosted / total) * 100) : 0,
    avgDaysToResponse: avgDays
  };
}

/**
 * Generate a text summary for the AI prompt
 */
export function profileToPromptContext(profile: FullProfile): string {
  const lines: string[] = [];

  lines.push(`=== CANDIDATE PROFILE ===`);
  lines.push(`Years of experience: ${profile.yearsExperience}`);
  lines.push(`Current seniority: ${profile.currentSeniority}`);
  lines.push(`Total applications tracked: ${profile.totalApplications}`);
  lines.push(`Overall success rate (got past ATS): ${profile.overallSuccessRate}%`);
  lines.push(`Ghost rate: ${profile.overallGhostRate}%`);
  if (profile.avgDaysToResponse) {
    lines.push(`Avg days to response: ${profile.avgDaysToResponse}`);
  }

  lines.push(`\n=== WHAT THEY'RE TARGETING ===`);

  if (profile.inferred.targetSeniorities.length > 0) {
    lines.push(`Seniority levels applied to:`);
    profile.inferred.targetSeniorities.slice(0, 5).forEach(s => {
      lines.push(`  - ${s.level}: ${s.count} apps (${s.percentage}%)`);
    });
  }

  if (profile.inferred.targetCompanySizes.length > 0) {
    lines.push(`Company sizes targeted:`);
    profile.inferred.targetCompanySizes.slice(0, 5).forEach(s => {
      lines.push(`  - ${s.size}: ${s.count} apps (${s.percentage}%)`);
    });
  }

  if (profile.inferred.preferredSources.length > 0) {
    lines.push(`Application sources:`);
    profile.inferred.preferredSources.slice(0, 5).forEach(s => {
      lines.push(`  - ${s.source}: ${s.count} apps (${s.percentage}%)`);
    });
  }

  lines.push(`\n=== SUCCESS RATES BY DIMENSION ===`);

  if (profile.inferred.successBySeniority.length > 0) {
    lines.push(`By seniority:`);
    profile.inferred.successBySeniority.forEach(s => {
      lines.push(`  - ${s.level}: ${s.rate}% success (${s.succeeded}/${s.applied})`);
    });
  }

  if (profile.inferred.successByCompanySize.length > 0) {
    lines.push(`By company size:`);
    profile.inferred.successByCompanySize.forEach(s => {
      lines.push(`  - ${s.size}: ${s.rate}% success (${s.succeeded}/${s.applied})`);
    });
  }

  if (profile.inferred.successBySource.length > 0) {
    lines.push(`By source:`);
    profile.inferred.successBySource.forEach(s => {
      lines.push(`  - ${s.source}: ${s.rate}% success (${s.succeeded}/${s.applied})`);
    });
  }

  if (profile.inferred.mismatches.length > 0) {
    lines.push(`\n=== DETECTED MISMATCHES ===`);
    profile.inferred.mismatches.forEach(m => {
      lines.push(`[${m.type}] ${m.description}`);
    });
  }

  return lines.join('\n');
}
