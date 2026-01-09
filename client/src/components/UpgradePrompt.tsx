import { useState } from 'react';
import { UsageAction, getLimitLabel, canUseFeature, syncProStatusFromServer } from '../utils/usage';
import { useAuth } from './AuthButtons';
import './UpgradePrompt.css';

const STRIPE_LINKS = {
  monthly: 'https://buy.stripe.com/3cI14p8Ra9Mp9w0aiJ2kw00', // $12/month
  yearly: 'https://buy.stripe.com/bJe14pgjC4s58rWduV2kw01',   // $99/year
};

interface UpgradePromptProps {
  action: UsageAction;
  onClose?: () => void;
}

export function UpgradePrompt({ action, onClose }: UpgradePromptProps) {
  const { remaining, limit } = canUseFeature(action);
  const label = getLimitLabel(action);
  const { isSignedIn } = useAuth();
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Handle "I already paid" - verify from server (only works if signed in)
  const handleVerifyPurchase = async () => {
    if (!isSignedIn) {
      setVerifyError('Please sign in first to verify your purchase.');
      return;
    }

    setVerifying(true);
    setVerifyError(null);

    try {
      const isPro = await syncProStatusFromServer();
      if (isPro) {
        // Successfully verified from server - reload to apply
        window.location.reload();
      } else {
        // Not found in server database
        setVerifyError('No active subscription found for your account. If you just paid, wait a moment and try again.');
      }
    } catch {
      setVerifyError('Could not verify. Please try again or contact support.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="upgrade-prompt">
      <div className="upgrade-content">
        <div className="upgrade-icon">
          <span>PRO</span>
        </div>
        <h3>You've used all your free {label}</h3>
        <p className="upgrade-detail">
          Free tier: {limit} {label} per month
          <br />
          You've used: {limit - remaining} / {limit}
        </p>

        <div className="upgrade-benefits">
          <h4>Upgrade to Pro for:</h4>
          <ul>
            <li>Unlimited rejection decodes</li>
            <li>Unlimited application tracking</li>
            <li>Unlimited AI insights</li>
            <li>Unlimited role fit checks</li>
            <li>Priority support</li>
          </ul>
        </div>

        <div className="upgrade-buttons">
          <a
            href={STRIPE_LINKS.monthly}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-upgrade"
          >
            $12/month
          </a>
          <a
            href={STRIPE_LINKS.yearly}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-upgrade btn-yearly"
          >
            $99/year <span className="savings-badge">Save 31%</span>
          </a>
        </div>

        {onClose && (
          <button className="btn btn-secondary btn-small" onClick={onClose}>
            Maybe later
          </button>
        )}

        {isSignedIn && (
          <>
            <button
              className="btn-link already-paid"
              onClick={handleVerifyPurchase}
              disabled={verifying}
            >
              {verifying ? 'Verifying...' : 'I already paid - verify purchase'}
            </button>
            {verifyError && (
              <p className="verify-error">{verifyError}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Smaller inline prompt for soft limits
interface UsageBadgeProps {
  action: UsageAction;
  showWhenFull?: boolean;
}

export function UsageBadge({ action, showWhenFull = false }: UsageBadgeProps) {
  const { allowed, remaining, limit } = canUseFeature(action);

  // Don't show if pro or if we only show when full
  if (remaining === Infinity) return null;
  if (showWhenFull && allowed) return null;

  const isLow = remaining <= 2 && remaining > 0;
  const isEmpty = remaining === 0;

  return (
    <span className={`usage-badge ${isLow ? 'low' : ''} ${isEmpty ? 'empty' : ''}`}>
      {remaining}/{limit} left
    </span>
  );
}

// Warning banner when approaching limit
interface LimitWarningProps {
  action: UsageAction;
}

export function LimitWarning({ action }: LimitWarningProps) {
  const { allowed, remaining, limit } = canUseFeature(action);
  const label = getLimitLabel(action);

  if (remaining === Infinity || remaining > 2) return null;

  if (!allowed) {
    return (
      <div className="limit-warning limit-reached">
        <strong>Limit reached.</strong> You've used all {limit} free {label} this month.
        <div className="limit-warning-buttons">
          <a href={STRIPE_LINKS.monthly} target="_blank" rel="noopener noreferrer" className="btn btn-small btn-secondary">
            $12/mo
          </a>
          <a href={STRIPE_LINKS.yearly} target="_blank" rel="noopener noreferrer" className="btn btn-small btn-accent">
            $99/yr
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="limit-warning">
      <strong>{remaining} {label} remaining</strong> this month.
      <div className="limit-warning-buttons">
        <a href={STRIPE_LINKS.monthly} target="_blank" rel="noopener noreferrer" className="btn btn-small btn-secondary">
          $12/mo
        </a>
        <a href={STRIPE_LINKS.yearly} target="_blank" rel="noopener noreferrer" className="btn btn-small btn-accent">
          $99/yr
        </a>
      </div>
    </div>
  );
}
