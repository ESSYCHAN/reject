import 'dotenv/config';
import { query } from '../db/index.js';
import { resolveCompany } from '../services/companyResolver.js';

/**
 * Backfill company_id on existing rejection_knowledge_base rows.
 *
 * Resolves each DISTINCT company_normalized value once (not every row), then
 * bulk-updates all rows sharing that value. Skips 'unknown'. New companies get
 * created on the fly by resolveCompany(); known/seeded ones match deterministically.
 *
 * Run: npx tsx src/scripts/backfillCompanyIds.ts
 */
async function backfill() {
  console.log('Backfilling company_id on rejection_knowledge_base...\n');

  const distinct = await query(`
    SELECT company_normalized, COUNT(*) AS cnt
    FROM rejection_knowledge_base
    WHERE company_id IS NULL
      AND company_normalized IS NOT NULL
      AND company_normalized <> ''
      AND LOWER(company_normalized) <> 'unknown'
    GROUP BY company_normalized
    ORDER BY cnt DESC
  `);

  console.log(`${distinct.rows.length} distinct company names to resolve.\n`);

  let resolved = 0;
  let rowsUpdated = 0;
  for (const row of distinct.rows) {
    // company_normalized is already snake_cased; turn it back into a readable
    // name so the resolver / LLM has something natural to work with.
    const readable = row.company_normalized.replace(/_/g, ' ').trim();
    try {
      const r = await resolveCompany(readable);
      if (!r) {
        console.log(`  – skipped "${row.company_normalized}" (unresolvable)`);
        continue;
      }
      const upd = await query(
        `UPDATE rejection_knowledge_base
         SET company_id = $1
         WHERE company_id IS NULL AND company_normalized = $2`,
        [r.companyId, row.company_normalized]
      );
      resolved++;
      rowsUpdated += upd.rowCount || 0;
      console.log(`  ✓ ${row.company_normalized} (${row.cnt} rows) → #${r.companyId} ${r.canonicalName} [${r.resolvedBy}]`);
    } catch (err) {
      console.error(`  ✗ ${row.company_normalized}:`, (err as Error).message);
    }
  }

  const remaining = await query(
    `SELECT COUNT(*) AS n FROM rejection_knowledge_base WHERE company_id IS NULL AND LOWER(company_normalized) <> 'unknown'`
  );

  console.log(`\n✅ Resolved ${resolved} names, updated ${rowsUpdated} rows.`);
  console.log(`   ${remaining.rows[0].n} non-unknown rows still without company_id.`);
  process.exit(0);
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
