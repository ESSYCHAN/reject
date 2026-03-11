import { useMemo, useRef, useState } from 'react';
import { ApplicationRecord, isSavedStatus } from '../types/pro';
import './JourneyCard.css';

interface JourneyCardProps {
  applications: ApplicationRecord[];
  userName?: string;
}

interface JourneyStats {
  totalApplications: number;
  totalRejections: number;
  ghosted: number;
  interviews: number;
  offers: number;
  daysInSearch: number;
  ghostRate: number;
  rejectionRate: number;
  avgDaysToReject: number;
  topRejectionStage: string;
  mostAppliedSource: string;
}

export function JourneyCard({ applications, userName }: JourneyCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const stats: JourneyStats = useMemo(() => {
    const appliedApps = applications.filter(a => !isSavedStatus(a.outcome));
    const totalApplications = appliedApps.length;

    const rejections = appliedApps.filter(a => a.outcome.startsWith('rejected'));
    const ghosted = appliedApps.filter(a => a.outcome === 'ghosted').length;
    const interviews = appliedApps.filter(a =>
      ['rejected_recruiter', 'rejected_hm', 'rejected_final', 'interviewing', 'offer'].includes(a.outcome)
    ).length;
    const offers = appliedApps.filter(a => a.outcome === 'offer').length;

    // Calculate days in search (from first to last application)
    const dates = appliedApps
      .map(a => a.dateApplied ? new Date(a.dateApplied).getTime() : 0)
      .filter(d => d > 0);
    const daysInSearch = dates.length >= 2
      ? Math.ceil((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24))
      : 0;

    // Average days to rejection
    const rejectionDays = appliedApps
      .filter(a => a.daysToResponse !== null)
      .map(a => a.daysToResponse!);
    const avgDaysToReject = rejectionDays.length > 0
      ? Math.round(rejectionDays.reduce((a, b) => a + b, 0) / rejectionDays.length)
      : 0;

    // Most common rejection stage
    const stages: Record<string, number> = {};
    appliedApps.forEach(a => {
      if (a.rejectionAnalysis?.stageReached) {
        stages[a.rejectionAnalysis.stageReached] = (stages[a.rejectionAnalysis.stageReached] || 0) + 1;
      }
    });
    const topStage = Object.entries(stages).sort((a, b) => b[1] - a[1])[0];
    const topRejectionStage = topStage ? formatStage(topStage[0]) : 'ATS';

    // Most used source
    const sources: Record<string, number> = {};
    appliedApps.forEach(a => {
      if (a.source) {
        sources[a.source] = (sources[a.source] || 0) + 1;
      }
    });
    const topSource = Object.entries(sources).sort((a, b) => b[1] - a[1])[0];
    const mostAppliedSource = topSource ? formatSource(topSource[0]) : 'Unknown';

    return {
      totalApplications,
      totalRejections: rejections.length,
      ghosted,
      interviews,
      offers,
      daysInSearch,
      ghostRate: totalApplications > 0 ? Math.round((ghosted / totalApplications) * 100) : 0,
      rejectionRate: totalApplications > 0 ? Math.round((rejections.length / totalApplications) * 100) : 0,
      avgDaysToReject,
      topRejectionStage,
      mostAppliedSource
    };
  }, [applications]);

  const getMilestones = (): string[] => {
    const milestones: string[] = [];

    if (stats.totalApplications >= 100) milestones.push('Century Club');
    else if (stats.totalApplications >= 50) milestones.push('Persistent');
    else if (stats.totalApplications >= 25) milestones.push('Getting Started');

    if (stats.totalRejections >= 50) milestones.push('Rejection Veteran');
    if (stats.ghosted >= 20) milestones.push('Ghost Hunter');
    if (stats.interviews >= 10) milestones.push('Interview Ready');
    if (stats.offers >= 1) milestones.push('Winner');
    if (stats.daysInSearch >= 90) milestones.push('Marathon Runner');

    return milestones.slice(0, 3); // Max 3 badges
  };

  const getMotivationalQuote = (): string => {
    if (stats.offers > 0) {
      return "From rejection to offer. The grind pays off.";
    }
    if (stats.interviews >= 5) {
      return "Breaking through the ATS wall. Keep pushing.";
    }
    if (stats.totalRejections >= 50) {
      return "50+ rejections. Still standing. Still applying.";
    }
    if (stats.ghosted >= stats.totalRejections / 2) {
      return "Half ghosted. The silence is loud, but so is resilience.";
    }
    return "Every rejection is data. Every 'no' gets you closer to 'yes'.";
  };

  const handleShare = async (platform: 'twitter' | 'linkedin' | 'copy') => {
    const text = `My job search journey:\n\n📊 ${stats.totalApplications} applications\n❌ ${stats.totalRejections} rejections\n👻 ${stats.ghosted} ghosted\n🎯 ${stats.interviews} interviews\n${stats.offers > 0 ? `✅ ${stats.offers} offer${stats.offers > 1 ? 's' : ''}` : ''}\n\n${getMotivationalQuote()}\n\nTrack your own journey at tryreject.co.uk`;

    if (platform === 'copy') {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setShareError('Failed to copy');
        setTimeout(() => setShareError(null), 2000);
      }
      return;
    }

    const encodedText = encodeURIComponent(text);

    if (platform === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank');
    } else if (platform === 'linkedin') {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=https://tryreject.co.uk&summary=${encodedText}`, '_blank');
    }
  };

  const milestones = getMilestones();

  if (stats.totalApplications === 0) {
    return null;
  }

  return (
    <div className="journey-card-container">
      <div className="journey-card" ref={cardRef}>
        <div className="journey-card-header">
          <div className="journey-brand">
            <span className="journey-logo">REJECT</span>
            <span className="journey-subtitle">Museum of Failures</span>
          </div>
          {userName && <span className="journey-user">{userName}'s Journey</span>}
        </div>

        <div className="journey-stats-grid">
          <div className="journey-stat main-stat">
            <span className="stat-number">{stats.totalApplications}</span>
            <span className="stat-label">Applications</span>
          </div>
          <div className="journey-stat rejection-stat">
            <span className="stat-number">{stats.totalRejections}</span>
            <span className="stat-label">Rejections</span>
          </div>
          <div className="journey-stat ghost-stat">
            <span className="stat-number">{stats.ghosted}</span>
            <span className="stat-label">Ghosted</span>
          </div>
          <div className="journey-stat interview-stat">
            <span className="stat-number">{stats.interviews}</span>
            <span className="stat-label">Interviews</span>
          </div>
        </div>

        {stats.offers > 0 && (
          <div className="journey-offer-banner">
            <span className="offer-icon">🎉</span>
            <span className="offer-text">{stats.offers} Offer{stats.offers > 1 ? 's' : ''} Secured</span>
          </div>
        )}

        <div className="journey-insights">
          <div className="insight-row">
            <span className="insight-label">Days in search</span>
            <span className="insight-value">{stats.daysInSearch}</span>
          </div>
          <div className="insight-row">
            <span className="insight-label">Avg response time</span>
            <span className="insight-value">{stats.avgDaysToReject > 0 ? `${stats.avgDaysToReject}d` : '—'}</span>
          </div>
          <div className="insight-row">
            <span className="insight-label">Ghost rate</span>
            <span className="insight-value">{stats.ghostRate}%</span>
          </div>
          <div className="insight-row">
            <span className="insight-label">Most filtered at</span>
            <span className="insight-value">{stats.topRejectionStage}</span>
          </div>
        </div>

        {milestones.length > 0 && (
          <div className="journey-milestones">
            {milestones.map((milestone, i) => (
              <span key={i} className="milestone-badge">{milestone}</span>
            ))}
          </div>
        )}

        <div className="journey-quote">
          "{getMotivationalQuote()}"
        </div>

        <div className="journey-footer">
          <span className="journey-cta">tryreject.co.uk</span>
        </div>
      </div>

      <div className="journey-share-buttons">
        <button
          className="share-btn share-twitter"
          onClick={() => handleShare('twitter')}
          title="Share on Twitter/X"
        >
          𝕏 Share
        </button>
        <button
          className="share-btn share-linkedin"
          onClick={() => handleShare('linkedin')}
          title="Share on LinkedIn"
        >
          in Share
        </button>
        <button
          className="share-btn share-copy"
          onClick={() => handleShare('copy')}
          title="Copy to clipboard"
        >
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>
      {shareError && <p className="share-error">{shareError}</p>}
    </div>
  );
}

function formatStage(stage: string): string {
  switch (stage) {
    case 'ats_filter': return 'ATS';
    case 'recruiter_screen': return 'Recruiter';
    case 'hiring_manager': return 'Hiring Manager';
    case 'final_round': return 'Final Round';
    default: return 'ATS';
  }
}

function formatSource(source: string): string {
  switch (source) {
    case 'linkedin': return 'LinkedIn';
    case 'indeed': return 'Indeed';
    case 'company_site': return 'Company Site';
    case 'referral': return 'Referral';
    case 'recruiter': return 'Recruiter';
    default: return source;
  }
}

export default JourneyCard;
