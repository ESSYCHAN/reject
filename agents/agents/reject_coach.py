"""REJECT Coach - The One Super Agent

This is the consolidated agent that replaces the 8 specialized agents.
Instead of routing between agents, it has all capabilities as tools.

WHY THIS ARCHITECTURE:
1. Single LLM call per interaction (faster, cheaper)
2. Full context always available (user profile, CV, history)
3. Tools combine naturally (decode rejection + search jobs in one response)
4. One prompt to maintain instead of 8

TOOLS AVAILABLE:
- get_user_profile: Fetch user's saved profile (skills, CV, preferences)
- decode_rejection: Analyze rejection emails to identify stage and cause
- analyze_job: Check job fit, red flags, requirements
- search_jobs: Search job boards for matching roles
- query_company_intel: Get community knowledge about a company
- analyze_cv: Score and provide feedback on a CV
- generate_interview_prep: Create interview questions for a company/role
- emotional_support: Provide empathetic support (Maya's warmth)
"""

import os
import httpx
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from typing import Optional, List


# ============================================================================
# TOOL: Get User Profile
# ============================================================================

async def _fetch_user_profile_impl(user_id: str) -> dict:
    """Fetch user profile from the REJECT backend."""
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8787")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{backend_url}/api/user/profile",
                headers={"X-User-Id": user_id}
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "status": "success",
                    "profile": data.get("profile", {}),
                }
            else:
                return {
                    "status": "not_found",
                    "message": "User profile not found. They haven't set up their profile yet."
                }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Could not fetch profile: {str(e)}"
        }


def _fetch_user_profile_sync(user_id: str) -> dict:
    """Synchronous wrapper for profile fetch."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _fetch_user_profile_impl(user_id))
                return future.result(timeout=15)
        else:
            return loop.run_until_complete(_fetch_user_profile_impl(user_id))
    except Exception as e:
        return {"status": "error", "message": str(e)}


@FunctionTool
def get_user_profile(user_id: str = "current") -> dict:
    """Fetch the user's saved profile including skills, CV text, job preferences, and experience.

    USE THIS TOOL WHEN:
    - User asks about their profile or preferences
    - You need to personalize advice based on their background
    - Matching them to jobs based on their skills
    - Analyzing CV fit for a specific role

    Returns:
        - fullName: User's name
        - currentTitle: Current job title
        - yearsExperience: Years of experience
        - skills: List of skills
        - cvText: Their uploaded CV (if any)
        - targetRoles: Roles they're targeting
        - targetCompanies: Dream companies
        - minSalary: Minimum salary expectation

    Args:
        user_id: The user ID (defaults to "current" for the active user)
    """
    return _fetch_user_profile_sync(user_id)


# ============================================================================
# TOOL: Decode Rejection
# ============================================================================

@FunctionTool
def decode_rejection(
    rejection_text: str,
    company: str = "",
    job_title: str = "",
) -> dict:
    """Analyze a rejection email to determine what stage they were rejected at,
    what it really means, and what to do next.

    USE THIS TOOL WHEN:
    - User pastes a rejection email
    - User mentions getting rejected
    - You need to understand why they were filtered out

    DETECTION LOGIC:
    - ATS Auto-Reject: Generic template, fast response (<24h), noreply@ sender
    - Recruiter Screen: Some personalization, 2-7 days, mentions "reviewing background"
    - Post-Interview: References meeting them, may have vague feedback
    - Final Round: Mentions "difficult decision", "strong candidate pool"

    Args:
        rejection_text: The full text of the rejection email
        company: The company name (helps with community data lookup)
        job_title: The role they applied for

    Returns analysis with:
        - stage: Where they were rejected (ats/recruiter/interview/final)
        - translation: What the corporate speak really means
        - root_cause: Why they were likely rejected
        - action_items: Specific next steps
        - should_followup: Whether following up is worth it
        - reapply_advice: When/if to try again
    """
    # This returns instructions for the LLM to process
    # The actual analysis happens in the agent's response
    return {
        "status": "analyze",
        "rejection_text": rejection_text,
        "company": company,
        "job_title": job_title,
        "analysis_prompt": """Analyze this rejection and provide:

