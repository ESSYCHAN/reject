/**
 * Agent Service - Connects React frontend to ADK agents
 */

const AGENTS_API_URL = import.meta.env.VITE_AGENTS_API_URL || 'http://localhost:8080';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  timestamp: Date;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const AGENTS: AgentInfo[] = [
  {
    id: 'career_coach',
    name: 'Career Coach',
    description: 'Your AI career coach - routes to specialists',
    icon: '🎯'
  },
  {
    id: 'cv_builder',
    name: 'CV Tailor',
    description: 'Customize your CV for specific jobs',
    icon: '✂️'
  },
  {
    id: 'resume_coach',
    name: 'Resume Coach',
    description: 'Improve your existing CV',
    icon: '📋'
  },
  {
    id: 'career_agent',
    name: 'Find Jobs',
    description: 'Search jobs matching your profile',
    icon: '🔍'
  },
  {
    id: 'job_advisor',
    name: 'Job Advisor',
    description: 'Analyze job descriptions',
    icon: '💼'
  },
  {
    id: 'interview_coach',
    name: 'Interview Coach',
    description: 'Practice interviews',
    icon: '🎤'
  },
  {
    id: 'rejection_decoder',
    name: 'Rejection Decoder',
    description: 'Understand rejections',
    icon: '🔓'
  }
];

// User context from the backend for personalized agent responses
export interface UserAgentContext {
  userProfile: {
    inferredSeniority: string | null;
    topIndustries: string[];
    preferredCompanySizes: string[];
    topRoles: string[];
    applicationCount: number;
  };
  successMetrics: {
    totalApplications: number;
    offers: number;
    interviewing: number;
    ghosted: number;
    rejected: number;
    pending: number;
    offerRate: string;
    interviewRate: string;
    ghostRate: string;
  };
  rejectionPatterns: {
    total: number;
    byStage: {
      ats: number;
      recruiter: number;
      hiringManager: number;
      finalRound: number;
    };
    byCategory: Record<string, number>;
    avgDaysToResponse: number;
  };
  topCompanies: Array<{
    company: string;
    applications: number;
    rejections: number;
    lastOutcome: string | null;
    mostCommonStage: string | null;
    // Community intelligence from other REJECT users
    communityInsights: {
      totalCommunityApps: number;
      communityGhostRate: string;
      avgResponseDays: number;
      topSignals: string[];
    } | null;
  }>;
  recentActivity: {
    applicationsLast30Days: number;
    rejectionsLast30Days: number;
    responsesLast30Days: number;
  };
  recentApplications: Array<{
    company: string;
    role: string;
    outcome: string;
    dateApplied: string | null;
    rejectionCategory: string | null;
    fitScore: number | null;
  }>;
}

export interface ChatRequest {
  message: string;
  agent?: string;
  conversationId?: string;
  context?: {
    cvText?: string;
    jobDescription?: string;
    targetRole?: string;
    // Enhanced context from user data
    userContext?: UserAgentContext;
  };
}

export interface ChatResponse {
  response: string;
  agent_used: string;
  conversation_id: string;
}

export interface CVAnalysis {
  overall_score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  ats_score: number;
  missing_keywords: string[];
}

export interface JobSearchResult {
  title: string;
  company: string;
  location: string;
  salary_min?: number;
  salary_max?: number;
  remote?: boolean;
  description: string;
  url: string;
  fit_score?: number;
}

export interface JobAnalysis {
  fit_score: number;
  verdict: string;
  red_flags: string[];
  green_flags: string[];
  recommendation: string;
  what_to_expect: string;
}

class AgentService {
  private baseUrl: string;
  private conversationId: string | null = null;

