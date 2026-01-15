import { useState, useMemo, useEffect } from 'react';
import {
  ApplicationRecord,
  SeniorityLevel,
  ApplicationSource,
  Outcome,
  SENIORITY_OPTIONS,
  SOURCE_OPTIONS,
  OUTCOME_OPTIONS
} from '../types/pro';
import { loadUsage, saveUsage } from '../utils/usage';
import { UpgradePrompt, LimitWarning } from './UpgradePrompt';
import { useApplicationsSync } from '../hooks/useApplicationsSync';
import { useUserSubscription } from '../hooks/useUserSubscription';

interface ProTrackerProps {
  onApplicationsChange?: (apps: ApplicationRecord[]) => void;
}

const ITEMS_PER_PAGE = 10;
const GHOST_THRESHOLD_DAYS = 30; // Auto-mark as ghosted after 30 days

// Calculate days since application
function daysSinceApplied(dateApplied: string | undefined | null): number | null {
  if (!dateApplied) return null;
  try {
    const applied = new Date(dateApplied);
    if (isNaN(applied.getTime())) return null;
    const now = new Date();
    const diffTime = now.getTime() - applied.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

// Format date as "Jan 10, 2026"
function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return 'Unknown date';

  try {
    // Handle various date formats
    let date: Date;

    // If it's already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      date = new Date(dateString + 'T00:00:00'); // Ensure local timezone
    }
    // If it's a full ISO string (2026-01-10T00:00:00.000Z)
    else if (dateString.includes('T')) {
      date = new Date(dateString);
    }
    // Try parsing as-is
    else {
      date = new Date(dateString);
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return dateString; // Return raw string if invalid
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return dateString; // Fallback to raw string if parsing fails
  }
}

export function ProTracker({ onApplicationsChange }: ProTrackerProps) {
  // Use cloud-synced applications
  const {
    applications,
    saveApplication,
    deleteApplication: deleteAppFromSync,
    isLoading,
    isSyncing
  } = useApplicationsSync();

  // Get Pro status from server
  const { isPro } = useUserSubscription();

  const [showForm, setShowForm] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'date' | 'company' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    company: '',
    role: '',
    seniorityLevel: 'mid' as SeniorityLevel,
    source: 'linkedin' as ApplicationSource,
    dateApplied: new Date().toISOString().split('T')[0]
  });

  // Notify parent when applications change
  useEffect(() => {
    onApplicationsChange?.(applications);
    // Update usage tracking
    const usage = loadUsage();
    usage.applications = applications.length;
    saveUsage(usage);
  }, [applications, onApplicationsChange]);

  // Listen for Pro status sync to clear upgrade prompt if user just became Pro
  useEffect(() => {
    if (isPro && showUpgrade) {
      setShowUpgrade(false);
    }
  }, [isPro, showUpgrade]);

  // Auto-ghost old pending applications
  useEffect(() => {
    const pendingApps = applications.filter(app => app.outcome === 'pending');
    const appsToGhost = pendingApps.filter(app => {
      const days = daysSinceApplied(app.dateApplied);
      return days !== null && days >= GHOST_THRESHOLD_DAYS;
    });

    // Mark each old pending app as ghosted
    appsToGhost.forEach(app => {
      const days = daysSinceApplied(app.dateApplied);
      saveApplication({
        ...app,
        outcome: 'ghosted',
        daysToResponse: days
      });
    });
  }, [applications, saveApplication]);

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

    // Check usage limits (Pro users bypass)
    if (!isPro) {
      const FREE_LIMIT = 10;
      if (applications.length >= FREE_LIMIT) {
        setShowUpgrade(true);
        return;
      }
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

    saveApplication(newApp);
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
    const app = applications.find(a => a.id === id);
    if (app) {
      saveApplication({ ...app, ...updates });
    }
  };

  const handleDeleteApplication = (id: string, companyName: string) => {
    if (window.confirm(`Delete application for ${companyName}? This cannot be undone.`)) {
      deleteAppFromSync(id);
    }
  };

  const getOutcomeClass = (outcome: Outcome) => {
    if (outcome === 'offer') return 'outcome-offer';
    if (outcome === 'ghosted') return 'outcome-ghosted';
    if (outcome.startsWith('rejected')) return 'outcome-rejected';
    if (outcome === 'pending') return 'outcome-pending';
    return '';
  };

  const getCategoryClass = (category: string) => {
    switch (category) {
      case 'Door Open': return 'category-door-open';
      case 'Soft No': return 'category-soft-no';
      case 'Template': return 'category-template';
      case 'Polite Pass': return 'category-polite-pass';
      case 'Hard No': return 'category-hard-no';
      default: return '';
    }
  };

  const getReplyClass = (worth: string) => {
    switch (worth) {
      case 'High': return 'reply-high';
      case 'Medium': return 'reply-medium';
      case 'Low': return 'reply-low';
      default: return '';
    }
  };

  const toggleExpand = (appId: string) => {
    setExpandedAppId(expandedAppId === appId ? null : appId);
  };

  // Sort applications
  const sortedApplications = useMemo(() => {
    const sorted = [...applications].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.dateApplied || 0).getTime() - new Date(b.dateApplied || 0).getTime();
          break;
        case 'company':
          comparison = (a.company || '').localeCompare(b.company || '');
          break;
        case 'status':
          comparison = (a.outcome || '').localeCompare(b.outcome || '');
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
    return sorted;
  }, [applications, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(sortedApplications.length / ITEMS_PER_PAGE);
  const paginatedApplications = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedApplications.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedApplications, currentPage]);

  // Toggle sort
  const handleSort = (field: 'date' | 'company' | 'status') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

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
        <h2>
          Pro Application Tracker
          {(isLoading || isSyncing) && <span className="sync-status"> (syncing...)</span>}
        </h2>
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
        {isLoading ? (
          <div className="empty-state">
            <p>Loading applications...</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="empty-state">
            <p>No applications tracked yet.</p>
            <p>Add applications to unlock pattern analysis and strategic insights.</p>
          </div>
        ) : (
          <>
            {/* Sort controls */}
            <div className="sort-controls">
              <span className="sort-label">Sort by:</span>
              <button
                className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`}
                onClick={() => handleSort('date')}
              >
                Date {sortBy === 'date' && (sortOrder === 'desc' ? '↓' : '↑')}
              </button>
              <button
                className={`sort-btn ${sortBy === 'company' ? 'active' : ''}`}
                onClick={() => handleSort('company')}
              >
                Company {sortBy === 'company' && (sortOrder === 'desc' ? '↓' : '↑')}
              </button>
              <button
                className={`sort-btn ${sortBy === 'status' ? 'active' : ''}`}
                onClick={() => handleSort('status')}
              >
                Status {sortBy === 'status' && (sortOrder === 'desc' ? '↓' : '↑')}
              </button>
            </div>

            {/* Compact table view */}
            <div className="applications-table">
              {paginatedApplications.map((app) => (
                <div key={app.id} className={`app-row ${expandedAppId === app.id ? 'expanded' : ''}`}>
                  <div className="app-row-main">
                    <div className="app-row-company">
                      <span className="company-name">{app.company}</span>
                      <span className="role-name">{app.role}</span>
                    </div>
                    <div className="app-row-date">
                      {formatDate(app.dateApplied)}
                      {app.outcome === 'pending' && daysSinceApplied(app.dateApplied) !== null && (
                        <span className={`days-badge ${daysSinceApplied(app.dateApplied)! >= 21 ? 'warning' : ''}`}>
                          {daysSinceApplied(app.dateApplied)}d
                        </span>
                      )}
                      {app.daysToResponse !== null && app.outcome !== 'pending' && (
                        <span className="days-badge">{app.daysToResponse}d</span>
                      )}
                    </div>
                    <div className="app-row-status">
                      <select
                        className={`status-select-compact ${getOutcomeClass(app.outcome)}`}
                        value={app.outcome}
                        onChange={(e) => updateApplication(app.id, { outcome: e.target.value as Outcome })}
                      >
                        {OUTCOME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="app-row-actions">
                      {app.rejectionAnalysis && (
                        <button
                          className={`btn-expand-analysis ${expandedAppId === app.id ? 'active' : ''}`}
                          onClick={() => toggleExpand(app.id)}
                          title="View decoded analysis"
                        >
                          {expandedAppId === app.id ? '▼' : '▶'}
                        </button>
                      )}
                      {app.outcome === 'pending' && daysSinceApplied(app.dateApplied)! >= 21 && daysSinceApplied(app.dateApplied)! < GHOST_THRESHOLD_DAYS && (
                        <button
                          className="btn-ghost-compact"
                          onClick={() => updateApplication(app.id, {
                            outcome: 'ghosted',
                            daysToResponse: daysSinceApplied(app.dateApplied)
                          })}
                          title="Mark as ghosted"
                        >
                          Ghost
                        </button>
                      )}
                      <button
                        className="btn-delete-compact"
                        onClick={() => handleDeleteApplication(app.id, app.company)}
                        title="Delete application"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Expanded rejection analysis panel */}
                  {expandedAppId === app.id && app.rejectionAnalysis && (
                    <div className="app-row-analysis">
                      <div className="analysis-header">
                        <span className={`category-badge ${getCategoryClass(app.rejectionAnalysis.category)}`}>
                          {app.rejectionAnalysis.category}
                        </span>
                        <span className="confidence-badge">
                          {Math.round(app.rejectionAnalysis.confidence * 100)}% confidence
                        </span>
                        <span className={`reply-badge ${getReplyClass(app.rejectionAnalysis.replyWorthIt)}`}>
                          Reply: {app.rejectionAnalysis.replyWorthIt}
                        </span>
                      </div>

                      {app.rejectionAnalysis.signals && app.rejectionAnalysis.signals.length > 0 && (
                        <div className="analysis-signals">
                          <strong>Key phrases detected:</strong>
                          <ul>
                            {app.rejectionAnalysis.signals.slice(0, 5).map((signal, i) => (
                              <li key={i}>{signal}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="analysis-footer">
                        <span className="decoded-date">
                          Decoded {formatDate(app.rejectionAnalysis.decodedAt)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

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
  const { applications } = useApplicationsSync();
  return applications;
}
