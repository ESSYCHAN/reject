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

export default pool;