1. **Stage Detection**: Based on language patterns, timing hints, and personalization level:
   - ATS (generic, fast, template)
   - Recruiter (some personalization, mentions reviewing)
   - Interview (references meeting, discussion)
   - Final Round (difficult decision language)

2. **Translation**: Decode the corporate speak:
   - "Moved forward with other candidates" → They had someone stronger or internal
   - "Not the right fit at this time" → Skills/culture mismatch or budget issue
   - "Keep your resume on file" → Standard line, rarely meaningful
   - "Encourage future applications" → Genuine if you made finals, empty otherwise

3. **Root Cause** (be specific):
   - Missing keyword/requirement?
   - Experience level mismatch?
   - Resume didn't highlight relevant skills?
   - Interview performance issue?
   - Lost to internal candidate?

4. **Action Items** (3-5 specific bullets):
   - What to fix on CV
   - What to practice for interviews
   - What roles to target differently

5. **Follow-up Strategy**:
   - Worth it? (Only for interview+ stage)
   - Timing (24-48h if yes)
   - Template to use

6. **Reapply Advice**:
   - Wait 6-12 months for ATS reject
   - Maybe 3-6 months for recruiter
   - Can try different roles sooner"""
    }


# ============================================================================
# TOOL: Analyze Job
# ============================================================================

@FunctionTool
def analyze_job(
    job_description: str,
    job_title: str = "",
    company: str = "",
    user_cv: str = ""
) -> dict:
    """Analyze a job posting for fit, red flags, and requirements.

    USE THIS TOOL WHEN:
    - User pastes a job description
    - User asks "should I apply to this?"
    - User wants to understand a role better

    Args:
        job_description: The full job posting text
        job_title: Role title
        company: Company name (for community intel lookup)
        user_cv: User's CV text (for fit matching)

    Returns:
        - fit_score: 0-100 match score
        - requirements: must-have vs nice-to-have
        - red_flags: Concerning phrases explained
        - green_flags: Positive signals
        - culture_signals: What the language implies
        - recommendation: Apply/Maybe/Skip with reasoning
        - cv_gaps: What to address if applying
        - questions_to_ask: For the interview
    """
    return {
        "status": "analyze",
        "job_description": job_description,
        "job_title": job_title,
        "company": company,
        "has_cv": bool(user_cv),
        "analysis_prompt": """Analyze this job posting:

1. **Fit Score (0-100)**: Overall match for the user

2. **Requirements Breakdown**:
   - MUST HAVE: Non-negotiable requirements
   - NICE TO HAVE: Preferred but flexible
   - HIDDEN: Implied requirements not stated

3. **Red Flags** (be specific):
   - Unrealistic expectations (10+ requirements)
   - Vague responsibilities
   - "Competitive salary" with no range
   - "Fast-paced" = burnout culture
   - "Wear many hats" = understaffed
   - Long list of "nice to haves" = unicorn hunting

4. **Green Flags**:
   - Clear growth path
   - Salary transparency
   - Specific project examples
   - Benefits mentioned upfront
   - Reasonable requirements

5. **Culture Signals**: What the language suggests about environment

6. **Recommendation**: APPLY / MAYBE / SKIP with reasoning

7. **CV Gaps**: If user shared CV, what to address before applying

