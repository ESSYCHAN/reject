import { UsageAction, getLimitLabel, canUseFeature } from '../utils/usage';
import './UpgradePrompt.css';

interface UpgradePromptProps {
  action: UsageAction;
  onClose?: () => void;
}

export function UpgradePrompt({ action, onClose }: UpgradePromptProps) {
  const { remaining, limit } = canUseFeature(action);
  const label = getLimitLabel(action);

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

        <div className="upgrade-pricing">
          <div className="price-option">
            <span className="price">$12</span>
            <span className="period">/month</span>
          </div>
          <div className="price-divider">or</div>
          <div className="price-option yearly">
            <span className="price">$99</span>
            <span className="period">/year</span>
            <span className="savings">Save 31%</span>
          </div>
        </div>

        <button className="btn btn-primary btn-upgrade">
          Upgrade to Pro
        </button>

        {onClose && (
          <button className="btn btn-secondary btn-small" onClick={onClose}>
            Maybe later
          </button>
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
        <button className="btn btn-small btn-accent">Upgrade</button>
      </div>
    );
  }

  return (
    <div className="limit-warning">
      <strong>{remaining} {label} remaining</strong> this month.
      <button className="btn btn-small btn-secondary">Upgrade for unlimited</button>
    </div>
  );
}
