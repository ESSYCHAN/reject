import { useState, useEffect } from 'react';
import { RejectionDecoder, DecodedData, LinkResult, getOutcomeLabel } from './components/RejectionDecoder';
import { ATSAssessment } from './types';
import { ProTracker } from './components/ProTracker';
import { ProInsightsV2 } from './components/ProInsightsV2';
import { JDAnalyzer } from './components/JDAnalyzer';
import { FAQ } from './components/FAQ';
import { AccountPage } from './components/AccountPage';
import { EmailCapture } from './components/EmailCapture';
import { AuthButtons, useAuth, syncUserToServer } from './components/AuthButtons';
import { LandingHero, PromoStrip } from './components/LandingHero';
import MayaLanding from './components/MayaLanding';
import { DecodeResponse } from './types';
import { ApplicationRecord } from './types/pro';
import { setProStatus, syncProStatusFromServer, loadUsage } from './utils/usage';
import { useApplicationsSync } from './hooks/useApplicationsSync';
import './App.css';

type Tab = 'decoder' | 'pro-tracker' | 'insights' | 'jd-check' | 'maya' | 'faq' | 'account';

// Check if user has used the app before
function hasUsedAppBefore(): boolean {
  const usage = loadUsage();
  // User has interacted if they've decoded anything or have applications
  return usage.decodes_per_month > 0 || usage.applications > 0;
}