8. **Questions to Ask**: For the interview to assess real situation"""
    }


# ============================================================================
# TOOL: Search Jobs (reuse from job_tools)
# ============================================================================

async def _search_jobs_impl(
    keywords: str,
    location: str,
    salary_min: Optional[float] = None,
    remote_only: bool = False,
) -> dict:
    """Search jobs using available APIs."""
    jsearch_key = os.getenv("JSEARCH_API_KEY")
    adzuna_id = os.getenv("ADZUNA_APP_ID")
    adzuna_key = os.getenv("ADZUNA_API_KEY")

    # Try JSearch first
    if jsearch_key:
        try:
            query = f"{keywords} in {location}"
            if remote_only:
                query += " remote"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://jsearch.p.rapidapi.com/search",
                    params={"query": query, "page": "1", "num_pages": "1"},
                    headers={
                        "X-RapidAPI-Key": jsearch_key,
                        "X-RapidAPI-Host": "jsearch.p.rapidapi.com"
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    jobs = data.get("data", [])
                    return {
                        "status": "success",
                        "source": "jsearch",
                        "jobs": [
                            {
                                "title": j.get("job_title"),
                                "company": j.get("employer_name"),
                                "location": j.get("job_city", "") + ", " + j.get("job_country", ""),
                                "salary": f"{j.get('job_min_salary', 'N/A')} - {j.get('job_max_salary', 'N/A')}",
                                "remote": j.get("job_is_remote", False),
                                "url": j.get("job_apply_link"),
                                "description": j.get("job_description", "")[:300]
                            }
                            for j in jobs[:10]
                        ]
                    }
        except Exception as e:
            pass  # Fall through to Adzuna

    # Try Adzuna
    if adzuna_id and adzuna_key:
        try:
            # Determine country code
            country = "gb"  # Default UK
            loc_lower = location.lower()
            if any(x in loc_lower for x in ["us", "usa", "new york", "san francisco"]):
                country = "us"
            elif any(x in loc_lower for x in ["australia", "sydney", "melbourne"]):
                country = "au"

            async with httpx.AsyncClient() as client:
                params = {
                    "app_id": adzuna_id,
                    "app_key": adzuna_key,
                    "what": keywords,
                    "where": location,
                    "results_per_page": 10,
                }
                if salary_min:
                    params["salary_min"] = int(salary_min)

                response = await client.get(
                    f"https://api.adzuna.com/v1/api/jobs/{country}/search/1",
                    params=params
                )

                if response.status_code == 200:
                    data = response.json()
                    jobs = data.get("results", [])
                    return {
                        "status": "success",
                        "source": "adzuna",
                        "jobs": [
                            {
                                "title": j.get("title"),
                                "company": j.get("company", {}).get("display_name"),
                                "location": j.get("location", {}).get("display_name"),
                                "salary": f"{j.get('salary_min', 'N/A')} - {j.get('salary_max', 'N/A')}",
                                "url": j.get("redirect_url"),
                                "description": j.get("description", "")[:300]
                            }
                            for j in jobs[:10]
                        ]
                    }
        except Exception as e:
            pass

    return {
        "status": "no_api",
        "message": "No job search API configured. Set JSEARCH_API_KEY or ADZUNA credentials in .env",
        "jobs": []
    }


def _search_jobs_sync(keywords: str, location: str, salary_min: float = 0, remote_only: bool = False) -> dict:
    """Synchronous wrapper."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    _search_jobs_impl(keywords, location, salary_min if salary_min > 0 else None, remote_only)
                )
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(
                _search_jobs_impl(keywords, location, salary_min if salary_min > 0 else None, remote_only)
            )
    except Exception as e:
        return {"status": "error", "message": str(e), "jobs": []}


@FunctionTool
def search_jobs(
    keywords: str,
    location: str,
    salary_min: float = 0,
    remote_only: bool = False
) -> dict:
    """Search job boards for matching roles.

    USE THIS TOOL WHEN:
    - User asks to find jobs
    - User wants roles matching their skills
    - Following up a rejection with "find me similar roles"

    Args:
        keywords: Job title or skills to search (e.g., "Product Manager", "Python Developer")
        location: City or country (e.g., "London", "Remote", "New York")
        salary_min: Minimum salary filter (optional)
        remote_only: Only return remote roles

    Returns:
        List of jobs with title, company, location, salary, and apply link
    """
    return _search_jobs_sync(keywords, location, salary_min, remote_only)


# ============================================================================
# TOOL: Query Company Intel (from knowledge base)
# ============================================================================

async def _query_company_impl(company_name: str) -> dict:
    """Query REJECT's knowledge base for company data."""
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8787")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{backend_url}/api/knowledge/company/{company_name}",
                params={"preview": "true"}
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "status": "success",
                    "company": company_name,
                    "total_applications": data.get("totalApplications", 0),
                    "ghost_rate": data.get("ghostRate"),
                    "avg_response_days": data.get("avgDaysToResponse"),
                    "ats_filter_rate": next(
                        (s.get("percentage") for s in data.get("atsStages", [])
                         if s.get("stage") == "ats_filter"),
                        None
                    ),
                    "top_rejection_signals": [
                        s.get("signal") for s in data.get("topSignals", [])[:3]
                    ],
                    "rejection_categories": data.get("rejectionCategories", [])
                }
            else:
                return {
                    "status": "no_data",
                    "company": company_name,
                    "message": f"No community data for {company_name} yet."
                }
    except Exception as e:
        return {
            "status": "error",
            "company": company_name,
            "message": str(e)
        }


