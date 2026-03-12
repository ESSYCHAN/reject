"""Maya Voice Coach Tools - Emotional support, knowledge access, and personalized coaching."""

import os
import httpx
from google.adk.tools import FunctionTool


# ============================================================================
# TOOL: Decode and Save Rejection (calls backend API)
# ============================================================================

async def _decode_and_save_impl(
    email_text: str,
    company: str = "",
    role: str = "",
    interview_stage: str = ""
) -> dict:
    """Call the REJECT backend to decode AND save the rejection."""
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8787")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{backend_url}/api/decode",
                json={
                    "emailText": email_text,
                    "company": company,
                    "role": role,
                    "interviewStage": interview_stage,
                }
            )

            if response.status_code == 200:
                data = response.json()
                result = data.get("data", {})
                return {
                    "status": "success",
                    "saved": True,
                    "category": result.get("category"),
                    "signals": result.get("signals", []),
                    "confidence": result.get("confidence"),
                    "ats_assessment": result.get("ats_assessment"),
                    "translation": result.get("translation"),
                    "reply_worth_it": result.get("reply_worth_it"),
                    "company_detected": result.get("extracted_company"),
                    "role_detected": result.get("extracted_role"),
                }
            else:
                error_text = response.text
                return {
                    "status": "error",
                    "saved": False,
                    "message": f"Backend error: {error_text[:200]}"
                }
    except Exception as e:
        return {
            "status": "error",
            "saved": False,
            "message": str(e)
        }


def _decode_and_save_sync(
    email_text: str,
    company: str = "",
    role: str = "",
    interview_stage: str = ""
) -> dict:
    """Synchronous wrapper."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    _decode_and_save_impl(email_text, company, role, interview_stage)
                )
                return future.result(timeout=35)
        else:
            return loop.run_until_complete(
                _decode_and_save_impl(email_text, company, role, interview_stage)
            )
    except Exception as e:
        return {"status": "error", "saved": False, "message": str(e)}


@FunctionTool
def decode_and_save_rejection(
    email_text: str,
    company: str = "",
    role: str = "",
    interview_stage: str = ""
) -> dict:
    """Decode a rejection email AND save it to the knowledge base.

    THIS IS THE PRIMARY TOOL FOR HANDLING REJECTIONS.

    When a user pastes a rejection email, use this tool IMMEDIATELY. It will:
    1. Analyze the rejection (stage, signals, category)
    2. Save to their personal tracker (if logged in)
    3. Save to the anonymous knowledge base (always)
    4. Store in Pinecone for pattern matching (flywheel)

    IMPORTANT: You do NOT need all parameters to save. The backend will:
    - Auto-detect company and role from the email text
    - Infer interview_stage from the rejection language (ATS auto-reject vs post-interview)
    - Save with whatever info is available

    ALWAYS call this tool when you see a rejection email. Don't ask for more info first.
    Save first, then offer to update details if the user wants.

    Args:
        email_text: The full rejection email text (REQUIRED)
        company: Company name (auto-detected if not provided)
        role: Job role (auto-detected if not provided)
        interview_stage: What stage they were at (auto-inferred if not provided)

    Returns:
        - category: Type of rejection (ats_rejection, post_interview, etc.)
        - signals: What the rejection language indicates
        - confidence: How confident the analysis is
        - ats_assessment: Which stage they reached (this IS the inferred stage)
        - translation: What the corporate speak really means
        - reply_worth_it: Whether responding is worthwhile
        - saved: True if saved to knowledge base
    """
    return _decode_and_save_sync(email_text, company, role, interview_stage)


# ============================================================================
# HOLDING EMAIL FLYWHEEL TOOLS
# ============================================================================

async def _save_holding_email_impl(company: str, role: str = "", email_snippet: str = "") -> dict:
    """Call backend to save a holding email for outcome tracking."""
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8787")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{backend_url}/api/pro/holding-email",
                json={
                    "companyName": company,
                    "role": role,
                    "emailSnippet": email_snippet
                }
            )

            if response.status_code == 200:
                data = response.json()
                result = data.get("data", {})
                return {
                    "status": "success",
                    "saved": True,
                    "id": result.get("id"),
                    "company_stats": result.get("companyStats")
                }
            else:
                return {"status": "error", "saved": False, "message": response.text[:200]}
    except Exception as e:
        return {"status": "error", "saved": False, "message": str(e)}


async def _get_company_holding_stats_impl(company: str) -> dict:
    """Get holding email stats for a company."""
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8787")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{backend_url}/api/pro/holding-stats/{company}"
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "status": "success",
                    "stats": data.get("data"),
                    "has_data": data.get("data") is not None
                }
            else:
                return {"status": "error", "stats": None, "has_data": False}
    except Exception as e:
        return {"status": "error", "stats": None, "has_data": False, "message": str(e)}


def _sync_wrapper(coro):
    """Generic sync wrapper for async functions."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, coro)
                return future.result(timeout=20)
        else:
            return loop.run_until_complete(coro)
    except Exception as e:
        return {"status": "error", "message": str(e)}


