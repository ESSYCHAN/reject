import { Router, Request, Response } from 'express';
import { getKnowledgeBaseCompanyStats, getMarketRejectionPatterns, query } from '../db/index.js';

const router = Router();

/**
 * Get all companies in knowledge base (for early-stage visibility)
 * Shows all companies regardless of data threshold
 */
router.get('/companies', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT company_normalized,
              COUNT(*) as total_entries,
              COUNT(DISTINCT rejection_category) as categories,
              COUNT(DISTINCT ats_stage) as stages
       FROM rejection_knowledge_base
       GROUP BY company_normalized
       ORDER BY total_entries DESC
       LIMIT 50`
    );

    res.json({
      companies: result.rows.map(r => ({
        company: r.company_normalized,
        dataPoints: parseInt(r.total_entries),
        uniqueCategories: parseInt(r.categories),
        uniqueStages: parseInt(r.stages)
      })),
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

/**
 * Get market-wide rejection patterns
 * Public endpoint - no auth required
 */
router.get('/market', async (_req: Request, res: Response) => {
  try {
    const patterns = await getMarketRejectionPatterns();
    res.json({ data: patterns });
  } catch (error) {
    console.error('Error fetching market patterns:', error);
    res.status(500).json({ error: 'Failed to fetch market patterns' });
  }
});

/**
 * Get rejection patterns for a specific company
 * Public endpoint - returns null if insufficient data (privacy)
 */
router.get('/company/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  // Allow ?preview=true to show with min 1 sample (for early stage)
  const preview = req.query.preview === 'true';
  const minSamples = preview ? 1 : 5;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Company name required (min 2 characters)' });
  }

  try {
    const stats = await getKnowledgeBaseCompanyStats(name.trim(), minSamples);

    if (!stats) {
      return res.json({
        data: null,
        message: 'Not enough data for this company yet. Keep decoding to build the knowledge base!'
      });
    }

    res.json({ data: stats, preview });
  } catch (error) {
    console.error('Error fetching company stats:', error);
    res.status(500).json({ error: 'Failed to fetch company stats' });
  }
});

/**
 * Search companies in knowledge base
 * Returns companies matching the query with enough data points
 */
router.get('/search', async (req: Request, res: Response) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({ error: 'Search query required (min 2 characters)' });
  }

  try {
    // This is a simple search - could be improved with fuzzy matching
    const { query } = await import('../db/index.js');
    const result = await query(
      `SELECT company_normalized, COUNT(*) as count
       FROM rejection_knowledge_base
       WHERE company_normalized LIKE $1
       GROUP BY company_normalized
       HAVING COUNT(*) >= 5
       ORDER BY count DESC
       LIMIT 20`,
      [`%${q.toLowerCase().trim()}%`]
    );

    res.json({
      companies: result.rows.map(r => ({
        company: r.company_normalized,
        dataPoints: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('Error searching companies:', error);
    res.status(500).json({ error: 'Failed to search companies' });
  }
});

export default router;
