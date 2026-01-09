import { useState } from 'react';
import { ApplicationRecord, SeniorityLevel, SENIORITY_OPTIONS } from '../types/pro';
import { canUseFeature, incrementUsage } from '../utils/usage';
import { UpgradePrompt, LimitWarning } from './UpgradePrompt';
import './RoleFitChecker.css';

// Types matching server schema
interface RoleFitResultV2 {
  verdict: 'good_match' | 'worth_trying' | 'long_shot' | 'insufficient_data';
  confidence: number;
  company: string;
  role_title: string;
  seniority_detected: string | null;
  summary: string;
  working_for_you: string[];
  working_against_you: string[];
  historical_context: {
    similar_applications: number;
    similar_success_rate: number | null;
    best_performing_source: string | null;
    applied_to_this_company_before: boolean;
  };
  recommendation: string;
  if_you_apply: string[];
}

interface MinimalProfile {
  yearsExperience: number;
  currentSeniority: SeniorityLevel;
}

// API call
async function checkRoleFitV2(
  jobDescription: string,
  profile: MinimalProfile,
  applications: ApplicationRecord[]
): Promise<RoleFitResultV2> {
  const response = await fetch('/api/pro/role-fit-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobDescription, profile, applications })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Failed to check fit');
  }

  const data = await response.json();
  return data.data;
}

// Load profile from localStorage
function loadProfile(): MinimalProfile {
  try {
    const stored = localStorage.getItem('reject_minimal_profile');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { yearsExperience: 3, currentSeniority: 'mid' };
}

function saveProfile(profile: MinimalProfile): void {
  localStorage.setItem('reject_minimal_profile', JSON.stringify(profile));
}

interface RoleFitCheckerProps {
  applications: ApplicationRecord[];
}

export function RoleFitChecker({ applications }: RoleFitCheckerProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [result, setResult] = useState<RoleFitResultV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<MinimalProfile>(loadProfile);
  const [showProfile, setShowProfile] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleCheck = async () => {
    if (jobDescription.length < 50) {
      setError('Please paste a longer job description (at least 50 characters)');
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

    try {
      saveProfile(profile);
      const data = await checkRoleFitV2(jobDescription, profile, applications);
      setResult(data);
      // Increment usage on success
      incrementUsage('role_fit_checks');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const getVerdictDisplay = (verdict: string) => {
    switch (verdict) {
      case 'good_match':
        return { label: 'Good Match', class: 'verdict-good', icon: '✓' };
      case 'worth_trying':
        return { label: 'Worth Trying', class: 'verdict-worth', icon: '→' };
      case 'long_shot':
        return { label: 'Long Shot', class: 'verdict-long', icon: '?' };
      case 'insufficient_data':
        return { label: 'Need More Data', class: 'verdict-data', icon: '📊' };
      default:
        return { label: verdict, class: '', icon: '' };
    }
  };

  // Show upgrade prompt if limit reached
  if (showUpgrade) {
    return (
      <div className="role-fit-v2">
        <UpgradePrompt action="role_fit_checks" onClose={() => setShowUpgrade(false)} />
      </div>
    );
  }

  return (
    <div className="role-fit-v2">
      <LimitWarning action="role_fit_checks" />
      <h2>Role Fit Checker</h2>
      <p className="section-desc">
        Paste a job description. We'll compare it to your application history.
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
          <div className="input-actions">
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setShowProfile(!showProfile)}
            >
              {showProfile ? 'Hide' : 'Your level'}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCheck}
              disabled={loading || jobDescription.length < 50}
            >
              {loading ? 'Analyzing...' : 'Check Fit'}
            </button>
          </div>
        </div>

        {showProfile && (
          <div className="mini-profile">
            <div className="profile-fields">
              <div className="field">
                <label>Years Experience</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={profile.yearsExperience}
                  onChange={(e) => setProfile({ ...profile, yearsExperience: parseInt(e.target.value) || 0 })}
                />
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
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {result && (
        <div className="fit-result">
          {/* Header */}
          <div className="result-header">
            <div className="role-info">
              <h3>{result.company}</h3>
              <p className="role-title">{result.role_title}</p>
              {result.seniority_detected && (
                <span className="seniority-tag">{result.seniority_detected} level</span>
              )}
            </div>
            <div className={`verdict-badge ${getVerdictDisplay(result.verdict).class}`}>
              <span className="verdict-icon">{getVerdictDisplay(result.verdict).icon}</span>
              <span className="verdict-label">{getVerdictDisplay(result.verdict).label}</span>
              <span className="verdict-confidence">{Math.round(result.confidence * 100)}%</span>
            </div>
          </div>

          {/* Summary */}
          <div className="result-summary">
            <p>{result.summary}</p>
          </div>

          {/* Pros and Cons */}
          <div className="pros-cons">
            {result.working_for_you.length > 0 && (
              <div className="pros">
                <h4>Working for you</h4>
                <ul>
                  {result.working_for_you.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.working_against_you.length > 0 && (
              <div className="cons">
                <h4>Challenges</h4>
                <ul>
                  {result.working_against_you.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Historical Context */}
          <div className="historical-context">
            <h4>Your History</h4>
            <div className="context-stats">
              <div className="context-stat">
                <span className="stat-value">{result.historical_context.similar_applications}</span>
                <span className="stat-label">Similar apps</span>
              </div>
              <div className="context-stat">
                <span className="stat-value">
                  {result.historical_context.similar_success_rate !== null
                    ? `${result.historical_context.similar_success_rate}%`
                    : '—'}
                </span>
                <span className="stat-label">Success rate</span>
              </div>
              {result.historical_context.best_performing_source && (
                <div className="context-stat">
                  <span className="stat-value">{result.historical_context.best_performing_source}</span>
                  <span className="stat-label">Best source</span>
                </div>
              )}
            </div>
            {result.historical_context.applied_to_this_company_before && (
              <p className="applied-before">You've applied to this company before</p>
            )}
          </div>

          {/* Recommendation */}
          <div className="recommendation">
            <h4>Bottom Line</h4>
            <p>{result.recommendation}</p>
          </div>

          {/* If You Apply */}
          {result.if_you_apply.length > 0 && (
            <div className="if-you-apply">
              <h4>If you apply</h4>
              <ul>
                {result.if_you_apply.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Empty state - encourage tracking */}
      {!result && !loading && applications.length < 3 && (
        <div className="empty-hint">
          <p>
            <strong>Tip:</strong> Track at least 3 applications in Pro Tracker to get personalized fit predictions.
          </p>
        </div>
      )}
    </div>
  );
}
