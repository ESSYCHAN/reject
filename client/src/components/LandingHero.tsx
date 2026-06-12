import './LandingHero.css';

interface LandingHeroProps {
  onGetStarted: () => void;
  onCheckFit?: () => void;
  onTrackApp?: () => void;
  onAICoach?: () => void;
  onDiagnose?: () => void;
}

export function LandingHero({ onGetStarted, onTrackApp, onAICoach, onDiagnose }: LandingHeroProps) {
  const diagnose = onDiagnose || onTrackApp || onGetStarted;

  return (
    <div className="landing">
      <nav className="landing-nav">
        <button className="landing-logo" onClick={diagnose}>
          REJECT <span className="logo-stamp">diagnosed</span>
        </button>

        <button className="nav-cta" onClick={diagnose}>
          Try free
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="landing-hero">
        <div className="hero-content">
          <span className="hero-eyebrow">Job Search Diagnosis</span>
          <h1 className="hero-title">
            Stop guessing where your job search is breaking.
          </h1>
          <p className="hero-subtitle">
            REJECT tracks your applications and decodes your rejections to pinpoint exactly where
            you're getting filtered — ATS, recruiter, interview, or final stage — and what to do
            about it.
          </p>

          <button className="hero-cta" onClick={diagnose}>
            Get my job-search diagnosis
            <span className="entry-arrow">&#8594;</span>
          </button>
          <p className="hero-note">First decode free · no card needed</p>

          <div className="trust-row">
            <span className="trust-item"><span className="trust-dot" /> No card</span>
            <span className="trust-item"><span className="trust-dot" /> Private</span>
            <span className="trust-item"><span className="trust-dot" /> Takes 60 seconds</span>
          </div>
        </div>

        {/* Diagnosis card */}
        <div className="hero-visual">
          <div className="diag-card">
            <div className="diag-card-head">
              <span className="diag-card-label">Job Search Diagnosis</span>
              <span className="diag-card-pill">47 applications</span>
            </div>

            <div className="diag-stats">
              <div className="diag-stat">
                <span className="diag-stat-label">ATS rejections</span>
                <div className="diag-bar"><div className="diag-bar-fill bad" style={{ width: '68%' }} /></div>
                <span className="diag-stat-value">68%</span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">Recruiter rejections</span>
                <div className="diag-bar"><div className="diag-bar-fill warn" style={{ width: '18%' }} /></div>
                <span className="diag-stat-value">18%</span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">Interview rate</span>
                <div className="diag-bar"><div className="diag-bar-fill ok" style={{ width: '6%' }} /></div>
                <span className="diag-stat-value">6%</span>
              </div>
              <div className="diag-stat">
                <span className="diag-stat-label">Offer rate</span>
                <div className="diag-bar"><div className="diag-bar-fill" style={{ width: '2%' }} /></div>
                <span className="diag-stat-value">0%</span>
              </div>
            </div>

            <div className="diag-verdict">
              <span className="diag-verdict-label">Diagnosis</span>
              <p>
                Your biggest bottleneck is <strong>ATS filtering</strong>. Your CV is not reaching
                enough humans.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 1: capabilities ── */}
      <section className="landing-section">
        <h2 className="section-heading">Everything you need to turn no into data</h2>
        <div className="cap-grid">
          <button className="cap-card" onClick={onGetStarted}>
            <span className="cap-icon">📩</span>
            <strong>Decode rejections</strong>
            <p>Paste any rejection email and see what it really means — and which stage it came from.</p>
          </button>
          <button className="cap-card" onClick={onTrackApp}>
            <span className="cap-icon">📋</span>
            <strong>Track applications</strong>
            <p>Log applications and outcomes in seconds. Every entry sharpens your diagnosis.</p>
          </button>
          <button className="cap-card" onClick={diagnose}>
            <span className="cap-icon">🩺</span>
            <strong>Diagnose bottlenecks</strong>
            <p>One clear answer: ATS, recruiter, interview, or final stage — with a plan to fix it.</p>
          </button>
        </div>
      </section>

      {/* ── SECTION 2: health report preview ── */}
      <section className="landing-section report-section">
        <div className="report-copy">
          <span className="hero-eyebrow">Your report</span>
          <h2 className="section-heading left">Job Search Health Report</h2>
          <p className="section-sub">
            See your funnel end to end — where applications enter, where they leak, and the single
            biggest issue holding you back.
          </p>
          <button className="hero-cta secondary" onClick={diagnose}>
            See sample report
            <span className="entry-arrow">&#8594;</span>
          </button>
        </div>

        <div className="report-preview">
          <div className="report-preview-head">
            <span className="diag-card-label">Health Report</span>
          </div>
          <div className="funnel">
            <FunnelRow label="ATS Screening" value={72} tone="bad" />
            <FunnelRow label="Recruiter Review" value={12} tone="warn" />
            <FunnelRow label="Interview" value={6} tone="ok" />
            <FunnelRow label="Offer" value={0} tone="flat" />
          </div>
          <div className="report-issue">
            <span className="report-issue-label">Biggest issue</span>
            <strong>ATS filtering</strong>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: pricing ── */}
      <section className="landing-section">
        <h2 className="section-heading">Simple pricing</h2>
        <div className="price-grid">
          <div className="price-card">
            <span className="price-tier">Free</span>
            <div className="price-amount">£0</div>
            <ul className="price-features">
              <li>3 decodes</li>
              <li>10 applications</li>
              <li>Basic stats</li>
            </ul>
            <button className="price-btn ghost" onClick={onGetStarted}>Start free</button>
          </div>

          <div className="price-card featured">
            <span className="price-badge">Most popular</span>
            <span className="price-tier">Diagnosis Report</span>
            <div className="price-amount">£19<span className="price-period"> one-off</span></div>
            <ul className="price-features">
              <li>Full job-search breakdown</li>
              <li>CV / JD improvement plan</li>
              <li>7-day action plan</li>
            </ul>
            <button className="price-btn" onClick={diagnose}>Get my report</button>
          </div>

          <div className="price-card">
            <span className="price-tier">Pro</span>
            <div className="price-amount">£9<span className="price-period">/month</span></div>
            <ul className="price-features">
              <li>Unlimited tracking</li>
              <li>Unlimited decodes</li>
              <li>Maya coach + company insights</li>
            </ul>
            <button className="price-btn ghost" onClick={onAICoach}>Go Pro</button>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: final CTA ── */}
      <section className="landing-final">
        <h2 className="final-title">Paste your last rejection.</h2>
        <p className="final-sub">See where your search is breaking in 60 seconds. First decode free.</p>
        <div className="final-cta">
          <input
            className="final-input"
            placeholder="Paste your rejection email here…"
            onFocus={onGetStarted}
            readOnly
          />
          <button className="hero-cta" onClick={onGetStarted}>Decode it free</button>
        </div>
        <button className="maya-link" onClick={onAICoach}>
          Prefer to talk it through? Maya, your coach, can walk you through your results →
        </button>
      </section>
    </div>
  );
}

function FunnelRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="funnel-row">
      <span className="funnel-label">{label}</span>
      <div className="funnel-track">
        <div className={`funnel-fill tone-${tone}`} style={{ width: `${Math.max(value, 2)}%` }} />
      </div>
      <span className="funnel-value">{value}%</span>
    </div>
  );
}

export function PromoStrip() {
  return (
    <div className="promo-strip">
      <div className="promo-content">
        <span className="promo-stat">73%</span> of rejections happen before a human ever reviews you
        <span className="promo-divider">•</span>
        <span className="promo-stat">First decode free</span>
      </div>
    </div>
  );
}
