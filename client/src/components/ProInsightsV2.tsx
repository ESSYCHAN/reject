import { useState, useEffect } from 'react';
import { ApplicationRecord, SeniorityLevel, SENIORITY_OPTIONS } from '../types/pro';
import { canUseFeature, incrementUsage } from '../utils/usage';
import { UpgradePrompt, LimitWarning } from './UpgradePrompt';
import './ProInsightsV2.css';

// Types for the unified analysis
interface UnifiedInsight {
  insight_type: string;
  title: string;
  explanation: string;
  evidence: string[];
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  confidence: number;
}

interface UnifiedAnalysisResponse {
  summary: string;
  insights: UnifiedInsight[];
  quick_wins: string[];
  biggest_issue: string | null;
}

interface FullProfile {
  yearsExperience: number;
  currentSeniority: SeniorityLevel;
  totalApplications: number;
  overallSuccessRate: number;
  overallGhostRate: number;
  avgDaysToResponse: number | null;
  inferred: {
    mismatches: { type: string; description: string; recommendation: string; confidence: number }[];
  };
}

interface AnalysisResult {
  profile: FullProfile;
  analysis: UnifiedAnalysisResponse;
}

// Minimal profile storage
const PROFILE_KEY = 'reject_minimal_profile';

interface MinimalProfile {
  yearsExperience: number;
  currentSeniority: SeniorityLevel;
}

function loadMinimalProfile(): MinimalProfile {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { yearsExperience: 3, currentSeniority: 'mid' };
}

function saveMinimalProfile(profile: MinimalProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// API call
async function fetchAnalysis(
  profile: MinimalProfile,
  applications: ApplicationRecord[]
): Promise<AnalysisResult> {
  const response = await fetch('/api/pro/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, applications })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Analysis failed');
  }

  const data = await response.json();
  return data.data;
}

// Experience options
const EXPERIENCE_OPTIONS = [
  { value: 0, label: '< 1 year' },
  { value: 1, label: '1-2 years' },
  { value: 3, label: '3-5 years' },
  { value: 6, label: '6-10 years' },
  { value: 11, label: '10+ years' }
];

interface ProInsightsV2Props {
  applications: ApplicationRecord[];
}

export function ProInsightsV2({ applications }: ProInsightsV2Props) {
  const [profile, setProfile] = useState<MinimalProfile>(loadMinimalProfile);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Save profile when it changes
  useEffect(() => {
    saveMinimalProfile(profile);
  }, [profile]);

  // Auto-analyze when we have enough applications
  const canAnalyze = applications.length >= 3;

  const handleAnalyze = async () => {
    if (!canAnalyze) return;

    // Check usage limits
    const { allowed } = canUseFeature('insights_runs');
    if (!allowed) {
      setShowUpgrade(true);
      return;
    }

    setLoading(true);
    setError(null);
    setShowUpgrade(false);

    try {
      const data = await fetchAnalysis(profile, applications);
      setResult(data);
      setHasAnalyzed(true);
      // Increment usage on success
      incrementUsage('insights_runs');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return '';
    }
  };

  const getVerdictIcon = (priority: string) => {
    switch (priority) {
      case 'high': return '';
      case 'medium': return '';
      case 'low': return '';
      default: return '';
    }
  };

  // Show upgrade prompt if limit reached
  if (showUpgrade) {
    return (
      <div className="pro-insights-v2">
        <UpgradePrompt action="insights_runs" onClose={() => setShowUpgrade(false)} />
      </div>
    );
  }

  return (
    <div className="pro-insights-v2">
      <LimitWarning action="insights_runs" />
      {/* Minimal Profile Section */}
      <div className="profile-section">
        <h3>Your Profile</h3>
        <p className="section-hint">Just 2 fields - we'll infer the rest from your applications.</p>

        <div className="profile-fields">
          <div className="field">
            <label>Experience</label>
            <select
              value={profile.yearsExperience}
              onChange={(e) => setProfile({ ...profile, yearsExperience: parseInt(e.target.value) })}
            >
              {EXPERIENCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Current Level</label>
            <select
              value={profile.currentSeniority}
              onChange={(e) => setProfile({ ...profile, currentSeniority: e.target.value as SeniorityLevel })}
            >
              {SENIORITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Analysis Section */}
      <div className="analysis-section">
        {!canAnalyze ? (
          <div className="not-enough-data">
            <h3>Not enough data yet</h3>
            <p>Track at least 3 applications to unlock insights.</p>
            <p className="current-count">Current: {applications.length} application{applications.length !== 1 ? 's' : ''}</p>
          </div>
        ) : (
          <>
            <button
              className="btn btn-primary analyze-btn"
              onClick={handleAnalyze}
              disabled={loading}
            >
              {loading ? 'Analyzing...' : hasAnalyzed ? 'Re-analyze' : 'Analyze My Patterns'}
            </button>

            {error && <div className="error-message">{error}</div>}
          </>
        )}

        {result && (
          <div className="analysis-results">
            {/* Summary */}
            <div className="summary-card">
              <p className="summary-text">{result.analysis.summary}</p>

              <div className="summary-stats">
                <div className="stat">
                  <span className="stat-value">{result.profile.totalApplications}</span>
                  <span className="stat-label">Applications</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{result.profile.overallSuccessRate}%</span>
                  <span className="stat-label">Response Rate</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{result.profile.overallGhostRate}%</span>
                  <span className="stat-label">Ghost Rate</span>
                </div>
                {result.profile.avgDaysToResponse && (
                  <div className="stat">
                    <span className="stat-value">{result.profile.avgDaysToResponse}</span>
                    <span className="stat-label">Avg Days to Hear Back</span>
                  </div>
                )}
              </div>
            </div>

            {/* Biggest Issue */}
            {result.analysis.biggest_issue && (
              <div className="biggest-issue">
                <h4>Biggest Issue</h4>
                <p>{result.analysis.biggest_issue}</p>
              </div>
            )}

            {/* Quick Wins */}
            {result.analysis.quick_wins.length > 0 && (
              <div className="quick-wins">
                <h4>Quick Wins</h4>
                <ul>
                  {result.analysis.quick_wins.map((win, i) => (
                    <li key={i}>{win}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Insights */}
            {result.analysis.insights.length > 0 && (
              <div className="insights-list">
                <h4>Detailed Insights</h4>
                {result.analysis.insights.map((insight, i) => (
                  <div key={i} className={`insight-card ${getPriorityColor(insight.priority)}`}>
                    <div className="insight-header">
                      <span className="insight-icon">{getVerdictIcon(insight.priority)}</span>
                      <h5>{insight.title}</h5>
                      <span className="confidence">{Math.round(insight.confidence * 100)}%</span>
                    </div>

                    <p className="insight-explanation">{insight.explanation}</p>

                    {insight.evidence.length > 0 && (
                      <div className="insight-evidence">
                        {insight.evidence.map((ev, j) => (
                          <span key={j} className="evidence-tag">{ev}</span>
                        ))}
                      </div>
                    )}

                    <div className="insight-recommendation">
                      <strong>Action:</strong> {insight.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No insights case */}
            {result.analysis.insights.length === 0 && !result.analysis.biggest_issue && (
              <div className="no-patterns">
                <p>No significant patterns detected yet. Keep tracking applications - insights will appear as patterns emerge.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
