import { z } from 'zod';

/**
 * Bias Signal Types
 * Based on UK Equality Act 2010 protected characteristics + additional patterns
 */
export const BiasSignalTypeSchema = z.enum([
  'age_related',
  'gender_related',
  'race_ethnicity_related',
  'disability_related',
  'pregnancy_maternity_related',
  'religion_belief_related',
  'sexual_orientation_related',
  'marital_status_related',
  'socioeconomic_related',
  'educational_institution_bias',
  'name_based',
  'appearance_related',
  'none_detected'
]);

export type BiasSignalType = z.infer<typeof BiasSignalTypeSchema>;

/**
 * UK Equality Act 2010 Protected Characteristics
 * https://www.legislation.gov.uk/ukpga/2010/15/section/4
 */
export const UK_PROTECTED_CHARACTERISTICS = [
  'age',
  'disability',
  'gender_reassignment',
  'marriage_civil_partnership',
  'pregnancy_maternity',
  'race',
  'religion_belief',
  'sex',
  'sexual_orientation'
] as const;

export type UKProtectedCharacteristic = typeof UK_PROTECTED_CHARACTERISTICS[number];

/**
 * Individual bias signal detected in a rejection email
 */
export const BiasSignalSchema = z.object({
  signal_type: BiasSignalTypeSchema,
  indicator_phrase: z.string().describe('The specific phrase that triggered detection'),
  confidence: z.number().min(0).max(1).describe('Confidence in this being a bias signal (0-1)'),
  explanation: z.string().describe('Why this might indicate bias'),
  uk_equality_act_category: z.string().nullable().describe('Mapped protected characteristic if applicable'),
});

export type BiasSignal = z.infer<typeof BiasSignalSchema>;

/**
 * UK Equality Act relevance assessment
 */
export const EqualityActRelevanceSchema = z.object({
  potentially_relevant: z.boolean(),
  protected_characteristics: z.array(z.string()),
  recommended_next_steps: z.array(z.string()),
});

export type EqualityActRelevance = z.infer<typeof EqualityActRelevanceSchema>;

/**
 * Overall risk level for bias detection
 */
export const BiasRiskLevelSchema = z.enum([
  'low',
  'moderate',
  'high',
  'insufficient_data'
]);

export type BiasRiskLevel = z.infer<typeof BiasRiskLevelSchema>;

/**
 * Complete bias audit response
 */
export const BiasAuditResponseSchema = z.object({
  overall_risk: BiasRiskLevelSchema,
  confidence: z.number().min(0).max(1),
  signals: z.array(BiasSignalSchema),
  summary: z.string().describe('Plain English summary of findings'),
  suggested_actions: z.array(z.string()),
  disclaimer: z.string(),

  // UK-specific context
  equality_act_relevance: EqualityActRelevanceSchema.optional(),

  // Metadata
  analysis_version: z.string().default('1.0'),
});

export type BiasAuditResponse = z.infer<typeof BiasAuditResponseSchema>;

/**
 * Request schema for bias audit endpoint
 */
export const BiasAuditRequestSchema = z.object({
  emailText: z.string()
    .min(10, 'Email text must be at least 10 characters')
    .max(8000, 'Email text must be under 8,000 characters'),
  includeUKContext: z.boolean().default(true).describe('Include UK Equality Act analysis'),
  interviewStage: z.enum(['none', 'phone_screen', 'technical', 'onsite', 'final_round']).optional(),
});

export type BiasAuditRequest = z.infer<typeof BiasAuditRequestSchema>;

/**
 * Batch decode request schema
 */
export const BatchDecodeRequestSchema = z.object({
  rejections: z.array(z.object({
    emailText: z.string().min(10).max(8000),
    interviewStage: z.enum(['none', 'phone_screen', 'technical', 'onsite', 'final_round']).optional(),
  })).min(1).max(20),
});

export type BatchDecodeRequest = z.infer<typeof BatchDecodeRequestSchema>;

/**
 * Mapping of signal types to UK protected characteristics
 */
export const SIGNAL_TO_CHARACTERISTIC: Record<BiasSignalType, UKProtectedCharacteristic | null> = {
  'age_related': 'age',
  'gender_related': 'sex',
  'race_ethnicity_related': 'race',
  'disability_related': 'disability',
  'pregnancy_maternity_related': 'pregnancy_maternity',
  'religion_belief_related': 'religion_belief',
  'sexual_orientation_related': 'sexual_orientation',
  'marital_status_related': 'marriage_civil_partnership',
  'socioeconomic_related': null, // Not a protected characteristic but still concerning
  'educational_institution_bias': null, // Not protected but can correlate with socioeconomic
  'name_based': 'race', // Name-based bias often correlates with race/ethnicity
  'appearance_related': null, // May correlate with multiple characteristics
  'none_detected': null,
};

/**
 * Legal disclaimer that must always be included
 */
export const BIAS_DISCLAIMER = `This analysis is for informational purposes only and does not constitute legal advice. The tool analyzes language patterns and cannot definitively determine whether discrimination has occurred.

If you believe you have experienced unlawful discrimination, we recommend:
- Consulting with an employment solicitor
- Contacting ACAS (Advisory, Conciliation and Arbitration Service) on 0300 123 1100
- Visiting the Equality Advisory Support Service at equalityadvisoryservice.com

Time limits apply for employment tribunal claims (usually 3 months minus 1 day from the act complained of).`;
