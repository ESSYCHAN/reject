import { useState, useEffect } from 'react';
import { RejectionDecoder, DecodedData, LinkResult, categoryToOutcome, getOutcomeLabel } from './components/RejectionDecoder';
import { ProTracker } from './components/ProTracker';
import { ProInsightsV2 } from './components/ProInsightsV2';
import { JDAnalyzer } from './components/JDAnalyzer';
import { FAQ } from './components/FAQ';
import { EmailCapture } from './components/EmailCapture';
import { AuthButtons, useAuth } from './components/AuthButtons';
import { LandingHero, PromoStrip } from './components/LandingHero';
import { DecodeResponse } from './types';
import { ApplicationRecord } from './types/pro';
import { setProStatus, syncProStatusFromServer, loadUsage } from './utils/usage';
import './App.css';

type Tab = 'decoder' | 'pro-tracker' | 'insights' | 'jd-check' | 'faq';

// Check if user has used the app before
function hasUsedAppBefore(): boolean {
  const usage = loadUsage();
  // User has interacted if they've decoded anything or have applications
  return usage.decodes_per_month > 0 || usage.applications > 0;
}

function App() {
  const { isSignedIn } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('decoder');
  const [showProWelcome, setShowProWelcome] = useState(false);
  const [showLanding, setShowLanding] = useState(() => !hasUsedAppBefore());

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

  // Sync Pro status from server when user is signed in
  // This ensures payment is reflected even if redirect failed
  useEffect(() => {
    if (isSignedIn) {
      syncProStatusFromServer().then(isPro => {
        if (isPro && !showProWelcome) {
          // User is Pro but didn't come from payment redirect - silently update
          console.log('Pro status verified from server');
        }
      });
    }
  }, [isSignedIn]);
  const [proApplications, setProApplications] = useState<ApplicationRecord[]>(() => {
    try {
      const stored = localStorage.getItem('reject_pro_applications');
      if (!stored) return [];
      return JSON.parse(stored).applications || [];
    } catch {
      return [];
    }
  });

  const handleProApplicationsChange = (apps: ApplicationRecord[]) => {
    setProApplications(apps);
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

    // Get existing applications and add new one
    const STORAGE_KEY = 'reject_pro_applications';
    let existingApps: ApplicationRecord[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        existingApps = data.applications || [];
      }
    } catch {
      existingApps = [];
    }

    const updatedApps = [newApp, ...existingApps];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, applications: updatedApps }));
    setProApplications(updatedApps);

    // Switch to Pro Tracker tab to show the new entry
    setActiveTab('pro-tracker');
  };

  // Link a rejection analysis to an existing application
  const handleLinkToApplication = (applicationId: string, result: DecodeResponse): LinkResult | null => {
    const STORAGE_KEY = 'reject_pro_applications';

    // Find the application to get previous state
    const app = proApplications.find(a => a.id === applicationId);
    if (!app) return null;

    const previousOutcome = getOutcomeLabel(app.outcome);
    const newOutcome = categoryToOutcome(result.category, result.signals);
    const daysToResponse = app.dateApplied
      ? Math.floor((Date.now() - new Date(app.dateApplied).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const updatedApps = proApplications.map(a => {
      if (a.id === applicationId) {
        return {
          ...a,
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
      }
      return a;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, applications: updatedApps }));
    setProApplications(updatedApps);

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
    const STORAGE_KEY = 'reject_pro_applications';
    const newApp: ApplicationRecord = {
      ...appData,
      id: crypto.randomUUID()
    };

    const updatedApps = [newApp, ...proApplications];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, applications: updatedApps }));
    setProApplications(updatedApps);

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
              Tracker
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
            <button
              className={`nav-btn ${activeTab === 'faq' ? 'active' : ''}`}
              onClick={() => setActiveTab('faq')}
            >
              FAQ
            </button>
          </nav>
          <AuthButtons />
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
        </div>
      </main>

      {/* Only show newsletter signup for non-authenticated visitors */}
      {!isSignedIn && <EmailCapture />}

      <footer className="footer">
        <p>REJECT &mdash; Decode what hiring systems don't tell you.</p>
      </footer>
    </div>
  );
}

export default App;