@FunctionTool
def save_holding_email(company: str, role: str = "", email_snippet: str = "") -> dict:
    """Save a holding email for outcome tracking (the holding flywheel).

    Use this when a user receives a "we'll get back to you" email (NOT a rejection).
    This tracks holding emails so we can:
    1. Remind users to follow up after 2 weeks
    2. Learn actual ghost rates per company
    3. Give data-driven advice like "Mercedes F1 holding emails → 85% ghost rate"

    Args:
        company: Company name (required)
        role: Role they applied for
        email_snippet: First 200 chars of email for context

    Returns:
        - saved: True if saved
        - id: ID for later updating with outcome
        - company_stats: Ghost/rejection stats if we have data for this company
    """
    return _sync_wrapper(_save_holding_email_impl(company, role, email_snippet))


@FunctionTool
def get_company_holding_stats(company: str) -> dict:
    """Get holding email outcome stats for a company.

    Use this to give data-driven responses about holding emails.
    Returns ghost rate, rejection rate, interview rate based on REJECT community data.

    Example response when we have data:
    "Mercedes AMG F1 sent this exact email to 12 REJECT users. 11 never heard back."

    Args:
        company: Company name to look up

    Returns:
        - has_data: True if we have stats
        - stats: {
            totalTracked: number of holding emails tracked,
            ghostedRate: % that never heard back,
            rejectedRate: % that got rejected,
            interviewRate: % that got interviews,
            avgDaysToOutcome: average days to hear back
          }
    """
    return _sync_wrapper(_get_company_holding_stats_impl(company))


# Tool: Emotional check-in and support
@FunctionTool
def emotional_support(emotional_state: str, rejection_count: int = 0, context: str = "") -> dict:
    """Provide empathetic emotional support based on user's current state.

    Maya uses this to:
    - Acknowledge and validate feelings
    - Provide perspective without dismissing emotions
    - Offer coping strategies for rejection-related stress
    - Know when to be encouraging vs when to just listen

    Args:
        emotional_state: User's current emotional state (frustrated, defeated, anxious, hopeful, etc.)
        rejection_count: How many rejections they've experienced recently
        context: Additional context about what triggered this emotion
    """
    return {
        "status": "success",
        "guidance": f"""
EMOTIONAL STATE: {emotional_state}
REJECTION COUNT: {rejection_count}
CONTEXT: {context or 'None provided'}

MAYA'S RESPONSE APPROACH:

**If FRUSTRATED/ANGRY:**
- Validate: "That frustration is completely valid. The job search process can feel dehumanizing."
- Normalize: "Most people hit this wall around rejection #{rejection_count or '10-15'}."
- Reframe: Focus on what they CAN control
- Action: "Let's channel this energy into something productive - want to review what's actually going wrong?"

**If DEFEATED/HOPELESS:**
- Validate first, don't rush to fix: "I hear you. This is hard. Really hard."
- Share data: "The average job search takes 3-6 months. You're still in the game."
- Small win: Find ONE thing they did right recently
- Gentle push: "What's one tiny thing we could improve today? Just one."

**If ANXIOUS/WORRIED:**
- Ground them: "Let's take a breath. What specifically is worrying you most?"
- Separate facts from fears
- Provide concrete next steps (anxiety hates uncertainty)
- Remind: "We'll work through this together, one step at a time."

**If HOPEFUL/MOTIVATED:**
- Match energy: "I love that energy! Let's use it!"
- Channel into action: Suggest specific next steps
- Set realistic expectations without dampening hope
- Build momentum: "What do you want to tackle first?"

**If CONFUSED/LOST:**
- Simplify: "Let's break this down together."
- Ask ONE clarifying question
- Provide clear direction
- Reassure: "There's no 'right' way to do this. Let's find YOUR way."

ALWAYS:
- Use their name if known
- Reference their specific situation (companies, roles, etc.)
- Be a buddy, not a therapist - warm, supportive, slightly playful
- End with an actionable suggestion or question
"""
    }


