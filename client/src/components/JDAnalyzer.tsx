import { useState } from 'react';
import { ApplicationRecord, SeniorityLevel, CompanySize, ApplicationSource, SOURCE_OPTIONS } from '../types/pro';
import { canUseFeature, incrementUsage } from '../utils/usage';
import { UpgradePrompt, LimitWarning } from './UpgradePrompt';
import './JDAnalyzer.css';

// Types matching server schema
interface RedFlag {
  issue: string;
  severity: 'minor' | 'moderate' | 'major';
  explanation: string;
}

interface HardRequirement {
  keyword: string;
  category: 'certification' | 'tool' | 'technology' | 'degree' | 'clearance' | 'language';
  tip: string;
}

interface ATSKeywords {
  hard_requirements: HardRequirement[];
  soft_requirements: string[];
  action_verbs: string[];
  exact_phrases: string[];
}

interface JDAnalysis {
  company: string;
  role_title: string;
  seniority: string;
  company_size: string;
  remote_policy: string;
  red_flags: RedFlag[];
  must_haves: string[];
  nice_to_haves: string[];
  hidden_requirements: string[];
  reality_check: {
    experience_years_stated: string | null;
    experience_years_realistic: string;
    is_realistic: boolean;
    explanation: string;
  };
  salary_insight: {
    mentioned: boolean;
    range: string | null;
    market_assessment: string;
  };
  application_strategy: {
    direct_apply_worth_it: boolean;
    reasoning: string;
    better_approach: string | null;
  };
  ats_keywords: ATSKeywords;
  tldr: string;
}

// API call
async function analyzeJD(jobDescription: string): Promise<JDAnalysis> {
  const response = await fetch('/api/pro/jd-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobDescription })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Failed to analyze');
  }

  const data = await response.json();
  return data.data;
}

// Map JD seniority string to our SeniorityLevel type
function mapSeniority(seniority: string): SeniorityLevel {
  const lower = seniority.toLowerCase();
  if (lower.includes('intern')) return 'intern';
  if (lower.includes('junior') || lower.includes('entry')) return 'junior';
  if (lower.includes('senior')) return 'senior';
  if (lower.includes('staff')) return 'staff';
  if (lower.includes('principal') || lower.includes('lead')) return 'principal';
  if (lower.includes('director')) return 'director';
  if (lower.includes('vp') || lower.includes('vice president')) return 'vp';
  if (lower.includes('c-level') || lower.includes('chief') || lower.includes('cto') || lower.includes('ceo')) return 'c-level';
  return 'mid';
}

// Map JD company size string to our CompanySize type
function mapCompanySize(size: string): CompanySize {
  const lower = size.toLowerCase();
  if (lower.includes('startup')) return 'startup';
  if (lower.includes('small')) return 'small';
  if (lower.includes('mid')) return 'mid';
  if (lower.includes('large')) return 'large';
  if (lower.includes('enterprise') || lower.includes('fortune')) return 'enterprise';
  return 'mid';
}

interface JDAnalyzerProps {
  onAddToTracker?: (app: Omit<ApplicationRecord, 'id'>) => void;
}

