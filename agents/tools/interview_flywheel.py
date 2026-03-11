"""Interview Flywheel Tools - Collect and query interview experiences.

These tools power the interview knowledge flywheel:
1. Users share their interview experiences after interviews
2. Data gets aggregated (anonymized)
3. Future users get real intel about companies before their interviews

This is REAL data from the REJECT community, not LLM hallucinations.
"""

import os
import httpx
from google.adk.tools import FunctionTool
from typing import Optional, List

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8787")


# ============================================================================
# TOOL: Save Interview Experience
# ============================================================================

async def _save_interview_impl(
    company: str,
    role: str,
    total_rounds: Optional[int] = None,
    interview_stages: Optional[List[str]] = None,
    interview_format: Optional[str] = None,
    duration_weeks: Optional[int] = None,
    questions_asked: Optional[List[dict]] = None,
    prep_materials: Optional[str] = None,
    interviewer_titles: Optional[List[str]] = None,
    difficulty_rating: Optional[int] = None,
    interviewer_friendliness: Optional[int] = None,
    process_transparency: Optional[int] = None,
    outcome: Optional[str] = None,
    tips_for_others: Optional[str] = None,
    would_interview_again: Optional[bool] = None,
    user_id: Optional[str] = None
) -> dict:
    """Save an interview experience to the flywheel."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            payload = {
                "company": company,
                "role": role,
                "totalRounds": total_rounds,
                "interviewStages": interview_stages,
                "interviewFormat": interview_format,
                "durationWeeks": duration_weeks,
                "questionsAsked": questions_asked,
                "prepMaterials": prep_materials,
                "interviewerTitles": interviewer_titles,
                "difficultyRating": difficulty_rating,
                "interviewerFriendliness": interviewer_friendliness,
                "processTransparency": process_transparency,
                "outcome": outcome,
                "tipsForOthers": tips_for_others,
                "wouldInterviewAgain": would_interview_again
            }
            # Remove None values
            payload = {k: v for k, v in payload.items() if v is not None}

            headers = {}
            if user_id:
                headers["X-User-Id"] = user_id

            response = await client.post(
                f"{BACKEND_URL}/api/interviews",
                json=payload,
                headers=headers
            )

            if response.status_code == 200:
                return {
                    "status": "success",
                    "message": "Interview experience saved! This helps future candidates."
                }
            else:
                return {
                    "status": "error",
                    "message": f"Failed to save: {response.status_code}"
                }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


def _save_interview_sync(**kwargs) -> dict:
    """Synchronous wrapper."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _save_interview_impl(**kwargs))
                return future.result(timeout=20)
        else:
            return loop.run_until_complete(_save_interview_impl(**kwargs))
    except Exception as e:
        return {"status": "error", "message": str(e)}


@FunctionTool
def save_interview_experience(
    company: str,
    role: str,
    total_rounds: int = 0,
    interview_stages: str = "",
    interview_format: str = "",
    duration_weeks: int = 0,
    questions_asked: str = "",
    prep_materials: str = "",
    interviewer_titles: str = "",
    difficulty_rating: int = 0,
    interviewer_friendliness: int = 0,
    process_transparency: int = 0,
    outcome: str = "",
    tips_for_others: str = "",
    would_interview_again: bool = False
) -> dict:
    """Save a user's interview experience to help future candidates.

    USE THIS TOOL WHEN:
    - User tells you about an interview they just had
    - User shares questions they were asked
    - User wants to share their experience to help others
    - After discussing an interview outcome (offer, rejection, etc.)

    IMPORTANT: Collect as much info as possible conversationally, then save.
    Don't make them fill out a form - extract details from the conversation.

    Args:
        company: Company name (required)
        role: Job title they interviewed for (required)
        total_rounds: How many rounds total
        interview_stages: Comma-separated stages (e.g., "phone_screen,technical,onsite,team_match")
        interview_format: "remote", "onsite", or "hybrid"
        duration_weeks: How long the process took in weeks
        questions_asked: Comma-separated questions they were asked
        prep_materials: What helped them prepare
        interviewer_titles: Comma-separated titles of interviewers (e.g., "Engineering Manager,Senior Engineer")
        difficulty_rating: 1-5 (1=easy, 5=very hard)
        interviewer_friendliness: 1-5 (1=cold, 5=very friendly)
        process_transparency: 1-5 (1=no info, 5=always knew where they stood)
        outcome: "offer", "rejected", "withdrew", or "pending"
        tips_for_others: Advice for future candidates
        would_interview_again: Would they try again at this company?

    Returns:
        Confirmation that the experience was saved.
    """
    # Parse comma-separated strings into lists
    stages_list = [s.strip() for s in interview_stages.split(",") if s.strip()] if interview_stages else None
    questions_list = [{"question": q.strip()} for q in questions_asked.split(",") if q.strip()] if questions_asked else None
    titles_list = [t.strip() for t in interviewer_titles.split(",") if t.strip()] if interviewer_titles else None

    return _save_interview_sync(
        company=company,
        role=role,
        total_rounds=total_rounds if total_rounds > 0 else None,
        interview_stages=stages_list,
        interview_format=interview_format if interview_format else None,
        duration_weeks=duration_weeks if duration_weeks > 0 else None,
        questions_asked=questions_list,
        prep_materials=prep_materials if prep_materials else None,
        interviewer_titles=titles_list,
        difficulty_rating=difficulty_rating if 1 <= difficulty_rating <= 5 else None,
        interviewer_friendliness=interviewer_friendliness if 1 <= interviewer_friendliness <= 5 else None,
        process_transparency=process_transparency if 1 <= process_transparency <= 5 else None,
        outcome=outcome if outcome else None,
        tips_for_others=tips_for_others if tips_for_others else None,
        would_interview_again=would_interview_again if outcome else None
    )


