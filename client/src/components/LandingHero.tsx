import './LandingHero.css';

interface LandingHeroProps {
  onGetStarted: () => void;
}

export function LandingHero({ onGetStarted }: LandingHeroProps) {
  return (
    <section className="landing-hero">
      <div className="hero-content">
        <h1 className="hero-title">
          Stop guessing why you got rejected
        </h1>
        <p className="hero-subtitle">
          Paste any rejection email. Get the real reason, not the HR script.
        </p>

        <div className="hero-features">
          <div className="feature">
            <span className="feature-icon">🔍</span>
            <div>
              <strong>Decode the real meaning</strong>
              <p>AI analyzes hiring language to reveal what they actually meant</p>
            </div>
          </div>
          <div className="feature">
            <span className="feature-icon">📊</span>
            <div>
              <strong>Know where you got filtered</strong>
              <p>ATS? Recruiter? Hiring manager? Find out exactly where</p>
            </div>
          </div>
          <div className="feature">
            <span className="feature-icon">🎯</span>
            <div>
              <strong>Get actionable next steps</strong>
              <p>Strategic advice based on rejection patterns, not generic tips</p>
            </div>
          </div>
        </div>

        <button className="btn btn-primary hero-cta" onClick={onGetStarted}>
          Decode Your First Rejection
        </button>
        <p className="hero-note">Free to try. No signup required.</p>
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
