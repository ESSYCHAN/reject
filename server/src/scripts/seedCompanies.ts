import 'dotenv/config';
import { query } from '../db/index.js';
import { normalizeCompanyKey } from '../services/companyResolver.js';

/**
 * Seed canonical companies + known aliases so common names resolve correctly
 * from day one — no LLM call needed for these. Add to this list as you spot
 * recurring variants in the data.
 *
 * Run: npx tsx src/scripts/seedCompanies.ts
 */
// IMPORTANT: aliases here are ONLY spelling/abbreviation variants of the SAME
// legal entity — never subsidiaries or sibling brands. Subsidiaries (e.g.
// DeepMind under Alphabet, AWS under Amazon) are kept as their own canonical
// companies on purpose; parent/child relationships will be modelled separately
// later, not by merging.
const SEED: { canonical: string; aliases: string[] }[] = [
  { canonical: 'AI Safety Institute', aliases: ['AISI', 'A.I. Safety Institute', 'UK AI Safety Institute', 'The AI Safety Institute'] },
  { canonical: 'Google', aliases: ['Google LLC', 'Google Inc'] },
  { canonical: 'DeepMind', aliases: ['Google DeepMind'] },  // kept separate from Google by design
  { canonical: 'Meta', aliases: ['Meta Platforms', 'Meta Inc'] },
  { canonical: 'Facebook', aliases: ['Facebook Inc'] },  // brand kept separate from Meta entity
  { canonical: 'Amazon', aliases: ['Amazon.com', 'Amazon Inc'] },
  { canonical: 'Amazon Web Services', aliases: ['AWS'] },  // subsidiary kept separate from Amazon
  { canonical: 'Microsoft', aliases: ['Microsoft Corporation', 'MSFT', 'Microsoft Corp'] },
  { canonical: 'Apple', aliases: ['Apple Inc', 'Apple Computer'] },
  { canonical: 'OpenAI', aliases: ['Open AI', 'OpenAI Inc', 'OpenAI LP'] },
  { canonical: 'Anthropic', aliases: ['Anthropic PBC', 'Anthropic AI'] },
  { canonical: 'JPMorgan Chase', aliases: ['JP Morgan', 'JPMorgan', 'J.P. Morgan', 'JPMC'] },
  { canonical: 'Goldman Sachs', aliases: ['Goldman', 'GS', 'Goldman Sachs Group'] },
  { canonical: 'Deloitte', aliases: ['Deloitte LLP', 'Deloitte Touche', 'Deloitte Touche Tohmatsu'] },
  { canonical: 'PwC', aliases: ['PricewaterhouseCoopers', 'Price Waterhouse Coopers', 'PWC'] },
];

async function seed() {
  console.log('Seeding canonical companies + aliases...\n');
  let companies = 0;
  let aliases = 0;

  for (const entry of SEED) {
    const canonicalKey = normalizeCompanyKey(entry.canonical);

    const inserted = await query(
      `INSERT INTO companies (canonical_name, canonical_key, aliases_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (canonical_key) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
       RETURNING id`,
      [entry.canonical, canonicalKey, entry.aliases.length + 1]
    );
    const companyId = inserted.rows[0].id;
    companies++;

    // Self-alias (the canonical name itself) + every listed alias.
    const allNames = [entry.canonical, ...entry.aliases];
    for (const name of allNames) {
      const aliasKey = normalizeCompanyKey(name);
      if (!aliasKey) continue;
      const res = await query(
        `INSERT INTO company_aliases (alias_key, company_id, raw_name, resolved_by)
         VALUES ($1, $2, $3, 'seed')
         ON CONFLICT (alias_key) DO NOTHING
         RETURNING alias_key`,
        [aliasKey, companyId, name]
      );
      if (res.rows.length > 0) aliases++;
    }
    console.log(`  ✓ ${entry.canonical} (+${entry.aliases.length} aliases)`);
  }

  console.log(`\n✅ Seeded ${companies} companies, ${aliases} alias rows.`);
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
