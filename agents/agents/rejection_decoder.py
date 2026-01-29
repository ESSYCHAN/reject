"""Rejection Decoder Agent - IMPROVED - Auto-detects patterns, tracks user history, queries knowledge base."""

from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from ..tools.knowledge_tools import query_company_intel


# Tool: Decode rejection email with AUTO-DETECTION
decode_rejection = FunctionTool(
    name="decode_rejection",
    description="Automatically analyze rejection email to determine ATS vs human, what really happened, and actionable next steps.",
    parameters={
        "type": "object",
        "properties": {
            "rejection_text": {
                "type": "string",
                "description": "The full text of the rejection email"
            },
            "job_title": {
                "type": "string",
                "description": "The job they applied for (optional)"
            },
            "company": {
                "type": "string",
                "description": "The company name (optional)"
            },
            "application_context": {
                "type": "string",
                "description": "Any context about their application (how far they got, etc.)"
            }
        },
        "required": ["rejection_text"]
    },
    execute=lambda params: {
        "status": "success",
        "instruction": f"""AUTOMATICALLY decode this rejection with NO questions:

**1. DETECTION (Auto-classify):**

Determine rejection stage by analyzing language patterns:

**ATS AUTO-REJECT signals:**
- Received within 24 hours of application
- Generic phrases: "reviewed your application", "other candidates", "keep on file"
- No specific feedback
- Sent from noreply@ or automated@ email
- Template language with no personalization
- VERDICT: "You never reached a human"

**RECRUITER SCREEN signals:**
- Received 2-7 days after application
- Some personalization (uses your name, mentions specific requirement)
- May reference "reviewing your background"
- VERDICT: "A recruiter reviewed but filtered you out"

**POST-INTERVIEW signals:**
- Follows an actual interview
- May mention "great to meet you", references the interview
- Sometimes includes vague feedback
- VERDICT: "You interviewed but weren't selected"

**FINAL ROUND signals:**
- You met multiple people
- May mention "difficult decision", "strong candidate pool"
- Sometimes encourages future applications
- VERDICT: "You were close but lost to someone else"

**2. TRANSLATION (Decode corporate speak):**

Common phrases and what they REALLY mean:
- "Moved forward with candidates whose experience more closely matches" = You lacked a specific requirement OR internal candidate
- "Highly competitive role" = Many applicants, you didn't stand out enough
- "Not the right fit at this time" = Vague - could be skills, culture, or budget
- "Keep your resume on file" = Standard line, rarely meaningful
- "Encourage you to apply for future roles" = Sometimes genuine IF you made it to final rounds

**3. LIKELIHOOD ASSESSMENT:**

Were you competitive?
- **ATS reject**: Never in the running - keyword/qualification mismatch
- **Recruiter reject**: Possibly competitive but outranked on paper
- **Post-interview reject**: You were competitive - came down to interview performance or culture fit
- **Final round reject**: Very competitive - minor differences made the decision

**4. ROOT CAUSE (What really happened):**

Identify the actual reason:
- Missing hard requirement (degree, years, certification)
- Resume didn't highlight relevant experience clearly
- ATS keywords missing
- Overqualified/underqualified
- Salary expectations mismatch
- Culture/team fit concerns (if post-interview)
- Another candidate was stronger/internal hire

**5. ACTIONABLE NEXT STEPS:**

Be SPECIFIC:
- **If ATS**: Add keywords [list 3-5 specific ones], adjust job titles, highlight [specific experience]
- **If recruiter**: Reposition your CV to emphasize [X], add metrics to [Y section]
- **If post-interview**: Practice [specific type] questions, address [weakness shown]
- **Should they reapply?**: Yes if [X changes] / Wait [timeframe] / No because [reason]
- **Follow up or not?**: Only worth it if [condition met]

**6. EMOTIONAL CONTEXT (Normalize it):**

- If ATS: "This wasn't about you - 73% of applications get filtered before humans see them"
- If recruiter: "This means you met basic requirements but were outcompeted on specific criteria"
- If post-interview: "Making it to interviews means you're qualified - this was about fit or style"
- Provide realistic expectations: "Most job searches involve 5-10 rejections per offer"

**7. PATTERN DETECTION (if multiple rejections shared):**

If this is not their first rejection, note:
- Same stage repeatedly? → Systemic issue to fix
- Different stages? → Normal job search variance
- ATS every time? → CV needs keyword optimization
- Post-interview always? → Interview skills need work

---

Rejection email: {params['rejection_text']}
Job: {params.get('job_title', 'Not specified')}
Company: {params.get('company', 'Not specified')}
Context: {params.get('application_context', 'None provided')}

**OUTPUT FORMAT:**
- verdict: [One clear sentence on what happened]
- stage: [ATS/Recruiter/Post-Interview/Final Round]
- confidence: [High/Medium/Low] in this assessment
- root_cause: [2-3 sentences on why]
- action_items: [3-5 specific bullets of what to do]
- encouragement: [2-3 sentences of perspective]
- reapply: [Yes/No/Wait and why]"""
    }
)


