import { z } from 'zod';

export type RejectionCategory = 'Template' | 'Soft No' | 'Hard No' | 'Door Open' | 'Polite Pass';
export type ReplyWorth = 'Low' | 'Medium' | 'High';
export type ApplicationStatus = 'pending' | 'rejected' | 'ghosted' | 'interviewing' | 'offer';
export type ATSStage = 'ats_filter' | 'recruiter_screen' | 'hiring_manager' | 'final_round' | 'unknown';
export type InterviewStage = 'none' | 'phone_screen' | 'technical' | 'onsite' | 'final_round';

// ATS Assessment - interpretation of where in the process filtering occurred
export interface ATSAssessment {
  likely_ats_filtered: boolean;
  confidence: number;
  reasoning: string;
  stage_reached: ATSStage;
  strategic_insight: string;
}

// Zod schema for validation
export const ATSAssessmentSchema = z.object({
  likely_ats_filtered: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  stage_reached: z.enum(['ats_filter', 'recruiter_screen', 'hiring_manager', 'final_round', 'unknown']),
  strategic_insight: z.string()
});

export const DecodeResponseSchema = z.object({
  category: z.enum(['Template', 'Soft No', 'Hard No', 'Door Open', 'Polite Pass']),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
  what_it_means: z.string(),
  keep_on_file_truth: z.string(),
  reply_worth_it: z.enum(['Low', 'Medium', 'High']),
  next_actions: z.array(z.string()),
  follow_up_template: z.string(),
  contradictions: z.array(z.string()).optional().default([]),
  ats_assessment: ATSAssessmentSchema.optional()
});

export interface DecodeResponse {
  category: RejectionCategory;
  confidence: number;
  signals: string[];
  what_it_means: string;
  silver_lining?: string;
  keep_on_file_truth: string;
  reply_worth_it: ReplyWorth;
  next_actions: string[];
  follow_up_template: string;
  contradictions?: string[];
  ats_assessment?: ATSAssessment;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  source: string;
  dateApplied: string;
  status: ApplicationStatus;
  outcomeDate?: string;
}

export interface TrackerStats {
  total: number;
  rejectionRate: number;
  ghostingRate: number;
  avgDaysToOutcome: number | null;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  details?: string;
}

export interface SubscribeResponse {
  success: boolean;
  message: string;
}

export const InterviewStageSchema = z.enum(['none', 'phone_screen', 'technical', 'onsite', 'final_round']);

export const DecodeRequestSchema = z.object({
  emailText: z.string().min(10, 'Email text must be at least 10 characters').max(10000, 'Email text too long'),
  interviewStage: InterviewStageSchema.optional()
});

export const SubscribeRequestSchema = z.object({
  email: z.string().email('Invalid email address')
});

export const STORAGE_KEY = 'reject_applications';
export const STORAGE_VERSION = 1;

export interface StoredData {
  version: number;
  applications: Application[];
}
