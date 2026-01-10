import OpenAI from 'openai';
import { z } from 'zod';
import { ApplicationRecord } from '../types/pro.js';
import { MinimalProfile, FullProfile, inferProfile, profileToPromptContext } from './profileInference.js';

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

// ============ UNIFIED INSIGHT SCHEMA ============

export const UnifiedInsightSchema = z.object({
  insight_type: z.string(),
  title: z.string(),
  explanation: z.string(),
  evidence: z.array(z.string()),
  recommendation: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  confidence: z.number().min(0).max(1)
});

export type UnifiedInsight = z.infer<typeof UnifiedInsightSchema>;

// ATS Boundary Mapping - where is the candidate being filtered?
export const ATSBoundarySchema = z.object({
  ats_filter_rate: z.number().min(0).max(100),
  human_review_rate: z.number().min(0).max(100),
  interpretation: z.string(),
  seniority_bands: z.array(z.object({
    level: z.string(),
    ats_pass_rate: z.number(),
    sample_size: z.number()
  })),
  strategic_recommendation: z.string()
});

export type ATSBoundary = z.infer<typeof ATSBoundarySchema>;

export const UnifiedAnalysisResponseSchema = z.object({
  summary: z.string(),
  insights: z.array(UnifiedInsightSchema),
  quick_wins: z.array(z.string()),
  biggest_issue: z.string().nullable(),
  ats_boundary: ATSBoundarySchema.optional()
});

export type UnifiedAnalysisResponse = z.infer<typeof UnifiedAnalysisResponseSchema>;

// ============ UNIFIED ANALYSIS PROMPT ============

