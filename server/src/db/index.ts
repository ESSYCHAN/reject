import pg from 'pg';
const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database schema
export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Users table (synced with Clerk)
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Subscriptions table
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id TEXT UNIQUE REFERENCES users(id),
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        status TEXT DEFAULT 'free',
        plan_type TEXT,
        current_period_end TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Usage tracking table
      CREATE TABLE IF NOT EXISTS usage (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        action TEXT NOT NULL,
        month_key TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        UNIQUE(user_id, action, month_key)
      );

      -- Rejection data (for B2B insights)
      CREATE TABLE IF NOT EXISTS rejection_data (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        company_name TEXT,
        industry TEXT,
        company_size TEXT,
        role_title TEXT,
        seniority_level TEXT,
        rejection_category TEXT,
        signals JSONB,
        source TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Applications table
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        company TEXT NOT NULL,
        role TEXT NOT NULL,
        seniority_level TEXT,
        company_size TEXT,
        industry TEXT,
        source TEXT,
        date_applied DATE,
        outcome TEXT,
        days_to_response INTEGER,
        rejection_analysis JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Subscribers table (for newsletter/email collection)
      CREATE TABLE IF NOT EXISTS subscribers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'website'
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage(user_id, month_key);
      CREATE INDEX IF NOT EXISTS idx_rejection_company ON rejection_data(company_name);
      CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
    `);
    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

// Query helper
export async function query(text: string, params?: unknown[]) {
  const result = await pool.query(text, params);
  return result;
}

// User operations
export async function upsertUser(userId: string, email: string) {
  await query(
    `INSERT INTO users (id, email, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET email = $2, updated_at = CURRENT_TIMESTAMP`,
    [userId, email]
  );
}

export async function getSubscription(userId: string) {
  const result = await query(
    'SELECT * FROM subscriptions WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function updateSubscription(
  userId: string,
  data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    status?: string;
    planType?: string;
    currentPeriodEnd?: Date;
  }
) {
  await query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, plan_type, current_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       stripe_customer_id = COALESCE($2, subscriptions.stripe_customer_id),
       stripe_subscription_id = COALESCE($3, subscriptions.stripe_subscription_id),
       status = COALESCE($4, subscriptions.status),
       plan_type = COALESCE($5, subscriptions.plan_type),
       current_period_end = COALESCE($6, subscriptions.current_period_end),
       updated_at = CURRENT_TIMESTAMP`,
    [userId, data.stripeCustomerId, data.stripeSubscriptionId, data.status, data.planType, data.currentPeriodEnd]
  );
}

// Usage operations
export async function getUsage(userId: string, monthKey: string) {
  const result = await query(
    'SELECT action, count FROM usage WHERE user_id = $1 AND month_key = $2',
    [userId, monthKey]
  );
  return result.rows.reduce((acc, row) => {
    acc[row.action] = row.count;
    return acc;
  }, {} as Record<string, number>);
}

export async function incrementUsage(userId: string, action: string, monthKey: string) {
  const result = await query(
    `INSERT INTO usage (user_id, action, month_key, count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (user_id, action, month_key)
     DO UPDATE SET count = usage.count + 1
     RETURNING count`,
    [userId, action, monthKey]
  );
  return result.rows[0]?.count || 0;
}

