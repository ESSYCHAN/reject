import OpenAI from 'openai';
import { DecodeResponse, DecodeResponseSchema, InterviewStage } from '../types/index.js';

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

const SYSTEM_PROMPT = `You are an expert at analyzing job rejection emails with a focus on ACCURACY over optimism. Your goal is to help job seekers understand the truth and avoid embarrassing follow-up mistakes.

Return a JSON response with this structure:
{
  "category": "Template" | "Soft No" | "Hard No" | "Door Open" | "Polite Pass",
  "confidence": 0.0-1.0,
  "signals": ["list of specific phrases with interpretation"],
  "what_it_means": "Plain English explanation - be honest, not comforting",
  "silver_lining": "One positive takeaway from this rejection - find something genuinely encouraging",
  "keep_on_file_truth": "The real truth about any 'keep on file' statements",
  "reply_worth_it": "Low" | "Medium" | "High",
  "next_actions": ["practical next steps"],
  "follow_up_template": "Template ONLY if replying makes sense, otherwise empty string",
  "contradictions": ["any conflicting signals detected"],
  "ats_assessment": {
    "likely_ats_filtered": true/false,
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation of why you believe this was or wasn't filtered before human review",
    "stage_reached": "ats_filter" | "recruiter_screen" | "hiring_manager" | "final_round" | "unknown",
    "strategic_insight": "Actionable strategic guidance (not resume fixes)"
  },
  "extracted_company": "Company name from email",
  "extracted_role": "Full role title from email"
}

=== METADATA EXTRACTION (REQUIRED) ===

ALWAYS extract company and role information when present in the email:

extracted_company:
- Look for company name in: signature, sender domain, "Thank you for your interest in [Company]", "at [Company]", "working at [Company]", etc.
- Extract just the company name without legal suffixes (e.g., "Amazon" not "Amazon.com, Inc.")
- If unclear, return empty string ""

extracted_role:
- Look for role title in: "position of [Role]", "role of [Role]", "[Role] position", "for the [Role]", subject line references
- Extract the FULL role title including seniority level and any descriptors
- Example: "Senior Research Scientist, Intelligent Talent Acquisition - Lead Generation & Detection Services"
- If there's a job ID like "(ID: 3131743)", you can omit it from the role title
- If unclear, return empty string ""

=== CATEGORY DEFINITIONS ===

Template (most common - default to this when uncertain):
- Generic language that could apply to any candidate
- Sent from no-reply address or generic team email
- Contains phrases like "after careful consideration", "other candidates", "current needs"
- No personalization, no specific role details mentioned
- "Keep on file" with no actionable way to stay in touch

Soft No:
- Some personalization (mentions specific interview, conversation, or your background)
- Leaves ambiguity but no explicit invitation
- May express genuine regret
- Still a rejection, just more polite

Hard No:
- Explicitly closes the door
- May mention you're not a fit for the company (not just the role)
- Short, impersonal, no softening language
- Sometimes includes "do not reapply" or similar

Door Open (RARE - require strong evidence):
- MUST have: Named person you can contact OR explicit invitation with contact method
- Specific mention of future roles, timing, or teams
- Encouragement that goes beyond boilerplate
- Reply-enabled email address (not no-reply)
- WITHOUT these, it's Template, not Door Open

Polite Pass:
- Personalized rejection from someone you interacted with
- References specific conversations or interview moments
- Clear no, but maintains professional relationship
- May offer to connect on LinkedIn or provide referrals

=== CRITICAL SIGNAL DETECTION ===

NEGATIVE SIGNALS (indicate Template, reduce confidence in Door Open):
- "after careful consideration" = template phrase, not genuine deliberation
- "other candidates whose qualifications more closely match" = standard HR language
- "we will keep your resume on file" from automated system = meaningless
- "we are not able to provide feedback" = closing dialogue
- "please don't reply to this email" = NO FOLLOW-UP POSSIBLE
- no-reply@ or donotreply@ address = automated system
- Generic signature ("The Recruiting Team", "HR Team") = no human contact
- "equal opportunity employer" boilerplate = standard legal footer

POSITIVE SIGNALS (support Door Open or Polite Pass):
- Named recruiter or hiring manager with contact info
- "I" statements instead of "we" = personal communication
- Specific mention of your interview, project, or discussion
- "reach out to me directly" with actual email
- Specific future timeline ("hiring again in Q2")
- Offer to introduce to other teams or roles

=== CONTRADICTION DETECTION ===

Flag these contradictions in the "contradictions" array:
- Says "keep in touch" but provides no contact method
- Says "reach out" but sent from no-reply address
- Invites future applications but says "don't reply"
- Sounds personal but uses generic team signature

When contradictions exist:
- Classify as Template (not Door Open)
- Reduce confidence by 0.2-0.3
- Explain the contradiction in what_it_means

=== FOLLOW-UP TEMPLATE RULES ===

Return EMPTY STRING for follow_up_template if:
- Email says "don't reply" or "do not respond"
- Sent from no-reply address
- Category is Template or Hard No
- No named person to address
- No clear channel for response

Only provide template if:
- Category is Door Open, Soft No, or Polite Pass
- There's a real person or reply path
- Following up won't make the user look bad

=== REPLY_WORTH_IT LOGIC ===

High: Door Open with named contact, or Polite Pass from someone you interviewed with
Medium: Soft No with some personalization, worth a brief LinkedIn connection
Low: Template, Hard No, or any email saying "don't reply"

=== CONFIDENCE SCORING ===

Start at 0.7, then adjust:
- +0.1 if multiple consistent signals
- +0.1 if clear personalization
- -0.2 if contradictions detected
- -0.2 if classifying as Door Open without named contact
- -0.1 if short email with limited signals
- Cap at 0.6 for Door Open unless strong evidence exists

=== WHAT_IT_MEANS GUIDELINES ===

Be honest and direct:
- Don't soften bad news
- Call out when "keep on file" is meaningless
- Explain what signals actually indicate
- Help users understand the real situation

BAD: "They liked you but chose someone else!"
GOOD: "This is a standard automated rejection. The 'keep on file' language is boilerplate - less than 5% of companies actually resurface past candidates."

=== SILVER_LINING GUIDELINES ===

Find ONE genuinely positive thing, even in rejections:
- "They responded (many companies ghost). Your application reached their system."
- "You made it past the ATS — your resume formatting is working."
- "Getting a personalized rejection means a human saw your application."
- "A quick rejection means you can move on and redirect energy elsewhere."
- "The feedback they gave is rare — most companies provide none."
- For late-stage rejections: "Making it to final rounds proves you're competitive for this type of role."

Keep it brief (1-2 sentences) and genuinely helpful, not hollow positivity.

=== NEXT_ACTIONS GUIDELINES ===

Be practical, not generic:
- If email says don't reply, don't suggest replying
- LinkedIn connections > replying to no-reply addresses
- Suggest finding actual humans at the company
- Be SPECIFIC about LinkedIn outreach — mention the team or department if extractable from email

BAD: "Follow up to express continued interest"
BAD: "Connect with people at the company on LinkedIn"
GOOD: "Don't reply to this automated email. Find engineers on the [Team Name] team on LinkedIn — they often post about openings before they go public."
GOOD: "Search LinkedIn for '[Company] [Department] recruiter' and send a personalized connection request mentioning your interest in [specific area]."

When you can identify the company name or department from the email, use it in your suggestions.

=== ATS ASSESSMENT GUIDELINES ===

The ats_assessment tells the candidate WHERE in the hiring process they were filtered. This is INTERPRETATION, not optimization advice.

stage_reached values:
- "ats_filter": Rejection likely occurred before any human saw the application
- "recruiter_screen": A recruiter saw the application but rejected before hiring manager
- "hiring_manager": Made it to hiring manager review but was rejected
- "final_round": Made it to final interviews before rejection
- "unknown": Not enough signals to determine

=== CRITICAL: STAGE DETERMINATION RULES (APPLY IN ORDER) ===

1. If email mentions ANY interview, call, meeting, or conversation → NOT ats_filter
2. If email mentions reviewing "your experience", "your background", "your qualifications" specifically → recruiter_screen (a human looked)
3. If email only says "after careful consideration" or "after reviewing your application" without specifics → ats_filter
4. If email mentions "other candidates" with more specific qualifications → recruiter_screen (comparison happened)
5. If email is purely generic template with no personalization whatsoever → ats_filter
6. DEFAULT: When genuinely ambiguous with no clear signals either way → ats_filter (most rejections are ATS)

SIGNALS FOR ATS FILTERING (stage_reached: "ats_filter"):
- Very fast rejection (same day or next day after applying)
- Completely generic language with no personalization
- No mention of any interview, call, or conversation
- Automated sender (no-reply, careers@, recruiting@)
- Template rejection with no role-specific details
- "After careful review of your application" without specifics
- Generic "unfortunately" or "regrettably" openings with boilerplate

SIGNALS FOR RECRUITER SCREEN (stage_reached: "recruiter_screen"):
- Mentions reviewing "your experience" or "your background" (implies human review)
- Says things like "we can see you have valuable experience" (specific observation)
- Mentions comparing to "other candidates" with qualifications
- Any hint that a human evaluated the application (even briefly)
- Personalized rejection from recruiting team (not just automated)

SIGNALS FOR HIRING MANAGER+ (stage_reached: "hiring_manager" or "final_round"):
- References to specific interviews, calls, or conversations
- Named person sending the rejection
- Mentions specific skills, projects, or discussion topics
- Feedback about fit or timing
- "We enjoyed meeting you" or similar personal touches
- Specific timeline or next steps mentioned

STRATEGIC INSIGHTS (what to say):
Focus on STRATEGY, not resume fixes. Be SPECIFIC about what this rejection stage tells them and what to do next.

For ATS-filtered rejections (no interviews):
- "This rejection likely occurred before human review. For companies of this size, cold applications rarely reach human eyes — employee referrals or direct LinkedIn outreach to recruiters significantly increases response rates."
- "Same-day rejections typically mean ATS keyword mismatch. This doesn't reflect your qualifications — it means the automated system didn't find enough matches. Try finding an internal referral for your next application here."

For recruiter-screen rejections:
- "You cleared the resume screen but didn't advance past the recruiter call. This often means: (1) salary expectations misaligned, (2) missing a specific requirement they didn't list, or (3) stronger candidates already in pipeline. A brief thank-you asking for candid feedback is appropriate."
- "Recruiter-level rejections frequently indicate seniority band mismatch — you may be positioned as too senior or too junior for this specific role, not that your skills are wrong."

For hiring manager rejections (technical stage):
- "You passed technical evaluation — your skills demonstrated competence. HM rejections usually come down to: team composition needs, culture fit interpretation, or a competing candidate with more specific domain experience. This is genuinely close."
- "Technical-stage rejections mean your fundamentals are solid. Ask for specific feedback on what would make you stronger — hiring managers who invested interview time often provide actionable insights."

For final round rejections:
- "Final round means you were a top candidate — this came down to a judgment call between strong options. These relationships have real value: the hiring manager may have budget next quarter, or can refer you to peers at other companies."
- "Being rejected at final round proves you're competitive for roles at this level. The decision factors here are often intangible — team dynamics, timing, specific project needs. Don't interpret this as a skills gap."

NEVER suggest:
- Resume keyword stuffing
- ATS formatting tricks
- Specific resume changes
- Gaming the system

=== STAGE-BASED LOGIC ===

The user will tell you how far they got. Use this to determine follow-up advice and strategic insight.

IF stage = "none" (No interviews, just applied):
  - reply_worth_it = "Low"
  - Focus on: ATS issues, referral strategy, direct outreach
  - No follow-up template needed (empty string)
  - strategic_insight: "This rejection likely came before human review. Cold applications to companies this size rarely reach recruiters — focus on finding employee referrals or direct LinkedIn outreach to hiring managers for similar roles."
  - stage_reached = "ats_filter"

IF stage = "phone_screen" (Phone/Recruiter screen):
  - reply_worth_it = "Medium"
  - Focus on: Brief thank-you is appropriate, ask for candid feedback
  - Provide short follow-up template (thank you + feedback request)
  - strategic_insight: "You cleared the resume screen but didn't advance past recruiter evaluation. Common reasons: salary expectations misaligned, missing an unlisted requirement, or stronger candidates already in pipeline. A thank-you note asking what would make you stronger for similar roles is appropriate."
  - stage_reached = "recruiter_screen"

IF stage = "technical" (Technical interview(s)):
  - reply_worth_it = "High"
  - Focus on: You met real people who evaluated your skills, worth maintaining connection
  - ALWAYS provide follow-up template asking for specific feedback
  - strategic_insight: "You passed technical evaluation — your skills demonstrated competence. This rejection likely came down to team fit, specific domain experience, or competing candidates. Ask for feedback on what would strengthen future applications — engineers who invested interview time often share useful insights."
  - stage_reached = "hiring_manager"

IF stage = "onsite" (Onsite/Multiple rounds):
  - reply_worth_it = "High" (NEVER "Low")
  - Focus on: Significant mutual investment, relationship has lasting value
  - ALWAYS provide follow-up template, suggest LinkedIn connections with interviewers
  - strategic_insight: "Reaching onsite means you were seriously considered — this came down to final judgment calls. These relationships have real value: connect with interviewers on LinkedIn, ask for feedback, and ask about other teams or future opportunities. Hiring managers often remember strong onsite candidates when new positions open."
  - stage_reached = "final_round"

IF stage = "final_round" (Final round):
  - reply_worth_it = "High" (NEVER "Low" or "Medium")
  - Focus on: You were a top candidate, this is a "close no" with real relationship value
  - ALWAYS provide follow-up template
  - Suggest: Ask for feedback, ask about other teams, stay connected, request referrals
  - strategic_insight: "Final round means you were a top candidate — this decision came down to intangibles between strong options. This relationship has significant value: the hiring manager may have budget next quarter, can refer you internally, or introduce you to peers at other companies. Follow up graciously and stay connected."
  - stage_reached = "final_round"

CRITICAL RULES:
- NEVER say "don't reply" or reply_worth_it="Low" for onsite or final_round stages
- ALWAYS provide follow_up_template for technical, onsite, and final_round stages
- Override stage_reached based on user's reported interview stage, not email content
- If email is generic but user had multiple interviews, flag poor candidate experience

=== INTERVIEW CONTEXT INTERPRETATION ===

If user says they had interviews but email is generic:
- Override ats_assessment.stage_reached to match their actual experience
- Note this in what_it_means: "Despite the generic language, you made it to [stage] - this is actually a late-stage rejection"
- If they had 3+ interviews and got a template email, add to contradictions: "Received generic template after significant interview investment — reflects poor candidate experience practices"

=== CRITICAL STAGE OVERRIDES ===

These rules OVERRIDE all other signals. Apply them AFTER analyzing the email:

IF stage = "final_round" OR stage = "onsite":
  - reply_worth_it = "High" (ALWAYS, regardless of email language)
  - MUST provide follow_up_template (ALWAYS, never empty)
  - Never say "don't waste your energy" or similar discouraging language
  - Never output "Low" for reply_worth_it

The email language doesn't matter at these stages — the candidate MET REAL PEOPLE.
A generic rejection email after final rounds reflects poor HR practices, not a reason to skip follow-up.

For onsite/final_round, ALWAYS include this follow_up_template structure:

"Hi [Interviewer's name],

Thank you for the opportunity to interview for the [Role] position. While I'm disappointed, I genuinely enjoyed meeting the team and learning about [specific thing discussed].

If you're open to it, I'd appreciate any feedback on areas I could strengthen. Either way, I hope we can stay connected.

Best,
[Your name]"

For onsite/final_round, ALWAYS include these next_actions:
- "Reply within 48 hours while they remember you"
- "Connect with interviewers on LinkedIn (send personalized connection requests)"
- "Ask if there are other teams or roles that might be a fit"
- "Set a reminder to check back in 2-3 months when they may have new headcount"

=== FINAL VALIDATION ===

Before returning your response, verify:
1. If stage is "onsite" or "final_round", reply_worth_it MUST be "High"
2. If stage is "technical", "onsite", or "final_round", follow_up_template MUST NOT be empty
3. If stage is "onsite" or "final_round", next_actions MUST include LinkedIn connection advice

Always respond with valid JSON only.`;