function App() {
  const { isSignedIn, email } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('maya');
  const [showProWelcome, setShowProWelcome] = useState(false);
  const [showLanding, setShowLanding] = useState(() => !hasUsedAppBefore());

  // Use cloud-synced applications
  const {
    applications: proApplications,
    saveApplication,
    updateApplications,
    isSyncing
  } = useApplicationsSync();

  // Check for successful payment redirect from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      // Mark as Pro in localStorage
      setProStatus(true);
      setShowProWelcome(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      // Hide welcome after 5 seconds
      setTimeout(() => setShowProWelcome(false), 5000);
    }
  }, []);

  // Sync user to database and check Pro status when signed in
  // Run on mount AND when isSignedIn changes to catch stale localStorage
  useEffect(() => {
    if (isSignedIn) {
      // First sync user to database (passing email), then check Pro status
      syncUserToServer(email)
        .then(() => syncProStatusFromServer())
        .then(isPro => {
          console.log('Pro status synced from server:', isPro);
          // Always dispatch event so components update
          window.dispatchEvent(new CustomEvent('pro-status-synced', { detail: { isPro } }));
        })
        .catch(err => {
          console.error('Failed to sync user/pro status:', err);
        });
    }
  }, [isSignedIn, email]);

  // Force sync Pro status on every page load (not just sign-in state change)
  useEffect(() => {
    if (isSignedIn) {
      // Small delay to ensure auth is ready
      const timer = setTimeout(() => {
        syncProStatusFromServer().then(isPro => {
          console.log('Force Pro sync on load:', isPro);
          window.dispatchEvent(new CustomEvent('pro-status-synced', { detail: { isPro } }));
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []); // Empty deps = run once on mount

  const handleProApplicationsChange = (apps: ApplicationRecord[]) => {
    updateApplications(apps);
  };

  const handleAddToTracker = (data: DecodedData) => {
    // Create a new application record from decoded rejection
    // Now using extracted role, seniority, and stage-based outcome
    const newApp: ApplicationRecord = {
      id: crypto.randomUUID(),
      company: data.companyName || 'Unknown Company',
      role: data.roleName || 'Position from rejection email',
      seniorityLevel: data.seniority,
      companySize: 'mid',
      industry: '',
      source: 'other',
      dateApplied: new Date().toISOString().split('T')[0],
      outcome: data.outcome,
      daysToResponse: null,
      // Store the rejection analysis so users can view it later
      rejectionAnalysis: {
        category: data.result.category,
        confidence: data.result.confidence,
        signals: data.result.signals,
        replyWorthIt: data.result.reply_worth_it,
        decodedAt: new Date().toISOString(),
        // New insightful fields from ATS assessment
        stageReached: data.result.ats_assessment?.stage_reached,
        likelyAtsFiltered: data.result.ats_assessment?.likely_ats_filtered,
        strategicInsight: data.result.ats_assessment?.strategic_insight,
        nextActions: data.result.next_actions,
        whatItMeans: data.result.what_it_means
      }
    };

    // Save using sync hook (handles both local and server)
    saveApplication(newApp);

    // Switch to Pro Tracker tab to show the new entry
    setActiveTab('pro-tracker');
  };

  // Map AI-detected ATS stage to outcome
  const atsStageToOutcome = (stage: ATSAssessment['stage_reached']): ApplicationRecord['outcome'] => {
    switch (stage) {
      case 'ats_filter': return 'rejected_ats';
      case 'recruiter_screen': return 'rejected_recruiter';
      case 'hiring_manager': return 'rejected_hm';
      case 'final_round': return 'rejected_final';
      case 'unknown': return 'rejected_ats';
      default: return 'rejected_ats';
    }
  };

  // Link a rejection analysis to an existing application
  const handleLinkToApplication = (applicationId: string, result: DecodeResponse): LinkResult | null => {
    // Find the application to get previous state
    const app = proApplications.find(a => a.id === applicationId);
    if (!app) return null;

    const previousOutcome = getOutcomeLabel(app.outcome);
    // Use AI-detected stage if available for accurate outcome
    const newOutcome = result.ats_assessment?.stage_reached
      ? atsStageToOutcome(result.ats_assessment.stage_reached)
      : 'rejected_ats';
    const daysToResponse = app.dateApplied
      ? Math.floor((Date.now() - new Date(app.dateApplied).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const updatedApp = {
      ...app,
      outcome: newOutcome,
      daysToResponse,
      // Store the rejection analysis with the application
      rejectionAnalysis: {
        category: result.category,
        confidence: result.confidence,
        signals: result.signals,
        replyWorthIt: result.reply_worth_it,
        decodedAt: new Date().toISOString(),
        // New insightful fields from ATS assessment
        stageReached: result.ats_assessment?.stage_reached,
        likelyAtsFiltered: result.ats_assessment?.likely_ats_filtered,
        strategicInsight: result.ats_assessment?.strategic_insight,
        nextActions: result.next_actions,
        whatItMeans: result.what_it_means
      }
    };

    // Save updated app using sync hook
    saveApplication(updatedApp);

    return {
      company: app.company,
      role: app.role,
      previousOutcome,
      newOutcome: getOutcomeLabel(newOutcome),
      daysToResponse
    };
  };

  // Add application from JD Analyzer (pre-filled from job description)
  const handleAddFromJD = (appData: Omit<ApplicationRecord, 'id'>) => {
    const newApp: ApplicationRecord = {
      ...appData,
      id: crypto.randomUUID()
    };

    // Save using sync hook
    saveApplication(newApp);

    // Switch to Tracker tab
    setActiveTab('pro-tracker');
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1 className="logo" onClick={() => setActiveTab('maya')} style={{ cursor: 'pointer' }}>REJECT</h1>
          <nav className="nav">
            <button
              className={`nav-btn ${activeTab === 'jd-check' ? 'active' : ''}`}
              onClick={() => setActiveTab('jd-check')}
            >
              Job Check
            </button>
            <button
              className={`nav-btn ${activeTab === 'pro-tracker' ? 'active' : ''}`}
              onClick={() => setActiveTab('pro-tracker')}
            >
              Tracker {isSyncing && <span className="sync-indicator">...</span>}
            </button>
            <button
              className={`nav-btn ${activeTab === 'decoder' ? 'active' : ''}`}
              onClick={() => setActiveTab('decoder')}
            >
              Decode
            </button>
            <button
              className={`nav-btn ${activeTab === 'insights' ? 'active' : ''}`}
              onClick={() => setActiveTab('insights')}
            >
              Patterns
            </button>
            <button
              className={`nav-btn nav-btn-maya ${activeTab === 'maya' ? 'active' : ''}`}
              onClick={() => setActiveTab('maya')}
            >
              <span className="maya-icon">💬</span> Maya
            </button>
          </nav>
          <AuthButtons onAccountClick={() => setActiveTab('account')} />
        </div>
      </header>

      <main className="main">
        <div className="container">
          {showProWelcome && (
            <div className="pro-welcome-banner">
              Welcome to Pro! You now have unlimited access to all features.
            </div>
          )}

          {/* Show landing hero for first-time visitors on decoder tab (not when signed in) */}
          {showLanding && activeTab === 'decoder' && !isSignedIn && (
            <>
              <LandingHero
                onGetStarted={() => setShowLanding(false)}
                onCheckFit={() => { setShowLanding(false); setActiveTab('jd-check'); }}
                onTrackApp={() => { setShowLanding(false); setActiveTab('pro-tracker'); }}
                onAICoach={() => { setShowLanding(false); setActiveTab('maya'); }}
              />
              <PromoStrip />
            </>
          )}

          {activeTab === 'decoder' && (
            <RejectionDecoder
              onAddToTracker={handleAddToTracker}
              onLinkToApplication={handleLinkToApplication}
              applications={proApplications}
            />
          )}
          {activeTab === 'pro-tracker' && (
            <ProTracker onApplicationsChange={handleProApplicationsChange} />
          )}
          {activeTab === 'insights' && <ProInsightsV2 applications={proApplications} />}
          {activeTab === 'jd-check' && <JDAnalyzer onAddToTracker={handleAddFromJD} />}
          {activeTab === 'maya' && <MayaLanding />}
          {activeTab === 'faq' && <FAQ />}
          {activeTab === 'account' && <AccountPage />}
        </div>
      </main>

      {/* Only show newsletter signup for non-authenticated visitors */}
      {!isSignedIn && <EmailCapture />}

      <footer className="footer">
        <button
          className="footer-link"
          onClick={() => setActiveTab('faq')}
        >
          FAQ
        </button>
        <p>REJECT &mdash; Decode what hiring systems don't tell you.</p>
        <a href="mailto:info@tryreject.co.uk" className="footer-email">info@tryreject.co.uk</a>
      </footer>
    </div>
  );
}

export default App;
