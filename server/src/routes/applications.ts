import { Router, Request, Response } from 'express';
import { requireAuth, getAuth, clerkClient } from '@clerk/express';
import * as db from '../db/index.js';

const router = Router();

// Helper to ensure user exists in database before inserting applications
async function ensureUserExists(userId: string): Promise<void> {
  console.log(`ensureUserExists: starting for ${userId}`);
  try {
    // Try to get user email from Clerk
    let email: string | null = null;
    try {
      const user = await clerkClient.users.getUser(userId);
      email = user.emailAddresses?.[0]?.emailAddress || null;
      console.log(`ensureUserExists: got email ${email} from Clerk`);
    } catch (clerkError) {
      // Clerk lookup failed, continue without email
      console.log(`ensureUserExists: Clerk lookup failed, continuing without email`, clerkError);
    }

    console.log(`ensureUserExists: upserting user ${userId} with email ${email || 'null'}`);
    await db.upsertUser(userId, email || '');
    console.log(`ensureUserExists: user upserted successfully`);
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
              date_applied, outcome, days_to_response, rejection_analysis, updated_at
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
      dateApplied: row.date_applied,
      outcome: row.outcome,
      daysToResponse: row.days_to_response,
      rejectionAnalysis: row.rejection_analysis,
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
    console.log(`Sync: starting for user ${userId}, ${applications.length} apps`);

    // Ensure user exists in database first (for foreign key constraint)
    await ensureUserExists(userId);
    console.log(`Sync: user ensured`);

    // Upsert each application
    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];
      console.log(`Sync: upserting app ${i + 1}/${applications.length}: ${app.id?.substring(0, 8)}...`);
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

export default router;
