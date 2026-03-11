import 'dotenv/config';
import { query } from '../db/index.js';
import { storeKnowledge } from '../services/vectordb.js';

/**
 * Sync PostgreSQL rejection_knowledge_base to Pinecone Vector DB
 * This enables semantic search over your existing rejection patterns
 */
async function syncKnowledgeBase() {
  console.log('Syncing PostgreSQL → Pinecone...\n');

  // Get aggregated patterns from knowledge base
  const patterns = await query(`
    SELECT
      company_normalized,
      rejection_category,
      ats_stage,
      signal,
      COUNT(*) as count
    FROM rejection_knowledge_base
    WHERE signal IS NOT NULL
    GROUP BY company_normalized, rejection_category, ats_stage, signal
    HAVING COUNT(*) >= 2
    ORDER BY count DESC
    LIMIT 100
  `);

  console.log(`Found ${patterns.rows.length} patterns to sync\n`);

  let synced = 0;
  for (const row of patterns.rows) {
    const id = `pattern-${row.company_normalized}-${row.signal}`.replace(/\s+/g, '-').substring(0, 100);

    // Create a rich text description for semantic search
    const text = `${row.company_normalized} rejection pattern: ${row.signal}. ` +
      `Category: ${row.rejection_category || 'unknown'}. ` +
      `Stage: ${row.ats_stage || 'unknown'}. ` +
      `Seen ${row.count} times.`;

    try {
      await storeKnowledge(id, text, {
        category: 'rejection-pattern',
        company: row.company_normalized || '',
        signal: row.signal || '',
        rejectionCategory: row.rejection_category || '',
        atsStage: row.ats_stage || '',
        count: parseInt(row.count)
      });
      synced++;
      console.log(`  ✓ ${row.company_normalized}: ${row.signal}`);
    } catch (err) {
      console.log(`  ✗ Failed: ${id}`);
    }
  }

  console.log(`\nSynced ${synced}/${patterns.rows.length} patterns`);

  // Also sync company-level insights
  const companies = await query(`
    SELECT
      company_normalized,
      COUNT(*) as total_rejections,
      COUNT(DISTINCT rejection_category) as unique_categories,
      MODE() WITHIN GROUP (ORDER BY rejection_category) as most_common_category
    FROM rejection_knowledge_base
    GROUP BY company_normalized
    HAVING COUNT(*) >= 5
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `);

  console.log(`\nSyncing ${companies.rows.length} company profiles...\n`);

  for (const row of companies.rows) {
    const id = `company-${row.company_normalized}`;
    const text = `${row.company_normalized} has ${row.total_rejections} rejections tracked. ` +
      `Most common rejection type: ${row.most_common_category || 'various'}. ` +
      `${row.unique_categories} different rejection categories seen.`;

    try {
      await storeKnowledge(id, text, {
        category: 'company-profile',
        company: row.company_normalized || '',
        totalRejections: parseInt(row.total_rejections),
        mostCommonCategory: row.most_common_category || ''
      });
      console.log(`  ✓ ${row.company_normalized}`);
    } catch (err) {
      console.log(`  ✗ Failed: ${row.company_normalized}`);
    }
  }

  console.log('\n✅ Sync complete!');
}

syncKnowledgeBase().catch(console.error);
