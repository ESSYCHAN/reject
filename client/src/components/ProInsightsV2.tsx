import { useState, useEffect, useMemo } from 'react';
import { ApplicationRecord, SeniorityLevel, SENIORITY_OPTIONS } from '../types/pro';
import { canUseFeature, incrementUsage, loadUsage, syncProStatusFromServer } from '../utils/usage';
import { generateProInsights, ProInsightsData } from '../utils/proAnalytics';
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

// ATS Boundary mapping - where is the user being filtered?
interface SeniorityBand {
  level: string;
  ats_pass_rate: number;
  sample_size: number;
}

interface ATSBoundary {
  ats_filter_rate: number;
  human_review_rate: number;
  interpretation: string;
  seniority_bands: SeniorityBand[];
  strategic_recommendation: string;
}

interface UnifiedAnalysisResponse {
  summary: string;
  insights: UnifiedInsight[];
  quick_wins: string[];
  biggest_issue: string | null;
  ats_boundary?: ATSBoundary;
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

// Community company stats from all users
interface CommunityCompanyStats {
  company: string;
  totalApplications: number;
  uniqueApplicants: number;
  avgDaysToResponse: number | null;
  ghostRate: number;
  rejectionCategories: { category: string; count: number; percentage: number }[];
  topSignals: { signal: string; count: number }[];
  seniorityBreakdown: { level: string; count: number }[];
  mostCommonOutcome: string | null;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'progress' | 'companies' | 'patterns'>('overview');
  const [isPro, setIsPro] = useState(loadUsage().isPro);
  const [communityCompanies, setCommunityCompanies] = useState<CommunityCompanyStats[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);

  // Sync Pro status from server on mount
  useEffect(() => {
    syncProStatusFromServer().then((serverIsPro) => {
      setIsPro(serverIsPro);
    });

    // Listen for Pro status sync events from App.tsx
    const handleProSync = (e: CustomEvent<{ isPro: boolean }>) => {
      setIsPro(e.detail.isPro);
    };

    window.addEventListener('pro-status-synced', handleProSync as EventListener);
    return () => {
      window.removeEventListener('pro-status-synced', handleProSync as EventListener);
    };
  }, []);

  // Fetch community company data when Companies tab is active
  useEffect(() => {
    if (activeTab === 'companies' && isPro && communityCompanies.length === 0) {
      setLoadingCommunity(true);
      fetch('/api/pro/company-intel')
        .then(res => res.json())
        .then(data => {
          setCommunityCompanies(data.data || []);
        })
        .catch(err => {
          console.error('Failed to fetch community company data:', err);
        })
        .finally(() => {
          setLoadingCommunity(false);
        });
    }
  }, [activeTab, isPro, communityCompanies.length]);

  // Generate Pro insights locally (no API call needed)
  const proInsights: ProInsightsData = useMemo(
    () => generateProInsights(applications),
    [applications]
  );

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

  const getTrendIcon = (trend: 'up' | 'down' | 'same') => {
    switch (trend) {
      case 'up': return '↑';
      case 'down': return '↓';
      case 'same': return '→';
    }
  };

