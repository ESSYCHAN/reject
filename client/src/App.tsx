import { useState, useEffect } from 'react';
import { RejectionDecoder, DecodedData, LinkResult, categoryToOutcome, getOutcomeLabel } from './components/RejectionDecoder';
import { Tracker } from './components/Tracker';
import { ProTracker } from './components/ProTracker';
import { ProInsightsV2 } from './components/ProInsightsV2';
import { RoleFitChecker } from './components/RoleFitChecker';
import { FAQ } from './components/FAQ';
import { EmailCapture } from './components/EmailCapture';
import { AuthButtons, useAuth } from './components/AuthButtons';
import { DecodeResponse } from './types';
import { ApplicationRecord, Outcome } from './types/pro';
import { setProStatus } from './utils/usage';
import './App.css';

type Tab = 'decoder' | 'tracker' | 'pro-tracker' | 'insights' | 'role-fit' | 'faq';

function App() {
  const { isSignedIn } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('decoder');
  const [showProWelcome, setShowProWelcome] = useState(false);

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
    // Map rejection category to outcome
    const categoryToOutcome = (category: string): Outcome => {
      switch (category) {
        case 'Door Open': return 'rejected_recruiter';
        case 'Hard No': return 'rejected_ats';
        case 'Soft No': return 'rejected_recruiter';
        case 'Template': return 'rejected_ats';
        case 'Polite Pass': return 'rejected_recruiter';
        default: return 'rejected_ats';
      }
    };

    // Create a new application record from decoded rejection
    const newApp: ApplicationRecord = {
      id: crypto.randomUUID(),
      company: data.companyName || 'Unknown Company',
      role: 'Position from rejection email',
      seniorityLevel: 'mid',
      companySize: 'mid',
      industry: '',
      source: 'other',
      dateApplied: new Date().toISOString().split('T')[0],
      outcome: categoryToOutcome(data.result.category),
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
              className={`nav-btn ${activeTab === 'tracker' ? 'active' : ''}`}
              onClick={() => setActiveTab('tracker')}
            >
              Tracker
            </button>
            <span className="nav-divider">|</span>
            <button
              className={`nav-btn pro ${activeTab === 'pro-tracker' ? 'active' : ''}`}
              onClick={() => setActiveTab('pro-tracker')}
            >
              Pro Tracker
            </button>
            <button
              className={`nav-btn pro ${activeTab === 'insights' ? 'active' : ''}`}
              onClick={() => setActiveTab('insights')}
            >
              Insights
            </button>
            <button
              className={`nav-btn pro ${activeTab === 'role-fit' ? 'active' : ''}`}
              onClick={() => setActiveTab('role-fit')}
            >
              Role Fit
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
          {activeTab === 'decoder' && (
            <RejectionDecoder
              onAddToTracker={handleAddToTracker}
              onLinkToApplication={handleLinkToApplication}
              applications={proApplications}
            />
          )}
          {activeTab === 'tracker' && <Tracker />}
          {activeTab === 'pro-tracker' && (
            <ProTracker onApplicationsChange={handleProApplicationsChange} />
          )}
          {activeTab === 'insights' && <ProInsightsV2 applications={proApplications} />}
          {activeTab === 'role-fit' && <RoleFitChecker applications={proApplications} />}
          {activeTab === 'faq' && <FAQ />}
        </div>
      </main>

      {/* Only show newsletter signup for non-authenticated visitors */}
      {!isSignedIn && <EmailCapture />}

      <footer className="footer">
        <p>REJECT &mdash; Turn every no into a next step.</p>
      </footer>
    </div>
  );
}

export default App;