const UNIFIED_ANALYSIS_PROMPT = `You are a supportive job search coach analyzing a candidate's application patterns. Your goal is to celebrate what's working, identify opportunities for improvement, and provide actionable guidance in a warm, encouraging tone.

You will receive:
1. The candidate's basic profile (years experience, current level)
2. Inferred data from their application history (what they're targeting vs what's working)
3. Pre-detected mismatches (seniority gaps, source inefficiencies, etc.)

OUTPUT JSON:
{
  "summary": "2-3 sentence executive summary - lead with what's going well, then mention areas to optimize",
  "insights": [
    {
      "insight_type": "seniority_mismatch" | "source_optimization" | "company_size_fit" | "ghost_pattern" | "timing_issue" | "application_volume" | "success_pattern" | "ats_boundary",
      "title": "Short headline (e.g., 'Your referrals are really working!')",
      "explanation": "Factual, data-backed explanation with encouraging framing",
      "evidence": ["specific data point 1", "specific data point 2"],
      "recommendation": "Specific, actionable next step",
      "priority": "high" | "medium" | "low",
      "confidence": 0.0-1.0
    }
  ],
  "quick_wins": ["Immediate action 1", "Immediate action 2"],
  "biggest_issue": "The single most impactful opportunity to improve, or null if doing well",
  "ats_boundary": {
    "ats_filter_rate": 0-100,
    "human_review_rate": 0-100,
    "interpretation": "Plain English explanation of where they're being filtered",
    "seniority_bands": [
      {"level": "junior/mid/senior/etc", "ats_pass_rate": 0-100, "sample_size": number}
    ],
    "strategic_recommendation": "Strategy to improve human review rate (not resume fixes)"
  }
}

=== RULES ===

1. BE DATA-DRIVEN AND ENCOURAGING
- Every insight must cite specific numbers from the provided data
- Frame findings positively where possible: "You're doing well at X (50% success!)" rather than "X has low success"
- Acknowledge strengths before suggesting improvements
- If sample size is small (<3), note it but stay encouraging about building more data

2. BE WARM AND SUPPORTIVE
- Lead with wins and strengths
- Frame challenges as opportunities: "There's room to grow" not "You're failing at"
- Normalize the job search struggle: applying to stretch roles is valid, rejection is normal
- Example: "You're crushing it with mid-level roles (50% is excellent!). Senior roles haven't landed yet, which is common when stretching up - consider keeping a few strategic senior applications while focusing energy where you're clearly competitive."

3. PRIORITIZE ACTIONABLE INSIGHTS
- "Shift 50% of applications to referrals" > "Network more"
- "Target mid-size companies" > "Consider company fit"
- Give specific percentages and targets
- ALWAYS use numbered steps in recommendations. Example:
  "Try: (1) Find 3 contacts at target companies on LinkedIn, (2) Apply directly on company career pages instead of job boards, (3) Follow up with a personalized note after applying"

4. AVOID THESE:
- Never suggest improving resume/CV content
- Never suggest skill improvements or certifications
- Never use empty platitudes without data ("Keep trying!" without context)
- Never be discouraging or harsh
- Never make assumptions beyond the data

5. INSIGHT PRIORITIES
- High: Clear pattern with 5+ data points and >30% impact potential
- Medium: Emerging pattern or moderate impact
- Low: Weak signal or small sample size

6. CONFIDENCE SCORING
- 0.8+: Strong pattern, 10+ applications, clear trend
- 0.5-0.8: Moderate pattern, 5-10 applications
- <0.5: Weak signal, limited data, note uncertainty

=== EXAMPLE INSIGHTS ===

GOOD:
{
  "insight_type": "source_optimization",
  "title": "Your referrals are really paying off!",
  "explanation": "Great news - your referral applications have a 40% response rate, which is 4x better than your LinkedIn applications (10%). You clearly make a strong impression when someone vouches for you.",
  "evidence": ["Referrals: 4/10 responses (40%)", "LinkedIn: 3/30 responses (10%)"],
  "recommendation": "Double down on what's working: (1) List 5 companies you want to work at, (2) Search LinkedIn for 2nd-degree connections at each, (3) Send personalized connection requests mentioning specific roles, (4) Ask for a referral once connected.",
  "priority": "high",
  "confidence": 0.75
}

GOOD (for challenging news):
{
  "insight_type": "seniority_mismatch",
  "title": "You're strong at mid-level, stretching into senior",
  "explanation": "You're doing really well with mid-level positions (50% success rate - that's solid!). Your senior-level applications haven't converted yet, which is common when reaching for the next tier. This isn't a red flag - it just suggests where to focus your energy.",
  "evidence": ["Mid-level: 5/10 responses (50%)", "Senior: 0/5 responses (0%)"],
  "recommendation": "Play to your strengths while still stretching: (1) Focus 70% of applications on mid-level roles where you're competitive, (2) Keep 30% for strategic senior applications at companies where you have connections, (3) For senior roles, prioritize referrals over cold applications.",
  "priority": "medium",
  "confidence": 0.7
}

BAD:
{
  "insight_type": "general",
  "title": "Keep improving",
  "explanation": "You're making progress on your job search.",
  "evidence": [],
  "recommendation": "Stay positive and keep applying.",
  "priority": "medium",
  "confidence": 0.5
}

=== ATS BOUNDARY ANALYSIS ===

The ats_boundary section tells the candidate WHERE in the process they're being filtered. This is INTERPRETATION of their rejection patterns.

HOW TO DETERMINE ATS vs HUMAN FILTERING:
- ATS filtered (before human review): Fast rejections (same/next day), template rejections, no interview mentions, no personalization
- Human reviewed: Interview mentions, personalized feedback, named sender, specific role/project references

SENIORITY BANDS:
Analyze success rates by seniority level. Example:
- "You pass ATS for mid-level roles 60% of the time"
- "You pass ATS for senior roles only 15% of the time"
- This indicates the SENIORITY BAND where they're competitive

STRATEGIC RECOMMENDATIONS (what to say):
Focus on STRATEGY, not resume fixes. Use numbered action steps:
- "For senior roles: (1) Identify 3 target companies, (2) Find employees on LinkedIn, (3) Request informational chats, (4) Ask for referrals after building rapport"
- "Your mid-level applications show good human review rates. The rejections happen at hiring manager stage: (1) Research the hiring manager before interviews, (2) Prepare specific examples of relevant work, (3) Ask about team dynamics to show genuine interest"
- "Companies this size rely heavily on ATS ranking: (1) Focus on companies where you have a connection, (2) Apply within 48 hours of job posting, (3) Follow up with the recruiter on LinkedIn"

NEVER recommend:
- Resume keyword optimization
- ATS formatting tricks
- Skill additions

=== SPECIAL CASES ===

If fewer than 3 applications:
- Return summary acknowledging limited data
- insights = []
- quick_wins = ["Track at least 5 more applications to unlock pattern analysis"]
- biggest_issue = null
- ats_boundary = null (not enough data)

If no clear patterns:
- Be honest: "No significant patterns detected yet"
- Focus on data collection recommendations

Always respond with valid JSON only.`;

