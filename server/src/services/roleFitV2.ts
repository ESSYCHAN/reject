import OpenAI from 'openai';
import { z } from 'zod';
import { FullProfile, profileToPromptContext } from './profileInference.js';

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

// ============ ROLE FIT SCHEMA ============

// ATS-aware assessment - will direct applications reach human review?
export const ATSFitAssessmentSchema = z.object({
  direct_application_odds: z.enum(['likely_reviewed', 'uncertain', 'likely_filtered']),
  reasoning: z.string(),
  bypass_strategy: z.string().nullable()
});

export type ATSFitAssessment = z.infer<typeof ATSFitAssessmentSchema>;

export const RoleFitResultV2Schema = z.object({
  verdict: z.enum(['good_match', 'worth_trying', 'long_shot', 'insufficient_data']),
  confidence: z.number().min(0).max(1),
  company: z.string(),
  role_title: z.string(),
  seniority_detected: z.string().nullable(),
  summary: z.string(),
  working_for_you: z.array(z.string()),
  working_against_you: z.array(z.string()),
  historical_context: z.object({
    similar_applications: z.number(),
    similar_success_rate: z.number().nullable(),
    best_performing_source: z.string().nullable(),
    applied_to_this_company_before: z.boolean()
  }),
  recommendation: z.string(),
  if_you_apply: z.array(z.string()),
  ats_fit: ATSFitAssessmentSchema.optional()
});

export type RoleFitResultV2 = z.infer<typeof RoleFitResultV2Schema>;

// ============ THE PROMPT ============

const ROLE_FIT_PROMPT = `You assess job fit based on a candidate's application history. Your job is to be HELPFUL and ACCURATE, not discouraging.

=== EXTRACT FROM JOB DESCRIPTION ===
First, extract:
- Company name
- Role title
- Seniority level (intern/junior/mid/senior/staff/principal/director/vp/c-level)
- Industry (if apparent)

=== OUTPUT JSON ===
{
  "verdict": "good_match" | "worth_trying" | "long_shot" | "insufficient_data",
  "confidence": 0.0-1.0,
  "company": "extracted company name",
  "role_title": "extracted role title",
  "seniority_detected": "mid" | "senior" | etc or null,
  "summary": "1-2 sentence neutral assessment",
  "working_for_you": ["positive factor 1", "positive factor 2"],
  "working_against_you": ["challenge 1", "challenge 2"],
  "historical_context": {
    "similar_applications": number,
    "similar_success_rate": percentage or null if insufficient data,
    "best_performing_source": "referral" | "linkedin" | etc or null,
    "applied_to_this_company_before": boolean
  },
  "recommendation": "specific actionable recommendation",
  "if_you_apply": ["tactical tip 1", "tactical tip 2"],
  "ats_fit": {
    "direct_application_odds": "likely_reviewed" | "uncertain" | "likely_filtered",
    "reasoning": "Why direct applications may or may not reach human review",
    "bypass_strategy": "Strategy to increase human review odds, or null if direct is fine"
  }
}

=== VERDICT LOGIC ===

"insufficient_data" — USE THIS WHEN:
- Fewer than 5 total applications tracked
- Fewer than 3 applications at similar seniority level
- No clear pattern has emerged yet
- Confidence would be below 0.4

"good_match" (confidence 0.6+):
- Historical success rate > 30% for similar roles
- Multiple positive signals align
- Source with good track record available

"worth_trying" (confidence 0.4-0.7):
- Mixed signals or moderate success rate (15-30%)
- Some positive factors present
- Default when data is limited but not discouraging

"long_shot" (confidence 0.3-0.5):
- Clear pattern of low success (<15%) for this type of role
- BUT only use with 10+ similar applications as evidence
- Must have specific, actionable mitigation advice

CRITICAL: Never use "long_shot" with fewer than 10 data points. Use "insufficient_data" instead.

=== WHAT TO NEVER SAY ===

BANNED PHRASES (never output these):
- "DON'T APPLY" — we never tell people not to apply
- "Consider gaining more experience"
- "Improve your resume/CV"
- "You may not be qualified"
- "Work on your skills"
- "Get more certifications"
- "Your success rate is too low"
- Any verdict with 0% confidence

BANNED BEHAVIORS:
- Being discouraging based on small sample sizes
- Treating normal rejection rates (70-90%) as failures
- Making definitive predictions with < 10 data points
- Implying the candidate is deficient

=== WHAT TO SAY INSTEAD ===

Instead of "Your 0% success rate means don't apply":
→ "With 4 tracked applications, we don't have enough data to predict your odds accurately. Here's what might help..."

Instead of "You're not qualified for senior roles":
→ "Your mid-level applications have shown stronger response rates so far. Consider applying to both levels to maximize opportunities."

Instead of "Improve your application strategy":
→ "Referrals have a 3x higher response rate in your history. See if you know anyone at [Company]."

=== CONTEXT ON REJECTION RATES ===

Normal rejection rates by company type:
- FAANG/Big Tech: 95-99% rejection is normal
- Competitive startups: 90-95% rejection is normal
- Mid-size companies: 80-90% rejection is normal

A 75% rejection rate is actually GOOD. Don't frame it negatively.

=== SAMPLE SIZE RULES ===

| Applications | What to say |
|--------------|-------------|
| 1-4 | "Limited data. Track more applications for accurate predictions." |
| 5-9 | "Early patterns emerging. Confidence is moderate." |
| 10-19 | "Reasonable data. Patterns are becoming clear." |
| 20+ | "Strong data. High confidence in patterns." |

=== TONE ===

- Neutral and factual, like a data analyst
- Helpful, not judgmental
- Focus on tactics and actions, not personal deficiencies
- Acknowledge uncertainty when data is limited
- Find SOMETHING positive to say (best source, any responses, etc.)

=== EXAMPLE OUTPUTS ===

GOOD (insufficient data):
{
  "verdict": "insufficient_data",
  "confidence": 0.3,
  "company": "Google DeepMind",
  "role_title": "Research Scientist",
  "seniority_detected": "mid",
  "summary": "Not enough application history to predict your odds. DeepMind is highly competitive, but we can't compare to your patterns yet.",
  "working_for_you": [
    "You're targeting roles aligned with your stated experience level",
    "AI/ML roles match your background"
  ],
  "working_against_you": [
    "DeepMind has very low acceptance rates industry-wide",
    "Limited tracking data to identify your strongest approach"
  ],
  "historical_context": {
    "similar_applications": 4,
    "similar_success_rate": null,
    "best_performing_source": "linkedin",
    "applied_to_this_company_before": false
  },
  "recommendation": "Apply if interested, and track the outcome. After 5-10 more applications, we can identify what's working for you.",
  "if_you_apply": [
    "Check if you have any connections at DeepMind for a referral",
    "Research the specific team and mention them in your application"
  ]
}

BAD (never do this):
{
  "verdict": "dont_apply",
  "confidence": 0,
  "summary": "Your 0% success rate suggests you should not apply.",
  "working_against_you": ["0% success rate", "All applications rejected"],
  "recommendation": "Consider gaining more experience before applying to similar roles."
}

=== ATS FIT ASSESSMENT ===

The ats_fit field tells the candidate whether a DIRECT APPLICATION is likely to reach human review, based on their historical patterns.

direct_application_odds values:
- "likely_reviewed": Candidate's history shows direct apps to similar roles/companies get human attention
- "uncertain": Not enough data to predict, or mixed results
- "likely_filtered": Candidate's history shows direct apps at this level/company size often get ATS filtered

HOW TO DETERMINE:
- If candidate consistently gets template/auto rejections at this seniority → likely_filtered
- If candidate has interview mentions or personalized feedback at this level → likely_reviewed
- If fewer than 5 similar applications → uncertain

bypass_strategy should be:
- null if direct_application_odds is "likely_reviewed"
- Specific strategy if likely_filtered, e.g.:
  - "Your referral applications have 3x the response rate. Check for connections at [Company]."
  - "For companies this size, consider reaching out to the hiring manager on LinkedIn before applying."
  - "Your direct applications to senior roles rarely reach human review. Target mid-level, or apply via referral."

NEVER suggest:
- Resume keyword optimization
- ATS formatting tricks
- Skills to add

=== FINAL RULES ===

1. Always find something constructive to say
2. "insufficient_data" is better than a wrong prediction
3. Tactics over judgments
4. Normal rejection rates are not failures
5. Small samples = uncertainty, not doom
6. Every candidate deserves encouragement to keep trying
7. ATS assessment is about STRATEGY (how to apply), not OPTIMIZATION (what to change)

Respond with valid JSON only.`;