export function JDAnalyzer({ onAddToTracker }: JDAnalyzerProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [result, setResult] = useState<JDAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [addedToTracker, setAddedToTracker] = useState(false);
  const [selectedSource, setSelectedSource] = useState<ApplicationSource>('linkedin');

  // Detect if text looks like a rejection email rather than a job description
  const looksLikeRejectionEmail = (text: string): boolean => {
    const lower = text.toLowerCase();
    const rejectionIndicators = [
      'unfortunately', 'regret to inform', 'not moving forward',
      'other candidates', 'decided not to', 'thank you for applying',
      'after careful', 'we will not', 'position has been filled',
      'not selected', 'moved forward with', 'appreciate your interest',
      'wish you the best', 'keep your resume on file'
    ];
    const jdIndicators = [
      'responsibilities:', 'qualifications:', 'requirements:',
      'about the role', 'what you\'ll do', 'years of experience',
      'benefits:', 'salary', 'we are looking for', 'join our team'
    ];

    const rejectionScore = rejectionIndicators.filter(ind => lower.includes(ind)).length;
    const jdScore = jdIndicators.filter(ind => lower.includes(ind)).length;

    return rejectionScore >= 2 && jdScore < 2;
  };

  const handleAnalyze = async () => {
    if (jobDescription.length < 50) {
      setError('Please paste a longer job description (at least 50 characters)');
      return;
    }

    // Detect if user pasted a rejection email instead of JD
    if (looksLikeRejectionEmail(jobDescription)) {
      setError('This looks like a rejection email, not a job description. Try the Decoder tab instead.');
      return;
    }

    // Check usage limits
    const { allowed } = canUseFeature('role_fit_checks');
    if (!allowed) {
      setShowUpgrade(true);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setShowUpgrade(false);
    setAddedToTracker(false);

    try {
      const data = await analyzeJD(jobDescription);
      setResult(data);
      incrementUsage('role_fit_checks');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case 'major': return 'severity-major';
      case 'moderate': return 'severity-moderate';
      case 'minor': return 'severity-minor';
      default: return '';
    }
  };

  // Check if this job already exists in tracker
  const isDuplicate = (company: string, role: string): boolean => {
    const STORAGE_KEY = 'reject_pro_applications';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return false;
      const data = JSON.parse(stored);
      const apps: ApplicationRecord[] = data.applications || [];
      return apps.some(app =>
        app.company.toLowerCase() === company.toLowerCase() &&
        app.role.toLowerCase() === role.toLowerCase()
      );
    } catch {
      return false;
    }
  };

  const handleAddToTracker = () => {
    if (!result || !onAddToTracker) return;

    // Check for duplicates
    if (isDuplicate(result.company, result.role_title)) {
      setError(`${result.company} - ${result.role_title} is already in your tracker`);
      return;
    }

    const newApp: Omit<ApplicationRecord, 'id'> = {
      company: result.company,
      role: result.role_title,
      seniorityLevel: mapSeniority(result.seniority),
      companySize: mapCompanySize(result.company_size),
      industry: '',
      source: selectedSource,
      dateApplied: new Date().toISOString().split('T')[0],
      outcome: 'pending',
      daysToResponse: null
    };

    onAddToTracker(newApp);
    setAddedToTracker(true);
  };

  // Show upgrade prompt if limit reached
  if (showUpgrade) {
    return (
      <div className="jd-analyzer">
        <UpgradePrompt action="role_fit_checks" onClose={() => setShowUpgrade(false)} />
      </div>
    );
  }

  return (
    <div className="jd-analyzer">
      <LimitWarning action="role_fit_checks" />
      <h2>JD Check</h2>
      <p className="section-desc">
        Paste a job description. We'll extract what matters and flag what doesn't.
      </p>

      <div className="jd-input-section">
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the full job description here..."
          rows={8}
          disabled={loading}
        />
        <div className="input-footer">
          <span className="char-count">
            {jobDescription.length} characters {jobDescription.length < 50 && '(min 50)'}
          </span>
          <button
            className="btn btn-primary"
            onClick={handleAnalyze}
            disabled={loading || jobDescription.length < 50}
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {result && (
        <div className="jd-result">
          {/* Header */}
          <div className="result-header">
            <div className="role-info">
              <h3>{result.company}</h3>
              <p className="role-title">{result.role_title}</p>
              <div className="role-tags">
                <span className="tag">{result.seniority}</span>
                <span className="tag">{result.company_size}</span>
                <span className="tag">{result.remote_policy}</span>
              </div>
            </div>
            {onAddToTracker && (
              <div className="result-actions">
                {addedToTracker ? (
                  <span className="added-confirmation">Added to Tracker</span>
                ) : (
                  <div className="add-to-tracker-form">
                    <select
                      value={selectedSource}
                      onChange={(e) => setSelectedSource(e.target.value as ApplicationSource)}
                      className="source-select"
                    >
                      {SOURCE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" onClick={handleAddToTracker}>
                      + Add to Tracker
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* TL;DR */}
          <div className="result-section tldr-section">
            <p className="tldr">{result.tldr}</p>
          </div>

          {/* Red Flags */}
          {result.red_flags.length > 0 && (
            <div className="result-section red-flags-section">
              <h4>Red Flags ({result.red_flags.length})</h4>
              <div className="red-flags-list">
                {result.red_flags.map((flag, i) => (
                  <div key={i} className={`red-flag ${getSeverityClass(flag.severity)}`}>
                    <div className="flag-header">
                      <span className="flag-issue">{flag.issue}</span>
                      <span className={`flag-severity ${getSeverityClass(flag.severity)}`}>
                        {flag.severity}
                      </span>
                    </div>
                    <p className="flag-explanation">{flag.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Requirements */}
          <div className="result-section requirements-section">
            <div className="requirements-columns">
              <div className="requirements-col">
                <h4>Must-Haves</h4>
                <ul>
                  {result.must_haves.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </div>
              {result.nice_to_haves.length > 0 && (
                <div className="requirements-col">
                  <h4>Nice-to-Haves</h4>
                  <ul>
                    {result.nice_to_haves.map((req, i) => (
                      <li key={i}>{req}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {result.hidden_requirements.length > 0 && (
              <div className="hidden-requirements">
                <h4>Hidden Requirements</h4>
                <p className="hidden-hint">Things they want but didn't explicitly state:</p>
                <ul>
                  {result.hidden_requirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ATS Keywords */}
          {result.ats_keywords && (
            <div className="result-section ats-keywords-section">
              <h4>ATS Keywords</h4>
              <p className="ats-hint">Include these on your resume to pass automated screening</p>

              {/* Hard Requirements */}
              {result.ats_keywords.hard_requirements.length > 0 && (
                <div className="ats-category">
                  <h5>Must-Have Keywords <span className="ats-badge critical">Critical</span></h5>
                  <div className="hard-requirements-list">
                    {result.ats_keywords.hard_requirements.map((req, i) => (
                      <div key={i} className="hard-requirement">
                        <div className="req-header">
                          <span className="req-keyword">{req.keyword}</span>
                          <span className={`req-category cat-${req.category}`}>{req.category}</span>
                        </div>
                        <p className="req-tip">{req.tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exact Phrases */}
              {result.ats_keywords.exact_phrases.length > 0 && (
                <div className="ats-category">
                  <h5>Exact Phrases to Use</h5>
                  <div className="keyword-chips">
                    {result.ats_keywords.exact_phrases.map((phrase, i) => (
                      <span key={i} className="keyword-chip phrase">{phrase}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Verbs */}
              {result.ats_keywords.action_verbs.length > 0 && (
                <div className="ats-category">
                  <h5>Action Verbs</h5>
                  <div className="keyword-chips">
                    {result.ats_keywords.action_verbs.map((verb, i) => (
                      <span key={i} className="keyword-chip verb">{verb}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Soft Requirements */}
              {result.ats_keywords.soft_requirements.length > 0 && (
                <div className="ats-category">
                  <h5>Nice-to-Have Keywords</h5>
                  <div className="keyword-chips">
                    {result.ats_keywords.soft_requirements.map((req, i) => (
                      <span key={i} className="keyword-chip soft">{req}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reality Check */}
          <div className="result-section reality-section">
            <h4>Reality Check</h4>
            <div className="reality-content">
              {result.reality_check.experience_years_stated && (
                <div className="reality-comparison">
                  <span className="stated">
                    States: {result.reality_check.experience_years_stated}
                  </span>
                  <span className="arrow">→</span>
                  <span className="realistic">
                    Realistic: {result.reality_check.experience_years_realistic}
                  </span>
                </div>
              )}
              <p className="reality-explanation">{result.reality_check.explanation}</p>
            </div>
          </div>

          {/* Salary Insight */}
          <div className="result-section salary-section">
            <h4>Salary</h4>
            {result.salary_insight.mentioned && result.salary_insight.range ? (
              <p className="salary-range">{result.salary_insight.range}</p>
            ) : (
              <p className="salary-hidden">Not disclosed</p>
            )}
            <p className="salary-assessment">{result.salary_insight.market_assessment}</p>
          </div>

          {/* Application Strategy */}
          <div className={`result-section strategy-section ${result.application_strategy.direct_apply_worth_it ? 'strategy-go' : 'strategy-caution'}`}>
            <h4>Application Strategy</h4>
            <div className="strategy-verdict">
              <span className={`strategy-badge ${result.application_strategy.direct_apply_worth_it ? 'worth-it' : 'reconsider'}`}>
                {result.application_strategy.direct_apply_worth_it ? 'Direct Apply OK' : 'Consider Alternatives'}
              </span>
            </div>
            <p className="strategy-reasoning">{result.application_strategy.reasoning}</p>
            {result.application_strategy.better_approach && (
              <div className="better-approach">
                <strong>Better approach:</strong> {result.application_strategy.better_approach}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
