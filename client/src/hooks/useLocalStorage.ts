import { useState, useEffect, useCallback } from 'react';
import { Application, StoredData, STORAGE_KEY, STORAGE_VERSION } from '../types';

function loadApplications(): Application[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const data: StoredData = JSON.parse(stored);

    if (data.version !== STORAGE_VERSION) {
      console.warn('Storage version mismatch, migrating...');
      return data.applications || [];
    }

    return data.applications;
  } catch {
    console.error('Failed to load applications from storage');
    return [];
  }
}

function saveApplications(applications: Application[]): void {
  const data: StoredData = {
    version: STORAGE_VERSION,
    applications
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function useApplications() {
  const [applications, setApplications] = useState<Application[]>(() => loadApplications());

  useEffect(() => {
    saveApplications(applications);
  }, [applications]);

  const addApplication = useCallback((app: Omit<Application, 'id'>) => {
    const newApp: Application = {
      ...app,
      id: crypto.randomUUID()
    };
    setApplications(prev => [newApp, ...prev]);
  }, []);

  const updateApplication = useCallback((id: string, updates: Partial<Application>) => {
    setApplications(prev =>
      prev.map(app =>
        app.id === id
          ? {
              ...app,
              ...updates,
              outcomeDate: updates.status && updates.status !== 'pending' && updates.status !== 'interviewing'
                ? updates.outcomeDate || new Date().toISOString().split('T')[0]
                : app.outcomeDate
            }
          : app
      )
    );
  }, []);

  const deleteApplication = useCallback((id: string) => {
    setApplications(prev => prev.filter(app => app.id !== id));
  }, []);

  return {
    applications,
    addApplication,
    updateApplication,
    deleteApplication
  };
}
