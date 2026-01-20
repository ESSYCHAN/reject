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
          Check jobs before applying. Track what matters. Decode rejections.
        </p>

        {/* Smart entry points based on user journey */}
        <div className="entry-points">
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

          <button className="entry-card entry-decode" onClick={onGetStarted}>
            <span className="entry-icon">&#128274;</span>
            <div className="entry-text">
              <strong>Got a rejection?</strong>
              <span>Decode what it really means</span>
            </div>
            <span className="entry-arrow">&#8594;</span>
          </button>
        </div>

        <p className="hero-note">Free to use. No signup required to start.</p>
      </div>

      <div className="hero-demo">
        <div className="demo-card">
          <div className="demo-label">Example Job Check</div>
          <div className="demo-content">
            <div className="demo-category">
              <span className="category-badge category-door-open">75 Fit Score</span>
              <span className="confidence">Good match</span>
            </div>
            <div className="demo-insight">
              <strong>What to expect:</strong>
              <p>Strong fit for your experience. Requirements are realistic, salary is transparent, and direct apply is worth it. One red flag: "fast-paced" often means understaffed.</p>
            </div>
            <div className="demo-stage">
              <span className="stage-badge stage-recruiter">Worth applying</span>
              <span className="stage-note">Save or mark as applied</span>
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
