import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ApplicationRecord } from '../types/pro';

const STORAGE_KEY = 'reject_pro_applications';
const API_URL = import.meta.env.VITE_API_URL || '';

interface StoredData {
  version: number;
  applications: ApplicationRecord[];
}

function loadLocalApplications(): ApplicationRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const data: StoredData = JSON.parse(stored);
    return data.applications || [];
  } catch {
    return [];
  }
}

function saveLocalApplications(applications: ApplicationRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, applications }));
}

export function useApplicationsSync() {
  const { isSignedIn, getToken } = useAuth();
  const [applications, setApplications] = useState<ApplicationRecord[]>(loadLocalApplications);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Fetch applications from server
  const fetchFromServer = useCallback(async (): Promise<ApplicationRecord[]> => {
    if (!isSignedIn) return [];

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/applications`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.applications || [];
      }
      console.error('Failed to fetch applications:', response.status);
      return [];
    } catch (error) {
      console.error('Error fetching applications:', error);
      return [];
    }
  }, [isSignedIn, getToken]);

  // Push applications to server
  const pushToServer = useCallback(async (apps: ApplicationRecord[]): Promise<boolean> => {
    if (!isSignedIn || apps.length === 0) return true;

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/applications/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ applications: apps })
      });

      if (response.ok) {
        console.log(`Synced ${apps.length} applications to server`);
        return true;
      }
      console.error('Failed to sync applications:', response.status);
      return false;
    } catch (error) {
      console.error('Error syncing applications:', error);
      return false;
    }
  }, [isSignedIn, getToken]);

  // Merge local and server applications (server wins for conflicts based on updatedAt)
  const mergeApplications = useCallback((local: ApplicationRecord[], server: ApplicationRecord[]): ApplicationRecord[] => {
    const merged = new Map<string, ApplicationRecord>();

    // Add all local apps first
    for (const app of local) {
      merged.set(app.id, app);
    }

    // Server apps override or add
    for (const app of server) {
      const existing = merged.get(app.id);
      if (!existing) {
        merged.set(app.id, app);
      } else {
        // If server has updatedAt, prefer server version
        const serverUpdated = (app as ApplicationRecord & { updatedAt?: string }).updatedAt;
        if (serverUpdated) {
          merged.set(app.id, app);
        }
      }
    }

    return Array.from(merged.values());
  }, []);

  // Initial sync on mount when signed in
  useEffect(() => {
    if (!isSignedIn) return;

    const syncOnMount = async () => {
      setIsLoading(true);
      setLastSyncError(null);

      try {
        const localApps = loadLocalApplications();
        const serverApps = await fetchFromServer();

        console.log(`Sync: ${localApps.length} local, ${serverApps.length} server applications`);

        // Merge and update
        const merged = mergeApplications(localApps, serverApps);
        setApplications(merged);
        saveLocalApplications(merged);

        // Push merged back to server (to ensure server has local-only items)
        if (localApps.length > 0) {
          await pushToServer(merged);
        }

        console.log(`Sync complete: ${merged.length} total applications`);
      } catch (error) {
        console.error('Sync error:', error);
        setLastSyncError('Failed to sync applications');
      } finally {
        setIsLoading(false);
      }
    };

    syncOnMount();
  }, [isSignedIn, fetchFromServer, mergeApplications, pushToServer]);

  // Add or update an application
  const saveApplication = useCallback(async (app: ApplicationRecord) => {
    // Update local state immediately
    setApplications(prev => {
      const updated = prev.filter(a => a.id !== app.id);
      updated.unshift(app);
      saveLocalApplications(updated);
      return updated;
    });

    // Sync to server if signed in
    if (isSignedIn) {
      setIsSyncing(true);
      try {
        const token = await getToken();
        await fetch(`${API_URL}/api/applications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(app)
        });
      } catch (error) {
        console.error('Failed to save to server:', error);
      } finally {
        setIsSyncing(false);
      }
    }
  }, [isSignedIn, getToken]);

  // Delete an application
  const deleteApplication = useCallback(async (id: string) => {
    // Update local state immediately
    setApplications(prev => {
      const updated = prev.filter(a => a.id !== id);
      saveLocalApplications(updated);
      return updated;
    });

    // Sync delete to server if signed in
    if (isSignedIn) {
      setIsSyncing(true);
      try {
        const token = await getToken();
        await fetch(`${API_URL}/api/applications/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } catch (error) {
        console.error('Failed to delete from server:', error);
      } finally {
        setIsSyncing(false);
      }
    }
  }, [isSignedIn, getToken]);

  // Update all applications (for bulk updates)
  const updateApplications = useCallback(async (newApps: ApplicationRecord[]) => {
    setApplications(newApps);
    saveLocalApplications(newApps);

    if (isSignedIn) {
      setIsSyncing(true);
      try {
        await pushToServer(newApps);
      } finally {
        setIsSyncing(false);
      }
    }
  }, [isSignedIn, pushToServer]);

  // Force refresh from server
  const refresh = useCallback(async () => {
    if (!isSignedIn) return;

    setIsLoading(true);
    try {
      const serverApps = await fetchFromServer();
      setApplications(serverApps);
      saveLocalApplications(serverApps);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, fetchFromServer]);

  return {
    applications,
    isLoading,
    isSyncing,
    lastSyncError,
    saveApplication,
    deleteApplication,
    updateApplications,
    refresh
  };
}
