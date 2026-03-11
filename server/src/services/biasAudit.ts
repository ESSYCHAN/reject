import OpenAI from 'openai';
import {
  BiasAuditResponse,
  BiasAuditResponseSchema,
  BiasSignal,
  BIAS_DISCLAIMER,
  SIGNAL_TO_CHARACTERISTIC,
  BiasSignalType,
} from '../types/bias.js';
import { redactPII } from './piiRedactor.js';

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'sk-your-openai-api-key-here') {
      throw new Error('OPENAI_API_KEY not configured');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// ============ BIAS ANALYSIS PROMPT ============

const BIAS_AUDIT_PROMPT = `You analyze rejection emails to identify potential bias signals in hiring decisions. Your role is to flag language patterns that MAY indicate bias - you are NOT making accusations or legal determinations.

=== IMPORTANT CONTEXT ===
- You are analyzing from a UK perspective, with reference to the Equality Act 2010
- Be conservative - only flag clear patterns, not ambiguous language
- Focus on LANGUAGE PATTERNS, not assumptions about the sender
- Some patterns correlate with protected characteristics but aren't direct discrimination
- The goal is to help job seekers understand their rejections, not to build legal cases

=== UK EQUALITY ACT 2010 PROTECTED CHARACTERISTICS ===
1. Age
2. Disability
3. Gender reassignment
4. Marriage and civil partnership
5. Pregnancy and maternity
6. Race (includes colour, nationality, ethnic/national origins)
7. Religion or belief
8. Sex
9. Sexual orientation

=== SIGNAL TYPES TO DETECT ===

age_related:
- References to "energy", "digital native", "recent graduate preferred"
- "Looking for someone early in their career" (when not entry-level role)
- "Might not be the right fit culturally" after discussing experience level
- Mentions of "overqualified" without substantive explanation

gender_related:
- References to "culture fit" after discussing family/personal life
- Different communication tone than typical (overly informal/formal based on assumed gender)
- Comments about "leadership style" that use gendered language
- References to "aggressive" or "not assertive enough" that may be gendered

race_ethnicity_related:
- Comments about "communication style" or "accent"
- References to "cultural fit" without clear job-related reasoning
- Mentions of "international experience" as negative
- Any reference to name pronunciation or spelling

disability_related:
- Questions or comments about "stamina" or "physical demands" not in JD
- References to "attendance concerns" without prior issues
- Comments about "pace" or "keeping up"
- Assumptions about capabilities

pregnancy_maternity_related:
- Timeline questions about "long-term commitment"
- References to "stability" or "availability"
- Comments about team planning or coverage
- Questions about future plans

religion_belief_related:
- Comments about availability on specific days
- References to "cultural events" or holidays
- Dress code discussions not relevant to role

socioeconomic_related:
- Emphasis on specific university prestige
- Comments about "polish" or "presentation"
- References to unpaid experience expectations

educational_institution_bias:
- Explicit preference for specific universities
- Dismissal based on institution rather than qualifications

name_based:
- Any comment about name
- Spelling/pronunciation mentions
- "Unusual name" comments

=== OUTPUT JSON ===
{
  "overall_risk": "low" | "moderate" | "high" | "insufficient_data",
  "confidence": 0.0-1.0,
  "signals": [
    {
      "signal_type": "age_related" | "gender_related" | "race_ethnicity_related" | "disability_related" | "pregnancy_maternity_related" | "religion_belief_related" | "sexual_orientation_related" | "marital_status_related" | "socioeconomic_related" | "educational_institution_bias" | "name_based" | "appearance_related" | "none_detected",
      "indicator_phrase": "exact quote from email",
      "confidence": 0.0-1.0,
      "explanation": "why this might indicate bias",
      "uk_equality_act_category": "protected characteristic name or null"
    }
  ],
  "summary": "1-2 sentence plain English summary",
  "suggested_actions": ["actionable next steps"],
  "equality_act_relevance": {
    "potentially_relevant": true/false,
    "protected_characteristics": ["list of relevant characteristics"],
    "recommended_next_steps": ["UK-specific guidance"]
  }
}

=== RISK LEVEL CRITERIA ===

high:
- Multiple signals pointing to same protected characteristic
- Explicit discriminatory language
- Clear pattern of bias indicators
- High confidence signals (>0.7)

moderate:
- Single clear signal
- Multiple low-confidence signals
- Language that correlates with bias but isn't definitive

low:
- No clear bias signals
- Standard rejection language
- Feedback is job-related and specific

insufficient_data:
- Email is too short
- No substantive feedback provided
- Automated/template response with no personalization

=== TONE ===
- Be factual and measured
- Don't assume bad intent
- Explain WHY something might be concerning
- Be helpful, not alarmist
- Always remind user this is not legal advice

Return valid JSON only.`;

// ============ MAIN FUNCTION ============

interface BiasAuditOptions {
  includeUKContext?: boolean;
  interviewStage?: string;
}

export async function analyzeBias(
  emailText: string,
  options: BiasAuditOptions = {}
): Promise<BiasAuditResponse> {
  const { includeUKContext = true } = options;
  const client = getOpenAIClient();

  // PII redaction first - critical for privacy
  const { redacted, totalRedactions } = redactPII(emailText);

  if (totalRedactions > 0) {
    console.log(`[bias-audit] Redacted ${totalRedactions} PII items before analysis`);
  }

  // Check for minimum content
  if (redacted.length < 50) {
    return {
      overall_risk: 'insufficient_data',
      confidence: 0,
      signals: [],
      summary: 'The email is too short to analyze for bias patterns.',
      suggested_actions: ['If you have a longer rejection email, try analyzing that instead.'],
      disclaimer: BIAS_DISCLAIMER,
      analysis_version: '1.0',
    };
  }

  const contextNote = includeUKContext
    ? 'Analyze with UK Equality Act 2010 context.'
    : 'Analyze for general bias patterns.';

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: BIAS_AUDIT_PROMPT },
      {
        role: 'user',
        content: `${contextNote}\n\nAnalyze this rejection email for potential bias signals:\n\n${redacted.substring(0, 5000)}`
      }
    ],
    temperature: 0.2, // Lower temperature for more consistent analysis
    max_tokens: 1200,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  const parsed = JSON.parse(content);

  // Map signal types to UK protected characteristics
  if (parsed.signals && Array.isArray(parsed.signals)) {
    parsed.signals = parsed.signals.map((signal: BiasSignal) => ({
      ...signal,
      uk_equality_act_category: signal.uk_equality_act_category ||
        SIGNAL_TO_CHARACTERISTIC[signal.signal_type as BiasSignalType] || null
    }));
  }

  // Add mandatory disclaimer
  parsed.disclaimer = BIAS_DISCLAIMER;
  parsed.analysis_version = '1.0';

  // Validate response
  const validated = BiasAuditResponseSchema.safeParse(parsed);

  if (!validated.success) {
    console.error('[bias-audit] Validation failed:', validated.error);
    // Return safe fallback
    return {
      overall_risk: 'insufficient_data',
      confidence: 0,
      signals: [],
      summary: 'Unable to complete bias analysis. Please try again.',
      suggested_actions: ['Try analyzing the email again.'],
      disclaimer: BIAS_DISCLAIMER,
      analysis_version: '1.0',
    };
  }

  return validated.data;
}

/**
 * Quick check if an email might contain bias signals (for UI hints)
 * This is a lighter-weight check than full analysis
 */
export function quickBiasCheck(emailText: string): {
  mightContainBias: boolean;
  suggestedAnalysis: boolean;
} {
  const lowerText = emailText.toLowerCase();

  // Quick pattern check for common bias indicators
  const biasIndicators = [
    'cultural fit',
    'culture fit',
    'overqualified',
    'energy level',
    'digital native',
    'long-term commitment',
    'attendance',
    'communication style',
    'accent',
    'polish',
    'presentation',
    'leadership style',
    'aggressive',
    'not assertive',
    'stamina',
    'keeping up',
    'recent graduate',
    'early career',
  ];

  const foundIndicators = biasIndicators.filter(indicator =>
    lowerText.includes(indicator)
  );

  return {
    mightContainBias: foundIndicators.length > 0,
    suggestedAnalysis: foundIndicators.length >= 1,
  };
}