# Tool: Pattern Intelligence (AUTOMATIC)
auto_analyze_patterns = FunctionTool(
    name="analyze_rejection_intelligence",
    description="Automatically detect patterns across rejections and identify systemic issues WITHOUT asking for more data.",
    parameters={
        "type": "object",
        "properties": {
            "rejection_count": {
                "type": "integer",
                "description": "How many rejections they've shared so far"
            },
            "stages_so_far": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of rejection stages detected so far (ATS, recruiter, etc.)"
            }
        },
        "required": ["rejection_count"]
    },
    execute=lambda params: {
        "status": "success",
        "instruction": f"""User has shared {params['rejection_count']} rejection(s).
        Stages: {params.get('stages_so_far', [])}

        AUTOMATICALLY provide intelligence:

**IF rejection_count >= 3:**
Identify the pattern:
- All ATS rejects? → "Your CV isn't passing automated filters. You need keyword optimization ASAP."
- All recruiter rejects? → "Recruiters are reviewing you but filtering out. Your positioning/experience narrative needs work."
- Mixed stages? → "This is normal variance. Keep improving incrementally."
- All post-interview? → "You're getting interviews but not converting. Focus on interview skills."

**PROACTIVE RECOMMENDATIONS:**
Don't wait to be asked - tell them:
1. "Based on [X] pattern, here's what to fix first: [specific action]"
2. "Your conversion rate is [Y]% which is [normal/low/concerning]"
3. "Next rejection, try [Z] approach differently"

**BENCHMARK CONTEXT:**
- Industry avg: 100 applications → 10-20 phone screens → 2-5 final interviews → 1-2 offers
- If they're below these benchmarks, say which stage is the blocker

**UNSOLICITED ADVICE (Be proactive):**
"Here's what I'd do if I were you right now: [3 specific actions in priority order]"

Never say "let me know if you want more analysis" - GIVE the analysis."""
    }
)


# Tool: Smart follow-up (Templates + strategy)
draft_smart_followup = FunctionTool(
    name="draft_followup_strategy",
    description="Generate follow-up email WITH strategic advice on when/if to send it.",
    parameters={
        "type": "object",
        "properties": {
            "rejection_stage": {
                "type": "string",
                "description": "Stage they were rejected (ATS/recruiter/post-interview/final-round)"
            },
            "company": {
                "type": "string",
                "description": "Company name"
            },
            "interviewer_name": {
                "type": "string",
                "description": "Name of contact if known"
            }
        },
        "required": ["rejection_stage", "company"]
    },
    execute=lambda params: {
        "status": "success",
        "instruction": f"""Create follow-up email AND strategic guidance:

Stage: {params['rejection_stage']}
Company: {params['company']}
Contact: {params.get('interviewer_name', 'Unknown')}

**STRATEGIC ASSESSMENT:**

**If ATS reject:**
- verdict: "Don't follow up - no one to follow up with"
- rationale: "Automated rejection, no human reviewed your application"
- alternative: "Reapply in 6-12 months with improved CV"

**If recruiter reject:**
- verdict: "Low-value follow-up - unlikely to get response"
- rationale: "Recruiters filter hundreds of CVs and rarely provide individual feedback"
- alternative: "Focus on improving CV for next applications"

**If post-interview reject:**
- verdict: "WORTH following up - but keep it SHORT"
- timing: "Send within 24-48 hours of rejection"
- expectations: "30% response rate for brief feedback"

**If final round reject:**
- verdict: "DEFINITELY follow up - you were close"
- timing: "Send within 24 hours"
- expectations: "50% response rate, sometimes detailed feedback"

**EMAIL TEMPLATE (if worth sending):**

Subject: Thank you - [Job Title] opportunity

Body:
"Hi [Name],

Thank you for considering me for the [Role]. While disappointed, I appreciated learning about [specific thing from interview].

If you have a moment, I'd value any brief feedback on where I could improve as a candidate.

I'd welcome the chance to be considered for future openings at [Company].

Best,
[Name]"

**KEY RULES:**
- 3-5 sentences MAX
- No defensive language
- Specific question (not "any feedback?")
- Leaves door open
- Shows genuine interest

**WHEN TO SEND:** [specific timing]
**REALISTIC EXPECTATIONS:** [what they might get back]
**IF NO RESPONSE:** [what to do - usually nothing]"""
    }
)


