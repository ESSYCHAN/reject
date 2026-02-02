/**
 * Rescorla-Wagner Associative Learner for Job Application Analytics
 *
 * Replaces naive correlation ("50% success with referrals!") with proper
 * cue competition learning that identifies what ACTUALLY predicts success.
 */

import { ApplicationRecord } from '../types/pro';

// ============ TYPES ============

export interface CueWeights {
  [cue: string]: number;
}

export interface CueMetadata {
  [cue: string]: {
    trials: number;
    lastUpdated: string;
  };
}

export interface RWState {
  weights: CueWeights;
  metadata: CueMetadata;
  totalTrials: number;
  learningRate: number;
}

export interface CueInsight {
  cue: string;
  category: 'source' | 'companySize' | 'seniority' | 'industry';
  weight: number;
  trials: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  interpretation: 'strong_positive' | 'positive' | 'neutral' | 'negative' | 'strong_negative';
}

export interface Counterfactual {
  description: string;
  currentCue: string;
  suggestedCue: string;
  probabilityIncrease: number;
}

export interface RWAnalytics {
  insights: CueInsight[];
  topPredictors: CueInsight[];
  bottomPredictors: CueInsight[];
  counterfactuals: Counterfactual[];
  modelAccuracy: number | null;
  totalTrials: number;
  isReliable: boolean;
  summary: string;
}

// ============ CONSTANTS ============

const DEFAULT_LEARNING_RATE = 0.1;
const DEFAULT_INITIAL_WEIGHT = 0.5;
const MIN_TRIALS_FOR_CONFIDENCE = 30;
const MIN_CUE_TRIALS_HIGH = 20;
const MIN_CUE_TRIALS_MEDIUM = 10;
const MIN_CUE_TRIALS_LOW = 5;

// ============ CUE EXTRACTION ============

/**
 * Extract cues from an application record
 */
export function extractCues(app: ApplicationRecord): string[] {
  const cues: string[] = [];

  // Source cue
  if (app.source) {
    cues.push(`source:${app.source}`);
  }

  // Company size cue
  if (app.companySize) {
    cues.push(`size:${app.companySize}`);
  }

  // Seniority cue
  if (app.seniorityLevel) {
    cues.push(`seniority:${app.seniorityLevel}`);
  }

  // Industry cue (if available)
  if (app.industry) {
    cues.push(`industry:${app.industry.toLowerCase()}`);
  }

  return cues;
}

/**
 * Map outcome to target value (λ)
 * Higher values = better outcomes
 */
export function outcomeToTarget(outcome: string): number | null {
  switch (outcome) {
    case 'offer':
      return 1.0;
    case 'rejected_final':
      return 0.7; // Got far in process
    case 'rejected_hm':
      return 0.5; // Passed recruiter screen
    case 'rejected_recruiter':
      return 0.3; // Passed ATS
    case 'rejected_ats':
      return 0.1; // Filtered early
    case 'ghosted':
      return 0.0; // No response
    case 'interviewing':
      return null; // Still in progress, don't train
    case 'applied':
      return null; // Still pending, don't train
    default:
      return null;
  }
}

// ============ R-W CORE ALGORITHM ============

/**
 * Initialize R-W state
 */
export function initializeRWState(learningRate: number = DEFAULT_LEARNING_RATE): RWState {
  return {
    weights: {},
    metadata: {},
    totalTrials: 0,
    learningRate
  };
}

/**
 * Get weight for a cue (initializes if not present)
 */
function getWeight(state: RWState, cue: string): number {
  if (state.weights[cue] === undefined) {
    state.weights[cue] = DEFAULT_INITIAL_WEIGHT;
    state.metadata[cue] = { trials: 0, lastUpdated: new Date().toISOString() };
  }
  return state.weights[cue];
}

/**
 * Single R-W learning trial
 * ΔV = α × (λ - ΣV)
 */