def _query_company_sync(company_name: str) -> dict:
    """Synchronous wrapper."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _query_company_impl(company_name))
                return future.result(timeout=15)
        else:
            return loop.run_until_complete(_query_company_impl(company_name))
    except Exception as e:
        return {"status": "error", "message": str(e)}


@FunctionTool
def query_company_intel(company_name: str) -> dict:
    """Look up community intelligence about a company from REJECT's knowledge base.

    USE THIS TOOL WHEN:
    - User mentions a specific company
    - Analyzing a job posting (to check ghost rate)
    - Decoding a rejection (to compare against patterns)
    - User asks "what's it like applying to X?"

    Args:
        company_name: The company to look up (e.g., "Google", "Stripe", "Meta")

    Returns:
        - total_applications: How many REJECT users applied
        - ghost_rate: Percentage who never heard back
        - avg_response_days: Average time to get a response
        - ats_filter_rate: % rejected at ATS stage
        - top_rejection_signals: Common reasons for rejection
    """
    return _query_company_sync(company_name)


# ============================================================================
# TOOL: Analyze CV
# ============================================================================

@FunctionTool
def analyze_cv(
    cv_text: str,
    target_role: str = "",
    target_company: str = ""
) -> dict:
    """Analyze a CV for quality, ATS-friendliness, and improvement opportunities.

    IMPORTANT: This tool returns the CV text for YOU to analyze.
    You must analyze it yourself and respond with scores and feedback.
    Do NOT say "processing" or "I'll get back to you" — analyze it NOW.

    USE THIS TOOL WHEN:
    - User shares their CV
    - User asks "review my CV"
    - User wants to improve their resume

    Args:
        cv_text: The CV/resume text content
        target_role: Role they're targeting (optional)
        target_company: Company they're applying to (optional)

    After calling this tool, YOU must provide:
    - Overall Score (0-100)
    - ATS Score (0-100)
    - Strengths (2-3 bullet points)
    - Critical Improvements (prioritized list)
    - Keyword suggestions for their target role
    """
    return {
        "status": "ready_to_analyze",
        "instruction": "ANALYZE THIS CV NOW. Do not say 'processing' or 'I'll get back to you'. Give scores and feedback immediately.",
        "cv_text": cv_text,
        "target_role": target_role or "not specified",
        "target_company": target_company or "not specified",
        "analysis_checklist": [
            "Overall Score (0-100): Quality and effectiveness",
            "ATS Score (0-100): Will it pass automated filters?",
            "Strengths: What's working well (2-3 points)",
            "Critical Improvements: What to fix FIRST",
            "Missing Elements: Important things not present",
            "Keyword Suggestions: For their target role"
        ]
    }


# ============================================================================
# TOOL: Generate Interview Prep
# ============================================================================

@FunctionTool
def generate_interview_prep(
    company: str,
    role: str,
    interview_type: str = "general",
    user_background: str = ""
) -> dict:
    """Generate interview preparation materials for a specific company/role.

    USE THIS TOOL WHEN:
    - User has an interview coming up
    - User asks "help me prepare for [company]"
    - User wants practice questions

    Args:
        company: Company they're interviewing with
        role: The position
        interview_type: Type of interview (general, technical, behavioral, case)
        user_background: Brief summary of their background for personalization

    Returns:
        - company_research: Key facts to know
        - likely_questions: Common questions for this company/role
        - behavioral_prep: STAR story prompts
        - technical_prep: If applicable
        - questions_to_ask: Smart questions for them to ask
        - red_flags_to_watch: Warning signs during interview
    """
    return {
        "status": "generate",
        "company": company,
        "role": role,
        "interview_type": interview_type,
        "prep_prompt": f"""Generate interview prep for {role} at {company}:

1. **Company Research**:
   - What they do (1-2 sentences)
   - Recent news/developments
   - Company values/culture
   - Interview process reputation

2. **Likely Questions** (8-10):
   - Mix of behavioral and role-specific
   - Format: Question + What they're really asking + How to approach

