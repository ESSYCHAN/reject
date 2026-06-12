import OpenAI from 'openai';
import { query } from '../db/index.js';

/**
 * Company entity resolution.
 *
 * Problem: the same company shows up under many surface names — "AISI",
 * "AI Safety Institute", "A.I. Safety Institute". Plain string normalization
 * puts them in different buckets, so insights fragment.
 *
 * Strategy (hybrid, self-improving):
 *   1. Normalize the raw name to an alias_key.
 *   2. Deterministic lookup in company_aliases — a hit returns the canonical
 *      company instantly and for free. This handles the overwhelming majority
 *      of writes once aliases accumulate.
 *   3. On a miss, ask the LLM ONCE whether this name matches a known company.
 *   4. Persist the alias either way, so the same name is never sent to the LLM
 *      again. Cost is one model call per *novel* surface name, ever.
 */

export interface ResolvedCompany {
  companyId: number;
  canonicalName: string;
  canonicalKey: string;
  resolvedBy: 'exact' | 'llm' | 'new';
}

/** Same normalization rule the rest of the codebase uses, kept in sync. */
export function normalizeCompanyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\s]+(com|inc|ltd|llc|corp|corporation|co|plc|group|holdings?)\.?$/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

let openai: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (openai) return openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-your-openai-api-key-here') return null;
  openai = new OpenAI({ apiKey });
  return openai;
}

/**
 * Resolve a raw company name to a canonical company, creating/learning as needed.
 * Always returns a company (falls back to creating a new canonical row), so the
 * caller can safely stamp a company_id on every write.
 */
export async function resolveCompany(rawName: string): Promise<ResolvedCompany | null> {
  const trimmed = (rawName || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;

  const aliasKey = normalizeCompanyKey(trimmed);
  if (!aliasKey) return null;

  // 1. Deterministic alias lookup — free, instant, handles repeat names.
  const existing = await query(
    `SELECT c.id, c.canonical_name, c.canonical_key
     FROM company_aliases a JOIN companies c ON c.id = a.company_id
     WHERE a.alias_key = $1`,
    [aliasKey]
  );
  if (existing.rows.length > 0) {
    const r = existing.rows[0];
    return { companyId: r.id, canonicalName: r.canonical_name, canonicalKey: r.canonical_key, resolvedBy: 'exact' };
  }

  // 1b. Maybe a canonical company already exists with this exact key but no
  // alias row yet (e.g. seeded canonical). Link to it.
  const sameKey = await query(
    `SELECT id, canonical_name, canonical_key FROM companies WHERE canonical_key = $1`,
    [aliasKey]
  );
  if (sameKey.rows.length > 0) {
    const r = sameKey.rows[0];
    await linkAlias(aliasKey, r.id, trimmed, 'exact');
    return { companyId: r.id, canonicalName: r.canonical_name, canonicalKey: r.canonical_key, resolvedBy: 'exact' };
  }

  // 2. Unknown name — ask the LLM once whether it matches a known company.
  const llmMatch = await tryLlmMatch(trimmed);
  if (llmMatch) {
    await linkAlias(aliasKey, llmMatch.id, trimmed, 'llm');
    await query(`UPDATE companies SET aliases_count = aliases_count + 1 WHERE id = $1`, [llmMatch.id]);
    return { companyId: llmMatch.id, canonicalName: llmMatch.canonical_name, canonicalKey: llmMatch.canonical_key, resolvedBy: 'llm' };
  }

  // 3. Genuinely new company — create canonical row + self-alias.
  const created = await query(
    `INSERT INTO companies (canonical_name, canonical_key, aliases_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (canonical_key) DO UPDATE SET aliases_count = companies.aliases_count
     RETURNING id, canonical_name, canonical_key`,
    [trimmed, aliasKey]
  );
  const c = created.rows[0];
  await linkAlias(aliasKey, c.id, trimmed, 'new');
  return { companyId: c.id, canonicalName: c.canonical_name, canonicalKey: c.canonical_key, resolvedBy: 'new' };
}

async function linkAlias(aliasKey: string, companyId: number, rawName: string, resolvedBy: string) {
  await query(
    `INSERT INTO company_aliases (alias_key, company_id, raw_name, resolved_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (alias_key) DO NOTHING`,
    [aliasKey, companyId, rawName, resolvedBy]
  );
}

/**
 * Ask the LLM whether `rawName` is the same as one of the known companies.
 * Returns the matched company row, or null for "no match / new company".
 * Conservative by design: only the most common/confusable companies are offered
 * as candidates, and the model must pick an exact id or say NEW.
 */
async function tryLlmMatch(
  rawName: string
): Promise<{ id: number; canonical_name: string; canonical_key: string } | null> {
  const client = getClient();
  if (!client) return null; // No LLM configured — treat as new company.

  // Offer the most-aliased existing companies as candidates (cap the prompt size).
  const candidates = await query(
    `SELECT id, canonical_name FROM companies ORDER BY aliases_count DESC, id ASC LIMIT 60`
  );
  if (candidates.rows.length === 0) return null;

  const list = candidates.rows.map((r) => `${r.id}: ${r.canonical_name}`).join('\n');

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 10,
      messages: [
        {
          role: 'system',
          content:
            'You resolve company names to a canonical list. Given a new company name and a numbered list of known companies, reply with ONLY the id number if the new name is the SAME legal entity — i.e. an abbreviation, acronym, punctuation/suffix variant, or alternate spelling (e.g. "AISI" = "AI Safety Institute", "JPMorgan" = "JPMorgan Chase"). ' +
            'Do NOT match a subsidiary, division, brand, or sibling company to its parent (e.g. "DeepMind" is NOT "Google"; "AWS" is NOT "Amazon"; "Instagram" is NOT "Meta") — for those reply "NEW". ' +
            'If it is not clearly the same legal entity as a listed company, reply with exactly "NEW". Never guess; when unsure, reply "NEW".',
        },
        {
          role: 'user',
          content: `New company name: "${rawName}"\n\nKnown companies:\n${list}\n\nReply with the matching id or NEW.`,
        },
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim() || 'NEW';
    if (/^new$/i.test(answer)) return null;

    const id = parseInt(answer, 10);
    if (Number.isNaN(id)) return null;

    const match = candidates.rows.find((r) => r.id === id);
    if (!match) return null;

    const full = await query(
      `SELECT id, canonical_name, canonical_key FROM companies WHERE id = $1`,
      [id]
    );
    return full.rows[0] || null;
  } catch (err) {
    console.error('[companyResolver] LLM match failed, treating as new:', err);
    return null;
  }
}
