import { useState, useMemo, useEffect } from 'react';
import {
  ApplicationRecord,
  SeniorityLevel,
  ApplicationSource,
  Outcome,
  SENIORITY_OPTIONS,
  SOURCE_OPTIONS,
  SAVED_STATUS_OPTIONS,
  APPLIED_STATUS_OPTIONS,
  isSavedStatus
} from '../types/pro';
import { loadUsage, saveUsage } from '../utils/usage';
import { UpgradePrompt, LimitWarning } from './UpgradePrompt';
import { useApplicationsSync } from '../hooks/useApplicationsSync';
import { useUserSubscription } from '../hooks/useUserSubscription';
import { JourneyCard } from './JourneyCard';
import { useAuth } from './AuthButtons';

type FilterTab = 'all' | 'saved' | 'applied';

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

export function ProTracker() {
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
  const { email } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [showJourneyCard, setShowJourneyCard] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'date' | 'company' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [modalApp, setModalApp] = useState<ApplicationRecord | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');
  const [formData, setFormData] = useState({
    company: '',
    role: '',
    seniorityLevel: 'mid' as SeniorityLevel,
    source: 'linkedin' as ApplicationSource,
    dateApplied: new Date().toISOString().split('T')[0]
  });

  // Update usage tracking when applications change
  useEffect(() => {
    const usage = loadUsage();
    usage.applications = applications.length;
    saveUsage(usage);
  }, [applications]);

  // Listen for Pro status sync to clear upgrade prompt if user just became Pro
  useEffect(() => {
    if (isPro && showUpgrade) {
      setShowUpgrade(false);
    }
  }, [isPro, showUpgrade]);

  // Note: Auto-ghosting is handled in useApplicationsSync hook during sync
  // Don't duplicate here or it causes infinite re-render loops

  // Filter applications by tab
  const filteredByTab = useMemo(() => {
    switch (filterTab) {
      case 'saved':
        return applications.filter(a => isSavedStatus(a.outcome));
      case 'applied':
        return applications.filter(a => !isSavedStatus(a.outcome));
      default:
        return applications;
    }
  }, [applications, filterTab]);

  const stats = useMemo(() => {
    const total = applications.length;
    const savedCount = applications.filter(a => isSavedStatus(a.outcome)).length;
    const appliedCount = applications.filter(a => !isSavedStatus(a.outcome)).length;

    if (appliedCount === 0) return {
      total,
      savedCount,
      appliedCount,
      ghostRate: 0,
      rejectRate: 0,
      successRate: 0
    };

    const appliedApps = applications.filter(a => !isSavedStatus(a.outcome));
    const ghosted = appliedApps.filter(a => a.outcome === 'ghosted').length;
    const rejected = appliedApps.filter(a => a.outcome.startsWith('rejected')).length;
    const success = appliedApps.filter(a => ['offer', 'rejected_final', 'rejected_hm'].includes(a.outcome)).length;

    return {
      total,
      savedCount,
      appliedCount,
      ghostRate: Math.round((ghosted / appliedCount) * 100),
      rejectRate: Math.round((rejected / appliedCount) * 100),
      successRate: Math.round((success / appliedCount) * 100)
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
      outcome: 'applied',
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
    if (isSavedStatus(outcome)) return 'outcome-saved';
    if (outcome === 'applied' || outcome === 'interviewing') return 'outcome-pending';
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

  // Format stage reached for display
  const formatStageReached = (stage: string | undefined): string => {
    if (!stage) return 'Unknown stage';
    switch (stage) {
      case 'ats_filter': return 'ATS Filter (before human review)';
      case 'recruiter_screen': return 'Recruiter Screen';
      case 'hiring_manager': return 'Hiring Manager';
      case 'final_round': return 'Final Round';
      default: return 'Unknown stage';
    }
  };

  const toggleExpand = (appId: string) => {
    setExpandedAppId(expandedAppId === appId ? null : appId);
  };

  // Sort applications (using filtered list)
  const sortedApplications = useMemo(() => {
    const sorted = [...filteredByTab].sort((a, b) => {
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
  }, [filteredByTab, sortBy, sortOrder]);

  // Handle notes editing
  const startEditingNotes = (app: ApplicationRecord) => {
    setEditingNotes(app.id);
    setNotesText(app.notes || '');
  };

  const saveNotes = (appId: string) => {
    updateApplication(appId, { notes: notesText });
    setEditingNotes(null);
    setNotesText('');
  };

  // Get fit score color class
  const getFitScoreClass = (score: number): string => {
    if (score >= 80) return 'fit-strong';
    if (score >= 65) return 'fit-good';
    if (score >= 50) return 'fit-moderate';
    if (score >= 35) return 'fit-weak';
    return 'fit-poor';
  };

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
          Tracker
          {(isLoading || isSyncing) && <span className="sync-status"> (syncing...)</span>}
        </h2>
        <button className="btn btn-secondary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Log Past Application'}
        </button>
      </div>

      {showForm && (
        <form className="tracker-form pro-form" onSubmit={handleSubmit}>
          <p className="form-hint">Quick log for jobs you've already applied to. For new jobs, use <strong>Job Check</strong> to analyze the JD first.</p>
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
              <span className="form-hint">
                {SOURCE_OPTIONS.find(opt => opt.value === formData.source)?.hint}
              </span>
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

      {/* Filter tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filterTab === 'all' ? 'active' : ''}`}
          onClick={() => { setFilterTab('all'); setCurrentPage(1); }}
        >
          All ({stats.total})
        </button>
        <button
          className={`filter-tab ${filterTab === 'saved' ? 'active' : ''}`}
          onClick={() => { setFilterTab('saved'); setCurrentPage(1); }}
        >
          Saved ({stats.savedCount})
        </button>
        <button
          className={`filter-tab ${filterTab === 'applied' ? 'active' : ''}`}
          onClick={() => { setFilterTab('applied'); setCurrentPage(1); }}
        >
          Applied ({stats.appliedCount})
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{stats.savedCount}</span>
          <span className="stat-label">Saved</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.appliedCount}</span>
          <span className="stat-label">Applied</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.successRate}%</span>
          <span className="stat-label">Got Past ATS</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.ghostRate}%</span>
          <span className="stat-label">Ghosted</span>
        </div>
      </div>

      {/* Museum of Failures - Shareable Journey Card */}
      {stats.appliedCount >= 3 && (
        <div className="journey-section">
          <button
            className="btn btn-journey"
            onClick={() => setShowJourneyCard(!showJourneyCard)}
          >
            {showJourneyCard ? 'Hide' : 'Share'} My Journey
          </button>
          {showJourneyCard && (
            <JourneyCard
              applications={applications}
              userName={email?.split('@')[0]}
            />
          )}
        </div>
      )}

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
                <div key={app.id} className={`app-row ${expandedAppId === app.id ? 'expanded' : ''} ${isSavedStatus(app.outcome) ? 'saved-job' : ''}`}>
                  <div className="app-row-main">
                    <div className="app-row-company">
                      <span className="company-name">
                        {app.company}
                        {app.fitAnalysis && (
                          <span className={`fit-score-mini ${getFitScoreClass(app.fitAnalysis.fitScore)}`}>
                            {app.fitAnalysis.fitScore}
                          </span>
                        )}
                      </span>
                      <span className="role-name">
                        {app.role}
                        {app.jobUrl && (
                          <a href={app.jobUrl} target="_blank" rel="noopener noreferrer" className="job-link" title="View job posting">
                            ↗
                          </a>
                        )}
                      </span>
                    </div>
                    <div className="app-row-date">
                      {formatDate(app.dateApplied)}
                      {app.outcome === 'applied' && daysSinceApplied(app.dateApplied) !== null && (
                        <span className={`days-badge ${daysSinceApplied(app.dateApplied)! >= 21 ? 'warning' : ''}`}>
                          {daysSinceApplied(app.dateApplied)}d
                        </span>
                      )}
                      {app.daysToResponse !== null && !isSavedStatus(app.outcome) && app.outcome !== 'applied' && (
                        <span className="days-badge">{app.daysToResponse}d</span>
                      )}
                    </div>
                    <div className="app-row-status">
                      <select
                        className={`status-select-compact ${getOutcomeClass(app.outcome)} ${isSavedStatus(app.outcome) ? 'saved-status' : ''}`}
                        value={app.outcome}
                        onChange={(e) => updateApplication(app.id, { outcome: e.target.value as Outcome })}
                      >
                        {isSavedStatus(app.outcome) ? (
                          <>
                            <optgroup label="Saved">
                              {SAVED_STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Applied">
                              {APPLIED_STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </optgroup>
                          </>
                        ) : (
                          <>
                            <optgroup label="Applied">
                              {APPLIED_STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Saved">
                              {SAVED_STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </optgroup>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="app-row-actions">
                      {(app.rejectionAnalysis || app.fitAnalysis || app.notes !== undefined) && (
                        <button
                          className={`btn-expand-analysis ${expandedAppId === app.id ? 'active' : ''}`}
                          onClick={() => toggleExpand(app.id)}
                          title={app.fitAnalysis ? 'View fit analysis' : app.rejectionAnalysis ? 'View decoded analysis' : 'View notes'}
                        >
                          {expandedAppId === app.id ? '▼' : '▶'}
                        </button>
                      )}
                      {app.outcome === 'applied' && daysSinceApplied(app.dateApplied)! >= 21 && daysSinceApplied(app.dateApplied)! < GHOST_THRESHOLD_DAYS && (
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
                      {/* Priority 1: Show where they got filtered - most insightful info */}
                      <div className="filtered-at-banner">
                        <span className="filtered-at-label">Filtered at:</span>
                        <span className="filtered-at-stage">{formatStageReached(app.rejectionAnalysis.stageReached)}</span>
                      </div>

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

                      {/* What it means - the strategic insight */}
                      {app.rejectionAnalysis.whatItMeans && (
                        <div className="analysis-what-it-means">
                          <p>{app.rejectionAnalysis.whatItMeans}</p>
                        </div>
                      )}

                      <div className="analysis-footer">
                        <span className="decoded-date">
                          Decoded {formatDate(app.rejectionAnalysis.decodedAt)}
                        </span>
                        <button
                          className="btn-see-full"
                          onClick={() => setModalApp(app)}
                        >
                          See full analysis →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Fit analysis panel for saved jobs */}
                  {expandedAppId === app.id && app.fitAnalysis && !app.rejectionAnalysis && (
                    <div className="app-row-fit-analysis">
                      <div className="fit-analysis-header">
                        <span className={`fit-score-badge ${getFitScoreClass(app.fitAnalysis.fitScore)}`}>
                          {app.fitAnalysis.fitScore} Fit Score
                        </span>
                        <span className="fit-verdict">{app.fitAnalysis.verdict.replace('_', ' ')}</span>
                      </div>

                      {app.fitAnalysis.highlights.length > 0 && (
                        <div className="fit-section">
                          <h5>Highlights</h5>
                          <ul className="fit-list highlights">
                            {app.fitAnalysis.highlights.map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {app.fitAnalysis.concerns.length > 0 && (
                        <div className="fit-section">
                          <h5>Concerns</h5>
                          <ul className="fit-list concerns">
                            {app.fitAnalysis.concerns.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="fit-recommendation">
                        <h5>What to expect</h5>
                        <p>{app.fitAnalysis.recommendation}</p>
                      </div>
                    </div>
                  )}

                  {/* Notes section (always expandable) */}
                  {expandedAppId === app.id && (
                    <div className="app-row-notes">
                      <div className="notes-header">
                        <h5>Notes</h5>
                        {editingNotes !== app.id && (
                          <button className="btn-edit-notes" onClick={() => startEditingNotes(app)}>
                            {app.notes ? 'Edit' : 'Add notes'}
                          </button>
                        )}
                      </div>
                      {editingNotes === app.id ? (
                        <div className="notes-edit">
                          <textarea
                            value={notesText}
                            onChange={(e) => setNotesText(e.target.value)}
                            placeholder="Add notes about this job (research, prep tasks, interview notes...)"
                            rows={3}
                          />
                          <div className="notes-actions">
                            <button className="btn btn-primary btn-small" onClick={() => saveNotes(app.id)}>
                              Save
                            </button>
                            <button className="btn btn-secondary btn-small" onClick={() => setEditingNotes(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="notes-content">{app.notes || 'No notes yet'}</p>
                      )}
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

      {/* Full Analysis Modal */}
      {modalApp && modalApp.rejectionAnalysis && (
        <div className="analysis-modal-overlay" onClick={() => setModalApp(null)}>
          <div className="analysis-modal" onClick={(e) => e.stopPropagation()}>
            <div className="analysis-modal-header">
              <div className="modal-title">
                <h3>{modalApp.company}</h3>
                <span className="modal-role">{modalApp.role}</span>
              </div>
              <button className="modal-close" onClick={() => setModalApp(null)}>×</button>
            </div>

            <div className="analysis-modal-content">
              {/* Priority 1: Where they got filtered */}
              <div className="modal-filtered-at">
                <span className="filtered-at-label">Filtered at:</span>
                <span className="filtered-at-stage">{formatStageReached(modalApp.rejectionAnalysis.stageReached)}</span>
              </div>

              <div className="modal-badges">
                <span className={`category-badge ${getCategoryClass(modalApp.rejectionAnalysis.category)}`}>
                  {modalApp.rejectionAnalysis.category}
                </span>
                <span className="confidence-badge">
                  {Math.round(modalApp.rejectionAnalysis.confidence * 100)}% confidence
                </span>
                <span className={`reply-badge ${getReplyClass(modalApp.rejectionAnalysis.replyWorthIt)}`}>
                  Reply: {modalApp.rejectionAnalysis.replyWorthIt}
                </span>
              </div>

              {/* What it means */}
              {modalApp.rejectionAnalysis.whatItMeans && (
                <div className="modal-section">
                  <h4>What This Means</h4>
                  <p className="modal-insight-text">{modalApp.rejectionAnalysis.whatItMeans}</p>
                </div>
              )}

              {/* Strategic insight */}
              {modalApp.rejectionAnalysis.strategicInsight && (
                <div className="modal-section">
                  <h4>Strategic Insight</h4>
                  <p className="modal-insight-text">{modalApp.rejectionAnalysis.strategicInsight}</p>
                </div>
              )}

              {/* Next actions */}
              {modalApp.rejectionAnalysis.nextActions && modalApp.rejectionAnalysis.nextActions.length > 0 && (
                <div className="modal-section">
                  <h4>Recommended Next Steps</h4>
                  <ul className="modal-next-actions">
                    {modalApp.rejectionAnalysis.nextActions.map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="modal-section">
                <h4>Key Phrases Detected</h4>
                <ul className="modal-signals">
                  {modalApp.rejectionAnalysis.signals.map((signal, i) => (
                    <li key={i}>{signal}</li>
                  ))}
                </ul>
              </div>

              <div className="modal-meta">
                <span>Applied: {formatDate(modalApp.dateApplied)}</span>
                {modalApp.daysToResponse !== null && (
                  <span>Response time: {modalApp.daysToResponse} days</span>
                )}
                <span>Decoded: {formatDate(modalApp.rejectionAnalysis.decodedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function useProApplications() {
  const { applications } = useApplicationsSync();
  return applications;
}
