/**
 * Client-side Bias Analysis Types
 * Matches server-side schemas
 */

export type BiasSignalType =
  | 'age_related'
  | 'gender_related'
  | 'race_ethnicity_related'
  | 'disability_related'
  | 'pregnancy_maternity_related'
  | 'religion_belief_related'
  | 'sexual_orientation_related'
  | 'marital_status_related'
  | 'socioeconomic_related'
  | 'educational_institution_bias'
  | 'name_based'
  | 'appearance_related'
  | 'none_detected';

export type BiasRiskLevel = 'low' | 'moderate' | 'high' | 'insufficient_data';

export interface BiasSignal {
  signal_type: BiasSignalType;
  indicator_phrase: string;
  confidence: number;
  explanation: string;
  uk_equality_act_category: string | null;
}

export interface EqualityActRelevance {
  potentially_relevant: boolean;
  protected_characteristics: string[];
  recommended_next_steps: string[];
}

export interface BiasAuditResponse {
  overall_risk: BiasRiskLevel;
  confidence: number;
  signals: BiasSignal[];
  summary: string;
  suggested_actions: string[];
  disclaimer: string;
  equality_act_relevance?: EqualityActRelevance;
  analysis_version: string;
}

// Human-readable labels
export const SIGNAL_TYPE_LABELS: Record<BiasSignalType, string> = {
  'age_related': 'Age-Related',
  'gender_related': 'Gender-Related',
  'race_ethnicity_related': 'Race/Ethnicity',
  'disability_related': 'Disability-Related',
  'pregnancy_maternity_related': 'Pregnancy/Maternity',
  'religion_belief_related': 'Religion/Belief',
  'sexual_orientation_related': 'Sexual Orientation',
  'marital_status_related': 'Marital Status',
  'socioeconomic_related': 'Socioeconomic',
  'educational_institution_bias': 'Educational Institution',
  'name_based': 'Name-Based',
  'appearance_related': 'Appearance-Related',
  'none_detected': 'None Detected',
};

export const RISK_LEVEL_LABELS: Record<BiasRiskLevel, string> = {
  'low': 'Low Risk',
  'moderate': 'Moderate Risk',
  'high': 'High Risk',
  'insufficient_data': 'Insufficient Data',
};

export const RISK_LEVEL_COLORS: Record<BiasRiskLevel, string> = {
  'low': '#22c55e',      // green
  'moderate': '#f59e0b', // amber
  'high': '#ef4444',     // red
  'insufficient_data': '#6b7280', // gray
};
