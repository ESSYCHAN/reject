import { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
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
  avgDaysToReject: number;
  topRejectionStage: string;
  interviewRate: number;
}

export function JourneyCard({ applications, userName }: JourneyCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const stats: JourneyStats = useMemo(() => {
    const appliedApps = applications.filter(a => !isSavedStatus(a.outcome));
    const totalApplications = appliedApps.length;

    const rejections = appliedApps.filter(a => a.outcome.startsWith('rejected'));
    const ghosted = appliedApps.filter(a => a.outcome === 'ghosted').length;
    const interviews = appliedApps.filter(a =>
      ['rejected_recruiter', 'rejected_hm', 'rejected_final', 'interviewing', 'offer'].includes(a.outcome)
    ).length;
    const offers = appliedApps.filter(a => a.outcome === 'offer').length;

    // Calculate days in search
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

    // Interview rate
    const interviewRate = totalApplications > 0 ? Math.round((interviews / totalApplications) * 100) : 0;

    return {
      totalApplications,
      totalRejections: rejections.length,
      ghosted,
      interviews,
      offers,
      daysInSearch,
      ghostRate: totalApplications > 0 ? Math.round((ghosted / totalApplications) * 100) : 0,
      avgDaysToReject,
      topRejectionStage,
      interviewRate
    };
  }, [applications]);

  const getMilestones = (): { label: string; type: 'accent' | 'warn' | 'good' }[] => {
    const milestones: { label: string; type: 'accent' | 'warn' | 'good' }[] = [];

    if (stats.totalApplications >= 100) milestones.push({ label: 'Century Club', type: 'accent' });
    else if (stats.totalApplications >= 50) milestones.push({ label: 'Persistent', type: 'accent' });

    if (stats.totalRejections >= 50) milestones.push({ label: 'Rejection Veteran', type: 'warn' });
    if (stats.interviews >= 10) milestones.push({ label: 'Interview Ready', type: 'good' });
    if (stats.offers >= 1) milestones.push({ label: 'Got The Offer', type: 'good' });

    return milestones.slice(0, 3);
  };

  const getQuote = (): string => {
    if (stats.offers > 0) {
      return "From rejection to offer. The grind paid off.";
    }
    if (stats.interviews >= 5) {
      return "Breaking through the ATS wall. Keep pushing.";
    }
    if (stats.totalRejections >= 50) {
      return "50+ rejections. Still standing. Still applying.";
    }
    return "Every rejection is data. Every 'no' gets you closer.";
  };

  const handleShare = async (platform: 'twitter' | 'linkedin' | 'copy') => {
    const reframeText = `${stats.totalRejections} rejections. Most weren't about me.`;
    const text = `${reframeText}\n\n📊 ${stats.totalApplications} applications\n❌ ${stats.totalRejections} rejections\n👻 ${stats.ghosted} ghosted\n🎯 ${stats.interviews} interviews\n${stats.offers > 0 ? `✅ ${stats.offers} offer${stats.offers > 1 ? 's' : ''}\n` : ''}\n${getQuote()}\n\nTrack your journey: tryreject.co.uk`;

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
    const url = encodeURIComponent('https://tryreject.co.uk');

    if (platform === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank');
    } else if (platform === 'linkedin') {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch {
        // Continue anyway
      }
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current || isDownloading) return;

    setIsDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#1a1512',
        scale: 2,
        logging: false,
        useCORS: true
      });

      const link = document.createElement('a');
      link.download = `reject-journey-${userName || 'my'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to download:', error);
      setShareError('Failed to create image');
      setTimeout(() => setShareError(null), 2000);
    } finally {
      setIsDownloading(false);
    }
  };

  const milestones = getMilestones();

  if (stats.totalApplications === 0) {
    return null;
  }

  return (
    <div className="journey-card-wrapper">
      {/* The actual card for download/share */}
      <div className="journey-card" ref={cardRef}>
        <div className="card-brand-bar">
          <span className="card-logo">REJECT</span>
          <span className="card-username">{userName ? `${userName}'s numbers` : 'my numbers'}</span>
        </div>

        <div className="card-headline">
          <h2>The Real Numbers</h2>
          <p>// {stats.daysInSearch > 0 ? `${stats.daysInSearch} days in the search` : 'tracking the journey'}</p>
        </div>

        <div className="card-stats">
          <div className="card-stat">
            <div className="card-stat-val cs-applications">{stats.totalApplications}</div>
            <div className="card-stat-lbl">Applications</div>
          </div>
          <div className="card-stat">
            <div className="card-stat-val cs-rejections">{stats.totalRejections}</div>
            <div className="card-stat-lbl">Rejections</div>
          </div>
          <div className="card-stat">
            <div className="card-stat-val cs-ghosted">{stats.ghosted}</div>
            <div className="card-stat-lbl">Ghosted</div>
          </div>
          <div className="card-stat">
            <div className="card-stat-val cs-interviews">{stats.interviews}</div>
            <div className="card-stat-lbl">Interviews</div>
          </div>
        </div>

        <div className="card-data">
          <div className="data-row">
            <span className="data-key">Avg response time</span>
            <span className={`data-val ${stats.avgDaysToReject > 14 ? 'warn' : ''}`}>
              {stats.avgDaysToReject > 0 ? `${stats.avgDaysToReject} days` : '—'}
            </span>
          </div>
          <div className="data-row">
            <span className="data-key">Ghost rate</span>
            <span className="data-val">{stats.ghostRate}%</span>
          </div>
          <div className="data-row">
            <span className="data-key">Most filtered at</span>
            <span className="data-val accent">{stats.topRejectionStage}</span>
          </div>
          <div className="data-row">
            <span className="data-key">Interview conversion</span>
            <span className={`data-val ${stats.interviewRate > 20 ? 'good' : ''}`}>{stats.interviewRate}%</span>
          </div>
        </div>

        {milestones.length > 0 && (
          <div className="card-badges">
            {milestones.map((m, i) => (
              <span key={i} className={`badge badge-${m.type}`}>{m.label}</span>
            ))}
          </div>
        )}

        <div className="card-quote">
          <p><em>{stats.totalRejections} rejections. Most weren't about you.</em> {getQuote()}</p>
        </div>

        <div className="card-footer">
          <span className="card-url">tryreject.co.uk</span>
          <span className="card-cta">decode your rejections →</span>
        </div>
      </div>

      {/* Share buttons - outside the card so they don't appear in download */}
      <div className="share-row">
        <button
          className="share-btn"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? '...' : '📥 Save'}
        </button>
        <button className="share-btn" onClick={() => handleShare('twitter')}>
          𝕏 Share
        </button>
        <button className="share-btn" onClick={() => handleShare('linkedin')}>
          in Share
        </button>
        <button className="share-btn" onClick={() => handleShare('copy')}>
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>

      <p className="share-note">sharing your journey helps other job seekers feel less alone</p>
      {shareError && <p className="share-error">{shareError}</p>}
    </div>
  );
}

function formatStage(stage: string): string {
  switch (stage) {
    case 'ats_filter': return 'ATS stage';
    case 'recruiter_screen': return 'Recruiter';
    case 'hiring_manager': return 'Hiring Manager';
    case 'final_round': return 'Final Round';
    default: return 'ATS stage';
  }
}

export default JourneyCard;