// ============ MAIN ANALYSIS FUNCTION ============

export async function analyzeApplications(
  minimalProfile: MinimalProfile,
  applications: ApplicationRecord[]
): Promise<{ profile: FullProfile; analysis: UnifiedAnalysisResponse }> {

  // Step 1: Infer full profile from applications
  const profile = inferProfile(minimalProfile, applications);

  // Step 2: Handle insufficient data case
  if (applications.length < 3) {
    return {
      profile,
      analysis: {
        summary: `You've tracked ${applications.length} application${applications.length === 1 ? '' : 's'}. Track at least 3-5 more to unlock pattern analysis and personalized insights.`,
        insights: [],
        quick_wins: [
          'Add your recent applications to start building your profile',
          'Include the outcome (rejected, ghosted, interviewing) for each',
          'Track the source (LinkedIn, referral, etc.) for better insights'
        ],
        biggest_issue: null
      }
    };
  }

  // Step 3: Generate prompt context
  const profileContext = profileToPromptContext(profile);

  // Step 4: Call AI for analysis
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: UNIFIED_ANALYSIS_PROMPT },
      {
        role: 'user',
        content: `Analyze this candidate's job search:\n\n${profileContext}`
      }
    ],
    temperature: 0.2,
    max_tokens: 1500,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  const parsed = JSON.parse(content);
  const validated = UnifiedAnalysisResponseSchema.safeParse(parsed);

  if (!validated.success) {
    console.error('Validation failed:', validated.error);
    // Return a safe fallback
    return {
      profile,
      analysis: {
        summary: 'Analysis completed with partial results.',
        insights: profile.inferred.mismatches.map(m => ({
          insight_type: m.type,
          title: m.type.replace(/_/g, ' '),
          explanation: m.description,
          evidence: [],
          recommendation: m.recommendation,
          priority: 'medium' as const,
          confidence: m.confidence
        })),
        quick_wins: ['Review your application sources', 'Check seniority level alignment'],
        biggest_issue: profile.inferred.mismatches[0]?.description || null
      }
    };
  }

  return { profile, analysis: validated.data };
}

// ============ ROLE FIT WITH INFERRED PROFILE ============

export const RoleFitResultSchema = z.object({
  verdict: z.enum(['strong_fit', 'worth_trying', 'long_shot', 'poor_fit']),
  match_score: z.number().min(0).max(100),
  explanation: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  historical_context: z.string(),
  recommendation: z.string()
});

export type RoleFitResult = z.infer<typeof RoleFitResultSchema>;

const ROLE_FIT_PROMPT = `You assess how well a job matches a candidate's profile and historical success patterns.

OUTPUT JSON:
{
  "verdict": "strong_fit" | "worth_trying" | "long_shot" | "poor_fit",
  "match_score": 0-100,
  "explanation": "2-3 sentences on fit",
  "pros": ["reason this could work"],
  "cons": ["reason this might not work"],
  "historical_context": "What their past applications to similar roles show",
  "recommendation": "Specific action (apply, skip, or apply with caveats)"
}

VERDICT LOGIC:
- strong_fit (80-100): Matches their successful pattern, right seniority, good source available
- worth_trying (50-79): Some alignment, worth an application
- long_shot (25-49): Misaligned on 1-2 dimensions but not impossible
- poor_fit (0-24): Multiple mismatches, historically poor results in this category

Base verdict on THEIR DATA, not general job market advice.`;

export async function assessRoleFit(
  roleDescription: string,
  company: string,
  companySize: string | undefined,
  seniorityLevel: string | undefined,
  profile: FullProfile
): Promise<RoleFitResult> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: ROLE_FIT_PROMPT },
      {
        role: 'user',
        content: `Assess fit for this role:

ROLE: ${roleDescription.substring(0, 2000)}
COMPANY: ${company}
COMPANY SIZE: ${companySize || 'Unknown'}
SENIORITY: ${seniorityLevel || 'Unknown'}

CANDIDATE PROFILE:
${profileToPromptContext(profile)}`
      }
    ],
    temperature: 0.2,
    max_tokens: 800,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  const parsed = JSON.parse(content);
  const validated = RoleFitResultSchema.safeParse(parsed);

  if (!validated.success) {
    throw new Error('Invalid role fit response');
  }

  return validated.data;
}