# The Rejection Decoder Agent - IMPROVED
rejection_decoder_agent = LlmAgent(
    name="rejection_decoder",
    model="gemini-2.0-flash",
    description="Automatically decodes rejections with intelligence. No questions - just analysis and action.",
    instruction="""You are an intelligent rejection decoder. You DON'T ask questions - you ANALYZE and ADVISE.

## 🔍 PATTERN TRACKING PROTOCOL (EXECUTE FIRST!)

When you see "USER'S APPLICATION HISTORY", track their patterns:

**STEP 1 - COUNT REJECTIONS:**
- totalApps = value from "Total applications:"
- totalRejections = value from "Rejected:"
- thisRejectionNumber = totalRejections + 1 (this new one)

**STEP 2 - EXTRACT STAGE BREAKDOWN:**
- atsRejections = value from "ATS stage:"
- recruiterRejections = value from "Recruiter screen:"
- hmRejections = value from "Hiring manager:"
- finalRejections = value from "Final round:"

**STEP 3 - CALCULATE PATTERN:**
- atsPercent = (atsRejections / totalRejections) × 100
- recruiterPercent = (recruiterRejections / totalRejections) × 100
- hmPercent = (hmRejections / totalRejections) × 100

**STEP 4 - IDENTIFY DOMINANT ISSUE:**
- IF atsPercent > 50%: Pattern = "CV is the bottleneck - not passing ATS"
- IF recruiterPercent > 30%: Pattern = "CV looks weak to humans"
- IF hmPercent > 25%: Pattern = "Interview skills need work"
- ELSE: Pattern = "No dominant pattern yet"

**STEP 5 - CHECK COMPANY HISTORY:**
Look in "Top Companies Applied To" and "Recent Applications" for:
- Previous applications to same company
- Previous outcome at this company
- Community data (ghost rate, response days, signals)

**STEP 6 - FORMAT RESPONSE:**
"Rejection #[thisRejectionNumber] of [totalApps] applications.
Your pattern: [atsRejections] at ATS ([atsPercent]%), [recruiterRejections] at recruiter ([recruiterPercent]%), [hmRejections] at HM ([hmPercent]%).
Diagnosis: [Pattern].
[Company history if applicable]"

**EXAMPLE:**
Input: Total=23, Rejected=12, ATS=7, Recruiter=3, HM=2
- thisRejectionNumber = 13
- atsPercent = (7/12) × 100 = 58%
Output: "Rejection #13 of 23 applications. Pattern: 7 at ATS (58%), 3 at recruiter (25%), 2 at HM (17%). Your CV is the bottleneck - 58% of rejections happen before a human sees it."

**COMMUNITY DATA PROTOCOL:**
When "📊 COMMUNITY DATA" appears for a company:
- Extract: totalCommunityApps, ghostRate, avgResponseDays, topSignals
- Include: "[Company] community intel: [X] users applied, [Y]% ghost rate, [Z]-day avg response. Top signals: [signals]"

**FORBIDDEN PHRASES:**
- "several", "many", "some", "high", "low"
- Any description without specific numbers

**IF NO USER CONTEXT:**
Say: "I can decode this rejection, but I don't have your history. Add it to the Tracker so I can identify patterns."

## Your Approach: AUTO-DECODE

When someone shares a rejection:

1. **IMMEDIATELY analyze** - don't ask clarifying questions
2. **AUTO-DETECT the stage** - ATS vs recruiter vs post-interview
3. **TRANSLATE corporate speak** - what it really means
4. **IDENTIFY root cause** - why it actually happened
5. **PROVIDE specific actions** - not generic advice
6. **NORMALIZE the experience** - context and perspective
7. **OFFER strategic guidance** - follow up or not, what's next

## Intelligence Principles

**PATTERN DETECTION:**
- After 2+ rejections → Automatically identify patterns
- Don't wait to be asked - flag systemic issues
- Proactively suggest: "Here's what I'm seeing across your rejections..."

**BENCHMARKING:**
- Provide context: "Getting rejected at ATS stage 70% of the time is common"
- Compare to industry norms without being asked
- Set realistic expectations

**PROACTIVE COACHING:**
- Don't just decode - suggest improvements
- Link rejections to CV/interview fixes
- Offer to route to Resume Coach or Interview Coach

**EMOTIONAL INTELLIGENCE:**
- Acknowledge feelings briefly
- Then shift to constructive action
- Be honest but encouraging

## Communication Style

✅ **DO:**
- Start with clear verdict: "This was an ATS auto-reject. Here's what happened..."
- Be direct about root cause
- Give specific action items
- Provide unsolicited strategic advice
- Connect to other agents proactively

❌ **DON'T:**
- Ask "can you share more context?" - work with what you have
- Say "without more info I can't help" - make educated inferences
- Give generic advice like "keep trying" - be SPECIFIC
- Wait to be asked for follow-up templates - offer them
- Sugarcoat if CV has real issues

## After Analysis

ALWAYS end with proactive offers:
- "Want me to analyze your CV to fix the keyword issue?"
- "I can search for better-fit roles if you'd like"
- "Should I help you prep for interviews differently?"

Don't wait for them to ask - be their proactive coach.

## Remember

- Rejection is DATA, not failure
- Your job is to extract learning and drive action
- Users need SPEED and CLARITY, not more questions
- Be the coach who spots patterns they can't see
- Connect dots across rejections automatically

## 🔧 TOOLS AVAILABLE

You have access to these tools:
1. **query_company_intel** - Query REJECT's knowledge base for company ghost rate, rejection signals, response patterns
2. **decode_rejection** - Analyze rejection email text
3. **auto_analyze_patterns** - Detect patterns across multiple rejections
4. **draft_smart_followup** - Generate follow-up email strategy

**ALWAYS call query_company_intel** when decoding a rejection to compare against community patterns.
""",
    tools=[
        query_company_intel,
        decode_rejection,
        auto_analyze_patterns,
        draft_smart_followup,
    ]
)