export function train(state: RWState, cues: string[], outcome: number): RWState {
  const newState = { ...state, weights: { ...state.weights }, metadata: { ...state.metadata } };

  // Calculate prediction (sum of weights for present cues)
  let prediction = 0;
  for (const cue of cues) {
    prediction += getWeight(newState, cue);
  }

  // Calculate prediction error
  const error = outcome - prediction;

  // Update each cue's weight
  const delta = newState.learningRate * error;
  const now = new Date().toISOString();

  for (const cue of cues) {
    newState.weights[cue] = (newState.weights[cue] ?? DEFAULT_INITIAL_WEIGHT) + delta;

    // Clamp weights to [0, 1] range
    newState.weights[cue] = Math.max(0, Math.min(1, newState.weights[cue]));

    // Update metadata
    if (!newState.metadata[cue]) {
      newState.metadata[cue] = { trials: 0, lastUpdated: now };
    }
    newState.metadata[cue].trials++;
    newState.metadata[cue].lastUpdated = now;
  }

  newState.totalTrials++;

  return newState;
}

/**
 * Train on all applications
 */
export function trainOnApplications(applications: ApplicationRecord[]): RWState {
  let state = initializeRWState();

  // Sort by date (oldest first) to simulate learning over time
  const sorted = [...applications].sort(
    (a, b) => new Date(a.dateApplied).getTime() - new Date(b.dateApplied).getTime()
  );

  for (const app of sorted) {
    const target = outcomeToTarget(app.outcome);
    if (target === null) continue; // Skip pending/interviewing

    const cues = extractCues(app);
    if (cues.length === 0) continue;

    state = train(state, cues, target);
  }

  return state;
}

// ============ ANALYTICS GENERATION ============

/**
 * Parse cue string to get category and value
 */
function parseCue(cue: string): { category: CueInsight['category']; value: string } {
  const [category, value] = cue.split(':');

  const categoryMap: Record<string, CueInsight['category']> = {
    'source': 'source',
    'size': 'companySize',
    'seniority': 'seniority',
    'industry': 'industry'
  };

  return {
    category: categoryMap[category] || 'source',
    value: value || cue
  };
}

/**
 * Determine confidence level based on trial count
 */
function getConfidence(trials: number): CueInsight['confidence'] {
  if (trials >= MIN_CUE_TRIALS_HIGH) return 'high';
  if (trials >= MIN_CUE_TRIALS_MEDIUM) return 'medium';
  if (trials >= MIN_CUE_TRIALS_LOW) return 'low';
  return 'insufficient';
}

/**
 * Interpret weight value
 */
function interpretWeight(weight: number): CueInsight['interpretation'] {
  if (weight >= 0.7) return 'strong_positive';
  if (weight >= 0.55) return 'positive';
  if (weight >= 0.45) return 'neutral';
  if (weight >= 0.3) return 'negative';
  return 'strong_negative';
}

/**
 * Format cue name for display
 */
