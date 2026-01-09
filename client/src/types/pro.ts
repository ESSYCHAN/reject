export type SeniorityLevel = 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'director' | 'vp' | 'c-level';
export type CompanySize = 'startup' | 'small' | 'mid' | 'large' | 'enterprise';
export type ApplicationSource = 'linkedin' | 'company_site' | 'referral' | 'recruiter' | 'job_board' | 'direct' | 'other';
export type Outcome = 'pending' | 'ghosted' | 'rejected_ats' | 'rejected_recruiter' | 'rejected_hm' | 'rejected_final' | 'offer';

export interface RejectionAnalysis {
  category: string;
  confidence: number;
  signals: string[];
  replyWorthIt: string;
  decodedAt: string;
}

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  seniorityLevel: SeniorityLevel;
  companySize: CompanySize;
  industry: string;
  source: ApplicationSource;
  dateApplied: string;
  outcome: Outcome;
  daysToResponse: number | null;
  rejectionEmailId?: string;
  rejectionAnalysis?: RejectionAnalysis;
}

export interface UserProfile {
  yearsExperience: number;
  currentSeniority: SeniorityLevel;
  skillCategories: string[];
  targetIndustries: string[];
  preferredCompanySize: CompanySize[];
}

export interface PatternInsight {
  insight_type: string;
  confidence_score: number;
  explanation: string;
  supporting_data: Record<string, number | string>;
  recommended_action: string;
}

export interface RoleFitResult {
  verdict: 'apply' | 'dont_apply' | 'low_odds' | 'high_odds';
  confidence_score: number;
  explanation: string;
  signals: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
  historical_match: {
    similar_roles_applied: number;
    success_rate: number;
  };
  recommended_action: string;
}

export interface FollowUpDecision {
  should_reply: boolean;
  confidence_score: number;
  explanation: string;
  template: string | null;
  optimal_timing: string | null;
}

export interface StrategicGuidance {
  insight_type: string;
  confidence_score: number;
  explanation: string;
  evidence: string[];
  recommended_action: string;
}

export const SENIORITY_OPTIONS: { value: SeniorityLevel; label: string }[] = [
  { value: 'intern', label: 'Intern' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-Level' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' },
  { value: 'principal', label: 'Principal' },
  { value: 'director', label: 'Director' },
  { value: 'vp', label: 'VP' },
  { value: 'c-level', label: 'C-Level' }
];

export const COMPANY_SIZE_OPTIONS: { value: CompanySize; label: string }[] = [
  { value: 'startup', label: 'Startup (1-50)' },
  { value: 'small', label: 'Small (51-200)' },
  { value: 'mid', label: 'Mid-size (201-1000)' },
  { value: 'large', label: 'Large (1001-5000)' },
  { value: 'enterprise', label: 'Enterprise (5000+)' }
];

export const SOURCE_OPTIONS: { value: ApplicationSource; label: string }[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'company_site', label: 'Company Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'job_board', label: 'Job Board' },
  { value: 'direct', label: 'Direct Application' },
  { value: 'other', label: 'Other' }
];

export const OUTCOME_OPTIONS: { value: Outcome; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'ghosted', label: 'Ghosted' },
  { value: 'rejected_ats', label: 'Rejected (ATS)' },
  { value: 'rejected_recruiter', label: 'Rejected (Recruiter)' },
  { value: 'rejected_hm', label: 'Rejected (Hiring Manager)' },
  { value: 'rejected_final', label: 'Rejected (Final Round)' },
  { value: 'offer', label: 'Offer' }
];
