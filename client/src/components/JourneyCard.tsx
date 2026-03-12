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

    const dates = appliedApps
      .map(a => a.dateApplied ? new Date(a.dateApplied).getTime() : 0)
      .filter(d => d > 0);
    const daysInSearch = dates.length >= 2
      ? Math.ceil((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24))
      : 0;

    const rejectionDays = appliedApps
      .filter(a => a.daysToResponse !== null)
      .map(a => a.daysToResponse!);
    const avgDaysToReject = rejectionDays.length > 0
      ? Math.round(rejectionDays.reduce((a, b) => a + b, 0) / rejectionDays.length)
      : 0;

    const stages: Record<string, number> = {};
    appliedApps.forEach(a => {
      if (a.rejectionAnalysis?.stageReached) {
        stages[a.rejectionAnalysis.stageReached] = (stages[a.rejectionAnalysis.stageReached] || 0) + 1;
      }
    });
    const topStage = Object.entries(stages).sort((a, b) => b[1] - a[1])[0];
    const topRejectionStage = topStage ? formatStage(topStage[0]) : 'ATS';

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
    if (stats.offers > 0) return "From rejection to offer. The grind paid off.";
    if (stats.interviews >= 5) return "Breaking through the ATS wall. Keep pushing.";
    if (stats.totalRejections >= 50) return "50+ rejections. Still standing. Still applying.";
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
      } catch { /* continue */ }
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
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

  if (stats.totalApplications === 0) return null;

  return (
    <div className="journey-card-wrapper">
      <div className="journey-card" ref={cardRef}>
        {/* Brand row */}
        <div className="card-brand">
          <span className="card-logo">REJECT</span>
          <span className="card-user">
            {userName || 'my journey'} · {stats.daysInSearch > 0 ? `${stats.daysInSearch} days in` : 'tracking'}
          </span>
        </div>

        {/* Two column body */}
        <div className="card-body">
          {/* Left - big stats */}
          <div className="card-left">
            <div className="section-label">// The real numbers</div>
            <div className="big-stats">
              <div className="big-stat">
                <div className="big-num n-applied">{stats.totalApplications}</div>
                <div className="big-lbl">Applied</div>
              </div>
              <div className="big-stat">
                <div className="big-num n-rejected">{stats.totalRejections}</div>
                <div className="big-lbl">Rejected</div>
              </div>
              <div className="big-stat">
                <div className="big-num n-ghosted">{stats.ghosted}</div>
                <div className="big-lbl">Ghosted</div>
              </div>
              <div className="big-stat">
                <div className="big-num n-interviews">{stats.interviews}</div>
                <div className="big-lbl">Interviews</div>
              </div>
            </div>
            {milestones.length > 0 && (
              <div className="card-badges">
                {milestones.map((m, i) => (
                  <span key={i} className={`badge b-${m.type}`}>{m.label}</span>
                ))}
              </div>
            )}
          </div>

          {/* Right - breakdown */}
          <div className="card-right">
            <div className="section-label">// Breakdown</div>
            <div className="detail-rows">
              <div className="detail-row">
                <span className="d-key">Days searching</span>
                <span className="d-val">{stats.daysInSearch || '—'}</span>
              </div>
              <div className="detail-row">
                <span className="d-key">Avg response</span>
                <span className={`d-val ${stats.avgDaysToReject > 14 ? 'd-warn' : ''}`}>
                  {stats.avgDaysToReject > 0 ? `${stats.avgDaysToReject} days` : '—'}
                </span>
              </div>
              <div className="detail-row">
                <span className="d-key">Ghost rate</span>
                <span className="d-val">{stats.ghostRate}%</span>
              </div>
              <div className="detail-row">
                <span className="d-key">Filtered at</span>
                <span className="d-val d-accent">{stats.topRejectionStage}</span>
              </div>
              <div className="detail-row">
                <span className="d-key">Interview rate</span>
                <span className={`d-val ${stats.interviewRate > 20 ? 'd-good' : ''}`}>{stats.interviewRate}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quote */}
        <div className="card-quote">
          <p><strong>{stats.totalRejections} rejections. Most weren't about you.</strong> {getQuote()}</p>
        </div>

        {/* Footer */}
        <div className="card-footer">
          <span className="card-url">tryreject.co.uk</span>
        </div>
      </div>

      {/* Share buttons */}
      <div className="share-row">
        <button className="share-btn" onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? '...' : '📥 Save'}
        </button>
        <button className="share-btn" onClick={() => handleShare('twitter')}>𝕏 Share</button>
        <button className="share-btn" onClick={() => handleShare('linkedin')}>in Share</button>
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