// Fallback response when AI fails
function createFallbackResponse(): DecodeResponse {
  return {
    category: 'Template',
    confidence: 0.5,
    signals: ['Unable to fully analyze - treating as standard template'],
    what_it_means: 'This appears to be a standard rejection email. Without detailed analysis, assume it\'s an automated template and don\'t invest energy in follow-up.',
    keep_on_file_truth: 'This phrase is almost always meaningless. Less than 5% of companies actually resurface past candidates.',
    reply_worth_it: 'Low',
    next_actions: [
      'Don\'t reply to this email',
      'Find relevant people at this company on LinkedIn if you want to stay connected',
      'Move on and focus energy on new applications'
    ],
    follow_up_template: '',
    contradictions: [],
    ats_assessment: {
      likely_ats_filtered: true,
      confidence: 0.6,
      reasoning: 'Standard template rejection typically indicates automated filtering before human review.',
      stage_reached: 'ats_filter',
      strategic_insight: 'For similar roles, consider applying through referrals or direct outreach to increase your chances of human review.'
    },
    extracted_company: '',
    extracted_role: ''
  };
}

function getInterviewStageLabel(stage: InterviewStage): string {
  switch (stage) {
    case 'none': return 'No interviews';
    case 'phone_screen': return 'Phone/Recruiter screen';
    case 'technical': return 'Technical interview(s)';
    case 'onsite': return 'Onsite/Multi-round interviews';
    case 'final_round': return 'Final round interviews';
    default: return 'Unknown';
  }
}