// Rejection data (for B2B analytics)
export async function saveRejectionData(
  userId: string,
  data: {
    companyName?: string;
    industry?: string;
    companySize?: string;
    roleTitle?: string;
    seniorityLevel?: string;
    rejectionCategory?: string;
    signals?: string[];
    source?: string;
  }
) {
  await query(
    `INSERT INTO rejection_data
     (user_id, company_name, industry, company_size, role_title, seniority_level, rejection_category, signals, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, data.companyName, data.industry, data.companySize, data.roleTitle,
     data.seniorityLevel, data.rejectionCategory, JSON.stringify(data.signals || []), data.source]
  );
}

// ============ COMMUNITY COMPANY INTELLIGENCE ============

export interface CommunityCompanyStats {
  company: string;
  totalApplications: number;
  uniqueApplicants: number;
  avgDaysToResponse: number | null;
  ghostRate: number;
  rejectionCategories: { category: string; count: number; percentage: number }[];
  topSignals: { signal: string; count: number }[];
  seniorityBreakdown: { level: string; count: number }[];
  mostCommonOutcome: string | null;
}

/**
 * Get aggregated company stats from all users
 * Only returns companies with MIN_APPLICATIONS threshold for privacy
 */
export async function getCommunityCompanyStats(minApplications = 10): Promise<CommunityCompanyStats[]> {
  // Get companies with enough data points
  const companiesResult = await query(`
    SELECT
      LOWER(TRIM(company_name)) as company_key,
      company_name,
      COUNT(*) as total_applications,
      COUNT(DISTINCT user_id) as unique_applicants
    FROM rejection_data
    WHERE company_name IS NOT NULL AND TRIM(company_name) != ''
    GROUP BY LOWER(TRIM(company_name)), company_name
    HAVING COUNT(*) >= $1
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `, [minApplications]);

  const stats: CommunityCompanyStats[] = [];

  for (const row of companiesResult.rows) {
    const companyKey = row.company_key;

    // Get rejection categories for this company
    const categoriesResult = await query(`
      SELECT rejection_category, COUNT(*) as count
      FROM rejection_data
      WHERE LOWER(TRIM(company_name)) = $1 AND rejection_category IS NOT NULL
      GROUP BY rejection_category
      ORDER BY count DESC
    `, [companyKey]);

    const totalWithCategory = categoriesResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    const rejectionCategories = categoriesResult.rows.map(r => ({
      category: r.rejection_category,
      count: parseInt(r.count),
      percentage: totalWithCategory > 0 ? Math.round((parseInt(r.count) / totalWithCategory) * 100) : 0
    }));

    // Get seniority breakdown
    const seniorityResult = await query(`
      SELECT seniority_level, COUNT(*) as count
      FROM rejection_data
      WHERE LOWER(TRIM(company_name)) = $1 AND seniority_level IS NOT NULL
      GROUP BY seniority_level
      ORDER BY count DESC
    `, [companyKey]);

    const seniorityBreakdown = seniorityResult.rows.map(r => ({
      level: r.seniority_level,
      count: parseInt(r.count)
    }));

    // Get aggregated signals
    const signalsResult = await query(`
      SELECT signals
      FROM rejection_data
      WHERE LOWER(TRIM(company_name)) = $1 AND signals IS NOT NULL
    `, [companyKey]);

    const signalCounts: Record<string, number> = {};
    for (const r of signalsResult.rows) {
      try {
        const signals = typeof r.signals === 'string' ? JSON.parse(r.signals) : r.signals;
        if (Array.isArray(signals)) {
          for (const signal of signals) {
            signalCounts[signal] = (signalCounts[signal] || 0) + 1;
          }
        }
      } catch { /* ignore parsing errors */ }
    }

    const topSignals = Object.entries(signalCounts)
      .map(([signal, count]) => ({ signal, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate ghost rate from applications table if available
    const ghostResult = await query(`
      SELECT
        COUNT(*) FILTER (WHERE outcome = 'ghosted') as ghosted,
        COUNT(*) as total
      FROM applications
      WHERE LOWER(TRIM(company)) = $1 AND outcome IS NOT NULL AND outcome != 'pending'
    `, [companyKey]);

    const ghosted = parseInt(ghostResult.rows[0]?.ghosted || '0');
    const totalResolved = parseInt(ghostResult.rows[0]?.total || '0');
    const ghostRate = totalResolved > 0 ? Math.round((ghosted / totalResolved) * 100) : 0;

    // Get avg days to response
    const responseTimeResult = await query(`
      SELECT AVG(days_to_response) as avg_days
      FROM applications
      WHERE LOWER(TRIM(company)) = $1 AND days_to_response > 0
    `, [companyKey]);

    const avgDays = responseTimeResult.rows[0]?.avg_days
      ? Math.round(parseFloat(responseTimeResult.rows[0].avg_days))
      : null;

    stats.push({
      company: row.company_name,
      totalApplications: parseInt(row.total_applications),
      uniqueApplicants: parseInt(row.unique_applicants),
      avgDaysToResponse: avgDays,
      ghostRate,
      rejectionCategories,
      topSignals,
      seniorityBreakdown,
      mostCommonOutcome: rejectionCategories[0]?.category || null
    });
  }

  return stats;
}

/**
 * Get stats for a specific company (for lookup)
 */
export async function getCompanyStats(companyName: string): Promise<CommunityCompanyStats | null> {
  const companyKey = companyName.toLowerCase().trim();

  const result = await query(`
    SELECT COUNT(*) as total, COUNT(DISTINCT user_id) as unique_applicants
    FROM rejection_data
    WHERE LOWER(TRIM(company_name)) = $1
  `, [companyKey]);

  const total = parseInt(result.rows[0]?.total || '0');
  if (total < 5) return null; // Privacy threshold

  // Use the same logic as getCommunityCompanyStats for single company
  const stats = await getCommunityCompanyStats(1);
  return stats.find(s => s.company.toLowerCase().trim() === companyKey) || null;
}

export default pool;
