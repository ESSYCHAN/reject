import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
});

const index = pinecone.index('reject-knowledge');

// Store a piece of knowledge
export async function storeKnowledge(
  id: string,
  text: string,
  metadata: Record<string, string | number>
) {
  await index.upsertRecords({
    records: [{
      _id: id,
      text,
      ...metadata
    }]
  });
}

// Search by meaning (semantic search)
export async function searchKnowledge(query: string, topK = 5) {
  const results = await index.searchRecords({
    query: { topK, inputs: { text: query } }
  });
  return results.result.hits;
}

// ============================================================================
// FLYWHEEL: Store decoded rejection patterns
// ============================================================================

interface DecodedRejection {
  company: string;
  role?: string;
  category: string;        // e.g., "ats_rejection", "post_interview"
  stage?: string;          // e.g., "resume_screen", "phone_screen"
  signals: string[];       // e.g., ["overqualified", "culture_fit"]
  confidence?: number;
}

/**
 * Store a decoded rejection in Pinecone for semantic search
 * This is called after every successful decode to build the knowledge flywheel
 */
export async function storeDecodedRejection(rejection: DecodedRejection) {
  // Skip if no meaningful data
  if (!rejection.company || rejection.company === 'unknown') {
    console.log('[vectordb] Skipping - no company identified');
    return;
  }

  // Create a unique ID based on content (prevents exact duplicates)
  const signalsStr = rejection.signals?.join('-') || 'no-signals';
  const id = `rejection-${rejection.company}-${rejection.category}-${signalsStr}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .substring(0, 100);

  // Create rich text description for semantic search
  // This is what gets embedded - more context = better search
  const text = [
    `Rejection from ${rejection.company}`,
    rejection.role ? `for ${rejection.role} role` : '',
    `Category: ${rejection.category}`,
    rejection.stage ? `Stage: ${rejection.stage}` : '',
    rejection.signals?.length
      ? `Signals: ${rejection.signals.join(', ')}`
      : '',
  ].filter(Boolean).join('. ') + '.';

  try {
    await storeKnowledge(id, text, {
      type: 'rejection',
      company: rejection.company,
      category: rejection.category,
      stage: rejection.stage || '',
      signals: rejection.signals?.join(',') || '',
      confidence: rejection.confidence || 0,
    });
    console.log(`[vectordb] Stored rejection pattern: ${rejection.company} - ${rejection.category}`);
  } catch (error) {
    // Don't fail the decode if vectordb fails
    console.error('[vectordb] Failed to store rejection:', error);
  }
}

/**
 * Search for similar rejection patterns
 * Used by agents to find patterns like "Why do I keep getting rejected at Google?"
 */
export async function searchSimilarRejections(query: string, topK = 5) {
  try {
    const results = await searchKnowledge(query, topK);
    return results.map(hit => {
      // Cast fields to access properties (Pinecone returns generic object)
      const fields = hit.fields as Record<string, unknown> | undefined;
      return {
        company: fields?.company as string | undefined,
        category: fields?.category as string | undefined,
        stage: fields?.stage as string | undefined,
        signals: (fields?.signals as string)?.split(',').filter(Boolean),
        score: hit._score,
        text: fields?.text as string | undefined,
      };
    });
  } catch (error) {
    console.error('[vectordb] Search failed:', error);
    return [];
  }
}
