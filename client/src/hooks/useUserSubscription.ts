import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';

interface UsageData {
  used: number;
  limit: number | 'unlimited';
}

interface UserData {
  isPro: boolean;
  isLoading: boolean;
  usage: {
    decodes: UsageData;
    applications: UsageData;
    insights: UsageData;
    roleFits: UsageData;
  };
  refetch: () => Promise<void>;
  incrementUsage: (action: 'decodes' | 'applications' | 'insights' | 'roleFits') => Promise<boolean>;
  canUse: (action: 'decodes' | 'applications' | 'insights' | 'roleFits') => boolean;
}

const API_URL = import.meta.env.VITE_API_URL || '';

const defaultUsage = {
  decodes: { used: 0, limit: 5 },
  applications: { used: 0, limit: 10 },
  insights: { used: 0, limit: 3 },
  roleFits: { used: 0, limit: 3 }
};

export function useUserSubscription(): UserData {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [usage, setUsage] = useState(defaultUsage);

  const fetchUserData = useCallback(async () => {
    if (!isSignedIn) {
      setIsLoading(false);
      setIsPro(false);
      setUsage(defaultUsage);
      return;
    }

    try {
      const token = await getToken();
      console.log('useUserSubscription: fetching /api/user/me with token:', token ? 'present' : 'missing');

      const response = await fetch(`${API_URL}/api/user/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      console.log('useUserSubscription: response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('useUserSubscription: isPro from server:', data.subscription?.isPro);
        setIsPro(data.subscription?.isPro || false);
        setUsage({
          decodes: data.usage?.decodes || defaultUsage.decodes,
          applications: data.usage?.applications || defaultUsage.applications,
          insights: data.usage?.insights || defaultUsage.insights,
          roleFits: data.usage?.roleFits || defaultUsage.roleFits
        });
      } else {
        console.error('useUserSubscription: error response:', response.status, await response.text());
      }
    } catch (error) {
      console.error('useUserSubscription: failed to fetch user data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const incrementUsage = useCallback(async (action: 'decodes' | 'applications' | 'insights' | 'roleFits'): Promise<boolean> => {
    if (!isSignedIn) return false;

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/user/usage/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsage(prev => ({
          ...prev,
          [action]: { used: data.used, limit: data.limit }
        }));
        return true;
      } else if (response.status === 403) {
        // Limit reached
        return false;
      }
    } catch (error) {
      console.error('Failed to increment usage:', error);
    }
    return false;
  }, [isSignedIn, getToken]);

  const canUse = useCallback((action: 'decodes' | 'applications' | 'insights' | 'roleFits'): boolean => {
    if (isPro) return true;
    const actionUsage = usage[action];
    if (typeof actionUsage.limit === 'string') return true; // 'unlimited'
    return actionUsage.used < actionUsage.limit;
  }, [isPro, usage]);

  return {
    isPro,
    isLoading,
    usage,
    refetch: fetchUserData,
    incrementUsage,
    canUse
  };
}
