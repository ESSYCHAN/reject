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
        fit_analysis JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add fit_analysis and notes columns if they don't exist (migration for existing DBs)
      ALTER TABLE applications ADD COLUMN IF NOT EXISTS fit_analysis JSONB;
      ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes TEXT;

      -- Subscribers table (for newsletter/email collection)
      CREATE TABLE IF NOT EXISTS subscribers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'website'
      );

      -- Rejection archive (user-specific, persists after app deletion)
      CREATE TABLE IF NOT EXISTS rejection_archive (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        application_id TEXT,  -- Reference to original app (may be deleted)
        company TEXT NOT NULL,
        role TEXT,
        seniority_level TEXT,
        rejection_category TEXT,
        confidence REAL,
        signals JSONB,
        ats_stage TEXT,
        reply_worth_it TEXT,  -- "Low" | "Medium" | "High"
        days_to_response INTEGER,
        email_snippet TEXT,  -- First 200 chars for context (no PII)
        decoded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Anonymized knowledge base (aggregate patterns across all users)
      CREATE TABLE IF NOT EXISTS rejection_knowledge_base (
        id SERIAL PRIMARY KEY,
        company_normalized TEXT NOT NULL,  -- Lowercase, stripped of Inc/Ltd/etc
        role_category TEXT,  -- e.g., "engineering", "product", "design"
        seniority_level TEXT,
        rejection_category TEXT,
        ats_stage TEXT,
        signal TEXT,  -- Individual signal (one row per signal)
        response_days_bucket TEXT,  -- "same_day", "1-3_days", "1_week", "2_weeks", "1_month+"
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- User profiles (CV data, skills, preferences)
      CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        user_id TEXT UNIQUE REFERENCES users(id),
        
        -- Basic info from CV
        full_name TEXT,
        current_title TEXT,
        years_experience INTEGER,
        
        -- Skills (PostgreSQL array)
        skills TEXT[],
        
        -- CV storage
        cv_text TEXT,                    -- Extracted text from CV
        cv_filename TEXT,                -- Original filename
        cv_uploaded_at TIMESTAMP,
        
        -- Preferences
        target_roles TEXT[],             -- What roles they want
        target_companies TEXT[],         -- Dream companies
        min_salary INTEGER,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );


      -- Interview experiences (the interview flywheel!)
      CREATE TABLE IF NOT EXISTS interview_experiences (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        company TEXT NOT NULL,
        company_normalized TEXT NOT NULL,
        role TEXT NOT NULL,
        role_category TEXT,

        -- Interview process info
        total_rounds INTEGER,
        interview_stages TEXT[],           -- e.g., ['phone_screen', 'technical', 'onsite', 'team_match']
        interview_format TEXT,             -- 'remote', 'onsite', 'hybrid'
        duration_weeks INTEGER,            -- How long the process took

        -- Questions and prep
        questions_asked JSONB,             -- Array of {question, category, difficulty}
        prep_materials TEXT,               -- What helped them prepare
        interviewer_titles TEXT[],         -- Who they met with (titles, not names)

        -- Assessment
        difficulty_rating INTEGER,         -- 1-5 scale
        interviewer_friendliness INTEGER,  -- 1-5 scale
        process_transparency INTEGER,      -- 1-5 scale (did they know where they stood?)

        -- Outcome and advice
        outcome TEXT,                      -- 'offer', 'rejected', 'withdrew', 'pending'
        tips_for_others TEXT,              -- Advice for future candidates
        would_interview_again BOOLEAN,     -- Would they try again?

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Holding email outcomes (the holding flywheel!)
      CREATE TABLE IF NOT EXISTS holding_email_outcomes (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        company_name TEXT NOT NULL,
        company_normalized TEXT NOT NULL,
        role TEXT,
        email_snippet TEXT,              -- First 200 chars for context
        held_at TIMESTAMP NOT NULL,      -- When we received the holding email
        reminder_sent_at TIMESTAMP,      -- When we asked for follow-up
        outcome TEXT,                    -- 'ghosted', 'rejected', 'interview', 'offer', 'pending'
        outcome_at TIMESTAMP,
        days_to_outcome INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_holding_outcomes_company ON holding_email_outcomes(company_normalized);
      CREATE INDEX IF NOT EXISTS idx_holding_outcomes_user ON holding_email_outcomes(user_id);
      CREATE INDEX IF NOT EXISTS idx_holding_outcomes_pending ON holding_email_outcomes(outcome) WHERE outcome = 'pending';
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage(user_id, month_key);
      CREATE INDEX IF NOT EXISTS idx_rejection_company ON rejection_data(company_name);
      CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
      CREATE INDEX IF NOT EXISTS idx_rejection_archive_user ON rejection_archive(user_id);
      CREATE INDEX IF NOT EXISTS idx_rejection_archive_company ON rejection_archive(company);
      CREATE INDEX IF NOT EXISTS idx_knowledge_base_company ON rejection_knowledge_base(company_normalized);
      CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON rejection_knowledge_base(rejection_category);
      CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_interview_experiences_company ON interview_experiences(company_normalized);
      CREATE INDEX IF NOT EXISTS idx_interview_experiences_role ON interview_experiences(role_category);

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
  // Handle empty email by making it null to avoid unique constraint violations
  const emailValue = email && email.trim() ? email.trim().toLowerCase() : null;

  // If email is provided, check if another user has this email
  let oldUserId: string | null = null;
  if (emailValue) {
    const existingUser = await query(
      `SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2`,
      [emailValue, userId]
    );
    if (existingUser.rows.length > 0) {
      oldUserId = existingUser.rows[0].id;

      // Clear email from old user FIRST to avoid unique constraint violation
      await query(
        `UPDATE users SET email = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [oldUserId]
      );
    }
  }

  // Create/update the new user (must happen before subscription migration due to FK constraint)
  await query(
    `INSERT INTO users (id, email, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       email = COALESCE($2, users.email),
       updated_at = CURRENT_TIMESTAMP`,
    [userId, emailValue]
  );

  // Now migrate data from old user if needed
  if (oldUserId) {

    // Migrate subscription (copy to new user)
    await query(
      `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, plan_type, current_period_end, updated_at)
       SELECT $1, stripe_customer_id, stripe_subscription_id, status, plan_type, current_period_end, CURRENT_TIMESTAMP
       FROM subscriptions WHERE user_id = $2
       ON CONFLICT (user_id) DO UPDATE SET
         stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
         stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
         status = COALESCE(EXCLUDED.status, subscriptions.status),
         plan_type = COALESCE(EXCLUDED.plan_type, subscriptions.plan_type),
         current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, oldUserId]
    );

    // Migrate applications (update user_id)
    await query(
      `UPDATE applications SET user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [userId, oldUserId]
    );

    // Migrate usage data
    await query(
      `UPDATE usage SET user_id = $1 WHERE user_id = $2`,
      [userId, oldUserId]
    );

    // Migrate rejection data
    await query(
      `UPDATE rejection_data SET user_id = $1 WHERE user_id = $2`,
      [userId, oldUserId]
    );
  }
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

// ============ REJECTION ARCHIVE (User-Specific Persistence) ============

export interface RejectionArchiveEntry {
  userId: string;
  applicationId?: string;
  company: string;
  role?: string;
  seniorityLevel?: string;
  rejectionCategory?: string;
  confidence?: number;
  signals?: string[];
  atsStage?: string;
  replyWorthIt?: 'Low' | 'Medium' | 'High';
  daysToResponse?: number;
  emailSnippet?: string;
}

/**
 * Save rejection to user's personal archive
 * This persists even if the application is deleted from tracker
 */
export async function saveToRejectionArchive(entry: RejectionArchiveEntry) {
  await query(
    `INSERT INTO rejection_archive
     (user_id, application_id, company, role, seniority_level, rejection_category,
      confidence, signals, ats_stage, reply_worth_it, days_to_response, email_snippet)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      entry.userId,
      entry.applicationId || null,
      entry.company,
      entry.role || null,
      entry.seniorityLevel || null,
      entry.rejectionCategory || null,
      entry.confidence || null,
      entry.signals ? JSON.stringify(entry.signals) : null,
      entry.atsStage || null,
      entry.replyWorthIt ?? null,
      entry.daysToResponse || null,
      entry.emailSnippet || null
    ]
  );
}

/**
 * Get user's rejection archive (for insights even after app deletion)
 */
export async function getUserRejectionArchive(userId: string) {
  const result = await query(
    `SELECT * FROM rejection_archive WHERE user_id = $1 ORDER BY decoded_at DESC`,
    [userId]
  );
  return result.rows.map(row => ({
    id: row.id,
    applicationId: row.application_id,
    company: row.company,
    role: row.role,
    seniorityLevel: row.seniority_level,
    rejectionCategory: row.rejection_category,
    confidence: row.confidence,
    signals: row.signals,
    atsStage: row.ats_stage,
    replyWorthIt: row.reply_worth_it,
    daysToResponse: row.days_to_response,
    emailSnippet: row.email_snippet,
    decodedAt: row.decoded_at
  }));
}

// ============ ANONYMIZED KNOWLEDGE BASE ============

/**
 * Normalize company name for aggregation
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\s]+(com|inc|ltd|llc|corp|corporation|co|plc|group|holdings?)\.?$/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Categorize role for aggregation
 */
function categorizeRole(role: string): string {
  const r = role.toLowerCase();
  if (r.includes('engineer') || r.includes('developer') || r.includes('swe') || r.includes('software')) return 'engineering';
  if (r.includes('product') || r.includes('pm')) return 'product';
  if (r.includes('design') || r.includes('ux') || r.includes('ui')) return 'design';
  if (r.includes('data') || r.includes('analyst') || r.includes('ml') || r.includes('ai')) return 'data';
  if (r.includes('marketing') || r.includes('growth')) return 'marketing';
  if (r.includes('sales') || r.includes('account')) return 'sales';
  if (r.includes('hr') || r.includes('people') || r.includes('recruiter')) return 'hr';
  if (r.includes('finance') || r.includes('accounting')) return 'finance';
  if (r.includes('operations') || r.includes('ops')) return 'operations';
  return 'other';
}

/**
 * Convert days to response bucket for aggregation
 */
function daysToResponseBucket(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'unknown';
  if (days === 0) return 'same_day';
  if (days <= 3) return '1-3_days';
  if (days <= 7) return '1_week';
  if (days <= 14) return '2_weeks';
  if (days <= 30) return '1_month';
  return '1_month+';
}

export interface KnowledgeBaseEntry {
  company: string;
  role?: string;
  seniorityLevel?: string;
  rejectionCategory?: string;
  atsStage?: string;
  signals?: string[];
  daysToResponse?: number;
}

/**
 * Save anonymized rejection pattern to knowledge base
 * One row per signal for better aggregation
 */
export async function saveToKnowledgeBase(entry: KnowledgeBaseEntry) {
  const companyNormalized = normalizeCompanyName(entry.company);
  const roleCategory = entry.role ? categorizeRole(entry.role) : null;
  const responseBucket = daysToResponseBucket(entry.daysToResponse);

  // If there are signals, create one row per signal
  if (entry.signals && entry.signals.length > 0) {
    for (const signal of entry.signals) {
      await query(
        `INSERT INTO rejection_knowledge_base
         (company_normalized, role_category, seniority_level, rejection_category, ats_stage, signal, response_days_bucket)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          companyNormalized,
          roleCategory,
          entry.seniorityLevel || null,
          entry.rejectionCategory || null,
          entry.atsStage || null,
          signal,
          responseBucket
        ]
      );
    }
  } else {
    // Single row without signal
    await query(
      `INSERT INTO rejection_knowledge_base
       (company_normalized, role_category, seniority_level, rejection_category, ats_stage, signal, response_days_bucket)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        companyNormalized,
        roleCategory,
        entry.seniorityLevel || null,
        entry.rejectionCategory || null,
        entry.atsStage || null,
        null,
        responseBucket
      ]
    );
  }
}

/**
 * Get aggregated knowledge base stats for a company
 */
export async function getKnowledgeBaseCompanyStats(companyName: string, minSamples = 5) {
  const companyNormalized = normalizeCompanyName(companyName);

  // Check if we have enough data
  const countResult = await query(
    `SELECT COUNT(DISTINCT id) as total FROM rejection_knowledge_base WHERE company_normalized = $1`,
    [companyNormalized]
  );
  const total = parseInt(countResult.rows[0]?.total || '0');
  if (total < minSamples) return null;

  // Get rejection category breakdown
  const categoryResult = await query(
    `SELECT rejection_category, COUNT(*) as count
     FROM rejection_knowledge_base
     WHERE company_normalized = $1 AND rejection_category IS NOT NULL
     GROUP BY rejection_category
     ORDER BY count DESC`,
    [companyNormalized]
  );

  // Get ATS stage breakdown
  const stageResult = await query(
    `SELECT ats_stage, COUNT(*) as count
     FROM rejection_knowledge_base
     WHERE company_normalized = $1 AND ats_stage IS NOT NULL
     GROUP BY ats_stage
     ORDER BY count DESC`,
    [companyNormalized]
  );

  // Get top signals
  const signalResult = await query(
    `SELECT signal, COUNT(*) as count
     FROM rejection_knowledge_base
     WHERE company_normalized = $1 AND signal IS NOT NULL
     GROUP BY signal
     ORDER BY count DESC
     LIMIT 10`,
    [companyNormalized]
  );

  // Get response time breakdown
  const responseResult = await query(
    `SELECT response_days_bucket, COUNT(*) as count
     FROM rejection_knowledge_base
     WHERE company_normalized = $1 AND response_days_bucket != 'unknown'
     GROUP BY response_days_bucket
     ORDER BY count DESC`,
    [companyNormalized]
  );

  return {
    company: companyName,
    totalSamples: total,
    rejectionCategories: categoryResult.rows.map(r => ({
      category: r.rejection_category,
      count: parseInt(r.count),
      percentage: Math.round((parseInt(r.count) / total) * 100)
    })),
    atsStages: stageResult.rows.map(r => ({
      stage: r.ats_stage,
      count: parseInt(r.count),
      percentage: Math.round((parseInt(r.count) / total) * 100)
    })),
    topSignals: signalResult.rows.map(r => ({
      signal: r.signal,
      count: parseInt(r.count)
    })),
    responseTimeBreakdown: responseResult.rows.map(r => ({
      bucket: r.response_days_bucket,
      count: parseInt(r.count)
    }))
  };
}

/**
 * Get market-wide rejection patterns (all companies)
 */
export async function getMarketRejectionPatterns() {
  // Overall rejection category distribution
  const categoryResult = await query(
    `SELECT rejection_category, COUNT(*) as count
     FROM rejection_knowledge_base
     WHERE rejection_category IS NOT NULL
     GROUP BY rejection_category
     ORDER BY count DESC`
  );

  // ATS stage distribution
  const stageResult = await query(
    `SELECT ats_stage, COUNT(*) as count
     FROM rejection_knowledge_base
     WHERE ats_stage IS NOT NULL
     GROUP BY ats_stage
     ORDER BY count DESC`
  );

  // Top signals market-wide
  const signalResult = await query(
    `SELECT signal, COUNT(*) as count
     FROM rejection_knowledge_base
     WHERE signal IS NOT NULL
     GROUP BY signal
     ORDER BY count DESC
     LIMIT 20`
  );

  // Response time patterns
  const responseResult = await query(
    `SELECT response_days_bucket, COUNT(*) as count
     FROM rejection_knowledge_base
     WHERE response_days_bucket != 'unknown'
     GROUP BY response_days_bucket
     ORDER BY count DESC`
  );

  // Companies with most rejections (privacy: only names, no user data)
  const companiesResult = await query(
    `SELECT company_normalized, COUNT(*) as count
     FROM rejection_knowledge_base
     GROUP BY company_normalized
     HAVING COUNT(*) >= 10
     ORDER BY count DESC
     LIMIT 20`
  );

  const total = categoryResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);

  return {
    totalRejections: total,
    rejectionCategories: categoryResult.rows.map(r => ({
      category: r.rejection_category,
      count: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0
    })),
    atsStages: stageResult.rows.map(r => ({
      stage: r.ats_stage,
      count: parseInt(r.count)
    })),
    topSignals: signalResult.rows.map(r => ({
      signal: r.signal,
      count: parseInt(r.count)
    })),
    responseTimeBreakdown: responseResult.rows.map(r => ({
      bucket: r.response_days_bucket,
      count: parseInt(r.count)
    })),
    topCompanies: companiesResult.rows.map(r => ({
      company: r.company_normalized,
      count: parseInt(r.count)
    }))
  };
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

// ============ USER PROFILES ============

export interface UserProfile {
  userId: string;
  fullName?: string;
  currentTitle?: string;
  yearsExperience?: number;
  skills?: string[];
  cvText?: string;
  cvFilename?: string;
  targetRoles?: string[];
  targetCompanies?: string[];
  minSalary?: number;
}

/**
 * Create or update user profile
 */
export async function upsertUserProfile(profile: UserProfile) {
  await query(
    `INSERT INTO user_profiles 
     (user_id, full_name, current_title, years_experience, skills, cv_text, cv_filename, cv_uploaded_at, target_roles, target_companies, min_salary, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, ${profile.cvText ? 'CURRENT_TIMESTAMP' : 'NULL'}, $8, $9, $10, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       full_name = COALESCE($2, user_profiles.full_name),
       current_title = COALESCE($3, user_profiles.current_title),
       years_experience = COALESCE($4, user_profiles.years_experience),
       skills = COALESCE($5, user_profiles.skills),
       cv_text = COALESCE($6, user_profiles.cv_text),
       cv_filename = COALESCE($7, user_profiles.cv_filename),
       cv_uploaded_at = ${profile.cvText ? 'CURRENT_TIMESTAMP' : 'user_profiles.cv_uploaded_at'},
       target_roles = COALESCE($8, user_profiles.target_roles),
       target_companies = COALESCE($9, user_profiles.target_companies),
       min_salary = COALESCE($10, user_profiles.min_salary),
       updated_at = CURRENT_TIMESTAMP`,
    [
      profile.userId,
      profile.fullName || null,
      profile.currentTitle || null,
      profile.yearsExperience || null,
      profile.skills || null,
      profile.cvText || null,
      profile.cvFilename || null,
      profile.targetRoles || null,
      profile.targetCompanies || null,
      profile.minSalary || null
    ]
  );
}

/**
 * Get user profile
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const result = await query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    userId: row.user_id,
    fullName: row.full_name,
    currentTitle: row.current_title,
    yearsExperience: row.years_experience,
    skills: row.skills,
    cvText: row.cv_text,
    cvFilename: row.cv_filename,
    targetRoles: row.target_roles,
    targetCompanies: row.target_companies,
    minSalary: row.min_salary
  };
}


// ============ INTERVIEW EXPERIENCES (Flywheel) ============

export interface InterviewExperience {
  userId?: string;
  company: string;
  role: string;
  totalRounds?: number;
  interviewStages?: string[];
  interviewFormat?: 'remote' | 'onsite' | 'hybrid';
  durationWeeks?: number;
  questionsAsked?: { question: string; category?: string; difficulty?: number }[];
  prepMaterials?: string;
  interviewerTitles?: string[];
  difficultyRating?: number;
  interviewerFriendliness?: number;
  processTransparency?: number;
  outcome?: 'offer' | 'rejected' | 'withdrew' | 'pending';
  tipsForOthers?: string;
  wouldInterviewAgain?: boolean;
}

/**
 * Save an interview experience to the flywheel
 */
export async function saveInterviewExperience(exp: InterviewExperience) {
  const companyNormalized = normalizeCompanyName(exp.company);
  const roleCategory = categorizeRole(exp.role);

  await query(
    `INSERT INTO interview_experiences
     (user_id, company, company_normalized, role, role_category,
      total_rounds, interview_stages, interview_format, duration_weeks,
      questions_asked, prep_materials, interviewer_titles,
      difficulty_rating, interviewer_friendliness, process_transparency,
      outcome, tips_for_others, would_interview_again)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      exp.userId || null,
      exp.company,
      companyNormalized,
      exp.role,
      roleCategory,
      exp.totalRounds || null,
      exp.interviewStages || null,
      exp.interviewFormat || null,
      exp.durationWeeks || null,
      exp.questionsAsked ? JSON.stringify(exp.questionsAsked) : null,
      exp.prepMaterials || null,
      exp.interviewerTitles || null,
      exp.difficultyRating || null,
      exp.interviewerFriendliness || null,
      exp.processTransparency || null,
      exp.outcome || null,
      exp.tipsForOthers || null,
      exp.wouldInterviewAgain ?? null
    ]
  );
}

/**
 * Get interview intel for a company (aggregated from all users)
 */
export async function getInterviewIntel(companyName: string, role?: string) {
  const companyNormalized = normalizeCompanyName(companyName);

  // Basic stats
  const statsQuery = role
    ? `SELECT
         COUNT(*) as total_interviews,
         AVG(total_rounds) as avg_rounds,
         AVG(duration_weeks) as avg_duration_weeks,
         AVG(difficulty_rating) as avg_difficulty,
         AVG(interviewer_friendliness) as avg_friendliness,
         AVG(process_transparency) as avg_transparency,
         COUNT(*) FILTER (WHERE outcome = 'offer') as offers,
         COUNT(*) FILTER (WHERE outcome = 'rejected') as rejections,
         COUNT(*) FILTER (WHERE would_interview_again = true) as would_try_again
       FROM interview_experiences
       WHERE company_normalized = $1 AND role_category = $2`
    : `SELECT
         COUNT(*) as total_interviews,
         AVG(total_rounds) as avg_rounds,
         AVG(duration_weeks) as avg_duration_weeks,
         AVG(difficulty_rating) as avg_difficulty,
         AVG(interviewer_friendliness) as avg_friendliness,
         AVG(process_transparency) as avg_transparency,
         COUNT(*) FILTER (WHERE outcome = 'offer') as offers,
         COUNT(*) FILTER (WHERE outcome = 'rejected') as rejections,
         COUNT(*) FILTER (WHERE would_interview_again = true) as would_try_again
       FROM interview_experiences
       WHERE company_normalized = $1`;

  const params = role ? [companyNormalized, categorizeRole(role)] : [companyNormalized];
  const statsResult = await query(statsQuery, params);
  const stats = statsResult.rows[0];

  if (!stats || parseInt(stats.total_interviews) === 0) {
    return null;
  }

  // Get common interview stages
  const stagesResult = await query(
    `SELECT UNNEST(interview_stages) as stage, COUNT(*) as count
     FROM interview_experiences
     WHERE company_normalized = $1
     GROUP BY stage
     ORDER BY count DESC`,
    [companyNormalized]
  );

  // Get common questions
  const questionsResult = await query(
    `SELECT questions_asked
     FROM interview_experiences
     WHERE company_normalized = $1 AND questions_asked IS NOT NULL
     LIMIT 20`,
    [companyNormalized]
  );

  // Aggregate questions
  const questionCounts: Record<string, number> = {};
  for (const row of questionsResult.rows) {
    const questions = row.questions_asked;
    if (Array.isArray(questions)) {
      for (const q of questions) {
        const qText = typeof q === 'string' ? q : q.question;
        if (qText) {
          questionCounts[qText] = (questionCounts[qText] || 0) + 1;
        }
      }
    }
  }
  const topQuestions = Object.entries(questionCounts)
    .map(([question, count]) => ({ question, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Get tips from successful candidates
  const tipsResult = await query(
    `SELECT tips_for_others
     FROM interview_experiences
     WHERE company_normalized = $1 AND tips_for_others IS NOT NULL AND outcome = 'offer'
     LIMIT 5`,
    [companyNormalized]
  );
  const successTips = tipsResult.rows.map(r => r.tips_for_others).filter(Boolean);

  // Get interviewer titles
  const titlesResult = await query(
    `SELECT UNNEST(interviewer_titles) as title, COUNT(*) as count
     FROM interview_experiences
     WHERE company_normalized = $1
     GROUP BY title
     ORDER BY count DESC
     LIMIT 10`,
    [companyNormalized]
  );

  const totalInterviews = parseInt(stats.total_interviews);
  const offers = parseInt(stats.offers || '0');

  return {
    company: companyName,
    totalInterviews,
    avgRounds: stats.avg_rounds ? Math.round(parseFloat(stats.avg_rounds) * 10) / 10 : null,
    avgDurationWeeks: stats.avg_duration_weeks ? Math.round(parseFloat(stats.avg_duration_weeks)) : null,
    avgDifficulty: stats.avg_difficulty ? Math.round(parseFloat(stats.avg_difficulty) * 10) / 10 : null,
    avgFriendliness: stats.avg_friendliness ? Math.round(parseFloat(stats.avg_friendliness) * 10) / 10 : null,
    avgTransparency: stats.avg_transparency ? Math.round(parseFloat(stats.avg_transparency) * 10) / 10 : null,
    offerRate: totalInterviews > 0 ? Math.round((offers / totalInterviews) * 100) : 0,
    wouldTryAgainRate: totalInterviews > 0 ? Math.round((parseInt(stats.would_try_again || '0') / totalInterviews) * 100) : 0,
    commonStages: stagesResult.rows.map(r => ({ stage: r.stage, count: parseInt(r.count) })),
    topQuestions,
    successTips,
    commonInterviewerTitles: titlesResult.rows.map(r => r.title)
  };
}

// ============ HOLDING EMAIL FLYWHEEL ============

export interface HoldingEmailRecord {
  id?: number;
  userId?: string;
  companyName: string;
  role?: string;
  emailSnippet?: string;
  heldAt: Date;
  outcome?: 'ghosted' | 'rejected' | 'interview' | 'offer' | 'pending';
  outcomeAt?: Date;
  daysToOutcome?: number;
}

export interface CompanyHoldingStats {
  company: string;
  totalTracked: number;
  ghostedCount: number;
  ghostedRate: number;
  rejectedCount: number;
  rejectedRate: number;
  interviewCount: number;
  interviewRate: number;
  offerCount: number;
  avgDaysToOutcome: number | null;
}

/**
 * Save a holding email for outcome tracking
 */
export async function saveHoldingEmail(record: HoldingEmailRecord): Promise<number> {
  const companyNormalized = normalizeCompanyName(record.companyName);

  const result = await query(
    `INSERT INTO holding_email_outcomes
     (user_id, company_name, company_normalized, role, email_snippet, held_at, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [
      record.userId || null,
      record.companyName,
      companyNormalized,
      record.role || null,
      record.emailSnippet?.slice(0, 200) || null,
      record.heldAt
    ]
  );

  return result.rows[0].id;
}

/**
 * Update a holding email with its outcome
 */
export async function updateHoldingOutcome(
  id: number,
  outcome: 'ghosted' | 'rejected' | 'interview' | 'offer',
  outcomeAt?: Date
): Promise<void> {
  const outcomeDate = outcomeAt || new Date();

  await query(
    `UPDATE holding_email_outcomes
     SET outcome = $1,
         outcome_at = $2,
         days_to_outcome = EXTRACT(DAY FROM ($2 - held_at))::INTEGER
     WHERE id = $3`,
    [outcome, outcomeDate, id]
  );
}

/**
 * Get pending holding emails that need follow-up (older than 14 days)
 */
export async function getPendingHoldingEmails(userId?: string, daysOld: number = 14): Promise<HoldingEmailRecord[]> {
  const whereClause = userId
    ? 'WHERE user_id = $1 AND outcome = $2 AND held_at < NOW() - INTERVAL \'1 day\' * $3'
    : 'WHERE outcome = $1 AND held_at < NOW() - INTERVAL \'1 day\' * $2';

  const params = userId
    ? [userId, 'pending', daysOld]
    : ['pending', daysOld];

  const result = await query(
    `SELECT id, user_id, company_name, role, held_at, reminder_sent_at
     FROM holding_email_outcomes
     ${whereClause}
     ORDER BY held_at ASC`,
    params
  );

  return result.rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    companyName: r.company_name,
    role: r.role,
    heldAt: r.held_at,
    outcome: 'pending' as const
  }));
}