# Tool: Personalized pep talk based on user history
@FunctionTool
def generate_pep_talk(
    total_applications: int = 0,
    total_rejections: int = 0,
    interviews_gotten: int = 0,
    recent_win: str = "",
    target_role: str = ""
) -> dict:
    """Generate a personalized pep talk based on user's application history and current situation.

    Maya uses this when users need motivation or are feeling down about their job search.

    Args:
        total_applications: Total number of applications submitted
        total_rejections: Total number of rejections received
        interviews_gotten: Number of interviews they've gotten
        recent_win: Any recent positive development (interview invite, good feedback, etc.)
        target_role: The role they're targeting
    """
    return {
        "status": "success",
        "pep_talk_elements": f"""
STATS:
- Applications: {total_applications or 'unknown'}
- Rejections: {total_rejections or 'unknown'}
- Interviews: {interviews_gotten or 'unknown'}
- Recent win: {recent_win or 'None mentioned'}
- Target: {target_role or 'Not specified'}

PEP TALK STRUCTURE:

1. **ACKNOWLEDGE THE GRIND** (2 sentences)
   - Reference their specific numbers
   - Validate the effort: "{total_applications or 'These'} applications is real work. That takes guts."

2. **PROVIDE PERSPECTIVE** (2-3 sentences)
   - Industry benchmarks: "The average is 100-200 applications per offer"
   - Progress framing: If interviews > 0, highlight interview rate
   - Time context: "Most searches take 3-6 months"

3. **HIGHLIGHT A WIN** (1-2 sentences)
   - If recent_win exists, celebrate it
   - If not, find something: "You're still showing up. That's more than most."
   - Skills they've developed through this process

4. **REALITY CHECK WITH HOPE** (2 sentences)
   - Honest about the challenge ahead
   - But with a path: "Here's what I know: every 'no' gets you closer to the right 'yes'"

5. **CALL TO ACTION** (1 sentence)
   - Specific, achievable: "Let's make the next application your strongest yet"
   - Or rest if needed: "But first - how about we take the rest of today off?"

TONE:
- Like a supportive friend who's been through it
- Not toxic positivity - real, grounded hope
- Slightly playful but never dismissive
- Use "we" language - you're in this together
"""
    }


# Tool: Quick wisdom/insight from knowledge base
@FunctionTool
def fetch_rejection_wisdom(topic: str, company: str = "") -> dict:
    """Fetch relevant wisdom, statistics, or insights from REJECT's knowledge base.

    Maya uses this to provide data-backed support and normalize user experiences.

    Args:
        topic: The topic area - one of: ats_rejection, ghosting, interview_rejection, salary_negotiation, career_change, general_stats
        company: Optional specific company to look up
    """
    wisdom_data = {
        "ats_rejection": {
            "stat": "75% of resumes are rejected by ATS before a human ever sees them",
            "insight": "ATS rejection isn't personal - it's algorithmic. Your resume might be great but missing specific keywords.",
            "action": "Try running your resume through an ATS checker and match keywords from the job description"
        },
        "ghosting": {
            "stat": "The average company ghosts 50-70% of applicants after initial application",
            "insight": "Ghosting is the norm, not the exception. Companies often close roles without notifying candidates.",
            "action": "Set a 'move on' date for each application - don't wait more than 2-3 weeks without follow-up"
        },
        "interview_rejection": {
            "stat": "Even qualified candidates have only a 20-30% chance of receiving an offer after a final interview",
            "insight": "Getting to the interview stage means you're qualified. The decision often comes down to fit, timing, or internal politics.",
            "action": "Ask for feedback - about 30% of rejected candidates who ask receive useful insights"
        },
        "salary_negotiation": {
            "stat": "Only 39% of workers try to negotiate salary, but 84% of those who do get at least some increase",
            "insight": "Negotiation is expected. Employers rarely rescind offers due to negotiation.",
            "action": "Always counter with a number 10-20% above their initial offer"
        },
        "career_change": {
            "stat": "Career changers typically need 30-50% more applications than those staying in their field",
            "insight": "The extra effort is worth it - career changers report 50% higher job satisfaction after switching.",
            "action": "Focus on transferable skills and consider bridge roles that combine old and new skills"
        },
        "general_stats": {
            "stat": "The average job search takes 5-6 months and 100-200 applications",
            "insight": "Job searching is a numbers game, but quality matters too. Tailored applications have 3x the response rate.",
            "action": "Aim for 5-10 quality applications per week rather than 50 generic ones"
        }
    }

    default_wisdom = {
        "stat": "Job searching is challenging for everyone",
        "insight": "You're not alone in this",
        "action": "Keep going, one application at a time"
    }

    return {
        "status": "success",
        "topic": topic,
        "wisdom": wisdom_data.get(topic, default_wisdom),
        "company_lookup": company if company else None
    }


