import { useState, useMemo } from 'react';
import { Application, ApplicationStatus, TrackerStats } from '../types';
import { useApplications } from '../hooks/useLocalStorage';

const STATUS_OPTIONS: ApplicationStatus[] = ['pending', 'rejected', 'ghosted', 'interviewing', 'offer'];

function calculateStats(applications: Application[]): TrackerStats {
  const total = applications.length;
  if (total === 0) {
    return { total: 0, rejectionRate: 0, ghostingRate: 0, avgDaysToOutcome: null };
  }

  const rejected = applications.filter(a => a.status === 'rejected').length;
  const ghosted = applications.filter(a => a.status === 'ghosted').length;

  const withOutcome = applications.filter(a => a.outcomeDate && a.dateApplied);
  let avgDays: number | null = null;

  if (withOutcome.length > 0) {
    const totalDays = withOutcome.reduce((sum, app) => {
      const applied = new Date(app.dateApplied);
      const outcome = new Date(app.outcomeDate!);
      return sum + Math.floor((outcome.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    avgDays = Math.round(totalDays / withOutcome.length);
  }

  return {
    total,
    rejectionRate: Math.round((rejected / total) * 100),
    ghostingRate: Math.round((ghosted / total) * 100),
    avgDaysToOutcome: avgDays
  };
}

export function Tracker() {
  const { applications, addApplication, updateApplication, deleteApplication } = useApplications();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    company: '',
    role: '',
    source: '',
    dateApplied: new Date().toISOString().split('T')[0],
    status: 'pending' as ApplicationStatus
  });

  const stats = useMemo(() => calculateStats(applications), [applications]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company || !formData.role) return;

    addApplication(formData);
    setFormData({
      company: '',
      role: '',
      source: '',
      dateApplied: new Date().toISOString().split('T')[0],
      status: 'pending'
    });
    setShowForm(false);
  };

  const getStatusClass = (status: ApplicationStatus) => {
    return `status-${status}`;
  };

  return (
    <div className="tracker">
      <div className="tracker-header">
        <h2>Application Tracker</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Application'}
        </button>
      </div>

      {showForm && (
        <form className="tracker-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="company">Company *</label>
              <input
                id="company"
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="role">Role *</label>
              <input
                id="role"
                type="text"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="source">Source</label>
              <input
                id="source"
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                placeholder="LinkedIn, company site, referral..."
              />
            </div>
            <div className="form-group">
              <label htmlFor="dateApplied">Date Applied</label>
              <input
                id="dateApplied"
                type="date"
                value={formData.dateApplied}
                onChange={(e) => setFormData({ ...formData, dateApplied: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Add Application</button>
        </form>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total Applications</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.rejectionRate}%</span>
          <span className="stat-label">Rejection Rate</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.ghostingRate}%</span>
          <span className="stat-label">Ghosting Rate</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.avgDaysToOutcome ?? '—'}</span>
          <span className="stat-label">Avg Days to Outcome</span>
        </div>
      </div>

      <div className="applications-list">
        {applications.length === 0 ? (
          <div className="empty-state">
            <p>No applications tracked yet.</p>
            <p>Click "+ Add Application" to get started.</p>
          </div>
        ) : (
          applications.map((app) => (
            <div key={app.id} className="application-card">
              <div className="application-main">
                <div className="application-info">
                  <h3>{app.company}</h3>
                  <p className="role">{app.role}</p>
                  {app.source && <p className="source">via {app.source}</p>}
                </div>
                <div className="application-meta">
                  <span className="date">Applied: {app.dateApplied}</span>
                  {app.outcomeDate && <span className="date">Outcome: {app.outcomeDate}</span>}
                </div>
              </div>
              <div className="application-actions">
                <select
                  className={`status-select ${getStatusClass(app.status)}`}
                  value={app.status}
                  onChange={(e) => updateApplication(app.id, { status: e.target.value as ApplicationStatus })}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </option>
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
          ))
        )}
      </div>
    </div>
  );
}
