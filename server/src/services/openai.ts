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
  }
}

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

=== NEXT_ACTIONS GUIDELINES ===

Be practical, not generic:
- If email says don't reply, don't suggest replying
- LinkedIn connections > replying to no-reply addresses
- Suggest finding actual humans at the company
- Be specific to the situation

BAD: "Follow up to express continued interest"
GOOD: "Don't reply to this automated email. Instead, find the hiring manager on LinkedIn and send a personalized connection request."

=== ATS ASSESSMENT GUIDELINES ===

The ats_assessment tells the candidate WHERE in the hiring process they were filtered. This is INTERPRETATION, not optimization advice.

stage_reached values:
- "ats_filter": Rejection likely occurred before any human saw the application
- "recruiter_screen": A recruiter saw the application but rejected before hiring manager
- "hiring_manager": Made it to hiring manager review but was rejected
- "final_round": Made it to final interviews before rejection
- "unknown": Not enough signals to determine

SIGNALS FOR ATS FILTERING (likely_ats_filtered: true):
- Very fast rejection (same day or next day after applying)
- Completely generic language with no personalization
- No mention of any interview, call, or conversation
- Automated sender (no-reply, careers@, recruiting@)
- Template rejection with no role-specific details
- "After careful review of your application" without specifics

SIGNALS FOR HUMAN REVIEW (likely_ats_filtered: false):
- References to specific interviews, calls, or conversations
- Named person sending the rejection
- Mentions specific skills, projects, or discussion topics
- Feedback about fit or timing
- "We enjoyed meeting you" or similar personal touches
- Specific timeline or next steps mentioned

STRATEGIC INSIGHTS (what to say):
Focus on STRATEGY, not resume fixes. Examples:

For ATS-filtered rejections:
- "This rejection likely occurred before human review. For similar roles, consider applying through referrals or direct LinkedIn outreach to bypass initial ATS filtering."
- "Applications to companies this size typically require employee referrals to reach human review for roles at this level."

For recruiter-level rejections:
- "You passed initial screening but didn't advance. Consider targeting roles where your experience is a closer title match."
- "Recruiter-level rejections often indicate seniority band mismatch rather than skills gaps."

For hiring manager rejections:
- "You made it to hiring manager review — your application materials are working. The decision was likely about team fit or specific experience."

NEVER suggest:
- Resume keyword stuffing
- ATS formatting tricks
- Specific resume changes
- Gaming the system

=== INTERVIEW CONTEXT INTERPRETATION ===

When the user provides interview context, use it to interpret generic rejections more accurately:

Interview stages and their meaning:
- "none": No interviews - treat as standard rejection
- "phone_screen": Had phone/recruiter screen - rejection is post-recruiter
- "technical": Had technical interview(s) - rejection is post-hiring manager review
- "onsite": Had onsite/multi-round interviews - rejection is late-stage
- "final_round": Was in final consideration - rejection is after full evaluation

CRITICAL: If user says they had interviews but email is generic:
- Override ats_assessment.stage_reached to match their actual experience
- Note this contradiction in what_it_means: "Despite the generic language, you made it to [stage] - this is actually a late-stage rejection"
- Adjust strategic_insight to reflect their actual progress
- If they had 3+ interviews and got a template email, flag this as concerning company behavior

Example interpretation:
- User had final round interviews + gets "after careful consideration" template
- This is NOT an ATS rejection - override stage_reached to "final_round"
- Note: "This generic email belies the fact you were seriously considered"
- Insight: "Getting a template after final rounds suggests poor candidate experience practices at this company"

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
    }
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
      temperature: 0.15, // Lower temperature for more consistent classification
      max_tokens: 1500, // Increased for ATS assessment
      response_format: { type: 'json_object' }
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
