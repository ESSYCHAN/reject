import { z } from 'zod';

export const RejectionCategorySchema = z.enum([
  'Template',
  'Soft No',
  'Hard No',
  'Door Open',
  'Polite Pass'
]);

export const ReplyWorthSchema = z.enum(['Low', 'Medium', 'High']);

// ATS Impact assessment
export const ATSAssessmentSchema = z.object({
  likely_ats_filtered: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  stage_reached: z.enum(['ats_filter', 'recruiter_screen', 'hiring_manager', 'final_round', 'unknown']),
  strategic_insight: z.string()
});

export type ATSAssessment = z.infer<typeof ATSAssessmentSchema>;

export const DecodeResponseSchema = z.object({
  category: RejectionCategorySchema,
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
  what_it_means: z.string(),
  silver_lining: z.string().optional(),
  keep_on_file_truth: z.string(),
  reply_worth_it: ReplyWorthSchema,
  next_actions: z.array(z.string()),
  follow_up_template: z.string(),
  contradictions: z.array(z.string()).optional(),
  ats_assessment: ATSAssessmentSchema.optional()
});

export type RejectionCategory = z.infer<typeof RejectionCategorySchema>;
export type ReplyWorth = z.infer<typeof ReplyWorthSchema>;
export type DecodeResponse = z.infer<typeof DecodeResponseSchema>;

export const InterviewStageSchema = z.enum(['none', 'phone_screen', 'technical', 'onsite', 'final_round']);
export type InterviewStage = z.infer<typeof InterviewStageSchema>;

export const DecodeRequestSchema = z.object({
  emailText: z.string()
    .min(10, 'Email text must be at least 10 characters')
    .max(8000, 'Email text must be under 8,000 characters')
    .transform(text => text.trim()),
  interviewStage: InterviewStageSchema.optional()
});

export type DecodeRequest = z.infer<typeof DecodeRequestSchema>;

export const SubscribeRequestSchema = z.object({
  email: z.string().email('Invalid email address')
});

export type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>;

export interface ApiError {
  error: string;
  details?: string;
}

export interface ApiSuccess<T> {
  data: T;
}
