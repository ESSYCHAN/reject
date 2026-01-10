import { useState, useEffect } from 'react';
import { RejectionDecoder, DecodedData, LinkResult, categoryToOutcome, getOutcomeLabel } from './components/RejectionDecoder';
import { ProTracker } from './components/ProTracker';
import { ProInsightsV2 } from './components/ProInsightsV2';
import { JDAnalyzer } from './components/JDAnalyzer';
import { FAQ } from './components/FAQ';
import { SubscriptionManager } from './components/SubscriptionManager';
import { EmailCapture } from './components/EmailCapture';
import { AuthButtons, useAuth, syncUserToServer } from './components/AuthButtons';
import { LandingHero, PromoStrip } from './components/LandingHero';
import { DecodeResponse } from './types';
import { ApplicationRecord } from './types/pro';
import { setProStatus, syncProStatusFromServer, loadUsage } from './utils/usage';
import { useApplicationsSync } from './hooks/useApplicationsSync';
import './App.css';

type Tab = 'decoder' | 'pro-tracker' | 'insights' | 'jd-check' | 'faq' | 'account';

// Check if user has used the app before
function hasUsedAppBefore(): boolean {
  const usage = loadUsage();
  // User has interacted if they've decoded anything or have applications
  return usage.decodes_per_month > 0 || usage.applications > 0;
}

function App() {
  const { isSignedIn, email } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('decoder');
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
      daysToResponse: null
    };

    // Save using sync hook (handles both local and server)
    saveApplication(newApp);

    // Switch to Pro Tracker tab to show the new entry
    setActiveTab('pro-tracker');
  };

  // Link a rejection analysis to an existing application
  const handleLinkToApplication = (applicationId: string, result: DecodeResponse): LinkResult | null => {
    // Find the application to get previous state
    const app = proApplications.find(a => a.id === applicationId);
    if (!app) return null;

    const previousOutcome = getOutcomeLabel(app.outcome);
    const newOutcome = categoryToOutcome(result.category, result.signals);
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
        decodedAt: new Date().toISOString()
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
          <h1 className="logo">REJECT</h1>
          <nav className="nav">
            <button
              className={`nav-btn ${activeTab === 'decoder' ? 'active' : ''}`}
              onClick={() => setActiveTab('decoder')}
            >
              Decoder
            </button>
            <button
              className={`nav-btn ${activeTab === 'pro-tracker' ? 'active' : ''}`}
              onClick={() => setActiveTab('pro-tracker')}
            >
              Tracker {isSyncing && <span className="sync-indicator">...</span>}
            </button>
            <button
              className={`nav-btn pro ${activeTab === 'insights' ? 'active' : ''}`}
              onClick={() => setActiveTab('insights')}
            >
              Insights
            </button>
            <button
              className={`nav-btn pro ${activeTab === 'jd-check' ? 'active' : ''}`}
              onClick={() => setActiveTab('jd-check')}
            >
              JD Check
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

          {/* Show landing hero for first-time visitors on decoder tab */}
          {showLanding && activeTab === 'decoder' && (
            <>
              <LandingHero onGetStarted={() => setShowLanding(false)} />
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
          {activeTab === 'faq' && <FAQ />}
          {activeTab === 'account' && (
            <div className="account-page">
              <h2>Account Settings</h2>
              <SubscriptionManager />
            </div>
          )}
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