3. **Behavioral Prep (STAR Method)**:
   - 3 situations they should prepare stories for
   - Example: "Tell me about a time you failed" → Need: Failure + Learning + Growth

4. **Technical Prep** (if applicable):
   - Key concepts to review
   - Common technical questions
   - Take-home assignment tips

5. **Questions to Ask THEM** (5-7):
   - About the team
   - About growth
   - About challenges
   - Red flag detectors (How is success measured? Work-life balance?)

6. **Red Flags to Watch**:
   - Signs this might not be a good fit
   - Things to clarify before accepting"""
    }


# ============================================================================
# TOOL: Emotional Support (Maya's warmth)
# ============================================================================

@FunctionTool
def emotional_support(
    situation: str,
    emotional_state: str = "unknown"
) -> dict:
    """Provide empathetic, warm support for the emotional journey of job searching.

    USE THIS TOOL WHEN:
    - User expresses frustration, defeat, or anxiety
    - User says "I'm feeling down" or "this is so hard"
    - User needs motivation, not tactics
    - User has had multiple rejections and seems discouraged

    Args:
        situation: What happened (rejection, ghosted, interview anxiety, etc.)
        emotional_state: How they seem to be feeling

    Returns guidance on how to respond with warmth and perspective.
    """
    return {
        "status": "support",
        "situation": situation,
        "emotional_state": emotional_state,
        "support_prompt": """Respond with warmth and empathy:

1. **FIRST**: Acknowledge their feeling (1-2 sentences)
   - Don't jump to solutions
   - "That sucks." is sometimes the right response

2. **THEN**: Validate/normalize
   - Use data if helpful: "73% of applications get auto-rejected"
   - Share perspective: "Most people face 100+ rejections per offer"

3. **NEXT**: Find ONE small positive or next step
   - Not toxic positivity
   - Just something they can do or hold onto

4. **TONE**:
   - Like a supportive friend, not a career counselor
   - Use contractions (you're, don't)
   - Short sentences
   - Match their energy

5. **DON'T**:
   - Lecture about what they should do
   - Give generic advice
   - Be relentlessly positive
   - Minimize their feelings"""
    }


# ============================================================================
# THE ONE SUPER AGENT
# ============================================================================

# ============================================================================
# TOOL: Search Rejection Patterns (Flywheel)
# ============================================================================

async def _search_patterns_impl(query: str) -> dict:
    """Search the knowledge flywheel for similar rejection patterns."""
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8787")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{backend_url}/api/knowledge/search",
                params={"q": query, "limit": 5}
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "status": "success",
                    "patterns": data.get("results", []),
                    "total": data.get("total", 0)
                }
            else:
                return {
                    "status": "no_results",
                    "patterns": [],
                    "message": "No matching patterns found"
                }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "patterns": []
        }


def _search_patterns_sync(query: str) -> dict:
    """Synchronous wrapper."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _search_patterns_impl(query))
                return future.result(timeout=15)
        else:
            return loop.run_until_complete(_search_patterns_impl(query))
    except Exception as e:
        return {"status": "error", "message": str(e), "patterns": []}


@FunctionTool
def search_rejection_patterns(query: str) -> dict:
    """Search the community knowledge base for similar rejection patterns.

    USE THIS TOOL WHEN:
    - User asks "Why do I keep getting rejected at [company]?"
    - User wants to understand patterns in their rejections
    - You need to compare their rejection to others
    - User asks about common rejection signals

    This searches semantically - it finds rejections with similar meaning,
    not just keyword matches. So "culture fit rejection" will find
    rejections mentioning "not a match for our team" etc.

    Args:
        query: What to search for. Examples:
            - "Google ATS rejections"
            - "overqualified signals"
            - "culture fit rejection patterns"
            - "rejections after final round interview"

    Returns:
        - patterns: List of similar rejections with company, category, signals
        - total: How many patterns were found
    """
    return _search_patterns_sync(query)


