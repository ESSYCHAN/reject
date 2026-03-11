import { useState } from 'react';
import { UserProfile } from './UserProfile';
import { SubscriptionManager } from './SubscriptionManager';
import './AccountPage.css';

type AccountTab = 'profile' | 'subscription';

export function AccountPage() {
  const [activeTab, setActiveTab] = useState<AccountTab>('profile');

  return (
    <div className="account-page-container">
      <h2>Account Settings</h2>

      <div className="account-tabs">
        <button
          className={`account-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button
          className={`account-tab ${activeTab === 'subscription' ? 'active' : ''}`}
          onClick={() => setActiveTab('subscription')}
        >
          Subscription
        </button>
      </div>

      <div className="account-content">
        {activeTab === 'profile' && <UserProfile />}
        {activeTab === 'subscription' && <SubscriptionManager />}
      </div>
    </div>
  );
}
