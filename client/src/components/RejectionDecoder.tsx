import { useState } from 'react';
import { DecodeResponse, ATSAssessment, InterviewStage } from '../types';
import { ApplicationRecord } from '../types/pro';
import { decodeEmail } from '../utils/api';
import { canUseFeature, incrementUsage } from '../utils/usage';
import { UpgradePrompt, LimitWarning } from './UpgradePrompt';

// Helper to get human-readable stage label
function getStageLabel(stage: ATSAssessment['stage_reached']): string {
  switch (stage) {
    case 'ats_filter': return 'ATS Filter';
    case 'recruiter_screen': return 'Recruiter Screen';
    case 'hiring_manager': return 'Hiring Manager';
    case 'final_round': return 'Final Round';
    case 'unknown': return 'Unknown Stage';
  }
}

// Helper to get stage color class
function getStageColor(stage: ATSAssessment['stage_reached']): string {
  switch (stage) {
    case 'ats_filter': return 'stage-ats';
    case 'recruiter_screen': return 'stage-recruiter';
    case 'hiring_manager': return 'stage-hm';
    case 'final_round': return 'stage-final';
    case 'unknown': return 'stage-unknown';
  }
}

interface DecodedData {
  result: DecodeResponse;
  emailText: string;
  companyName: string | null;
}

// Try to extract company name from rejection email
function extractCompanyName(emailText: string): string | null {
  const patterns = [
    /(?:at|from|with)\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:\.|,|\s+team|\s+and|\s+we|\s+has)/i,
    /([A-Z][A-Za-z0-9\s&.-]+?)\s+(?:team|hiring|recruitment|talent)/i,
    /Thank you for (?:your interest in|applying to)\s+([A-Z][A-Za-z0-9\s&.-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = emailText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length >= 2 && name.length <= 50) {
        return name;
      }
    }
  }
  return null;
}

// Normalize company name for fuzzy matching
function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\s]+(com|inc|ltd|llc|corp|corporation|co)\.?$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Smarter outcome mapping using signals
function categoryToOutcome(category: string, signals: string[] = []): ApplicationRecord['outcome'] {
  const signalsText = signals.join(' ').toLowerCase();

  // Check signals for clues about interview stage
  const hadInterview = /interview|meeting|conversation|spoke|chat|call/.test(signalsText);
  const finalRound = /final|team|onsite|panel|offer stage|last round/.test(signalsText);
  const recruiterMention = /recruiter|talent|hr rep|sourcer/.test(signalsText);

  if (finalRound) return 'rejected_final';
  if (hadInterview && !recruiterMention) return 'rejected_hm';
  if (hadInterview && recruiterMention) return 'rejected_recruiter';

  switch (category) {
    case 'Door Open': return 'rejected_recruiter';
    case 'Polite Pass': return 'rejected_hm';
    case 'Soft No': return 'rejected_recruiter';
    case 'Hard No': return 'rejected_ats';
    case 'Template': return 'rejected_ats';
    default: return 'rejected_ats';
  }
}

// Get human-readable outcome label
function getOutcomeLabel(outcome: ApplicationRecord['outcome']): string {
  switch (outcome) {
    case 'rejected_ats': return 'Rejected (ATS)';
    case 'rejected_recruiter': return 'Rejected (Recruiter)';
    case 'rejected_hm': return 'Rejected (Hiring Manager)';
    case 'rejected_final': return 'Rejected (Final Round)';
    default: return outcome;
  }
}

interface LinkResult {
  company: string;
  role: string;
  previousOutcome: string;
  newOutcome: string;
  daysToResponse: number | null;
}

interface RejectionDecoderProps {
  onAddToTracker?: (data: DecodedData) => void;
  onLinkToApplication?: (applicationId: string, result: DecodeResponse) => LinkResult | null;
  applications?: ApplicationRecord[];
}