  const getTrendClass = (trend: 'up' | 'down' | 'same', isPositive: boolean) => {
    if (trend === 'same') return 'trend-neutral';
    if (trend === 'up') return isPositive ? 'trend-positive' : 'trend-negative';
    return isPositive ? 'trend-negative' : 'trend-positive';
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

      {/* Tab Navigation */}
      <div className="insights-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'progress' ? 'active' : ''} ${!isPro ? 'pro-locked' : ''}`}
          onClick={() => isPro ? setActiveTab('progress') : setShowUpgrade(true)}
        >
          Progress {!isPro && '🔒'}
        </button>
        <button
          className={`tab-btn ${activeTab === 'companies' ? 'active' : ''} ${!isPro ? 'pro-locked' : ''}`}
          onClick={() => isPro ? setActiveTab('companies') : setShowUpgrade(true)}
        >
          Companies {!isPro && '🔒'}
        </button>
        <button
          className={`tab-btn ${activeTab === 'patterns' ? 'active' : ''} ${!isPro ? 'pro-locked' : ''}`}
          onClick={() => isPro ? setActiveTab('patterns') : setShowUpgrade(true)}
        >
          Patterns {!isPro && '🔒'}
        </button>
      </div>

      {/* Overview Tab - Original functionality */}
      {activeTab === 'overview' && (
        <>
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

                {/* ATS Boundary Mapping */}
                {result.analysis.ats_boundary && (
                  <div className="ats-boundary-section">
                    <h4>Where You're Being Filtered</h4>
                    <div className="ats-boundary-bars">
                      <div className="boundary-bar">
                        <div className="bar-label">ATS Filtered</div>
                        <div className="bar-container">
                          <div
                            className="bar-fill bar-ats"
                            style={{ width: `${result.analysis.ats_boundary.ats_filter_rate}%` }}
                          />
                        </div>
                        <div className="bar-value">{result.analysis.ats_boundary.ats_filter_rate}%</div>
                      </div>
                      <div className="boundary-bar">
                        <div className="bar-label">Human Reviewed</div>
                        <div className="bar-container">
                          <div
                            className="bar-fill bar-human"
                            style={{ width: `${result.analysis.ats_boundary.human_review_rate}%` }}
                          />
                        </div>
                        <div className="bar-value">{result.analysis.ats_boundary.human_review_rate}%</div>
                      </div>
                    </div>

                    <p className="ats-interpretation">{result.analysis.ats_boundary.interpretation}</p>

                    {result.analysis.ats_boundary.seniority_bands.length > 0 && (
                      <div className="seniority-bands">
                        <h5>Success by Seniority Level</h5>
                        <div className="bands-grid">
                          {result.analysis.ats_boundary.seniority_bands.map((band, i) => (
                            <div key={i} className="band-item">
                              <span className="band-level">{band.level}</span>
                              <span className={`band-rate ${band.ats_pass_rate >= 50 ? 'good' : band.ats_pass_rate >= 25 ? 'fair' : 'poor'}`}>
                                {band.ats_pass_rate}% pass ATS
                              </span>
                              <span className="band-sample">({band.sample_size} apps)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="ats-strategic-rec">
                      <strong>Strategy:</strong> {result.analysis.ats_boundary.strategic_recommendation}
                    </div>
                  </div>
                )}

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
        </>
      )}

      {/* Progress Tab - PRO ONLY */}
      {activeTab === 'progress' && isPro && (
        <div className="progress-section">
          <h3>Month-over-Month Progress</h3>
          <p className="section-hint">Track how your job search is improving over time.</p>

          {proInsights.progress.current ? (
            <>
              <div className="progress-summary">
                <p>{proInsights.progress.summary}</p>
              </div>

              {/* Current vs Previous Month Comparison */}
              {proInsights.progress.previous && (
                <div className="comparison-grid">
                  <div className="comparison-card">
                    <span className="comparison-label">Response Rate</span>
                    <div className="comparison-values">
                      <span className="current-value">{proInsights.progress.current.responseRate}%</span>
                      {proInsights.progress.changes.responseRate && (
                        <span className={`trend ${getTrendClass(proInsights.progress.changes.responseRate.trend, true)}`}>
                          {getTrendIcon(proInsights.progress.changes.responseRate.trend)} {proInsights.progress.changes.responseRate.value}%
                        </span>
                      )}
                    </div>
                    <span className="previous-value">vs {proInsights.progress.previous.responseRate}% last month</span>
                  </div>

                  <div className="comparison-card">
                    <span className="comparison-label">Interview Rate</span>
                    <div className="comparison-values">
                      <span className="current-value">{proInsights.progress.current.interviewRate}%</span>
                      {proInsights.progress.changes.interviewRate && (
                        <span className={`trend ${getTrendClass(proInsights.progress.changes.interviewRate.trend, true)}`}>
                          {getTrendIcon(proInsights.progress.changes.interviewRate.trend)} {proInsights.progress.changes.interviewRate.value}%
                        </span>
                      )}
                    </div>
                    <span className="previous-value">vs {proInsights.progress.previous.interviewRate}% last month</span>
                  </div>

                  <div className="comparison-card">
                    <span className="comparison-label">Ghost Rate</span>
                    <div className="comparison-values">
                      <span className="current-value">{proInsights.progress.current.ghostRate}%</span>
                      {proInsights.progress.changes.ghostRate && (
                        <span className={`trend ${getTrendClass(proInsights.progress.changes.ghostRate.trend, false)}`}>
                          {getTrendIcon(proInsights.progress.changes.ghostRate.trend)} {proInsights.progress.changes.ghostRate.value}%
                        </span>
                      )}
                    </div>
                    <span className="previous-value">vs {proInsights.progress.previous.ghostRate}% last month</span>
                  </div>

                  <div className="comparison-card">
                    <span className="comparison-label">Applications</span>
                    <div className="comparison-values">
                      <span className="current-value">{proInsights.progress.current.totalApplications}</span>
                      {proInsights.progress.changes.volume && (
                        <span className={`trend trend-neutral`}>
                          {getTrendIcon(proInsights.progress.changes.volume.trend)} {proInsights.progress.changes.volume.value}
                        </span>
                      )}
                    </div>
                    <span className="previous-value">vs {proInsights.progress.previous.totalApplications} last month</span>
                  </div>
                </div>
              )}

              {/* Monthly History */}
              {proInsights.monthlyHistory.length > 0 && (
                <div className="monthly-history">
                  <h4>Monthly History</h4>
                  <div className="history-table">
                    <div className="history-header">
                      <span>Month</span>
                      <span>Apps</span>
                      <span>Response</span>
                      <span>Interview</span>
                      <span>Offers</span>
                    </div>
                    {proInsights.monthlyHistory.slice(0, 6).map((month, i) => (
                      <div key={month.month} className={`history-row ${i === 0 ? 'current' : ''}`}>
                        <span className="month-label">{month.month}</span>
                        <span>{month.totalApplications}</span>
                        <span>{month.responseRate}%</span>
                        <span>{month.interviewRate}%</span>
                        <span>{month.offers}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="no-data-message">
              <p>Start tracking applications with dates to see your progress over time.</p>
            </div>
          )}
        </div>
      )}

      {/* Companies Tab - PRO ONLY */}
      {activeTab === 'companies' && isPro && (
        <div className="companies-section">
          {/* Your Companies Section */}
          <div className="companies-subsection">
            <h3>Your Company History</h3>
            <p className="section-hint">Patterns from companies you've applied to multiple times.</p>

            {proInsights.companies.length > 0 ? (
              <div className="companies-list">
                {proInsights.companies.map((company, i) => (
                  <div key={i} className="company-card personal">
                    <div className="company-header">
                      <h4>{company.company}</h4>
                      <span className="app-count">{company.totalApplications} applications</span>
                    </div>

                    <div className="company-outcomes">
                      {company.outcomes.offer > 0 && (
                        <span className="outcome-badge outcome-offer">{company.outcomes.offer} offer(s)</span>
                      )}
                      {company.outcomes.rejected_final > 0 && (
                        <span className="outcome-badge outcome-final">{company.outcomes.rejected_final} final round</span>
                      )}
                      {company.outcomes.rejected_hm > 0 && (
                        <span className="outcome-badge outcome-hm">{company.outcomes.rejected_hm} HM stage</span>
                      )}
                      {company.outcomes.rejected_recruiter > 0 && (
                        <span className="outcome-badge outcome-recruiter">{company.outcomes.rejected_recruiter} recruiter</span>
                      )}
                      {company.outcomes.rejected_ats > 0 && (
                        <span className="outcome-badge outcome-ats">{company.outcomes.rejected_ats} ATS</span>
                      )}
                      {company.outcomes.ghosted > 0 && (
                        <span className="outcome-badge outcome-ghosted">{company.outcomes.ghosted} ghosted</span>
                      )}
                    </div>

                    {company.avgDaysToResponse && (
                      <p className="company-response-time">Avg response: {company.avgDaysToResponse} days</p>
                    )}

                    <p className="company-insight">{company.insight}</p>

                    {company.rejectionCategories.length > 0 && (
                      <div className="rejection-categories">
                        <span className="categories-label">Rejection types:</span>
                        {company.rejectionCategories.map((cat, j) => (
                          <span key={j} className="category-tag">{cat.category} ({cat.count})</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data-message">
                <p>Apply to companies multiple times to see your personal patterns. We need at least 2 applications per company.</p>
              </div>
            )}
          </div>

          {/* Community Intelligence Section */}
          <div className="companies-subsection community">
            <h3>Community Intelligence</h3>
            <p className="section-hint">Aggregated insights from all REJECT users (anonymized, 10+ data points per company).</p>

            {loadingCommunity ? (
              <div className="no-data-message">
                <p>Loading community data...</p>
              </div>
            ) : communityCompanies.length > 0 ? (
              <div className="companies-list">
                {communityCompanies.map((company, i) => (
                  <div key={i} className="company-card community">
                    <div className="company-header">
                      <h4>{company.company}</h4>
                      <div className="community-badges">
                        <span className="app-count">{company.totalApplications} data points</span>
                        <span className="applicant-count">{company.uniqueApplicants} applicants</span>
                      </div>
                    </div>

                    <div className="community-stats">
                      {company.ghostRate > 0 && (
                        <div className="community-stat">
                          <span className="stat-value">{company.ghostRate}%</span>
                          <span className="stat-label">Ghost Rate</span>
                        </div>
                      )}
                      {company.avgDaysToResponse && (
                        <div className="community-stat">
                          <span className="stat-value">{company.avgDaysToResponse}d</span>
                          <span className="stat-label">Avg Response</span>
                        </div>
                      )}
                      {company.mostCommonOutcome && (
                        <div className="community-stat">
                          <span className="stat-value">{company.mostCommonOutcome}</span>
                          <span className="stat-label">Most Common</span>
                        </div>
                      )}
                    </div>

                    {company.rejectionCategories.length > 0 && (
                      <div className="rejection-breakdown">
                        <span className="breakdown-title">Rejection breakdown:</span>
                        <div className="breakdown-bars-mini">
                          {company.rejectionCategories.slice(0, 3).map((cat, j) => (
                            <div key={j} className="breakdown-item">
                              <span className="breakdown-name">{cat.category}</span>
                              <div className="breakdown-bar-mini">
                                <div
                                  className="breakdown-fill-mini"
                                  style={{ width: `${cat.percentage}%` }}
                                />
                              </div>
                              <span className="breakdown-pct">{cat.percentage}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {company.topSignals.length > 0 && (
                      <div className="community-signals">
                        <span className="signals-label">Common signals:</span>
                        {company.topSignals.slice(0, 3).map((sig, j) => (
                          <span key={j} className="signal-mini">{sig.signal}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data-message">
                <p>Community data is building. As more users decode rejections, company insights will appear here.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Patterns Tab - PRO ONLY */}
      {activeTab === 'patterns' && isPro && (
        <div className="patterns-section">
          <h3>Rejection Pattern Analysis</h3>
          <p className="section-hint">Aggregate insights from your decoded rejection emails.</p>

          {proInsights.rejectionPatterns.totalDecoded > 0 ? (
            <>
              <div className="patterns-summary">
                <p>{proInsights.rejectionPatterns.insight}</p>
              </div>

              <div className="patterns-stats">
                <div className="pattern-stat">
                  <span className="stat-value">{proInsights.rejectionPatterns.totalDecoded}</span>
                  <span className="stat-label">Rejections Decoded</span>
                </div>
                <div className="pattern-stat">
                  <span className="stat-value">{proInsights.rejectionPatterns.atsFilteredPercentage}%</span>
                  <span className="stat-label">ATS Filtered</span>
                </div>
                <div className="pattern-stat">
                  <span className="stat-value">{proInsights.rejectionPatterns.humanReviewedPercentage}%</span>
                  <span className="stat-label">Human Reviewed</span>
                </div>
                <div className="pattern-stat">
                  <span className="stat-value">{proInsights.rejectionPatterns.templateRejectionPercentage}%</span>
                  <span className="stat-label">Template Rejections</span>
                </div>
              </div>

              {/* Category Breakdown */}
              {proInsights.rejectionPatterns.categoryBreakdown.length > 0 && (
                <div className="category-breakdown">
                  <h4>Rejection Categories</h4>
                  <div className="breakdown-bars">
                    {proInsights.rejectionPatterns.categoryBreakdown.map((cat, i) => (
                      <div key={i} className="breakdown-row">
                        <span className="breakdown-label">{cat.category}</span>
                        <div className="breakdown-bar-container">
                          <div
                            className="breakdown-bar-fill"
                            style={{ width: `${cat.percentage}%` }}
                          />
                        </div>
                        <span className="breakdown-value">{cat.count} ({cat.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Signals */}
              {proInsights.rejectionPatterns.topSignals.length > 0 && (
                <div className="top-signals">
                  <h4>Common Signals in Your Rejections</h4>
                  <div className="signals-grid">
                    {proInsights.rejectionPatterns.topSignals.map((signal, i) => (
                      <span key={i} className="signal-tag">
                        {signal.signal} <span className="signal-count">({signal.count})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="no-data-message">
              <p>{proInsights.rejectionPatterns.insight}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
