import './LandingHero.css';

interface LandingHeroProps {
  onGetStarted: () => void;
  onCheckFit?: () => void;
  onTrackApp?: () => void;
}

export function LandingHero({ onGetStarted, onCheckFit, onTrackApp }: LandingHeroProps) {
  return (
    <section className="landing-hero">
      <div className="hero-content">
        <h1 className="hero-title">
          Your job search companion
        </h1>
        <p className="hero-subtitle">
          Decode rejections. Check fit before applying. Track what matters.
        </p>

        {/* Smart entry points based on user journey */}
        <div className="entry-points">
          <button className="entry-card entry-decode" onClick={onGetStarted}>
            <span className="entry-icon">&#128274;</span>
            <div className="entry-text">
              <strong>Got a rejection?</strong>
              <span>Decode what it really means</span>
            </div>
            <span className="entry-arrow">&#8594;</span>
          </button>

          <button className="entry-card entry-fit" onClick={onCheckFit}>
            <span className="entry-icon">&#127919;</span>
            <div className="entry-text">
              <strong>Found a job?</strong>
              <span>Check if it's worth applying</span>
            </div>
            <span className="entry-arrow">&#8594;</span>
          </button>

          <button className="entry-card entry-track" onClick={onTrackApp}>
            <span className="entry-icon">&#128203;</span>
            <div className="entry-text">
              <strong>Already applied?</strong>
              <span>Track your applications</span>
            </div>
            <span className="entry-arrow">&#8594;</span>
          </button>
        </div>

        <p className="hero-note">Free to use. No signup required to start.</p>
      </div>

      <div className="hero-demo">
        <div className="demo-card">
          <div className="demo-label">Example Analysis</div>
          <div className="demo-content">
            <div className="demo-category">
              <span className="category-badge category-soft-no">Soft No</span>
              <span className="confidence">87% confidence</span>
            </div>
            <div className="demo-insight">
              <strong>What it means:</strong>
              <p>"We went with other candidates" = You made it past ATS but got filtered at recruiter screen. The timing (3 days) suggests a quick human review, not deep consideration.</p>
            </div>
            <div className="demo-stage">
              <span className="stage-badge stage-recruiter">Recruiter Screen</span>
              <span className="stage-note">Filtered before hiring manager</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PromoStrip() {
  return (
    <div className="promo-strip">
      <div className="promo-content">
        <span className="promo-stat">2,847</span> rejection emails decoded
        <span className="promo-divider">•</span>
        <span className="promo-stat">73%</span> of rejections happen before human review
        <span className="promo-divider">•</span>
        <span className="promo-stat">Free</span> to start
      </div>
    </div>
  );
}
