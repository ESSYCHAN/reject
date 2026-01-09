// Usage tracking for freemium model

export const FREE_LIMITS = {
  decodes_per_month: 5,
  applications: 10,
  insights_runs: 3,
  role_fit_checks: 3
} as const;

export type UsageAction = keyof typeof FREE_LIMITS;

interface UsageData {
  month: string; // YYYY-MM format
  decodes_per_month: number;
  applications: number;
  insights_runs: number;
  role_fit_checks: number;
  isPro: boolean;
}

const STORAGE_KEY = 'reject_usage';

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getDefaultUsage(): UsageData {
  return {
    month: getCurrentMonth(),
    decodes_per_month: 0,
    applications: 0,
    insights_runs: 0,
    role_fit_checks: 0,
    isPro: false
  };
}

export function loadUsage(): UsageData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return getDefaultUsage();

    const data = JSON.parse(stored) as UsageData;

    // Reset monthly counters if new month
    const currentMonth = getCurrentMonth();
    if (data.month !== currentMonth) {
      return {
        ...getDefaultUsage(),
        applications: data.applications, // Applications persist
        isPro: data.isPro
      };
    }

    return data;
  } catch {
    return getDefaultUsage();
  }
}

export function saveUsage(usage: UsageData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

export function incrementUsage(action: UsageAction): UsageData {
  const usage = loadUsage();
  usage[action]++;
  usage.month = getCurrentMonth();
  saveUsage(usage);
  return usage;
}

export function canUseFeature(action: UsageAction): { allowed: boolean; remaining: number; limit: number } {
  const usage = loadUsage();

  if (usage.isPro) {
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }

  const limit = FREE_LIMITS[action];
  const used = usage[action];
  const remaining = Math.max(0, limit - used);

  return {
    allowed: used < limit,
    remaining,
    limit
  };
}

export function getUsageSummary(): {
  usage: UsageData;
  limits: typeof FREE_LIMITS;
  isPro: boolean;
} {
  const usage = loadUsage();
  return {
    usage,
    limits: FREE_LIMITS,
    isPro: usage.isPro
  };
}

// For testing/demo - set pro status
export function setProStatus(isPro: boolean): void {
  const usage = loadUsage();
  usage.isPro = isPro;
  saveUsage(usage);
}

// Get human-readable limit name
export function getLimitLabel(action: UsageAction): string {
  const labels: Record<UsageAction, string> = {
    decodes_per_month: 'rejection decodes',
    applications: 'tracked applications',
    insights_runs: 'insight analyses',
    role_fit_checks: 'role fit checks'
  };
  return labels[action];
}
