import { Router, Request, Response } from 'express';
import { requireAuth, getAuth, clerkClient } from '@clerk/express';
import * as db from '../db/index.js';

const router = Router();

// Helper to ensure user exists in database before inserting applications
async function ensureUserExists(userId: string): Promise<void> {
  try {
    // Try to get user email from Clerk
    let email: string | null = null;
    try {
      const user = await clerkClient.users.getUser(userId);
      email = user.emailAddresses?.[0]?.emailAddress || null;
    } catch {
      // Clerk lookup failed, continue without email (don't log to reduce noise)
    }

    await db.upsertUser(userId, email || '');
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    throw error;
  }
}

// Get all applications for the current user
router.get('/', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const result = await db.query(
      `SELECT id, company, role, seniority_level, company_size, industry, source,
              date_applied, outcome, days_to_response, rejection_analysis, fit_analysis, notes, updated_at
       FROM applications
       WHERE user_id = $1
       ORDER BY COALESCE(date_applied, created_at) DESC`,
      [userId]
    );

    // Transform to camelCase for client
    const applications = result.rows.map(row => ({
      id: row.id,
      company: row.company,
      role: row.role,
      seniorityLevel: row.seniority_level,
      companySize: row.company_size,
      industry: row.industry,
      source: row.source,
      // Ensure dateApplied is always a string in YYYY-MM-DD format
      dateApplied: row.date_applied
        ? (row.date_applied instanceof Date
            ? row.date_applied.toISOString().split('T')[0]
            : String(row.date_applied).split('T')[0])
        : null,
      outcome: row.outcome,
      daysToResponse: row.days_to_response,
      rejectionAnalysis: row.rejection_analysis,
      fitAnalysis: row.fit_analysis,
      notes: row.notes,
      updatedAt: row.updated_at
    }));

    res.json({ applications });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Sync applications (upsert all from client)
router.post('/sync', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { applications } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!Array.isArray(applications)) {
    return res.status(400).json({ error: 'Applications must be an array' });
  }

  try {
    // Only log summary, not each individual app (reduces log volume)
    if (applications.length > 0) {
      console.log(`Sync: ${applications.length} apps for user ${userId.substring(0, 8)}...`);
    }

    // Ensure user exists in database first (for foreign key constraint)
    await ensureUserExists(userId);

    // Upsert each application (no per-app logging to avoid rate limits)
    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];
      await db.query(
        `INSERT INTO applications (id, user_id, company, role, seniority_level, company_size,
                                   industry, source, date_applied, outcome, days_to_response,
                                   rejection_analysis, fit_analysis, notes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           company = EXCLUDED.company,
           role = EXCLUDED.role,
           seniority_level = EXCLUDED.seniority_level,
           company_size = EXCLUDED.company_size,
           industry = EXCLUDED.industry,
           source = EXCLUDED.source,
           date_applied = EXCLUDED.date_applied,
           outcome = EXCLUDED.outcome,
           days_to_response = EXCLUDED.days_to_response,
           rejection_analysis = EXCLUDED.rejection_analysis,
           fit_analysis = EXCLUDED.fit_analysis,
           notes = EXCLUDED.notes,
           updated_at = CURRENT_TIMESTAMP`,
        [
          app.id,
          userId,
          app.company,
          app.role,
          app.seniorityLevel || null,
          app.companySize || null,
          app.industry || null,
          app.source || null,
          app.dateApplied || null,
          app.outcome || 'pending',
          app.daysToResponse || null,
          app.rejectionAnalysis ? JSON.stringify(app.rejectionAnalysis) : null,
          app.fitAnalysis ? JSON.stringify(app.fitAnalysis) : null,
          app.notes || null
        ]
      );
    }

    console.log(`Synced ${applications.length} applications for user ${userId}`);
    res.json({ success: true, count: applications.length });
  } catch (error) {
    console.error('Error syncing applications:', error);
    // Return more details for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Sync error details:', { errorMessage, errorStack });
    res.status(500).json({
      error: 'Failed to sync applications',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// Add a single application
router.post('/', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const app = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!app.id || !app.company || !app.role) {
    return res.status(400).json({ error: 'id, company, and role are required' });
  }

  try {
    // Ensure user exists in database first (for foreign key constraint)
    await ensureUserExists(userId);

    await db.query(
      `INSERT INTO applications (id, user_id, company, role, seniority_level, company_size,
                                 industry, source, date_applied, outcome, days_to_response,
                                 rejection_analysis, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         company = EXCLUDED.company,
         role = EXCLUDED.role,
         seniority_level = EXCLUDED.seniority_level,
         company_size = EXCLUDED.company_size,
         industry = EXCLUDED.industry,
         source = EXCLUDED.source,
         date_applied = EXCLUDED.date_applied,
         outcome = EXCLUDED.outcome,
         days_to_response = EXCLUDED.days_to_response,
         rejection_analysis = EXCLUDED.rejection_analysis,
         updated_at = CURRENT_TIMESTAMP`,
      [
        app.id,
        userId,
        app.company,
        app.role,
        app.seniorityLevel || null,
        app.companySize || null,
        app.industry || null,
        app.source || null,
        app.dateApplied || null,
        app.outcome || 'pending',
        app.daysToResponse || null,
        app.rejectionAnalysis ? JSON.stringify(app.rejectionAnalysis) : null
      ]
    );

    res.json({ success: true, id: app.id });
  } catch (error) {
    console.error('Error adding application:', error);
    res.status(500).json({ error: 'Failed to add application' });
  }
});

// Delete an application
router.delete('/:id', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { id } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const result = await db.query(
      'DELETE FROM applications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

// ============================================================================
// MAYA AGENT ENDPOINTS (use X-User-Id header instead of JWT)
// These allow Maya to manage tracker on behalf of users
// ============================================================================

// Get applications for Maya (uses X-User-Id header)
// Returns stats + recent applications (Maya doesn't need all 100+ app details)
router.get('/maya', async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;

  if (!userId) {
    return res.status(401).json({ error: 'X-User-Id header required' });
  }

  try {
    // Get stats first (counts all applications)
    // Outcome values: saved, applied, pending, interviewing, offer, rejected_ats, rejected_recruiter, rejected_hm, rejected_final, ghosted
    const statsResult = await db.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE outcome = 'saved') as saved,
         COUNT(*) FILTER (WHERE outcome IN ('applied', 'pending')) as applied,
         COUNT(*) FILTER (WHERE outcome LIKE 'rejected%') as rejected,
         COUNT(*) FILTER (WHERE outcome = 'interviewing') as interviewing,
         COUNT(*) FILTER (WHERE outcome = 'offer') as offers,
         COUNT(*) FILTER (WHERE outcome = 'ghosted') as ghosted
       FROM applications
       WHERE user_id = $1`,
      [userId]
    );

    const stats = statsResult.rows[0] || {};

    // Get recent 30 applications (enough for Maya to reference specific companies)
    const result = await db.query(
      `SELECT id, company, role, outcome, date_applied
       FROM applications
       WHERE user_id = $1
       ORDER BY COALESCE(date_applied, created_at) DESC
       LIMIT 30`,
      [userId]
    );

    const applications = result.rows.map(row => ({
      id: row.id,
      company: row.company,
      role: row.role,
      outcome: row.outcome,
      dateApplied: row.date_applied
        ? (row.date_applied instanceof Date
            ? row.date_applied.toISOString().split('T')[0]
            : String(row.date_applied).split('T')[0])
        : null
    }));

    res.json({
      stats: {
        total: parseInt(stats.total) || 0,
        saved: parseInt(stats.saved) || 0,
        applied: parseInt(stats.applied) || 0,
        rejected: parseInt(stats.rejected) || 0,
        interviewing: parseInt(stats.interviewing) || 0,
        offers: parseInt(stats.offers) || 0,
        ghosted: parseInt(stats.ghosted) || 0
      },
      applications,  // Recent 30 for company lookup
      count: parseInt(stats.total) || 0  // Total count for Maya
    });
  } catch (error) {
    console.error('Error fetching applications for Maya:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Add rejection from Maya (uses X-User-Id header)
router.post('/maya', async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const { company, role, outcome, rejectionAnalysis } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'X-User-Id header required' });
  }

  if (!company) {
    return res.status(400).json({ error: 'company is required' });
  }

  try {
    // Ensure user exists
    await ensureUserExists(userId);

    // Generate UUID for new application
    const { v4: uuidv4 } = await import('uuid');
    const appId = uuidv4();

    await db.query(
      `INSERT INTO applications (id, user_id, company, role, outcome, rejection_analysis, date_applied, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_TIMESTAMP)`,
      [
        appId,
        userId,
        company,
        role || 'Unknown Role',
        outcome || 'rejected_ats',
        rejectionAnalysis ? JSON.stringify(rejectionAnalysis) : null
      ]
    );

    console.log(`[Maya] Added rejection to tracker: ${company} for user ${userId.substring(0, 8)}...`);
    res.json({ success: true, id: appId, company, role });
  } catch (error) {
    console.error('Error adding application from Maya:', error);
    res.status(500).json({ error: 'Failed to add application' });
  }
});

// Update/link rejection from Maya (uses X-User-Id header)
router.patch('/maya/:id', async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const { id } = req.params;
  const { outcome, rejectionAnalysis } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'X-User-Id header required' });
  }

  try {
    const result = await db.query(
      `UPDATE applications
       SET outcome = COALESCE($1, outcome),
           rejection_analysis = COALESCE($2, rejection_analysis),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING id, company, role`,
      [
        outcome || null,
        rejectionAnalysis ? JSON.stringify(rejectionAnalysis) : null,
        id,
        userId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = result.rows[0];
    console.log(`[Maya] Linked rejection to existing app: ${app.company} - ${app.role}`);
    res.json({ success: true, id, company: app.company, role: app.role });
  } catch (error) {
    console.error('Error updating application from Maya:', error);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

export default router;
