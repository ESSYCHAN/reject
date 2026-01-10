import OpenAI from 'openai';
import { z } from 'zod';

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

// ============ JD ANALYSIS SCHEMA ============

export const JDAnalysisSchema = z.object({
  company: z.string(),
  role_title: z.string(),
  seniority: z.enum(['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'director', 'vp', 'c-level', 'unknown']),
  company_size: z.enum(['startup', 'small', 'mid', 'large', 'enterprise', 'unknown']),
  remote_policy: z.enum(['remote', 'hybrid', 'onsite', 'unclear']),

  // Red flags
  red_flags: z.array(z.object({
    issue: z.string(),
    severity: z.enum(['minor', 'moderate', 'major']),
    explanation: z.string()
  })),

  // What they actually want
  must_haves: z.array(z.string()),
  nice_to_haves: z.array(z.string()),
  hidden_requirements: z.array(z.string()),

  // Reality check
  reality_check: z.object({
    experience_years_stated: z.string().nullable(),
    experience_years_realistic: z.string(),
    is_realistic: z.boolean(),
    explanation: z.string()
  }),

  // Salary insight
  salary_insight: z.object({
    mentioned: z.boolean(),
    range: z.string().nullable(),
    market_assessment: z.string()
  }),

  // Application strategy
  application_strategy: z.object({
    direct_apply_worth_it: z.boolean(),
    reasoning: z.string(),
    better_approach: z.string().nullable()
  }),

  // ATS Keywords - what to include on your resume
  ats_keywords: z.object({
    hard_requirements: z.array(z.object({
      keyword: z.string(),
      category: z.enum(['certification', 'tool', 'technology', 'degree', 'clearance', 'language']),
      tip: z.string()
    })),
    soft_requirements: z.array(z.string()),
    action_verbs: z.array(z.string()),
    exact_phrases: z.array(z.string())
  }),

  // Summary
  tldr: z.string()
});

export type JDAnalysis = z.infer<typeof JDAnalysisSchema>;

// ============ THE PROMPT ============

const JD_ANALYZER_PROMPT = `You analyze job descriptions to help candidates understand what they're actually applying to. Be honest and practical.

=== OUTPUT JSON ===
{
  "company": "company name from JD",
  "role_title": "extracted role title",
  "seniority": "intern" | "junior" | "mid" | "senior" | "staff" | "principal" | "director" | "vp" | "c-level" | "unknown",
  "company_size": "startup" | "small" | "mid" | "large" | "enterprise" | "unknown",
  "remote_policy": "remote" | "hybrid" | "onsite" | "unclear",

  "red_flags": [
    {
      "issue": "short description of issue",
      "severity": "minor" | "moderate" | "major",
      "explanation": "why this is concerning"
    }
  ],

  "must_haves": ["actual required skills/qualifications"],
  "nice_to_haves": ["preferred but not required"],
  "hidden_requirements": ["things they want but didn't explicitly state"],

  "reality_check": {
    "experience_years_stated": "5+ years" or null if not stated,
    "experience_years_realistic": "3-4 years could work",
    "is_realistic": true/false,
    "explanation": "why the stated requirements may not be real"
  },

  "salary_insight": {
    "mentioned": true/false,
    "range": "$X-Y" or null,
    "market_assessment": "how this compares to market"
  },

  "application_strategy": {
    "direct_apply_worth_it": true/false,
    "reasoning": "why direct application may or may not work",
    "better_approach": "alternative strategy" or null
  },

  "ats_keywords": {
    "hard_requirements": [
      {
        "keyword": "AWS Certified Solutions Architect",
        "category": "certification" | "tool" | "technology" | "degree" | "clearance" | "language",
        "tip": "Include exact certification name if you have it"
      }
    ],
    "soft_requirements": ["teamwork", "communication"],
    "action_verbs": ["led", "designed", "implemented"],
    "exact_phrases": ["phrases to use verbatim from the JD"]
  },

  "tldr": "1-2 sentence summary of what this role really is"
}

=== RED FLAG DETECTION ===

MAJOR red flags:
- "Fast-paced environment" + long hours mentioned = burnout culture
- Looking for "rockstar/ninja/guru" = unrealistic expectations
- "Wear many hats" for non-startup = understaffed
- Requirements impossible to all have (e.g., "10 years React" when React is 10 years old)
- Massive requirement list (15+ skills) = they don't know what they want
- No clear role definition = role is whatever they need
- "Unlimited PTO" with workaholic culture signals = you won't use it
- Entry-level salary for senior requirements = underpaying

MODERATE red flags:
- No salary range = likely below market
- Vague responsibilities = poorly defined role
- "Other duties as assigned" prominently featured = scope creep
- Recent string of same role postings = turnover issues
- Very short job posting = low effort, possibly fake

MINOR red flags:
- Generic benefits list = standard, nothing special
- "Competitive salary" = probably not competitive
- Required cover letter = more effort, lower volume

=== HIDDEN REQUIREMENTS ===

Look for:
- Phrases like "collaborate with senior leadership" = need executive presence
- "Client-facing" = presentation and sales-adjacent skills
- "Startup experience preferred" = expect chaos tolerance
- "Mission-driven" = may expect below-market comp
- "Data-driven" = need analytics/metrics focus
- "Own the product" = no product management support

=== REALITY CHECK ON EXPERIENCE ===

Common patterns:
- "5+ years required" for mid-level tasks = 3 years is probably fine
- "7+ years" for senior = 5 years with strong portfolio works
- "10+ years" = they want grey hair, but 6-7 solid years may work
- "3-5 years" for senior title = title inflation or underpay

General rule: Stated years - 2 is often the real floor.

Exception: Staff+ roles, highly regulated industries, or specialized domains usually mean what they say.

=== APPLICATION STRATEGY ===

direct_apply_worth_it = false when:
- Large company (FAANG, Fortune 500) with high applicant volume
- Role has been posted 30+ days
- Generic JD suggests ATS-heavy filtering
- You don't match 70%+ of must-haves

better_approach suggestions:
- "Find the hiring manager on LinkedIn and send a connection request with a personalized note"
- "Check if you have any connections at [Company] for a referral"
- "Apply through the company's career page rather than job boards"
- "Reach out to the team directly with a relevant portfolio piece"

=== ATS KEYWORD EXTRACTION ===

Extract keywords that ATS systems will likely scan for. This applies to ALL industries - tech, healthcare, finance, marketing, operations, legal, HR, sales, etc.

hard_requirements (these are FILTERS - missing them may auto-reject):
- Certifications (ANY field):
  * Tech: "AWS Certified", "CISSP", "Scrum Master"
  * Finance: "CPA", "CFA", "Series 7", "FINRA"
  * Healthcare: "RN", "NP", "BCLS", "HIPAA certified"
  * HR: "PHR", "SHRM-CP", "SHRM-SCP"
  * Project Mgmt: "PMP", "Six Sigma", "PRINCE2"
  * Marketing: "Google Analytics", "HubSpot", "Salesforce Marketing Cloud"
  * Legal: "JD", "Bar admission", "Paralegal certification"
  * Real Estate: "Real estate license", "CCIM"
  * Supply Chain: "APICS", "CSCP", "CPIM"

- Required tools/software (ANY field):
  * Tech: "Python", "AWS", "Kubernetes"
  * Finance: "Bloomberg Terminal", "QuickBooks", "NetSuite"
  * Marketing: "HubSpot", "Marketo", "Google Ads"
  * Design: "Figma", "Adobe Creative Suite", "Sketch"
  * Healthcare: "Epic", "Cerner", "MEDITECH"
  * HR: "Workday", "ADP", "BambooHR"
  * Sales: "Salesforce", "Outreach", "Gong"
  * Operations: "SAP", "Oracle", "Jira"

- Degrees: Match the exact degree mentioned
- Clearances: Security clearances, background check requirements
- Languages: Any language requirements (spoken or programming)
- Licenses: Industry-specific licenses (nursing, law, real estate, etc.)

For each hard requirement, provide a tip on how to include it on a resume that's relevant to that specific field.

soft_requirements (help but won't filter you out):
- Soft skills mentioned: "leadership", "communication", "collaboration", "stakeholder management"
- Work styles: "self-starter", "detail-oriented", "deadline-driven", "client-facing"
- Domain skills: Whatever the JD emphasizes but doesn't list as required

action_verbs (use these to describe your experience):
- Extract the ACTUAL verbs from the JD - whatever they use
- Examples vary by field:
  * Tech: "built", "deployed", "optimized", "debugged"
  * Sales: "closed", "prospected", "negotiated", "exceeded"
  * Marketing: "launched", "grew", "engaged", "analyzed"
  * Finance: "audited", "forecasted", "reconciled", "reported"
  * Healthcare: "diagnosed", "treated", "coordinated", "documented"
  * HR: "recruited", "onboarded", "facilitated", "resolved"
  * Operations: "streamlined", "implemented", "reduced", "managed"
- Match your resume bullets to THEIR language

exact_phrases (use verbatim where applicable):
- Industry-specific terminology from the JD
- Methodologies mentioned (Agile, Lean, Six Sigma, etc.)
- Company-specific terms they repeat
- Compliance/regulatory terms (HIPAA, SOX, GDPR, etc.)
- Business model terms (B2B, B2C, SaaS, etc.)

IMPORTANT:
- Focus on extractable, actionable keywords specific to THIS job
- Don't assume tech - adapt to the actual industry in the JD
- Don't list generic requirements unless heavily emphasized

=== SALARY ASSESSMENT ===

If no salary is mentioned:
- Large company + senior role: "Large companies that hide salary often pay market rate but negotiate hard"
- Startup + no salary: "Startups hiding salary often compensate with equity but below-market base"
- "Competitive" = "Probably not competitive"

=== TONE ===

Be direct and practical:
- Call out BS without being cynical
- Explain why something matters
- Give actionable insight
- Don't assume the worst, but don't be naive either

Respond with valid JSON only.`;

// ============ MAIN FUNCTION ============

export async function analyzeJobDescription(jobDescription: string): Promise<JDAnalysis> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: JD_ANALYZER_PROMPT },
      {
        role: 'user',
        content: `Analyze this job description:\n\n${jobDescription.substring(0, 5000)}`
      }
    ],
    temperature: 0.3,
    max_tokens: 1200,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  const parsed = JSON.parse(content);
  const validated = JDAnalysisSchema.safeParse(parsed);

  if (!validated.success) {
    console.error('JD analysis validation failed:', validated.error);
    // Return safe fallback
    return {
      company: 'Unknown',
      role_title: 'Unknown',
      seniority: 'unknown',
      company_size: 'unknown',
      remote_policy: 'unclear',
      red_flags: [],
      must_haves: ['Unable to parse requirements'],
      nice_to_haves: [],
      hidden_requirements: [],
      reality_check: {
        experience_years_stated: null,
        experience_years_realistic: 'Unable to assess',
        is_realistic: true,
        explanation: 'Could not analyze experience requirements'
      },
      salary_insight: {
        mentioned: false,
        range: null,
        market_assessment: 'Unable to assess'
      },
      application_strategy: {
        direct_apply_worth_it: true,
        reasoning: 'Unable to fully analyze - proceed with direct application',
        better_approach: null
      },
      ats_keywords: {
        hard_requirements: [],
        soft_requirements: [],
        action_verbs: [],
        exact_phrases: []
      },
      tldr: 'Unable to fully analyze this job description.'
    };
  }

  return validated.data;
}