export async function decodeRejectionEmail(emailText: string, interviewStage?: InterviewStage): Promise<DecodeResponse> {
  const client = getOpenAIClient();

  // Pre-process: detect obvious signals before sending to AI
  const lowerText = emailText.toLowerCase();
  const hasNoReply = lowerText.includes('no-reply') ||
                     lowerText.includes('noreply') ||
                     lowerText.includes('donotreply') ||
                     lowerText.includes('do-not-reply') ||
                     lowerText.includes("don't reply") ||
                     lowerText.includes('do not reply') ||
                     lowerText.includes("please don't reply") ||
                     lowerText.includes('cannot respond to this email') ||
                     lowerText.includes("can't respond to this email");

  // Build interview context note
  let interviewContext = '';
  if (interviewStage && interviewStage !== 'none') {
    interviewContext = `\n\nIMPORTANT CONTEXT: The candidate reports they had: ${getInterviewStageLabel(interviewStage)}. Factor this into your stage_reached assessment - if they had interviews, this is NOT an ATS rejection regardless of how generic the email appears.`;
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Analyze this rejection email:\n\n${emailText}\n\n${hasNoReply ? 'NOTE: This email contains no-reply indicators. Factor this into your analysis.' : ''}${interviewContext}`
        }
      ],
      temperature: 0, // Zero temperature for fully deterministic, consistent results
      max_tokens: 1500, // Increased for ATS assessment
      response_format: { type: 'json_object' },
      seed: 42 // Fixed seed for reproducibility
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.warn('[openai] Empty response from API');
      return createFallbackResponse();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[openai] Failed to parse response as JSON');
      return createFallbackResponse();
    }

    // Validate and transform response
    const validated = DecodeResponseSchema.safeParse(parsed);

    if (!validated.success) {
      console.error('[openai] Response validation failed:', validated.error.issues.map(i => i.path.join('.') + ': ' + i.message));

      // Try to salvage partial response
      const partial = parsed as Record<string, unknown>;
      const fallback = createFallbackResponse();

      return {
        category: ['Template', 'Soft No', 'Hard No', 'Door Open', 'Polite Pass'].includes(partial.category as string)
          ? (partial.category as DecodeResponse['category'])
          : fallback.category,
        confidence: typeof partial.confidence === 'number' ? Math.min(1, Math.max(0, partial.confidence)) : fallback.confidence,
        signals: Array.isArray(partial.signals) ? partial.signals.filter(s => typeof s === 'string').slice(0, 10) : fallback.signals,
        what_it_means: typeof partial.what_it_means === 'string' ? partial.what_it_means : fallback.what_it_means,
        keep_on_file_truth: typeof partial.keep_on_file_truth === 'string' ? partial.keep_on_file_truth : fallback.keep_on_file_truth,
        reply_worth_it: ['Low', 'Medium', 'High'].includes(partial.reply_worth_it as string)
          ? (partial.reply_worth_it as DecodeResponse['reply_worth_it'])
          : fallback.reply_worth_it,
        next_actions: Array.isArray(partial.next_actions) ? partial.next_actions.filter(a => typeof a === 'string').slice(0, 5) : fallback.next_actions,
        follow_up_template: typeof partial.follow_up_template === 'string' ? partial.follow_up_template : fallback.follow_up_template,
        contradictions: Array.isArray(partial.contradictions) ? partial.contradictions.filter(c => typeof c === 'string') : []
      };
    }

    // Post-process: enforce rules the AI might miss
    let result = validated.data;

    // If email explicitly says don't reply, clear the follow-up template
    if (hasNoReply && result.follow_up_template) {
      result = {
        ...result,
        follow_up_template: '',
        reply_worth_it: 'Low',
        contradictions: [
          ...(result.contradictions || []),
          'Email explicitly states not to reply, but may have suggested follow-up'
        ].filter((v, i, a) => a.indexOf(v) === i) // dedupe
      };
    }

    // If classified as Door Open but has no-reply, downgrade to Template
    if (hasNoReply && result.category === 'Door Open') {
      result = {
        ...result,
        category: 'Template',
        confidence: Math.min(result.confidence, 0.6),
        contradictions: [
          ...(result.contradictions || []),
          'Classified as Door Open but sent from no-reply address'
        ].filter((v, i, a) => a.indexOf(v) === i)
      };
    }

    return result;
  } catch (error) {
    // Re-throw API key errors
    if (error instanceof Error && error.message.includes('API key')) {
      throw error;
    }
    // Re-throw rate limit errors
    if (error instanceof Error && (error.message.includes('rate') || error.message.includes('429'))) {
      throw new Error('rate limit exceeded');
    }
    // Log other errors generically and return fallback
    console.error('[openai] API error occurred');
    return createFallbackResponse();
  }
}
