import { useState, useEffect } from 'react';
import { useAuth } from './AuthButtons';
import { useUserSubscription } from '../hooks/useUserSubscription';
import './SubscriptionManager.css';

const API_URL = import.meta.env.VITE_API_URL || '';

interface SubscriptionDetails {
  status: string;
  planType: string | null;
  customerId: string | null;
  currentPeriodEnd: string | null;
}

export function SubscriptionManager() {
  const { isSignedIn, userId } = useAuth();
  const { isPro: isProFromHook, isLoading } = useUserSubscription();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Fetch subscription details
  useEffect(() => {
    if (!isSignedIn || !userId) return;

    const fetchSubscription = async () => {
      setLoadingDetails(true);
      try {
        const response = await fetch(`${API_URL}/api/stripe/subscription/${userId}`);
        if (response.ok) {
          const data = await response.json();
          setSubscription(data.subscription);
        }
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchSubscription();
  }, [isSignedIn, userId]);

  const handleCancelSubscription = async () => {
    if (!userId) return;

    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? You will continue to have Pro access until the end of your billing period.'
    );

    if (!confirmed) return;

    setCanceling(true);
    setCancelError(null);

    try {
      const response = await fetch(`${API_URL}/api/stripe/cancel-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();

      if (response.ok) {
        setCancelSuccess(true);
        setSubscription(prev => prev ? { ...prev, status: 'canceling' } : null);
      } else {
        setCancelError(data.error || 'Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Cancel error:', error);
      setCancelError('Network error. Please try again.');
    } finally {
      setCanceling(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!subscription?.customerId) {
      setCancelError('No Stripe customer found. Please contact support.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/stripe/create-portal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: subscription.customerId,
          returnUrl: window.location.href
        })
      });

      const data = await response.json();

      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        setCancelError(data.error || 'Failed to open subscription portal');
      }
    } catch (error) {
      console.error('Portal error:', error);
      setCancelError('Network error. Please try again.');
    }
  };

  if (!isSignedIn) {
    return null;
  }

  if (isLoading || loadingDetails) {
    return (
      <div className="subscription-manager">
        <div className="subscription-loading">Loading subscription details...</div>
      </div>
    );
  }

  // Determine Pro status from directly fetched subscription (more reliable than localStorage)
  const isProFromServer = subscription?.status === 'active' || subscription?.status === 'pro';
  const isPro = isProFromServer || isProFromHook;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
      case 'pro':
        return 'Active';
      case 'canceling':
        return 'Canceling at period end';
      case 'canceled':
        return 'Canceled';
      default:
        return 'Free';
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="subscription-manager">
      <h3>Subscription</h3>

      <div className="subscription-status">
        <div className="status-row">
          <span className="status-label">Status:</span>
          <span className={`status-value ${isPro ? 'pro' : 'free'}`}>
            {isPro ? 'Pro' : 'Free'}
            {subscription?.status && subscription.status !== 'free' && (
              <span className="status-detail">({getStatusLabel(subscription.status)})</span>
            )}
          </span>
        </div>

        {subscription?.planType && (
          <div className="status-row">
            <span className="status-label">Plan:</span>
            <span className="status-value">
              {subscription.planType === 'yearly' ? 'Yearly ($99/year)' : 'Monthly ($12/month)'}
            </span>
          </div>
        )}

        {subscription?.currentPeriodEnd && (
          <div className="status-row">
            <span className="status-label">
              {subscription.status === 'canceling' ? 'Access until:' : 'Renews on:'}
            </span>
            <span className="status-value">{formatDate(subscription.currentPeriodEnd)}</span>
          </div>
        )}
      </div>

      {cancelError && (
        <div className="subscription-error">{cancelError}</div>
      )}

      {cancelSuccess && (
        <div className="subscription-success">
          Your subscription has been set to cancel at the end of your billing period.
        </div>
      )}

      {isPro && subscription?.status !== 'canceling' && subscription?.status !== 'canceled' && (
        <div className="subscription-actions">
          {subscription?.customerId ? (
            <button
              className="btn btn-secondary"
              onClick={handleManageSubscription}
            >
              Manage Subscription
            </button>
          ) : null}
          <button
            className="btn btn-danger"
            onClick={handleCancelSubscription}
            disabled={canceling}
          >
            {canceling ? 'Canceling...' : 'Cancel Subscription'}
          </button>
        </div>
      )}

      {!isPro && (
        <div className="subscription-upgrade">
          <p>Upgrade to Pro for unlimited access!</p>
          <div className="upgrade-links">
            <a
              href="https://buy.stripe.com/3cI14p8Ra9Mp9w0aiJ2kw00"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              $12/month
            </a>
            <a
              href="https://buy.stripe.com/bJe14pgjC4s58rWduV2kw01"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              $99/year (Save 31%)
            </a>
          </div>
        </div>
      )}

      <p className="subscription-help">
        Need help? Contact <a href="mailto:support@reject.app">support@reject.app</a>
      </p>
    </div>
  );
}
