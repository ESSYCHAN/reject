import { z } from 'zod';

// Application Record Schema
export const SeniorityLevelSchema = z.enum([
  'intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'director', 'vp', 'c-level'
]);

export const CompanySizeSchema = z.enum([
  'startup', 'small', 'mid', 'large', 'enterprise'
]);

export const ApplicationSourceSchema = z.enum([
  'linkedin', 'company_site', 'referral', 'recruiter', 'job_board', 'direct', 'other'
]);

export const OutcomeSchema = z.enum([
  'pending', 'ghosted', 'rejected_ats', 'rejected_recruiter', 'rejected_hm', 'rejected_final', 'offer'
]);

export const ApplicationRecordSchema = z.object({
  id: z.string(),
  company: z.string(),
  role: z.string(),
  seniorityLevel: SeniorityLevelSchema.nullable().optional().transform(v => v ?? 'mid'),
  companySize: CompanySizeSchema.nullable().optional().transform(v => v ?? 'mid'),
  industry: z.string().nullable().optional().transform(v => v ?? ''),
  source: ApplicationSourceSchema.nullable().optional().transform(v => v ?? 'other'),
  dateApplied: z.string().nullable().optional().transform(v => v ?? new Date().toISOString().split('T')[0]),
  outcome: OutcomeSchema.nullable().optional().transform(v => v ?? 'pending'),
  daysToResponse: z.number().nullable().optional().transform(v => v ?? null),
  rejectionEmailId: z.string().optional()
});

export type ApplicationRecord = z.infer<typeof ApplicationRecordSchema>;
export type SeniorityLevel = z.infer<typeof SeniorityLevelSchema>;
export type CompanySize = z.infer<typeof CompanySizeSchema>;
export type ApplicationSource = z.infer<typeof ApplicationSourceSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;

// User Profile Schema
export const UserProfileSchema = z.object({
  yearsExperience: z.number().min(0).max(50),
  currentSeniority: SeniorityLevelSchema,
  skillCategories: z.array(z.string()),
  targetIndustries: z.array(z.string()),
  preferredCompanySize: z.array(CompanySizeSchema)
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

// Pattern Insight Schema
export const InsightTypeSchema = z.enum([
  'failure_stage',
  'rejection_pattern',
  'ghost_ratio',
  'role_underperformance',
  'source_effectiveness',
  'seniority_mismatch',
  'company_size_fit'
]);

export const PatternInsightSchema = z.object({
  insight_type: InsightTypeSchema,
  confidence_score: z.number().min(0).max(1),
  explanation: z.string(),
  supporting_data: z.record(z.union([z.number(), z.string()])),
  recommended_action: z.string()
});

export type PatternInsight = z.infer<typeof PatternInsightSchema>;

// Role Fit Result Schema
export const VerdictSchema = z.enum(['apply', 'dont_apply', 'low_odds', 'high_odds']);

export const RoleFitResultSchema = z.object({
  verdict: VerdictSchema,
  confidence_score: z.number().min(0).max(1),
  explanation: z.string(),
  signals: z.object({
    positive: z.array(z.string()),
    negative: z.array(z.string()),
    neutral: z.array(z.string())
  }),
  historical_match: z.object({
    similar_roles_applied: z.number(),
    success_rate: z.number()
  }),
  recommended_action: z.string()
});

export type RoleFitResult = z.infer<typeof RoleFitResultSchema>;

// Company Insight Schema
export const ComparisonSchema = z.enum(['better', 'average', 'worse']);

export const CompanyInsightSchema = z.object({
  company: z.string(),
  ghost_rate: z.number().min(0).max(1),
  avg_response_days: z.number(),
  keep_on_file_conversion: z.number().min(0).max(1),
  comparison_to_market: ComparisonSchema,
  sample_size: z.number(),
  confidence_score: z.number().min(0).max(1),
  explanation: z.string()
});

export type CompanyInsight = z.infer<typeof CompanyInsightSchema>;

// Follow-up Decision Schema
export const FollowUpDecisionSchema = z.object({
  should_reply: z.boolean(),
  confidence_score: z.number().min(0).max(1),
  explanation: z.string(),
  template: z.string().nullable(),
  optimal_timing: z.string().nullable()
});

export type FollowUpDecision = z.infer<typeof FollowUpDecisionSchema>;

// Strategic Guidance Schema
export const StrategyTypeSchema = z.enum([
  'seniority_calibration',
  'source_optimization',
  'company_size_fit',
  'timing_pattern',
  'industry_alignment'
]);

export const StrategicGuidanceSchema = z.object({
  insight_type: StrategyTypeSchema,
  confidence_score: z.number().min(0).max(1),
  explanation: z.string(),
  evidence: z.array(z.string()),
  recommended_action: z.string()
});

export type StrategicGuidance = z.infer<typeof StrategicGuidanceSchema>;

// API Request Schemas
export const PatternAnalysisRequestSchema = z.object({
  applications: z.array(ApplicationRecordSchema),
  rejectionCategories: z.array(z.object({
    category: z.string(),
    signals: z.array(z.string())
  })).optional()
});

export const RoleFitRequestSchema = z.object({
  roleDescription: z.string().min(50).max(5000),
  company: z.string(),
  companySize: CompanySizeSchema.optional(),
  userProfile: UserProfileSchema,
  applicationHistory: z.array(ApplicationRecordSchema)
});

export const FollowUpRequestSchema = z.object({
  rejectionCategory: z.string(),
  rejectionSignals: z.array(z.string()),
  replyWorthIt: z.enum(['Low', 'Medium', 'High']),
  application: ApplicationRecordSchema,
  previousFollowUps: z.number().default(0)
});

export const StrategyRequestSchema = z.object({
  userProfile: UserProfileSchema,
  applications: z.array(ApplicationRecordSchema)
});

// Response wrapper
export const PatternAnalysisResponseSchema = z.object({
  insights: z.array(PatternInsightSchema)
});

export const StrategyResponseSchema = z.object({
  guidance: z.array(StrategicGuidanceSchema)
});
