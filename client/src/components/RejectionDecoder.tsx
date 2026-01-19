import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { DecodeResponse, ATSAssessment, InterviewStage } from '../types';
import { ApplicationRecord, SeniorityLevel } from '../types/pro';
import { decodeEmail } from '../utils/api';
import { canUseFeature, incrementUsage, loadUsage } from '../utils/usage';
import { UpgradePrompt, LimitWarning } from './UpgradePrompt';
import { SignupPrompt, useSignupPrompt } from './SignupPrompt';

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

// Map AI-detected ATS stage to outcome (preferred over dropdown)
function atsStageToOutcome(stage: ATSAssessment['stage_reached']): ApplicationRecord['outcome'] {
  switch (stage) {
    case 'ats_filter': return 'rejected_ats';
    case 'recruiter_screen': return 'rejected_recruiter';
    case 'hiring_manager': return 'rejected_hm';
    case 'final_round': return 'rejected_final';
    case 'unknown': return 'rejected_ats';
    default: return 'rejected_ats';
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
  const { isSignedIn } = useAuth();
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
  const [matchingAppIds, setMatchingAppIds] = useState<string[]>([]);
  const [companyIntel, setCompanyIntel] = useState<{
    totalSamples: number;
    rejectionCategories: { category: string; count: number; percentage: number }[];
    atsStages: { stage: string; count: number; percentage: number }[];
    topSignals: { signal: string; count: number }[];
  } | null>(null);
  const [companyIntelLoading, setCompanyIntelLoading] = useState(false);

  // Signup prompt state
  const { shouldShow: shouldShowSignup, dismiss: dismissSignup } = useSignupPrompt();
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [decodeCount, setDecodeCount] = useState(() => loadUsage().decodes_per_month);

  // Filter to show only applied/interviewing/ghosted applications (ones that could receive rejections)
  const linkableApps = applications.filter(app =>
    app.outcome === 'applied' || app.outcome === 'interviewing' || app.outcome === 'ghosted'
  );

  // Listen for Pro status sync to clear upgrade prompt if user just became Pro
  useEffect(() => {
    const handleProSync = (event: CustomEvent<{ isPro: boolean }>) => {
      if (event.detail.isPro && showUpgrade) {
        setShowUpgrade(false);
      }
    };
    window.addEventListener('pro-status-synced', handleProSync as EventListener);
    return () => {
      window.removeEventListener('pro-status-synced', handleProSync as EventListener);
    };
  }, [showUpgrade]);

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
      setError('This looks like a job description, not a rejection email. Try the Check Fit tab instead.');
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
      const newCount = loadUsage().decodes_per_month;
      setDecodeCount(newCount);

      // Show signup prompt after threshold reached
      if (shouldShowSignup(newCount, isSignedIn || false)) {
        // Delay slightly so user sees their result first
        setTimeout(() => setShowSignupPrompt(true), 1500);
      }

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

      // Try to auto-match with existing applications by company name (fuzzy)
      const companyToMatch = aiCompany || extractedInfo.company;
      if (companyToMatch && linkableApps.length > 0) {
        const normalizedExtracted = normalizeCompany(companyToMatch);
        const matches = linkableApps.filter(app => {
          const normalizedApp = normalizeCompany(app.company);
          return normalizedApp === normalizedExtracted ||
            normalizedApp.includes(normalizedExtracted) ||
            normalizedExtracted.includes(normalizedApp);
        });

        if (matches.length > 0) {
          setMatchingAppIds(matches.map(m => m.id));
          // Auto-select only if there's exactly one match
          if (matches.length === 1) {
            setSelectedAppId(matches[0].id);
          }
        }
      }

      // Fetch company intel from knowledge base (preview mode for early stage)
      if (companyToMatch) {
        setCompanyIntelLoading(true);
        setCompanyIntel(null);
        try {
          const intelResponse = await fetch(`/api/knowledge/company/${encodeURIComponent(companyToMatch)}?preview=true`);
          const intelData = await intelResponse.json();
          if (intelData.data) {
            setCompanyIntel(intelData.data);
          }
        } catch (err) {
          console.error('Failed to fetch company intel:', err);
        } finally {
          setCompanyIntelLoading(false);
        }
      }
    }
  };

  const handleAddToTrackerClick = () => {
    if (result && onAddToTracker && extracted) {
      // Use AI-detected stage if available, otherwise fall back to dropdown
      const outcome = result.ats_assessment?.stage_reached
        ? atsStageToOutcome(result.ats_assessment.stage_reached)
        : stageToOutcome(interviewStage);
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

  const handleDismissSignup = () => {
    setShowSignupPrompt(false);
    dismissSignup();
  };

  return (
    <div className="decoder">
      <LimitWarning action="decodes_per_month" />

      {/* Signup prompt modal */}
      {showSignupPrompt && (
        <SignupPrompt
          decodeCount={decodeCount}
          onDismiss={handleDismissSignup}
          variant="modal"
        />
      )}
      <div className="decoder-input">
        <div className="interview-stage-section interview-stage-prominent">
          <div className="stage-question">
            <span className="stage-question-icon">💬</span>
            <span className="stage-question-text">Did you have any interviews for this role?</span>
          </div>
          <div className="stage-options">
            <button
              type="button"
              className={`stage-option ${interviewStage === 'none' ? 'active' : ''}`}
              onClick={() => setInterviewStage('none')}
              disabled={loading}
            >
              <span className="option-number">1</span>
              <span className="option-label">No interviews</span>
              <span className="option-desc">Just applied</span>
            </button>
            <button
              type="button"
              className={`stage-option ${interviewStage === 'phone_screen' ? 'active' : ''}`}
              onClick={() => setInterviewStage('phone_screen')}
              disabled={loading}
            >
              <span className="option-number">2</span>
              <span className="option-label">Recruiter call</span>
              <span className="option-desc">Phone screen</span>
            </button>
            <button
              type="button"
              className={`stage-option ${interviewStage === 'technical' ? 'active' : ''}`}
              onClick={() => setInterviewStage('technical')}
              disabled={loading}
            >
              <span className="option-number">3</span>
              <span className="option-label">Technical</span>
              <span className="option-desc">Coding/skills test</span>
            </button>
            <button
              type="button"
              className={`stage-option ${interviewStage === 'onsite' ? 'active' : ''}`}
              onClick={() => setInterviewStage('onsite')}
              disabled={loading}
            >
              <span className="option-number">4</span>
              <span className="option-label">Onsite</span>
              <span className="option-desc">Panel rounds</span>
            </button>
            <button
              type="button"
              className={`stage-option ${interviewStage === 'final_round' ? 'active' : ''}`}
              onClick={() => setInterviewStage('final_round')}
              disabled={loading}
            >
              <span className="option-number">5</span>
              <span className="option-label">Final round</span>
              <span className="option-desc">Last stage</span>
            </button>
          </div>
          <span className="stage-hint">This helps us understand where in the process you were rejected</span>
        </div>
        <h2>Paste your rejection email</h2>
        <textarea
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          placeholder="Paste the rejection email here..."
          rows={10}
          maxLength={10000}
          disabled={loading}
        />
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

          {/* Company Intel from Knowledge Base */}
          {(companyIntel || companyIntelLoading) && extracted?.company && (
            <div className="result-section company-intel">
              <h3>Company Intel: {extracted.company}</h3>
              {companyIntelLoading ? (
                <p className="intel-loading">Loading community insights...</p>
              ) : companyIntel ? (
                <div className="intel-content">
                  <p className="intel-samples">Based on {companyIntel.totalSamples} decoded rejection{companyIntel.totalSamples !== 1 ? 's' : ''} from this company</p>

                  {companyIntel.atsStages.length > 0 && (
                    <div className="intel-section">
                      <strong>Where others got filtered:</strong>
                      <div className="intel-bars">
                        {companyIntel.atsStages.slice(0, 3).map((stage, i) => (
                          <div key={i} className="intel-bar-item">
                            <span className="intel-bar-label">{getStageLabel(stage.stage as ATSAssessment['stage_reached'])}</span>
                            <div className="intel-bar">
                              <div className="intel-bar-fill" style={{ width: `${stage.percentage}%` }}></div>
                            </div>
                            <span className="intel-bar-pct">{stage.percentage}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {companyIntel.topSignals.length > 0 && (
                    <div className="intel-section">
                      <strong>Common phrases in rejections:</strong>
                      <ul className="intel-signals">
                        {companyIntel.topSignals.slice(0, 3).map((sig, i) => (
                          <li key={i}>"{sig.signal}" <span className="signal-count">({sig.count}×)</span></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {companyIntel.totalSamples < 5 && (
                    <p className="intel-note">More data needed for reliable patterns. Keep decoding to help build the knowledge base!</p>
                  )}
                </div>
              ) : null}
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
            <h3>Key phrases we spotted</h3>
            <ul className="signals-list">
              {result.signals.map((phrase, i) => (
                <li key={i}>{phrase}</li>
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
                Based on what we found in this email, following up would likely be ineffective
                or could even make you look bad. The email may have come from an automated
                system, explicitly asked not to reply, or showed no genuine opening for
                future contact.
              </p>
            </div>
          )}

          {/* TRACK THIS REJECTION - At bottom after full analysis */}
          {(onAddToTracker || onLinkToApplication) && !addedToTracker && !linkResult && (
            <div className="result-section tracker-cta-section">
              <div className="tracker-cta-header">
                <h3>Track this rejection</h3>
                <p className="tracker-cta-subtitle">
                  Building a record helps you spot patterns and improve your strategy
                </p>
              </div>

              <div className="tracker-cta-content">
                {/* Show extracted company/role */}
                <div className="extracted-info-display">
                  <div className="extracted-item">
                    <span className="extracted-label">Company</span>
                    <input
                      type="text"
                      value={editedCompany}
                      onChange={(e) => setEditedCompany(e.target.value)}
                      placeholder="Company name"
                      className="extracted-input"
                    />
                  </div>
                  <div className="extracted-item">
                    <span className="extracted-label">Role</span>
                    <input
                      type="text"
                      value={editedRole}
                      onChange={(e) => setEditedRole(e.target.value)}
                      placeholder="Job title"
                      className="extracted-input"
                    />
                  </div>
                </div>

                {/* Link to existing OR add new - prioritize linking when match found */}
                <div className="tracker-cta-actions">
                  {onLinkToApplication && linkableApps.length > 0 && (
                    <div className="link-existing-compact">
                      {matchingAppIds.length === 1 && selectedAppId && (
                        <span className="match-found-badge">Match found!</span>
                      )}
                      {matchingAppIds.length > 1 && (
                        <span className="match-found-badge multiple">{matchingAppIds.length} matches - pick one</span>
                      )}
                      <select
                        value={selectedAppId}
                        onChange={(e) => setSelectedAppId(e.target.value)}
                        className={`link-select ${matchingAppIds.length > 0 ? 'has-match' : ''}`}
                      >
                        <option value="">Link to existing...</option>
                        {/* Show matching apps first */}
                        {matchingAppIds.length > 1 && linkableApps
                          .filter(app => matchingAppIds.includes(app.id))
                          .map(app => (
                            <option key={app.id} value={app.id}>
                              ★ {app.company} - {app.role}
                            </option>
                          ))
                        }
                        {/* Show non-matching apps */}
                        {linkableApps
                          .filter(app => !matchingAppIds.includes(app.id) || matchingAppIds.length <= 1)
                          .map(app => (
                            <option key={app.id} value={app.id}>
                              {matchingAppIds.includes(app.id) ? '★ ' : ''}{app.company} - {app.role}
                            </option>
                          ))
                        }
                      </select>
                      {selectedAppId && (
                        <button
                          className="btn btn-primary"
                          onClick={handleLinkToApplication}
                        >
                          Link Rejection
                        </button>
                      )}
                    </div>
                  )}

                  {/* Only show "Add to Tracker" if NO match was found */}
                  {onAddToTracker && matchingAppIds.length === 0 && (
                    <button
                      className="btn btn-primary btn-add-tracker"
                      onClick={handleAddToTrackerClick}
                    >
                      + Add to Tracker
                    </button>
                  )}

                  {/* Show secondary "Add as new" option if match exists but user wants to add anyway */}
                  {onAddToTracker && matchingAppIds.length > 0 && (
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={handleAddToTrackerClick}
                      title="Add as a separate application (not linked to match)"
                    >
                      Add as new
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Show success message after tracking */}
          {(addedToTracker || linkResult) && (
            <div className="result-section tracker-success-section">
              {linkResult ? (
                <div className="tracker-success">
                  <span className="success-icon">✓</span>
                  <div className="success-details">
                    <strong>Linked to {linkResult.company} - {linkResult.role}</strong>
                    <span className="outcome-change">
                      {linkResult.previousOutcome} → {linkResult.newOutcome}
                      {linkResult.daysToResponse !== null && ` (${linkResult.daysToResponse} days)`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="tracker-success">
                  <span className="success-icon">✓</span>
                  <div className="success-details">
                    <strong>Added: {editedCompany || 'Unknown'} — {editedRole || 'Role'}</strong>
                    <span className="outcome-change">View in Tracker tab</span>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export { getOutcomeLabel };
export type { DecodedData, LinkResult };