# ============================================================================
# TOOL: Query Interview Intel
# ============================================================================

async def _query_interview_intel_impl(company: str, role: Optional[str] = None) -> dict:
    """Query interview intel for a company."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            params = {"role": role} if role else {}
            response = await client.get(
                f"{BACKEND_URL}/api/interviews/intel/{company}",
                params=params
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("hasData"):
                    return {
                        "status": "success",
                        "company": company,
                        "data": data,
                        "summary": _format_interview_summary(data)
                    }
                else:
                    return {
                        "status": "no_data",
                        "company": company,
                        "message": f"No interview data for {company} yet."
                    }
            else:
                return {
                    "status": "error",
                    "message": f"Failed to fetch: {response.status_code}"
                }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


def _format_interview_summary(data: dict) -> str:
    """Format interview intel into a readable summary."""
    parts = [f"Interview Intel for {data.get('company', 'Unknown')}:"]

    total = data.get("totalInterviews", 0)
    if total:
        parts.append(f"- Based on {total} REJECT user{'s' if total > 1 else ''}")

    if data.get("avgRounds"):
        parts.append(f"- Average {data['avgRounds']} interview rounds")

    if data.get("avgDurationWeeks"):
        parts.append(f"- Process takes about {data['avgDurationWeeks']} weeks")

    if data.get("avgDifficulty"):
        difficulty = data["avgDifficulty"]
        level = "Easy" if difficulty <= 2 else "Moderate" if difficulty <= 3.5 else "Hard"
        parts.append(f"- Difficulty: {level} ({difficulty}/5)")

    if data.get("avgFriendliness"):
        parts.append(f"- Interviewer friendliness: {data['avgFriendliness']}/5")

    if data.get("offerRate") is not None:
        parts.append(f"- Offer rate: {data['offerRate']}%")

    # Common stages
    stages = data.get("commonStages", [])
    if stages:
        stage_names = [s["stage"] for s in stages[:4]]
        parts.append(f"- Typical stages: {' → '.join(stage_names)}")

    # Top questions
    questions = data.get("topQuestions", [])
    if questions:
        parts.append("- Common questions:")
        for q in questions[:3]:
            parts.append(f"  • \"{q['question']}\"")

    # Success tips
    tips = data.get("successTips", [])
    if tips:
        parts.append("- Tips from people who got offers:")
        for tip in tips[:2]:
            parts.append(f"  • {tip}")

    return "\n".join(parts)


def _query_interview_intel_sync(company: str, role: str = "") -> dict:
    """Synchronous wrapper."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    _query_interview_intel_impl(company, role if role else None)
                )
                return future.result(timeout=15)
        else:
            return loop.run_until_complete(
                _query_interview_intel_impl(company, role if role else None)
            )
    except Exception as e:
        return {"status": "error", "message": str(e)}


@FunctionTool
def query_interview_intel(company: str, role: str = "") -> dict:
    """Get interview intelligence for a company from the REJECT community.

    This returns REAL data from users who interviewed there:
    - How many rounds to expect
    - How long the process takes
    - Common interview questions
    - Difficulty rating
    - Tips from people who got offers

    USE THIS TOOL WHEN:
    - User says they have an interview coming up
    - User asks "what's the interview like at X?"
    - User wants to know what to expect
    - Before generating interview prep (to include real intel)

    IMPORTANT: This is community data. If we don't have data for a company,
    say so and offer to help them prepare anyway. Then after their interview,
    ask them to share their experience!

    Args:
        company: Company name to look up
        role: Optional role to filter by (e.g., "engineering", "product")

    Returns:
        Interview intel including rounds, duration, questions, difficulty, tips
    """
    return _query_interview_intel_sync(company, role)