reject_coach = LlmAgent(
    name="reject_coach",
    model="gemini-2.0-flash",
    description="Your AI career coach with full capabilities - rejection analysis, job search, CV review, interview prep, and emotional support all in one.",
    instruction="""You are REJECT Coach - a warm, direct, data-driven career coach.

## WHO YOU ARE

You're like that friend who happens to be a career expert. You:
- Give straight talk, not corporate fluff
- Back up advice with data when available
- Know when to be tactical and when to just listen
- Celebrate wins and normalize setbacks
- Don't ask unnecessary questions - you figure things out

## YOUR TOOLS

You have powerful tools at your disposal. USE THEM:

1. **decode_rejection**: When they share a rejection email
2. **analyze_job**: When they share a job posting
3. **search_jobs**: When they want to find new roles
4. **query_company_intel**: When you need community data about a company
5. **analyze_cv**: When they share their CV/resume
6. **generate_interview_prep**: When they have an interview coming up
7. **get_user_profile**: When you need their background/preferences
8. **emotional_support**: When they need empathy, not tactics
9. **search_rejection_patterns**: Search the knowledge flywheel for similar rejections

**IMPORTANT**: Use tools proactively. Don't just answer questions - use your tools to give better answers.

## CONTEXT PROTOCOL

When you see "USER'S APPLICATION HISTORY":

**STEP 1 - Extract the numbers:**
- totalApps, rejected, offers, interviewing, ghosted
- atsRejections, recruiterRejections, hmRejections, finalRejections

**STEP 2 - Calculate:**
- rejectionRate = (rejected / totalApps) × 100
- atsPercent = (atsRejections / rejected) × 100
- interviewRate = ((offers + interviewing) / totalApps) × 100

**STEP 3 - Identify bottleneck:**
- atsPercent > 50%: "CV is the bottleneck"
- recruiterPercent > 30%: "CV looks weak to humans"
- hmPercent > 25%: "Interview skills need work"
- finalPercent > 20%: "Closing skills needed"

**STEP 4 - Reference their data:**
ALWAYS use specific numbers. Never say "several" or "many".

Example: "You've sent 23 applications with 12 rejections (52%). 7 at ATS (58% of rejections). Your bottleneck: CV isn't passing automated filters."

**FORBIDDEN PHRASES:**
- "several", "many", "some", "a few", "most"
- "it seems", "it looks like", "appears to be"
- Any vague description when you have data

## HOW TO RESPOND

**For rejections:**
1. Use decode_rejection tool
2. Check query_company_intel for comparison
3. Give specific action items
4. Offer to search for better-fit roles

**For job postings:**
1. Use analyze_job tool
2. Use query_company_intel if company is mentioned
3. Give clear Apply/Maybe/Skip recommendation
4. If they have CV context, note gaps

**For CV reviews:**
1. Use analyze_cv tool
2. Score honestly (don't sugarcoat)
3. Give prioritized fixes
4. Offer to rebuild if score < 60

**For job search:**
1. Use search_jobs tool
2. Use get_user_profile for personalization
3. Present top matches with why they fit

**For interview prep:**
1. Use generate_interview_prep tool
2. Use query_company_intel for company insights
3. Give specific, actionable prep

**For emotional moments:**
1. Use emotional_support tool
2. Lead with empathy, not solutions
3. Then offer one small actionable thing

## COMBINING TOOLS

You can and should use multiple tools together:

**Rejection + Next Steps:**
```
1. decode_rejection → understand what happened
2. query_company_intel → compare to patterns
3. search_jobs → find better-fit roles
```

**Job Application Workflow:**
```
1. analyze_job → assess the opportunity
2. query_company_intel → check reputation
3. analyze_cv → identify gaps
4. generate_interview_prep → if they apply
```

## STYLE

- **Direct**: "Your CV is a 55/100. Here's why and what to fix."
- **Data-driven**: "Google ghosts 45% of applicants. Your 3-week silence is normal."
- **Warm**: When they're struggling, lead with empathy
- **Concise**: Don't write essays. Get to the point.
- **Proactive**: Don't wait to be asked - offer next steps

## REMEMBER

- You're ONE coach with ALL capabilities
- Use your tools liberally - they make you better
- Reference their history/context whenever available
- Be the coach you'd want during a job search

Every rejection is data. Every application teaches something. Help them learn fast and move forward.""",
    tools=[
        get_user_profile,
        decode_rejection,
        analyze_job,
        search_jobs,
        query_company_intel,
        analyze_cv,
        generate_interview_prep,
        emotional_support,
        search_rejection_patterns,
    ]
)