# Tool: Daily check-in prompt
@FunctionTool
def daily_checkin(
    last_activity: str = "",
    days_since_last_chat: int = 0,
    pending_applications: int = 0,
    upcoming_interviews: int = 0
) -> dict:
    """Generate a personalized daily check-in based on user's recent activity and emotional state.

    Maya uses this for ongoing support and accountability.

    Args:
        last_activity: What they were working on last time
        days_since_last_chat: Days since last conversation
        pending_applications: Number of applications waiting for response
        upcoming_interviews: Number of upcoming interviews
    """
    return {
        "status": "success",
        "checkin_structure": f"""
CONTEXT:
- Last activity: {last_activity or 'Unknown'}
- Days away: {days_since_last_chat}
- Pending apps: {pending_applications}
- Upcoming interviews: {upcoming_interviews}

MAYA'S CHECK-IN APPROACH:

**IF RETURNING AFTER ABSENCE (days > 3):**
"Hey! I missed you. How have things been going?"
- Don't assume bad news
- Give them space to share updates
- Gently ask if they need anything

**IF DAILY USER:**
"Hey friend! Ready for another day of this?"
- Quick, casual energy
- Reference what they were working on
- Offer specific help

**IF HAS UPCOMING INTERVIEW:**
"Big day coming up! How are you feeling about [company/role]?"
- Focus on interview prep
- Offer to practice
- Help with nerves if needed

**IF MANY PENDING (>10):**
"You've got {pending_applications} applications out there working for you."
- Acknowledge the waiting game
- Suggest when to follow up
- Distract with productive activities

**IF NO RECENT ACTIVITY:**
"Haven't seen you apply to anything in a bit. Taking a break, or stuck?"
- Non-judgmental check
- Offer break permission OR help getting unstuck
- Remind it's a marathon, not a sprint

TONE:
- Warm, like a friend checking in
- Not pushy or guilt-trippy
- Match their likely energy level
- Always end with an offer to help
"""
    }


# Tool: Voice response formatter (for TTS optimization)
@FunctionTool
def format_for_voice(text: str, emotion: str = "supportive") -> dict:
    """Format Maya's response for optimal voice/TTS delivery.

    Converts text responses into natural, speakable content.

    Args:
        text: The text to format for voice delivery
        emotion: The emotional tone - one of: supportive, excited, calm, serious, playful
    """
    return {
        "status": "success",
        "voice_formatting_rules": """
VOICE OPTIMIZATION RULES:

1. **SENTENCE LENGTH**: Keep sentences under 15 words for natural breathing
2. **CONTRACTIONS**: Use them! "You're" not "You are", "don't" not "do not"
3. **FILLER WORDS**: Add natural pauses: "So...", "Look,", "Here's the thing..."
4. **NUMBERS**: Spell out for TTS: "twenty three" not "23"
5. **LISTS**: Use "first... then... finally" not bullet points
6. **EMPHASIS**: Use word choice, not formatting (bold/italic don't translate)
7. **QUESTIONS**: Use rising intonation markers naturally
8. **NAMES**: Use the user's name occasionally for connection
9. **HUMOR**: Light, warm humor translates well to voice
10. **PAUSES**: Use "..." for natural pauses, not commas

AVOID:
- Long sentences with multiple clauses
- Technical jargon without explanation
- URLs or email addresses (summarize instead)
- Acronyms without spelling out
- Complex statistics (round and simplify)

EMOTIONAL TONE ADJUSTMENTS:
- supportive: Slower pace, softer words, more pauses
- excited: Faster pace, more energy words, exclamations
- calm: Even pace, grounding words, steady rhythm
- serious: Measured pace, direct language, clear structure
- playful: Varied pace, casual words, light humor
""",
        "original_text": text,
        "emotion": emotion
    }