/**
 * Mark reminder as sent for a holding email
 */
export async function markReminderSent(id: number): Promise<void> {
  await query(
    `UPDATE holding_email_outcomes SET reminder_sent_at = NOW() WHERE id = $1`,
    [id]
  );
}

/**
 * Get company holding stats - THE FLYWHEEL DATA
 */
export async function getCompanyHoldingStats(companyName: string): Promise<CompanyHoldingStats | null> {
  const companyNormalized = normalizeCompanyName(companyName);

  const result = await query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE outcome = 'ghosted') as ghosted,
       COUNT(*) FILTER (WHERE outcome = 'rejected') as rejected,
       COUNT(*) FILTER (WHERE outcome = 'interview') as interview,
       COUNT(*) FILTER (WHERE outcome = 'offer') as offer,
       AVG(days_to_outcome) FILTER (WHERE days_to_outcome IS NOT NULL) as avg_days
     FROM holding_email_outcomes
     WHERE company_normalized = $1 AND outcome != 'pending'`,
    [companyNormalized]
  );

  const stats = result.rows[0];
  const total = parseInt(stats.total);

  if (total < 3) return null; // Need at least 3 data points

  return {
    company: companyName,
    totalTracked: total,
    ghostedCount: parseInt(stats.ghosted),
    ghostedRate: Math.round((parseInt(stats.ghosted) / total) * 100),
    rejectedCount: parseInt(stats.rejected),
    rejectedRate: Math.round((parseInt(stats.rejected) / total) * 100),
    interviewCount: parseInt(stats.interview),
    interviewRate: Math.round((parseInt(stats.interview) / total) * 100),
    offerCount: parseInt(stats.offer),
    avgDaysToOutcome: stats.avg_days ? Math.round(parseFloat(stats.avg_days)) : null
  };
}

/**
 * Get all companies with holding stats (for leaderboard/insights)
 */
export async function getAllCompanyHoldingStats(minSamples: number = 5): Promise<CompanyHoldingStats[]> {
  const result = await query(
    `SELECT
       company_name,
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE outcome = 'ghosted') as ghosted,
       COUNT(*) FILTER (WHERE outcome = 'rejected') as rejected,
       COUNT(*) FILTER (WHERE outcome = 'interview') as interview,
       COUNT(*) FILTER (WHERE outcome = 'offer') as offer,
       AVG(days_to_outcome) FILTER (WHERE days_to_outcome IS NOT NULL) as avg_days
     FROM holding_email_outcomes
     WHERE outcome != 'pending'
     GROUP BY company_name, company_normalized
     HAVING COUNT(*) >= $1
     ORDER BY COUNT(*) DESC
     LIMIT 50`,
    [minSamples]
  );

  return result.rows.map(r => {
    const total = parseInt(r.total);
    return {
      company: r.company_name,
      totalTracked: total,
      ghostedCount: parseInt(r.ghosted),
      ghostedRate: Math.round((parseInt(r.ghosted) / total) * 100),
      rejectedCount: parseInt(r.rejected),
      rejectedRate: Math.round((parseInt(r.rejected) / total) * 100),
      interviewCount: parseInt(r.interview),
      interviewRate: Math.round((parseInt(r.interview) / total) * 100),
      offerCount: parseInt(r.offer),
      avgDaysToOutcome: r.avg_days ? Math.round(parseFloat(r.avg_days)) : null
    };
  });
}

// ============ COMMUNITY BENCHMARKS (for Journey Card) ============

export interface CommunityBenchmarks {
  totalJobSeekers: number;
  avgApplications: number;
  avgRejections: number;
  avgInterviewRate: number;
  avgGhostRate: number;
  avgDaysToResponse: number | null;
  avgDaysInSearch: number | null;
  percentiles: {
    applications: { p25: number; p50: number; p75: number };
    interviewRate: { p25: number; p50: number; p75: number };
  };
  encouragement: string[];
}

/**
 * Get community-wide benchmarks for Journey Card comparison
 * Privacy: Only aggregate stats, no individual user data
 */
export async function getCommunityBenchmarks(): Promise<CommunityBenchmarks | null> {
  // Get aggregate stats per user
  const userStatsResult = await query(`
    SELECT
      user_id,
      COUNT(*) as total_apps,
      COUNT(*) FILTER (WHERE outcome LIKE 'rejected%') as rejections,
      COUNT(*) FILTER (WHERE outcome = 'ghosted') as ghosted,
      COUNT(*) FILTER (WHERE outcome IN ('rejected_recruiter', 'rejected_hm', 'rejected_final', 'interviewing', 'offer')) as interviews,
      AVG(days_to_response) FILTER (WHERE days_to_response > 0) as avg_response_days,
      MAX(date_applied) - MIN(date_applied) as days_searching
    FROM applications
    WHERE outcome IS NOT NULL AND outcome != 'pending' AND outcome NOT LIKE 'saved%'
    GROUP BY user_id
    HAVING COUNT(*) >= 3
  `);

  if (userStatsResult.rows.length < 5) {
    // Not enough data for meaningful benchmarks
    return null;
  }

  const users = userStatsResult.rows.map(r => ({
    totalApps: parseInt(r.total_apps),
    rejections: parseInt(r.rejections),
    ghosted: parseInt(r.ghosted),
    interviews: parseInt(r.interviews),
    avgResponseDays: r.avg_response_days ? parseFloat(r.avg_response_days) : null,
    daysSearching: r.days_searching ? parseInt(r.days_searching) : null,
    interviewRate: parseInt(r.total_apps) > 0 ? (parseInt(r.interviews) / parseInt(r.total_apps)) * 100 : 0,
    ghostRate: parseInt(r.total_apps) > 0 ? (parseInt(r.ghosted) / parseInt(r.total_apps)) * 100 : 0
  }));

  // Calculate averages
  const avgApplications = Math.round(users.reduce((sum, u) => sum + u.totalApps, 0) / users.length);
  const avgRejections = Math.round(users.reduce((sum, u) => sum + u.rejections, 0) / users.length);
  const avgInterviewRate = Math.round(users.reduce((sum, u) => sum + u.interviewRate, 0) / users.length);
  const avgGhostRate = Math.round(users.reduce((sum, u) => sum + u.ghostRate, 0) / users.length);

  const responseDays = users.filter(u => u.avgResponseDays !== null).map(u => u.avgResponseDays!);
  const avgDaysToResponse = responseDays.length > 0
    ? Math.round(responseDays.reduce((a, b) => a + b, 0) / responseDays.length)
    : null;

  const searchDays = users.filter(u => u.daysSearching !== null && u.daysSearching > 0).map(u => u.daysSearching!);
  const avgDaysInSearch = searchDays.length > 0
    ? Math.round(searchDays.reduce((a, b) => a + b, 0) / searchDays.length)
    : null;

  // Calculate percentiles
  const sortedApps = [...users].sort((a, b) => a.totalApps - b.totalApps);
  const sortedInterviewRates = [...users].sort((a, b) => a.interviewRate - b.interviewRate);

  const getPercentile = (arr: number[], p: number) => {
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };

  const appValues = sortedApps.map(u => u.totalApps);
  const interviewValues = sortedInterviewRates.map(u => Math.round(u.interviewRate));

  // Get encouragement from knowledge base
  const encouragementResult = await query(`
    SELECT DISTINCT ON (rejection_category) signal
    FROM rejection_knowledge_base
    WHERE signal LIKE '%not about you%' OR signal LIKE '%timing%' OR signal LIKE '%normal%'
    LIMIT 3
  `);

  const defaultEncouragement = [
    "The average job seeker faces dozens of rejections before landing their role.",
    "Your persistence puts you ahead of most candidates who give up early.",
    "Every application is practice. Every rejection is data."
  ];

  return {
    totalJobSeekers: users.length,
    avgApplications,
    avgRejections,
    avgInterviewRate,
    avgGhostRate,
    avgDaysToResponse,
    avgDaysInSearch,
    percentiles: {
      applications: {
        p25: getPercentile(appValues, 25),
        p50: getPercentile(appValues, 50),
        p75: getPercentile(appValues, 75)
      },
      interviewRate: {
        p25: getPercentile(interviewValues, 25),
        p50: getPercentile(interviewValues, 50),
        p75: getPercentile(interviewValues, 75)
      }
    },
    encouragement: encouragementResult.rows.length > 0
      ? encouragementResult.rows.map(r => r.signal)
      : defaultEncouragement
  };
}

export default pool;
