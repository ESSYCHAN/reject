import { useClerk } from '@clerk/clerk-react';
import './SignupPrompt.css';

interface SignupPromptProps {
  decodeCount: number;
  onDismiss: () => void;
  variant?: 'inline' | 'modal';
}

export function SignupPrompt({ decodeCount, onDismiss, variant = 'inline' }: SignupPromptProps) {
  const { openSignUp } = useClerk();

  const handleSignUp = () => {
    openSignUp({});
  };

  if (variant === 'modal') {
    return (
      <div className="signup-prompt-overlay">
        <div className="signup-prompt-modal">
          <button className="signup-prompt-close" onClick={onDismiss}>×</button>

          <div className="signup-prompt-content">
            <div className="signup-prompt-icon">&#128202;</div>
            <h3>You've decoded {decodeCount} rejections</h3>
            <p className="signup-prompt-main">
              Sign up to see patterns across your rejections and track your progress over time.
            </p>

            <div className="signup-prompt-benefits">
              <div className="benefit">
                <span className="benefit-icon">&#128200;</span>
                <span>See where you're getting filtered</span>
              </div>
              <div className="benefit">
                <span className="benefit-icon">&#128203;</span>
                <span>Track all your applications</span>
              </div>
              <div className="benefit">
                <span className="benefit-icon">&#128274;</span>
                <span>Never lose your data</span>
              </div>
            </div>

            <button className="btn btn-primary signup-prompt-btn" onClick={handleSignUp}>
              Sign up free
            </button>
            <button className="signup-prompt-skip" onClick={onDismiss}>
              Maybe later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Inline variant (banner)
  return (
    <div className="signup-prompt-banner">
      <div className="signup-banner-content">
        <span className="signup-banner-text">
          <strong>{decodeCount} rejections decoded.</strong> Sign up to see your patterns and sync across devices.
        </span>
        <div className="signup-banner-actions">
          <button className="btn btn-primary btn-sm" onClick={handleSignUp}>
            Sign up free
          </button>
          <button className="signup-banner-dismiss" onClick={onDismiss}>×</button>
        </div>
      </div>
    </div>
  );
}

// Hook to check if we should show signup prompt
export function useSignupPrompt() {
  const SIGNUP_PROMPT_THRESHOLD = 3;
  const DISMISSED_KEY = 'reject_signup_dismissed';

  const isDismissed = (): boolean => {
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (!dismissed) return false;
      // Auto-reset after 7 days
      const dismissedAt = parseInt(dismissed, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      return Date.now() - dismissedAt < sevenDays;
    } catch {
      return false;
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    } catch {
      // ignore
    }
  };

  const shouldShow = (decodeCount: number, isSignedIn: boolean): boolean => {
    if (isSignedIn) return false;
    if (isDismissed()) return false;
    return decodeCount >= SIGNUP_PROMPT_THRESHOLD;
  };

  return { shouldShow, dismiss, threshold: SIGNUP_PROMPT_THRESHOLD };
}
