import { useState, useMemo } from 'react';
import {
  ApplicationRecord,
  SeniorityLevel,
  ApplicationSource,
  Outcome,
  SENIORITY_OPTIONS,
  SOURCE_OPTIONS,
  OUTCOME_OPTIONS
} from '../types/pro';
import { canUseFeature, loadUsage, saveUsage } from '../utils/usage';
import { UpgradePrompt, LimitWarning } from './UpgradePrompt';

const STORAGE_KEY = 'reject_pro_applications';
const STORAGE_VERSION = 1;

interface StoredProData {
  version: number;
  applications: ApplicationRecord[];
}

function loadProApplications(): ApplicationRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const data: StoredProData = JSON.parse(stored);
    if (data.version !== STORAGE_VERSION) return data.applications || [];
    return data.applications;
  } catch {
    return [];
  }
}

function saveProApplications(applications: ApplicationRecord[]): void {
  const data: StoredProData = { version: STORAGE_VERSION, applications };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

interface ProTrackerProps {
  onApplicationsChange?: (apps: ApplicationRecord[]) => void;
}

const ITEMS_PER_PAGE = 10;

export function ProTracker({ onApplicationsChange }: ProTrackerProps) {
  const [applications, setApplications] = useState<ApplicationRecord[]>(() => loadProApplications());
  const [showForm, setShowForm] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    company: '',
    role: '',
    seniorityLevel: 'mid' as SeniorityLevel,
    source: 'linkedin' as ApplicationSource,
    dateApplied: new Date().toISOString().split('T')[0]
  });

  const updateApplications = (newApps: ApplicationRecord[]) => {
    setApplications(newApps);
    saveProApplications(newApps);
    onApplicationsChange?.(newApps);
    // Sync application count to usage tracking
    const usage = loadUsage();
    usage.applications = newApps.length;
    saveUsage(usage);
  };

  const stats = useMemo(() => {
    const total = applications.length;
    if (total === 0) return { total: 0, ghostRate: 0, rejectRate: 0, successRate: 0 };

    const ghosted = applications.filter(a => a.outcome === 'ghosted').length;
    const rejected = applications.filter(a => a.outcome.startsWith('rejected')).length;
    const success = applications.filter(a => ['offer', 'rejected_final', 'rejected_hm'].includes(a.outcome)).length;

    return {
      total,
      ghostRate: Math.round((ghosted / total) * 100),
      rejectRate: Math.round((rejected / total) * 100),
      successRate: Math.round((success / total) * 100)
    };
  }, [applications]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company || !formData.role) return;

    // Check usage limits
    const { allowed } = canUseFeature('applications');
    if (!allowed) {
      setShowUpgrade(true);
      return;
    }

    const newApp: ApplicationRecord = {
      id: crypto.randomUUID(),
      company: formData.company,
      role: formData.role,
      seniorityLevel: formData.seniorityLevel,
      companySize: 'mid', // Default - can be inferred later
      industry: '', // Can be inferred from company name
      source: formData.source,
      dateApplied: formData.dateApplied,
      outcome: 'pending',
      daysToResponse: null // Auto-calculated when rejection is linked
    };

    updateApplications([newApp, ...applications]);
    setFormData({
      company: '',
      role: '',
      seniorityLevel: 'mid',
      source: 'linkedin',
      dateApplied: new Date().toISOString().split('T')[0]
    });
    setShowForm(false);
  };

  const updateApplication = (id: string, updates: Partial<ApplicationRecord>) => {
    const updated = applications.map(app =>
      app.id === id ? { ...app, ...updates } : app
    );
    updateApplications(updated);
  };

  const deleteApplication = (id: string) => {
    updateApplications(applications.filter(app => app.id !== id));
  };

  const getOutcomeClass = (outcome: Outcome) => {
    if (outcome === 'offer') return 'outcome-offer';
    if (outcome === 'ghosted') return 'outcome-ghosted';
    if (outcome.startsWith('rejected')) return 'outcome-rejected';
    if (outcome === 'pending') return 'outcome-pending';
    return '';
  };

  // Pagination
  const totalPages = Math.ceil(applications.length / ITEMS_PER_PAGE);
  const paginatedApplications = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return applications.slice(start, start + ITEMS_PER_PAGE);
  }, [applications, currentPage]);

  // Reset to page 1 when applications change significantly
  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Show upgrade prompt if limit reached
  if (showUpgrade) {
    return (
      <div className="pro-tracker">
        <UpgradePrompt action="applications" onClose={() => setShowUpgrade(false)} />
      </div>
    );
  }

  return (
    <div className="pro-tracker">
      <LimitWarning action="applications" />
      <div className="tracker-header">
        <h2>Pro Application Tracker</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Application'}
        </button>
      </div>

      {showForm && (
        <form className="tracker-form pro-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Company *</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="e.g., Stripe"
                required
              />
            </div>
            <div className="form-group">
              <label>Role *</label>
              <input
                type="text"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g., Senior Software Engineer"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Seniority</label>
              <select
                value={formData.seniorityLevel}
                onChange={(e) => setFormData({ ...formData, seniorityLevel: e.target.value as SeniorityLevel })}
              >
                {SENIORITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Source</label>
              <select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as ApplicationSource })}
              >
                {SOURCE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Date Applied</label>
              <input
                type="date"
                value={formData.dateApplied}
                onChange={(e) => setFormData({ ...formData, dateApplied: e.target.value })}
              />
            </div>
            <div className="form-group" />
          </div>

          <button type="submit" className="btn btn-primary">Add Application</button>
        </form>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.successRate}%</span>
          <span className="stat-label">Got Past ATS</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.rejectRate}%</span>
          <span className="stat-label">Rejected</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.ghostRate}%</span>
          <span className="stat-label">Ghosted</span>
        </div>
      </div>

      <div className="applications-list">
        {applications.length === 0 ? (
          <div className="empty-state">
            <p>No applications tracked yet.</p>
            <p>Add applications to unlock pattern analysis and strategic insights.</p>
          </div>
        ) : (
          <>
            {paginatedApplications.map((app) => (
              <div key={app.id} className="application-card pro-card">
                <div className="application-main">
                  <div className="application-info">
                    <h3>{app.company}</h3>
                    <p className="role">{app.role}</p>
                    <div className="app-tags">
                      <span className="tag">{app.seniorityLevel}</span>
                      <span className="tag">{app.source}</span>
                    </div>
                  </div>
                  <div className="application-meta">
                    <span className="date">Applied: {app.dateApplied}</span>
                    {app.daysToResponse !== null && (
                      <span className="date">{app.daysToResponse} days to response</span>
                    )}
                  </div>
                </div>
                <div className="application-actions">
                  <select
                    className={`status-select ${getOutcomeClass(app.outcome)}`}
                    value={app.outcome}
                    onChange={(e) => updateApplication(app.id, { outcome: e.target.value as Outcome })}
                  >
                    {OUTCOME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => deleteApplication(app.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span className="pagination-info">
                  Page {currentPage} of {totalPages} ({applications.length} applications)
                </span>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function useProApplications() {
  const [applications] = useState<ApplicationRecord[]>(() => loadProApplications());
  return applications;
}