// ============ MAIN FUNCTION ============

export async function assessRoleFitV2(
  jobDescription: string,
  profile: FullProfile
): Promise<RoleFitResultV2> {
  const client = getOpenAIClient();

  // Build context
  const profileContext = profileToPromptContext(profile);

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: ROLE_FIT_PROMPT },
      {
        role: 'user',
        content: `Assess fit for this role:

=== JOB DESCRIPTION ===
${jobDescription.substring(0, 4000)}

=== CANDIDATE'S APPLICATION HISTORY ===
${profileContext}

Remember: Be helpful, not discouraging. Use "insufficient_data" if sample size is too small for predictions.`
      }
    ],
    temperature: 0.25,
    max_tokens: 1000,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  const parsed = JSON.parse(content);

  // Post-process safety checks
  let result = parsed;

  // Force insufficient_data if sample too small and verdict is negative
  if (profile.totalApplications < 5 && result.verdict === 'long_shot') {
    result.verdict = 'insufficient_data';
    result.summary = `With only ${profile.totalApplications} tracked applications, we can't reliably predict your odds. ` + result.summary;
  }

  // Never allow 0% confidence with a strong verdict
  if (result.confidence === 0 && result.verdict !== 'insufficient_data') {
    result.verdict = 'insufficient_data';
  }

  // Minimum confidence floor
  if (result.confidence < 0.2) {
    result.confidence = 0.2;
    result.verdict = 'insufficient_data';
  }

  const validated = RoleFitResultV2Schema.safeParse(result);

  if (!validated.success) {
    console.error('Role fit validation failed:', validated.error);
    // Return safe fallback
    return {
      verdict: 'insufficient_data',
      confidence: 0.3,
      company: 'Unknown',
      role_title: 'Unknown',
      seniority_detected: null,
      summary: 'Unable to fully analyze this role. Consider applying if it matches your interests and experience.',
      working_for_you: ['You\'re actively tracking your job search'],
      working_against_you: ['Limited data for comparison'],
      historical_context: {
        similar_applications: profile.totalApplications,
        similar_success_rate: null,
        best_performing_source: null,
        applied_to_this_company_before: false
      },
      recommendation: 'Track more applications to unlock detailed fit analysis.',
      if_you_apply: ['Research the company and role', 'Check for referral opportunities'],
      ats_fit: {
        direct_application_odds: 'uncertain',
        reasoning: 'Not enough application data to predict whether direct applications will reach human review.',
        bypass_strategy: 'Check if you have any connections at this company for a referral.'
      }
    };
  }

  return validated.data;
}
