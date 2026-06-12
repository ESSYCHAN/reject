import { ApiResponse, DecodeResponse, SubscribeResponse, InterviewStage } from '../types';

const API_BASE = '/api';

export async function decodeEmail(emailText: string, interviewStage?: InterviewStage): Promise<ApiResponse<DecodeResponse>> {
  try {
    const response = await fetch(`${API_BASE}/decode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ emailText, interviewStage })
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'Failed to decode email', details: data.details };
    }

    return { data: data.data };
  } catch (error) {
    return { error: 'Network error. Please check your connection.' };
  }
}

export async function subscribe(email: string, source?: string): Promise<ApiResponse<SubscribeResponse>> {
  try {
    const response = await fetch(`${API_BASE}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, source })
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'Failed to subscribe', details: data.details };
    }

    return { data: data.data };
  } catch (error) {
    return { error: 'Network error. Please check your connection.' };
  }
}

export interface ReportFeedbackInput {
  userId?: string;
  bottleneck?: string;
  confidence?: 'low' | 'medium' | 'high';
  helpful?: boolean;
  matchedExperience?: boolean;
  note?: string;
}

export async function sendReportFeedback(input: ReportFeedbackInput): Promise<ApiResponse<{ success: boolean }>> {
  try {
    const response = await fetch(`${API_BASE}/feedback/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'Failed to send feedback', details: data.details };
    }

    return { data: data.data };
  } catch (error) {
    return { error: 'Network error. Please check your connection.' };
  }
}
