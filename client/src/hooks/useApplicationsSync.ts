import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ApplicationRecord } from '../types/pro';
import { clearAllUserData } from '../utils/usage';

// Track if user has ever signed in (to distinguish "never signed in" from "signed out")
const HAS_SIGNED_IN_KEY = 'reject_has_signed_in';

function hasEverSignedIn(): boolean {
  return localStorage.getItem(HAS_SIGNED_IN_KEY) === 'true';
}

function markAsSignedIn(): void {
  localStorage.setItem(HAS_SIGNED_IN_KEY, 'true');
}

const STORAGE_KEY = 'reject_pro_applications';
const DELETED_IDS_KEY = 'reject_deleted_ids';
const API_URL = import.meta.env.VITE_API_URL || '';

// Load deleted IDs from localStorage (persists across page refresh until server confirms)
function loadDeletedIds(): Set<string> {
  try {
    const stored = localStorage.getItem(DELETED_IDS_KEY);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

function saveDeletedIds(ids: Set<string>): void {
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(ids)));
}

function removeDeletedId(id: string): void {
  const ids = loadDeletedIds();
  ids.delete(id);
  saveDeletedIds(ids);
}

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
  // Load from localStorage initially - supports anonymous users and signed-in users
  const [applications, setApplications] = useState<ApplicationRecord[]>(() => {
    return loadLocalApplications();
  });
  const [isLoading, setIsLoading] = useState(false); // Only loading when syncing with server
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Fetch applications from server
  const fetchFromServer = useCallback(async (): Promise<ApplicationRecord[]> => {
    if (!isSignedIn) {
      console.log('useApplicationsSync: not signed in, skipping fetch');
      return [];
    }

    try {
      const token = await getToken();
      console.log('useApplicationsSync: fetching applications with token:', token ? 'present' : 'missing');

      const response = await fetch(`${API_URL}/api/applications`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      console.log('useApplicationsSync: fetch response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('useApplicationsSync: fetched', data.applications?.length || 0, 'applications from server');
        return data.applications || [];
      }
      console.error('Failed to fetch applications:', response.status, await response.text());
      return [];
    } catch (error) {
      console.error('Error fetching applications:', error);
      return [];
    }
  }, [isSignedIn, getToken]);

  // Push applications to server
  const pushToServer = useCallback(async (apps: ApplicationRecord[]): Promise<boolean> => {
    if (!isSignedIn || apps.length === 0) {
      console.log('useApplicationsSync: skip push - signed in:', isSignedIn, 'apps:', apps.length);
      return true;
    }

    try {
      const token = await getToken();
      console.log('useApplicationsSync: pushing', apps.length, 'applications to server');

      const response = await fetch(`${API_URL}/api/applications/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ applications: apps })
      });

      if (response.ok) {
        console.log('useApplicationsSync: successfully synced', apps.length, 'applications to server');
        return true;
      }
      console.error('useApplicationsSync: failed to sync:', response.status, await response.text());
      return false;
    } catch (error) {
      console.error('useApplicationsSync: error syncing:', error);
      return false;
    }
  }, [isSignedIn, getToken]);

  // Track deleted IDs to prevent re-sync from bringing them back (persists across refresh)
  const deletedIds = useRef<Set<string>>(loadDeletedIds());

  // Merge local and server applications (server wins for conflicts based on updatedAt)
  const mergeApplications = useCallback((local: ApplicationRecord[], server: ApplicationRecord[]): ApplicationRecord[] => {
    const merged = new Map<string, ApplicationRecord>();

    // Add all local apps first
    for (const app of local) {
      // Skip if this app was deleted in this session
      if (deletedIds.current.has(app.id)) continue;
      merged.set(app.id, app);
    }

    // Server apps override or add
    for (const app of server) {
      // Skip if this app was deleted in this session
      if (deletedIds.current.has(app.id)) continue;

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

  // Track if we've synced to avoid duplicate syncs
  const hasSynced = useRef(false);

  // Initial sync on mount when signed in
  // Only clear data when user explicitly signs OUT (not when they've never signed in)
  useEffect(() => {
    const everSignedIn = hasEverSignedIn();
    console.log('useApplicationsSync: effect triggered, isSignedIn:', isSignedIn, 'everSignedIn:', everSignedIn, 'hasSynced:', hasSynced.current);

    if (!isSignedIn) {
      hasSynced.current = false; // Reset when signed out

      // Only clear data if user has previously signed in (meaning they signed out)
      // This preserves data for anonymous users who haven't signed up yet
      if (everSignedIn) {
        setApplications([]);
        clearAllUserData();
        console.log('useApplicationsSync: cleared all user data on sign out');
      }
      setIsLoading(false);
      return;
    }

    // Mark that user has signed in (for future sign-out detection)
    markAsSignedIn();

    if (hasSynced.current) return; // Already synced this session
    hasSynced.current = true;

    const syncOnMount = async () => {
      setIsLoading(true);
      setLastSyncError(null);

      try {
        const localApps = loadLocalApplications();
        console.log('useApplicationsSync: starting sync, local apps:', localApps.length);

        const serverApps = await fetchFromServer();

        console.log(`useApplicationsSync: Sync - ${localApps.length} local, ${serverApps.length} server applications`);

        // Merge and update
        const merged = mergeApplications(localApps, serverApps);
        setApplications(merged);
        saveLocalApplications(merged);

        // Push merged back to server (to ensure server has local-only items)
        // Only push apps that aren't in the deleted list
        if (localApps.length > 0) {
          const appsToSync = merged.filter(app => !deletedIds.current.has(app.id));
          await pushToServer(appsToSync);
        }

        // Clean up deletedIds for apps that are confirmed gone from server
        // (they weren't in serverApps, so server confirmed delete)
        const serverIds = new Set(serverApps.map(a => a.id));
        for (const deletedId of deletedIds.current) {
          if (!serverIds.has(deletedId)) {
            // Server confirmed it's gone, safe to remove from tracking
            deletedIds.current.delete(deletedId);
          }
        }
        saveDeletedIds(deletedIds.current);

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
    // Track this ID as deleted to prevent re-sync from bringing it back
    deletedIds.current.add(id);
    saveDeletedIds(deletedIds.current);

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
        const response = await fetch(`${API_URL}/api/applications/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (response.ok) {
          console.log('useApplicationsSync: deleted from server:', id);
          // Keep in deletedIds until next page load to prevent race conditions
          // The ID will be cleaned up naturally when it's no longer on the server
        } else {
          console.error('useApplicationsSync: server delete failed:', response.status);
          // Keep tracking it so it doesn't come back on refresh
        }
      } catch (error) {
        console.error('Failed to delete from server:', error);
      } finally {
        setIsSyncing(false);
      }
    } else {
      // Not signed in, no server to confirm, clear tracking
      removeDeletedId(id);
      deletedIds.current.delete(id);
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
