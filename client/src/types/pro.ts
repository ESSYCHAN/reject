export type SeniorityLevel = 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'director' | 'vp' | 'c-level';
export type CompanySize = 'startup' | 'small' | 'mid' | 'large' | 'enterprise';
export type ApplicationSource = 'linkedin' | 'company_site' | 'referral' | 'recruiter' | 'job_board' | 'direct' | 'other';
// Pre-application statuses (wishlist/saved)
export type SavedStatus = 'saved' | 'researching' | 'preparing' | 'ready_to_apply';
// Post-application statuses
export type AppliedStatus = 'applied' | 'interviewing' | 'ghosted' | 'rejected_ats' | 'rejected_recruiter' | 'rejected_hm' | 'rejected_final' | 'offer';
// Combined outcome type
export type Outcome = SavedStatus | AppliedStatus;

export interface RejectionAnalysis {
  category: string;
  confidence: number;
  signals: string[];
  replyWorthIt: string;
  decodedAt: string;
  // New fields for more insightful analysis
  stageReached?: 'ats_filter' | 'recruiter_screen' | 'hiring_manager' | 'final_round' | 'unknown';
  likelyAtsFiltered?: boolean;
  strategicInsight?: string;
  nextActions?: string[];
  whatItMeans?: string;
}

// Fit analysis from JD Check (stored with saved jobs)
export interface FitAnalysis {
  fitScore: number; // 0-100
  verdict: 'strong_fit' | 'good_fit' | 'moderate_fit' | 'weak_fit' | 'poor_fit';
  highlights: string[];
  concerns: string[];
  recommendation: string;
  analyzedAt: string;
  jobUrl?: string;
}

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  seniorityLevel: SeniorityLevel;
  companySize: CompanySize;
  industry: string | null;
  source: ApplicationSource;
  dateApplied: string; // For saved jobs, this is the date saved
  dateSaved?: string; // When job was first saved (for wishlist)
  outcome: Outcome;
  daysToResponse: number | null;
  rejectionEmailId?: string;
  rejectionAnalysis?: RejectionAnalysis;
  fitAnalysis?: FitAnalysis; // From JD Check
  notes?: string; // User notes for research, prep, etc.
  jobUrl?: string; // Link to the job posting
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

export const SOURCE_OPTIONS: { value: ApplicationSource; label: string; hint: string }[] = [
  { value: 'linkedin', label: 'LinkedIn', hint: 'Used LinkedIn Easy Apply (stayed on LinkedIn)' },
  { value: 'company_site', label: 'Company Website', hint: 'Applied on the company\'s careers portal (even if you found the job on LinkedIn)' },
  { value: 'referral', label: 'Referral', hint: 'Someone at the company referred you' },
  { value: 'recruiter', label: 'Recruiter', hint: 'A recruiter reached out to you' },
  { value: 'job_board', label: 'Job Board', hint: 'Indeed, Glassdoor, or similar job boards' },
  { value: 'direct', label: 'Direct Outreach', hint: 'Cold emailed or DM\'d someone directly (bypassed formal application)' },
  { value: 'other', label: 'Other', hint: 'Any other application method' }
];

// Pre-application (saved/wishlist) statuses
export const SAVED_STATUS_OPTIONS: { value: SavedStatus; label: string }[] = [
  { value: 'saved', label: 'Saved' },
  { value: 'researching', label: 'Researching' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready_to_apply', label: 'Ready to Apply' }
];

// Post-application statuses
export const APPLIED_STATUS_OPTIONS: { value: AppliedStatus; label: string }[] = [
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'ghosted', label: 'Ghosted' },
  { value: 'rejected_ats', label: 'Rejected (ATS)' },
  { value: 'rejected_recruiter', label: 'Rejected (Recruiter)' },
  { value: 'rejected_hm', label: 'Rejected (Hiring Manager)' },
  { value: 'rejected_final', label: 'Rejected (Final Round)' },
  { value: 'offer', label: 'Offer' }
];

// All outcome options combined
export const OUTCOME_OPTIONS: { value: Outcome; label: string }[] = [
  ...SAVED_STATUS_OPTIONS,
  ...APPLIED_STATUS_OPTIONS
];

// Helper to check if status is pre-application
export const isSavedStatus = (status: Outcome): status is SavedStatus => {
  return ['saved', 'researching', 'preparing', 'ready_to_apply'].includes(status);
};

// Helper to check if status is post-application
export const isAppliedStatus = (status: Outcome): status is AppliedStatus => {
  return !isSavedStatus(status);
};
