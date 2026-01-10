import { useState } from 'react';
import { DecodeResponse, ATSAssessment, InterviewStage } from '../types';
import { ApplicationRecord, SeniorityLevel } from '../types/pro';
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

// === EMAIL EXTRACTION LOGIC ===

interface ExtractedInfo {
  company: string | null;
  role: string | null;
  seniority: SeniorityLevel;
}

function extractFromEmail(emailText: string): ExtractedInfo {
  const text = emailText.trim();
  let company: string | null = null;
  let role: string | null = null;

  // Combined patterns for role + company
  const combinedPatterns = [
    // "for the Principal Researcher position at Nokia"
    /for the\s+([A-Za-z0-9\s\-\/&,]+?)\s+(?:position|role|opportunity)\s+(?:at|with)\s+([A-Z][A-Za-z0-9\s&.\-']+?)(?:\.|,|\s+We|\s+Thank|\s+After)/i,
    // "your application for Software Engineer at Google"
    /application\s+(?:for|to)\s+(?:the\s+)?([A-Za-z0-9\s\-\/&,]+?)\s+(?:position\s+)?(?:at|with)\s+([A-Z][A-Za-z0-9\s&.\-']+?)(?:\.|,|\s+We|\s+Thank|\s+After)/i,
    // "the Data Scientist role at McKinsey & Company"
    /the\s+([A-Za-z0-9\s\-\/&,]+?)\s+(?:role|position|opportunity)\s+(?:at|with)\s+([A-Z][A-Za-z0-9\s&.\-']+?)(?:\.|,|\s+We|\s+Thank|\s+After)/i,
    // "your interest in the Product Manager position at Stripe"
    /interest\s+in\s+(?:the\s+)?([A-Za-z0-9\s\-\/&,]+?)\s+(?:position|role|opportunity)\s+(?:at|with)\s+([A-Z][A-Za-z0-9\s&.\-']+?)(?:\.|,|\s+We|\s+Thank|\s+After)/i,
    // "regarding your application to Google for the Software Engineer role"
    /application\s+to\s+([A-Z][A-Za-z0-9\s&.\-']+?)\s+for\s+(?:the\s+)?([A-Za-z0-9\s\-\/&,]+?)(?:\s+role|\s+position)?(?:\.|,|\s+We|\s+Thank|\s+After)/i,
    // "thank you for interviewing for Senior Developer at Acme Corp"
    /interviewing\s+(?:for|with)\s+(?:the\s+)?([A-Za-z0-9\s\-\/&,]+?)\s+(?:position\s+)?(?:at|with)\s+([A-Z][A-Za-z0-9\s&.\-']+?)(?:\.|,|\s+We|\s+Thank|\s+After)/i,
    // "RE: Software Engineer - Google" or "Subject: Principal Researcher - Nokia"
    /(?:RE:|Subject:)\s*([A-Za-z0-9\s\-\/&,]+?)\s+-\s+([A-Z][A-Za-z0-9\s&.\-']+?)(?:\s|$)/i,
  ];

  for (const pattern of combinedPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      const extractedRole = cleanRole(match[1]);
      const extractedCompany = cleanCompany(match[2]);
      if (isValidRole(extractedRole) && isValidCompany(extractedCompany)) {
        role = extractedRole;
        company = extractedCompany;
        break;
      }
    }
  }

  // Fallback: company only
  if (!company) {
    const companyPatterns = [
      /(?:interest in|applying to|application to)\s+([A-Z][A-Za-z0-9\s&.\-']+?)(?:\.|,|\s+and|\s+We|\!)/i,
      /(?:recruitment|hiring|interview)\s+(?:process|team)\s+(?:for|at|with)\s+([A-Z][A-Za-z0-9\s&.\-']+?)(?:\.|,|\s+We)/i,
      /\bat\s+([A-Z][A-Za-z0-9\s&.\-']+?),?\s+we\b/i,
      /([A-Z][A-Za-z0-9\s&.\-']+?)\s+(?:Recruiting|Recruitment|Talent|People|HR|Hiring)\s+(?:Team|Organization|Department)/i,
    ];
    for (const pattern of companyPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const extractedCompany = cleanCompany(match[1]);
        if (isValidCompany(extractedCompany)) {
          company = extractedCompany;
          break;
        }
      }
    }
  }

  // Fallback: role only
  if (!role) {
    const rolePatterns = [
      /for\s+(?:the\s+)?([A-Za-z0-9\s\-\/&,]+?)\s+(?:position|role|opportunity)(?:\s+at|\.|,)/i,
      /the\s+([A-Za-z0-9\s\-\/&,]+?)\s+(?:role|position|opportunity)(?:\s+at|\.|,)/i,
    ];
    for (const pattern of rolePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const extractedRole = cleanRole(match[1]);
        if (isValidRole(extractedRole)) {
          role = extractedRole;
          break;
        }
      }
    }
  }

  return { company, role, seniority: inferSeniority(role) };
}

function cleanRole(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/^the\s+/i, '').replace(/\s+position$/i, '').replace(/\s+role$/i, '').trim();
}

function cleanCompany(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/[.,!]+$/, '').replace(/\s+(We|Thank|After|and).*$/i, '').trim();
}

function isValidRole(role: string): boolean {
  if (!role || role.length < 3 || role.length > 80) return false;
  const invalidStarts = [
    'the job', 'your', 'this', 'that', 'our', 'we ', 'after', 'thank',
    'unfortunately', 'however', 'please', 'regarding', 'following',
    'position from', 'role from', 'a position', 'an opportunity'
  ];
  const invalidContains = [
    'rejection', 'application', 'resume', 'cv', 'requirements',
    'qualifications', 'candidates', 'unfortunately', 'regret'
  ];
  const lowerRole = role.toLowerCase();
  for (const invalid of invalidStarts) {
    if (lowerRole.startsWith(invalid)) return false;
  }
  for (const invalid of invalidContains) {
    if (lowerRole.includes(invalid)) return false;
  }
  // Should contain role-like word or be short enough to be a title
  const roleKeywords = ['engineer', 'developer', 'scientist', 'analyst', 'manager', 'designer', 'researcher', 'director', 'lead', 'architect', 'consultant', 'specialist', 'coordinator', 'associate', 'intern', 'administrator', 'officer', 'head', 'vp', 'president', 'chief', 'executive', 'strategist', 'planner', 'writer', 'editor', 'producer', 'recruiter', 'buyer', 'agent', 'rep', 'sales', 'marketing', 'product', 'program', 'project'];
  const hasRoleKeyword = roleKeywords.some(keyword => lowerRole.includes(keyword));
  const isShortTitle = role.split(' ').length <= 4;
  return hasRoleKeyword || isShortTitle;
}

function isValidCompany(company: string): boolean {
  if (!company || company.length < 2 || company.length > 60) return false;
  const invalidCompanies = [
    'the job', 'the position', 'the role', 'this role', 'the company',
    'your application', 'the requirements', 'job requirements', 'the job requirements',
    'thank you', 'unfortunately', 'we regret', 'after careful', 'however',
    'we have', 'we are', 'at this time', 'other candidates', 'your resume',
    'your qualifications', 'your experience', 'your background', 'the team'
  ];
  const lowerCompany = company.toLowerCase();
  for (const invalid of invalidCompanies) {
    if (lowerCompany.includes(invalid)) return false;
  }
  if (!/^[A-Z]/.test(company)) return false;
  return true;
}

function inferSeniority(role: string | null): SeniorityLevel {
  if (!role) return 'mid';
  const lowerRole = role.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cio|chief)\b/.test(lowerRole)) return 'c-level';
  if (/\b(vp|vice\s*president)\b/.test(lowerRole)) return 'vp';
  if (/\bdirector\b/.test(lowerRole)) return 'director';
  if (/\b(principal|distinguished|fellow)\b/.test(lowerRole)) return 'principal';
  if (/\bstaff\b/.test(lowerRole)) return 'staff';
  if (/\b(senior|sr\.?|lead|head)\b/.test(lowerRole)) return 'senior';
  if (/\b(junior|jr\.?|associate|entry)\b/.test(lowerRole)) return 'junior';
  if (/\b(intern|internship|trainee|apprentice)\b/.test(lowerRole)) return 'intern';
  return 'mid';
}

// Map interview stage dropdown to outcome
function stageToOutcome(stage: InterviewStage): ApplicationRecord['outcome'] {
  switch (stage) {
    case 'none': return 'rejected_ats';
    case 'phone_screen': return 'rejected_recruiter';
    case 'technical': return 'rejected_hm';
    case 'onsite': return 'rejected_final';
    case 'final_round': return 'rejected_final';
    default: return 'rejected_ats';
  }
}

// Short label for outcome badge
function getShortOutcomeLabel(stage: InterviewStage): string {
  switch (stage) {
    case 'none': return 'ATS';
    case 'phone_screen': return 'Recruiter';
    case 'technical': return 'Technical';
    case 'onsite': return 'Final';
    case 'final_round': return 'Final';
    default: return 'ATS';
  }
}

interface DecodedData {
  result: DecodeResponse;
  emailText: string;
  companyName: string | null;
  roleName: string | null;
  seniority: SeniorityLevel;
  outcome: ApplicationRecord['outcome'];
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
  const [extracted, setExtracted] = useState<ExtractedInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedToTracker, setAddedToTracker] = useState(false);
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [editedCompany, setEditedCompany] = useState<string>('');
  const [editedRole, setEditedRole] = useState<string>('');

  // Filter to show only pending/interviewing applications (ones that could receive rejections)
  const linkableApps = applications.filter(app =>
    app.outcome === 'pending' || app.outcome === 'ghosted'
  );

  // Detect if text looks like a job description rather than a rejection email
  const looksLikeJobDescription = (text: string): boolean => {
    const lower = text.toLowerCase();
    const jdIndicators = [
      'responsibilities:', 'qualifications:', 'requirements:',
      'about the role', 'what you\'ll do', 'what we\'re looking for',
      'years of experience', 'bachelor\'s degree', 'must have',
      'nice to have', 'benefits:', 'compensation:', 'salary range',
      'apply now', 'job description', 'about us', 'we are looking for',
      'join our team', 'this position', 'the ideal candidate'
    ];
    const rejectionIndicators = [
      'unfortunately', 'regret to inform', 'not moving forward',
      'other candidates', 'decided not to', 'thank you for applying',
      'after careful', 'we will not', 'position has been filled',
      'not selected', 'moved forward with', 'appreciate your interest'
    ];

    const jdScore = jdIndicators.filter(ind => lower.includes(ind)).length;
    const rejectionScore = rejectionIndicators.filter(ind => lower.includes(ind)).length;

    return jdScore >= 2 && rejectionScore < 2;
  };

  const handleDecode = async () => {
    if (emailText.trim().length < 10) {
      setError('Please enter at least 10 characters');
      return;
    }

    // Detect if user pasted a JD instead of rejection email
    if (looksLikeJobDescription(emailText)) {
      setError('This looks like a job description, not a rejection email. Try the JD Check tab instead.');
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
    setExtracted(null);
    setAddedToTracker(false);
    setLinkResult(null);
    setSelectedAppId('');
    setShowUpgrade(false);

    // Extract company/role while waiting for API
    const extractedInfo = extractFromEmail(emailText);
    setExtracted(extractedInfo);
    // Initialize editable fields with extracted values (or empty for user to fill)
    setEditedCompany(extractedInfo.company || '');
    setEditedRole(extractedInfo.role || '');

    const response = await decodeEmail(emailText, interviewStage);

    setLoading(false);

    if (response.error) {
      setError(response.error);
    } else if (response.data) {
      setResult(response.data);
      // Increment usage only on successful decode
      incrementUsage('decodes_per_month');

      // Prefer AI-extracted company/role over local regex extraction
      const aiCompany = response.data.extracted_company?.trim();
      const aiRole = response.data.extracted_role?.trim();

      // Update extracted info with AI values if available
      if (aiCompany || aiRole) {
        const updatedExtracted = {
          company: aiCompany || extractedInfo.company,
          role: aiRole || extractedInfo.role,
          seniority: aiRole ? inferSeniority(aiRole) : extractedInfo.seniority
        };
        setExtracted(updatedExtracted);
        setEditedCompany(updatedExtracted.company || '');
        setEditedRole(updatedExtracted.role || '');
      }

      // Try to auto-match with an existing application by company name (fuzzy)
      const companyToMatch = aiCompany || extractedInfo.company;
      if (companyToMatch && linkableApps.length > 0) {
        const normalizedExtracted = normalizeCompany(companyToMatch);
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

  const handleAddToTrackerClick = () => {
    if (result && onAddToTracker && extracted) {
      const outcome = stageToOutcome(interviewStage);
      // Use edited values (which may have been modified by user)
      const finalCompany = editedCompany.trim() || 'Unknown Company';
      const finalRole = editedRole.trim() || 'Position from rejection email';
      onAddToTracker({
        result,
        emailText,
        companyName: finalCompany,
        roleName: finalRole,
        seniority: extracted.seniority,
        outcome
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
          {/* Extracted info banner - editable when unknown */}
          {extracted && (
            <div className="extracted-info">
              {extracted.company ? (
                <span className="extracted-company">{extracted.company}</span>
              ) : (
                <input
                  type="text"
                  className="extracted-company-input"
                  value={editedCompany}
                  onChange={(e) => setEditedCompany(e.target.value)}
                  placeholder="Enter company name"
                />
              )}
              <span className="extracted-separator">—</span>
              {extracted.role ? (
                <span className="extracted-role">{extracted.role}</span>
              ) : (
                <input
                  type="text"
                  className="extracted-role-input"
                  value={editedRole}
                  onChange={(e) => setEditedRole(e.target.value)}
                  placeholder="Enter role"
                />
              )}
              <span className="extracted-seniority">{extracted.seniority}</span>
            </div>
          )}

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
              <h3>Where you got filtered</h3>
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

          {/* Silver lining - something positive */}
          {result.silver_lining && (
            <div className="result-section silver-lining">
              <h3>Silver lining</h3>
              <p>{result.silver_lining}</p>
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
                  Added: {editedCompany || 'Unknown'} — {editedRole || 'Role from email'}
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
                    <div className="add-new-section">
                      <button
                        className="btn btn-secondary"
                        onClick={handleAddToTrackerClick}
                      >
                        + Add: {editedCompany || 'Unknown'} — {editedRole || 'Role'}
                      </button>
                      <span className={`outcome-preview outcome-${stageToOutcome(interviewStage)}`}>
                        Stage: {getShortOutcomeLabel(interviewStage)}
                      </span>
                    </div>
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