  constructor() {
    this.baseUrl = AGENTS_API_URL;
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 90000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out. The AI is taking longer than usual - please try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Chat with an agent
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    console.log('[agentService] chat() called, baseUrl:', this.baseUrl);
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: request.message,
          agent: request.agent || 'career_coach',
          conversation_id: request.conversationId || this.conversationId,
          context: request.context,
        }),
      },
      120000 // 2 minute timeout for AI responses
    );
    console.log('[agentService] fetch response status:', response.status);

    if (!response.ok) {
      let errorMessage = `Chat failed: ${response.status} ${response.statusText}`.trim();
      const errorText = await response.text();
      if (errorText) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData?.detail && typeof errorData.detail === 'string') {
            errorMessage = errorData.detail;
          } else {
            errorMessage = errorText;
          }
        } catch {
          errorMessage = errorText;
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[agentService] parsed data:', data);
    this.conversationId = data.conversation_id;
    return data;
  }

  /**
   * Analyze a CV
   */
  async analyzeCV(cvText: string, targetRole?: string, jobDescription?: string): Promise<CVAnalysis> {
    const response = await fetch(`${this.baseUrl}/analyze/cv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cv_text: cvText,
        target_role: targetRole,
        job_description: jobDescription,
      }),
    });

    if (!response.ok) {
      throw new Error(`CV analysis failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.analysis;
  }

  /**
   * Search for jobs
   */
  async searchJobs(
    keywords: string,
    location: string,
    options?: {
      salaryMin?: number;
      remoteOnly?: boolean;
      cvText?: string;
    }
  ): Promise<JobSearchResult[]> {
    const response = await fetch(`${this.baseUrl}/search/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywords,
        location,
        salary_min: options?.salaryMin,
        remote_only: options?.remoteOnly || false,
        cv_text: options?.cvText,
      }),
    });

    if (!response.ok) {
      throw new Error(`Job search failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.jobs;
  }

  /**
   * Analyze a job description
   */
  async analyzeJob(jobDescription: string, cvText?: string): Promise<JobAnalysis> {
    const response = await fetch(`${this.baseUrl}/analyze/job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_description: jobDescription,
        cv_text: cvText,
      }),
    });

    if (!response.ok) {
      throw new Error(`Job analysis failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.analysis;
  }

  /**
   * Decode a rejection email
   */
  async decodeRejection(
    rejectionText: string,
    options?: {
      jobTitle?: string;
      company?: string;
      context?: string;
    }
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}/decode/rejection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rejection_text: rejectionText,
        job_title: options?.jobTitle,
        company: options?.company,
        context: options?.context,
      }),
    });

    if (!response.ok) {
      throw new Error(`Rejection decode failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.analysis;
  }

  /**
   * Get interview preparation
   */
  async prepareInterview(
    jobTitle: string,
    options?: {
      company?: string;
      interviewType?: 'phone_screen' | 'behavioral' | 'technical' | 'final_round';
      cvText?: string;
    }
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}/prepare/interview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_title: jobTitle,
        company: options?.company,
        interview_type: options?.interviewType || 'behavioral',
        cv_text: options?.cvText,
      }),
    });

    if (!response.ok) {
      throw new Error(`Interview prep failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.preparation;
  }

  /**
   * Upload and parse a CV file
   */
  async uploadCV(file: File): Promise<{ text: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);

    let response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/upload/cv`,
        {
          method: 'POST',
          body: formData,
        },
        60000 // 1 minute timeout for file upload
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        throw error;
      }
      throw new Error(`Network error - is the agents server running at ${this.baseUrl}?`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Upload failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Export CV as PDF
   */
  async exportCV(sections: {
    name?: string;
    contact?: string;
    summary?: string;
    experience?: string[];
    education?: string[];
    skills?: string[];
  }): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/export/cv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sections }),
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    return response.blob();
  }

  /**
   * Reset conversation
   */
  resetConversation(): void {
    this.conversationId = null;
  }

  /**
   * Get current conversation ID
   */
  getConversationId(): string | null {
    return this.conversationId;
  }
}

// Export singleton instance
export const agentService = new AgentService();

// API URL for main backend (not agents)
const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Fetch user context from the main backend for personalized agent responses
 * This includes application history, rejection patterns, success metrics
 */
export async function fetchUserAgentContext(token: string): Promise<UserAgentContext | null> {
  try {
    const response = await fetch(`${API_URL}/api/agents/context`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('[agentService] Failed to fetch user context:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('[agentService] Error fetching user context:', error);
    return null;
  }
}

/**
 * Compute UserAgentContext from local ApplicationRecord[] data
 * This ensures consistency between tracker display and agent context
 */
export function computeUserAgentContext(applications: Array<{
  id: string;
  company: string;
  role: string;
  seniorityLevel: string;
  companySize: string;
  industry: string | null;
  source: string;
  dateApplied: string;
  outcome: string;
  daysToResponse: number | null;
  rejectionAnalysis?: {
    category: string;
    stageReached?: string;
  };
  fitAnalysis?: {
    fitScore: number;
  };
}>): UserAgentContext | null {
  if (!applications || applications.length === 0) {
    return null;
  }

  // Filter to only applied applications (exclude saved/wishlist)
  const savedStatuses = ['saved', 'researching', 'preparing', 'ready_to_apply'];
  const appliedApps = applications.filter(app => !savedStatuses.includes(app.outcome));

  if (appliedApps.length === 0) {
    return null;
  }

  // Count outcomes
  const offers = appliedApps.filter(a => a.outcome === 'offer').length;
  const interviewing = appliedApps.filter(a => a.outcome === 'interviewing').length;
  const ghosted = appliedApps.filter(a => a.outcome === 'ghosted').length;
  const rejected = appliedApps.filter(a => a.outcome.startsWith('rejected_')).length;
  const pending = appliedApps.filter(a => a.outcome === 'applied').length;

  // Rejection breakdown by stage
  const atsRejections = appliedApps.filter(a => a.outcome === 'rejected_ats').length;
  const recruiterRejections = appliedApps.filter(a => a.outcome === 'rejected_recruiter').length;
  const hmRejections = appliedApps.filter(a => a.outcome === 'rejected_hm').length;
  const finalRejections = appliedApps.filter(a => a.outcome === 'rejected_final').length;

  // Calculate rates
  const total = appliedApps.length;
  const offerRate = total > 0 ? ((offers / total) * 100).toFixed(1) + '%' : '0%';
  const interviewRate = total > 0 ? (((offers + interviewing) / total) * 100).toFixed(1) + '%' : '0%';
  const ghostRate = total > 0 ? ((ghosted / total) * 100).toFixed(1) + '%' : '0%';

  // Rejection categories from rejection analysis
  const byCategory: Record<string, number> = {};
  appliedApps.forEach(app => {
    if (app.rejectionAnalysis?.category) {
      const cat = app.rejectionAnalysis.category;
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }
  });

  // Average days to response
  const responseDays = appliedApps
    .filter(a => a.daysToResponse !== null && a.daysToResponse !== undefined)
    .map(a => a.daysToResponse as number);
  const avgDaysToResponse = responseDays.length > 0
    ? Math.round(responseDays.reduce((a, b) => a + b, 0) / responseDays.length)
    : 0;

  // Infer seniority from most common
  const seniorityCounts: Record<string, number> = {};
  appliedApps.forEach(app => {
    const s = app.seniorityLevel || 'unknown';
    seniorityCounts[s] = (seniorityCounts[s] || 0) + 1;
  });
  const inferredSeniority = Object.entries(seniorityCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Top industries
  const industryCounts: Record<string, number> = {};
  appliedApps.forEach(app => {
    if (app.industry) {
      industryCounts[app.industry] = (industryCounts[app.industry] || 0) + 1;
    }
  });
  const topIndustries = Object.entries(industryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ind]) => ind);

  // Preferred company sizes
  const sizeCounts: Record<string, number> = {};
  appliedApps.forEach(app => {
    const s = app.companySize || 'unknown';
    sizeCounts[s] = (sizeCounts[s] || 0) + 1;
  });
  const preferredCompanySizes = Object.entries(sizeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([size]) => size);

  // Top roles
  const roleCounts: Record<string, number> = {};
  appliedApps.forEach(app => {
    const r = app.role || 'Unknown Role';
    roleCounts[r] = (roleCounts[r] || 0) + 1;
  });
  const topRoles = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([role]) => role);

  // Top companies by application count
  const companyStats: Record<string, { applications: number; rejections: number; lastOutcome: string | null }> = {};
  appliedApps.forEach(app => {
    const c = app.company;
    if (!companyStats[c]) {
      companyStats[c] = { applications: 0, rejections: 0, lastOutcome: null };
    }
    companyStats[c].applications++;
    if (app.outcome.startsWith('rejected_')) {
      companyStats[c].rejections++;
    }
    companyStats[c].lastOutcome = app.outcome;
  });
  const topCompanies = Object.entries(companyStats)
    .sort((a, b) => b[1].applications - a[1].applications)
    .slice(0, 10)
    .map(([company, stats]) => ({
      company,
      applications: stats.applications,
      rejections: stats.rejections,
      lastOutcome: stats.lastOutcome,
      mostCommonStage: null,
      communityInsights: null
    }));

  // Recent activity (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentApps = appliedApps.filter(app => {
    const appDate = new Date(app.dateApplied);
    return appDate >= thirtyDaysAgo;
  });
  const applicationsLast30Days = recentApps.length;
  const rejectionsLast30Days = recentApps.filter(a => a.outcome.startsWith('rejected_')).length;
  const responsesLast30Days = recentApps.filter(a => !['applied', 'ghosted'].includes(a.outcome)).length;

  // Recent applications (last 10)
  const recentApplications = appliedApps
    .sort((a, b) => new Date(b.dateApplied).getTime() - new Date(a.dateApplied).getTime())
    .slice(0, 10)
    .map(app => ({
      company: app.company,
      role: app.role,
      outcome: app.outcome,
      dateApplied: app.dateApplied,
      rejectionCategory: app.rejectionAnalysis?.category || null,
      fitScore: app.fitAnalysis?.fitScore || null
    }));

  return {
    userProfile: {
      inferredSeniority,
      topIndustries,
      preferredCompanySizes,
      topRoles,
      applicationCount: appliedApps.length
    },
    successMetrics: {
      totalApplications: total,
      offers,
      interviewing,
      ghosted,
      rejected,
      pending,
      offerRate,
      interviewRate,
      ghostRate
    },
    rejectionPatterns: {
      total: rejected,
      byStage: {
        ats: atsRejections,
        recruiter: recruiterRejections,
        hiringManager: hmRejections,
        finalRound: finalRejections
      },
      byCategory,
      avgDaysToResponse
    },
    topCompanies,
    recentActivity: {
      applicationsLast30Days,
      rejectionsLast30Days,
      responsesLast30Days
    },
    recentApplications
  };
}
