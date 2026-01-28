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

export interface ChatRequest {
  message: string;
  agent?: string;
  conversationId?: string;
  context?: {
    cvText?: string;
    jobDescription?: string;
    targetRole?: string;
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

    if (!response.ok) {
      throw new Error(`Chat failed: ${response.statusText}`);
    }

    const data = await response.json();
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