function formatCueName(cue: string): string {
  const { value } = parseCue(cue);
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Generate counterfactual recommendations
 */
function generateCounterfactuals(insights: CueInsight[]): Counterfactual[] {
  const counterfactuals: Counterfactual[] = [];

  // Group by category
  const byCategory: Record<string, CueInsight[]> = {};
  for (const insight of insights) {
    if (!byCategory[insight.category]) byCategory[insight.category] = [];
    byCategory[insight.category].push(insight);
  }

  // For each category, suggest swapping worst for best
  for (const [category, categoryInsights] of Object.entries(byCategory)) {
    if (categoryInsights.length < 2) continue;

    // Sort by weight
    const sorted = [...categoryInsights].sort((a, b) => b.weight - a.weight);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Only suggest if there's meaningful difference and enough confidence
    if (best.weight - worst.weight >= 0.15 &&
        best.confidence !== 'insufficient' &&
        worst.confidence !== 'insufficient') {
      const increase = Math.round((best.weight - worst.weight) * 100);

      const categoryLabel = category === 'companySize' ? 'company size' : category;

      counterfactuals.push({
        description: `Switch ${categoryLabel} from ${formatCueName(worst.cue)} to ${formatCueName(best.cue)}`,
        currentCue: worst.cue,
        suggestedCue: best.cue,
        probabilityIncrease: increase
      });
    }
  }

  // Sort by potential impact
  return counterfactuals.sort((a, b) => b.probabilityIncrease - a.probabilityIncrease);
}

/**
 * Generate summary text
 */
function generateSummary(
  topPredictors: CueInsight[],
  bottomPredictors: CueInsight[],
  totalTrials: number,
  isReliable: boolean
): string {
  if (totalTrials === 0) {
    return 'No completed applications yet. Start tracking to see what predicts your success.';
  }

  if (!isReliable) {
    return `${totalTrials} applications tracked. Need ${MIN_TRIALS_FOR_CONFIDENCE - totalTrials} more for reliable insights.`;
  }

  const parts: string[] = [];

  if (topPredictors.length > 0) {
    const top = topPredictors[0];
    parts.push(`${formatCueName(top.cue)} is your strongest predictor (+${Math.round(top.weight * 100)}%)`);
  }

  if (bottomPredictors.length > 0) {
    const bottom = bottomPredictors[0];
    if (bottom.interpretation === 'strong_negative' || bottom.interpretation === 'negative') {
      parts.push(`${formatCueName(bottom.cue)} is hurting your chances`);
    }
  }

  if (parts.length === 0) {
    return `${totalTrials} applications analyzed. Your results are fairly consistent across different factors.`;
  }

  return parts.join('. ') + '.';
}

/**
 * Generate full R-W analytics from state
 */
export function generateRWAnalytics(state: RWState): RWAnalytics {
  const insights: CueInsight[] = [];

  // Convert weights to insights
  for (const [cue, weight] of Object.entries(state.weights)) {
    const { category } = parseCue(cue);
    const trials = state.metadata[cue]?.trials || 0;

    insights.push({
      cue,
      category,
      weight,
      trials,
      confidence: getConfidence(trials),
      interpretation: interpretWeight(weight)
    });
  }

  // Sort by weight (descending)
  insights.sort((a, b) => b.weight - a.weight);

  // Get top/bottom predictors (only those with sufficient data)
  const reliable = insights.filter(i => i.confidence !== 'insufficient');
  const topPredictors = reliable.filter(i =>
    i.interpretation === 'strong_positive' || i.interpretation === 'positive'
  ).slice(0, 3);

  const bottomPredictors = reliable.filter(i =>
    i.interpretation === 'strong_negative' || i.interpretation === 'negative'
  ).slice(-3).reverse();

  // Generate counterfactuals
  const counterfactuals = generateCounterfactuals(reliable);

  // Check if model is reliable
  const isReliable = state.totalTrials >= MIN_TRIALS_FOR_CONFIDENCE;

  // Generate summary
  const summary = generateSummary(topPredictors, bottomPredictors, state.totalTrials, isReliable);

  return {
    insights,
    topPredictors,
    bottomPredictors,
    counterfactuals,
    modelAccuracy: null, // Could calculate cross-validation accuracy
    totalTrials: state.totalTrials,
    isReliable,
    summary
  };
}

/**
 * Main entry point: analyze applications with R-W
 */
export function analyzeWithRW(applications: ApplicationRecord[]): RWAnalytics {
  const state = trainOnApplications(applications);
  return generateRWAnalytics(state);
}

/**
 * Predict outcome for a hypothetical application
 */
export function predictOutcome(state: RWState, cues: string[]): number {
  let prediction = 0;
  for (const cue of cues) {
    prediction += state.weights[cue] ?? DEFAULT_INITIAL_WEIGHT;
  }
  // Normalize by number of cues and clamp
  return Math.max(0, Math.min(1, prediction / Math.max(cues.length, 1)));
}