export function RejectionDecoder({ onAddToTracker, onLinkToApplication, applications = [] }: RejectionDecoderProps) {
  const [emailText, setEmailText] = useState('');
  const [interviewStage, setInterviewStage] = useState<InterviewStage>('none');
  const [result, setResult] = useState<DecodeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedToTracker, setAddedToTracker] = useState(false);
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Filter to show only pending/interviewing applications (ones that could receive rejections)
  const linkableApps = applications.filter(app =>
    app.outcome === 'pending' || app.outcome === 'ghosted'
  );

  const handleDecode = async () => {
    if (emailText.trim().length < 10) {
      setError('Please enter at least 10 characters');
      return;
    }

    // Check usage limits
    const { allowed } = canUseFeature('decodes_per_month');
    if (!allowed) {
      setShowUpgrade(true);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setAddedToTracker(false);
    setLinkResult(null);
    setSelectedAppId('');
    setShowUpgrade(false);

    const response = await decodeEmail(emailText, interviewStage);

    setLoading(false);

    if (response.error) {
      setError(response.error);
    } else if (response.data) {
      setResult(response.data);
      // Increment usage only on successful decode
      incrementUsage('decodes_per_month');

      // Try to auto-match with an existing application by company name (fuzzy)
      const extractedCompany = extractCompanyName(emailText);
      if (extractedCompany && linkableApps.length > 0) {
        const normalizedExtracted = normalizeCompany(extractedCompany);
        const match = linkableApps.find(app => {
          const normalizedApp = normalizeCompany(app.company);
          return normalizedApp === normalizedExtracted ||
            normalizedApp.includes(normalizedExtracted) ||
            normalizedExtracted.includes(normalizedApp);
        });
        if (match) {
          setSelectedAppId(match.id);
        }
      }
    }
  };

  const handleAddToTracker = () => {
    if (result && onAddToTracker) {
      const companyName = extractCompanyName(emailText);
      onAddToTracker({
        result,
        emailText,
        companyName
      });
      setAddedToTracker(true);
    }
  };

  const handleLinkToApplication = () => {
    if (result && selectedAppId && onLinkToApplication) {
      const linkRes = onLinkToApplication(selectedAppId, result);
      setLinkResult(linkRes);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Door Open': return 'category-door-open';
      case 'Soft No': return 'category-soft-no';
      case 'Template': return 'category-template';
      case 'Polite Pass': return 'category-polite-pass';
      case 'Hard No': return 'category-hard-no';
      default: return '';
    }
  };

  const getReplyColor = (worth: string) => {
    switch (worth) {
      case 'High': return 'reply-high';
      case 'Medium': return 'reply-medium';
      case 'Low': return 'reply-low';
      default: return '';
    }
  };

  // Show upgrade prompt if limit reached
  if (showUpgrade) {
    return (
      <div className="decoder">
        <UpgradePrompt action="decodes_per_month" onClose={() => setShowUpgrade(false)} />
      </div>
    );
  }

  return (
    <div className="decoder">
      <LimitWarning action="decodes_per_month" />
      <div className="decoder-input">
        <h2>Paste your rejection email</h2>
        <textarea
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          placeholder="Paste the rejection email here..."
          rows={10}
          maxLength={10000}
          disabled={loading}
        />
        <div className="interview-context">
          <label htmlFor="interview-stage">How far did you get?</label>
          <select
            id="interview-stage"
            value={interviewStage}
            onChange={(e) => setInterviewStage(e.target.value as InterviewStage)}
            disabled={loading}
          >
            <option value="none">No interviews (just applied)</option>
            <option value="phone_screen">Phone/Recruiter screen</option>
            <option value="technical">Technical interview(s)</option>
            <option value="onsite">Onsite/Multiple rounds</option>
            <option value="final_round">Final round</option>
          </select>
        </div>
        <div className="decoder-actions">
          <span className="char-count">{emailText.length}/10,000</span>
          <button
            className="btn btn-primary"
            onClick={handleDecode}
            disabled={loading || emailText.trim().length < 10}
          >
            {loading ? 'Decoding...' : 'Decode'}
          </button>
        </div>
        {error && <div className="error-message">{error}</div>}
      </div>

      {result && (
        <div className="decoder-results">
          <div className="result-header">
            <span className={`category-badge ${getCategoryColor(result.category)}`}>
              {result.category}
            </span>
            <span className="confidence">
              {Math.round(result.confidence * 100)}% confidence
            </span>
          </div>

          {/* Show contradictions prominently if any were detected */}
          {result.contradictions && result.contradictions.length > 0 && (
            <div className="result-section contradictions-section">
              <h3>Contradictions Detected</h3>
              <ul className="contradictions-list">
                {result.contradictions.map((contradiction, i) => (
                  <li key={i}>{contradiction}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ATS Assessment - Key insight about where filtering occurred */}
          {result.ats_assessment && (
            <div className="result-section ats-assessment">
              <h3>Where You Were Filtered</h3>
              <div className="ats-stage-indicator">
                <span className={`stage-badge ${getStageColor(result.ats_assessment.stage_reached)}`}>
                  {getStageLabel(result.ats_assessment.stage_reached)}
                </span>
                {result.ats_assessment.likely_ats_filtered && (
                  <span className="ats-filtered-badge">Before Human Review</span>
                )}
              </div>
              <p className="ats-reasoning">{result.ats_assessment.reasoning}</p>
              <div className="strategic-insight">
                <strong>Strategy:</strong> {result.ats_assessment.strategic_insight}
              </div>
            </div>
          )}

          <div className="result-section">
            <h3>What it means</h3>
            <p>{result.what_it_means}</p>
          </div>

          <div className="result-section">
            <h3>Signals detected</h3>
            <ul className="signals-list">
              {result.signals.map((signal, i) => (
                <li key={i}>{signal}</li>
              ))}
            </ul>
          </div>

          <div className="result-section">
            <h3>"We'll keep your resume on file" truth</h3>
            <p>{result.keep_on_file_truth}</p>
          </div>

          <div className="result-section">
            <h3>Worth replying?</h3>
            <span className={`reply-badge ${getReplyColor(result.reply_worth_it)}`}>
              {result.reply_worth_it}
            </span>
            {result.reply_worth_it === 'Low' && (
              <p className="reply-explanation">
                Don't waste your energy on a reply. Focus on new opportunities instead.
              </p>
            )}
          </div>

          <div className="result-section">
            <h3>Next actions</h3>
            <ul className="actions-list">
              {result.next_actions.map((action, i) => (
                <li key={i}>{action}</li>
              ))}
            </ul>
          </div>

          {/* Only show follow-up template if it exists and reply is worth it */}
          {result.follow_up_template && result.reply_worth_it !== 'Low' && (
            <div className="result-section">
              <h3>Follow-up template</h3>
              <div className="template-box">
                <pre>{result.follow_up_template}</pre>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => navigator.clipboard.writeText(result.follow_up_template)}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Show why no template if reply is Low */}
          {result.reply_worth_it === 'Low' && !result.follow_up_template && (
            <div className="result-section no-template-section">
              <h3>Why no follow-up template?</h3>
              <p>
                Based on the signals in this email, following up would likely be ineffective
                or could even make you look bad. The email may have come from an automated
                system, explicitly asked not to reply, or showed no genuine opening for
                future contact.
              </p>
            </div>
          )}

          {/* Link to existing application or add new */}
          {(onAddToTracker || onLinkToApplication) && (
            <div className="result-section tracker-actions">
              {linkResult ? (
                <div className="link-success">
                  <div className="link-success-header">Linked to {linkResult.company} - {linkResult.role}</div>
                  <ul className="link-changes">
                    <li>Status: {linkResult.previousOutcome} → <strong>{linkResult.newOutcome}</strong></li>
                    {linkResult.daysToResponse !== null && (
                      <li>Days to response: <strong>{linkResult.daysToResponse} days</strong></li>
                    )}
                  </ul>
                </div>
              ) : addedToTracker ? (
                <div className="success-message">
                  Added to Pro Tracker! Go to Pro Tracker tab to fill in details.
                </div>
              ) : (
                <div className="link-or-add">
                  {/* Link to existing application */}
                  {onLinkToApplication && linkableApps.length > 0 && (
                    <div className="link-to-app">
                      <label>Link to existing application:</label>
                      <div className="link-controls">
                        <select
                          value={selectedAppId}
                          onChange={(e) => setSelectedAppId(e.target.value)}
                        >
                          <option value="">Select application...</option>
                          {linkableApps.map(app => (
                            <option key={app.id} value={app.id}>
                              {app.company} - {app.role}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-primary"
                          onClick={handleLinkToApplication}
                          disabled={!selectedAppId}
                        >
                          Link
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Divider if both options available */}
                  {onLinkToApplication && linkableApps.length > 0 && onAddToTracker && (
                    <div className="or-divider">
                      <span>or</span>
                    </div>
                  )}

                  {/* Add as new application */}
                  {onAddToTracker && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleAddToTracker}
                    >
                      + Add as new application
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { categoryToOutcome, getOutcomeLabel };
export type { DecodedData, LinkResult };
