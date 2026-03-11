"""Tracker Tools - Add and manage applications in the user's tracker.

These tools allow Maya to:
1. Add decoded rejections to the tracker
2. Link rejections to existing applications
3. Get the user's application list to find matches
"""

import os
import httpx
from google.adk.tools import FunctionTool
from typing import Optional, List

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8787")


# ============================================================================
# TOOL: Get User's Applications (for linking)
# ============================================================================

async def _get_applications_impl(user_id: str) -> dict:
    """Get user's applications from the tracker."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{BACKEND_URL}/api/applications/maya",
                headers={"X-User-Id": user_id}
            )

            if response.status_code == 200:
                data = response.json()
                apps = data.get("applications", [])
                # Simplify for Maya - just company, role, status
                simplified = []
                for app in apps[:20]:  # Limit to 20 most recent
                    simplified.append({
                        "id": app.get("id"),
                        "company": app.get("company"),
                        "role": app.get("role"),
                        "outcome": app.get("outcome"),
                        "dateApplied": app.get("dateApplied")
                    })
                return {
                    "status": "success",
                    "count": len(apps),
                    "applications": simplified
                }
            else:
                return {
                    "status": "error",
                    "message": f"Failed to fetch: {response.status_code}"
                }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _get_applications_sync(user_id: str) -> dict:
    """Synchronous wrapper."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _get_applications_impl(user_id))
                return future.result(timeout=15)
        else:
            return loop.run_until_complete(_get_applications_impl(user_id))
    except Exception as e:
        return {"status": "error", "message": str(e)}


@FunctionTool
def get_user_applications(user_id: str = "") -> dict:
    """Get the user's tracked applications to find matches for linking rejections.

    USE THIS WHEN:
    - User says they got rejected from a company and you want to check if they have an existing application
    - Before adding a rejection, to see if it should be linked to an existing entry
    - User asks about their applications or tracker

    Args:
        user_id: The user's ID (passed from conversation context)

    Returns:
        List of applications with id, company, role, outcome, dateApplied
    """
    if not user_id:
        return {
            "status": "not_authenticated",
            "message": "User not signed in - can't access their tracker"
        }
    return _get_applications_sync(user_id)


# ============================================================================
# TOOL: Add Rejection to Tracker
# ============================================================================

async def _add_rejection_impl(
    user_id: str,
    company: str,
    role: str,
    rejection_category: str,
    stage_reached: str = "",
    confidence: float = 0.8,
    signals: List[str] = None,
    what_it_means: str = ""
) -> dict:
    """Add a decoded rejection to the user's tracker."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Map stage to outcome
            outcome_map = {
                "ats_filter": "rejected_ats",
                "recruiter_screen": "rejected_recruiter",
                "hiring_manager": "rejected_hm",
                "final_round": "rejected_final",
                "unknown": "rejected_ats"
            }
            outcome = outcome_map.get(stage_reached, "rejected_ats")

            payload = {
                "company": company,
                "role": role or "Unknown Role",
                "outcome": outcome,
                "rejectionAnalysis": {
                    "category": rejection_category,
                    "confidence": confidence,
                    "signals": signals or [],
                    "stageReached": stage_reached or "ats_filter",  # Default to ATS if unknown
                    "whatItMeans": what_it_means,
                    "decodedAt": "now"
                }
            }

            response = await client.post(
                f"{BACKEND_URL}/api/applications/maya",
                json=payload,
                headers={
                    "X-User-Id": user_id,
                    "Content-Type": "application/json"
                }
            )

            if response.status_code == 200:
                return {
                    "status": "success",
                    "message": f"Added {company} rejection to tracker",
                    "company": company,
                    "role": role
                }
            else:
                return {
                    "status": "error",
                    "message": f"Failed to save: {response.status_code}"
                }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _add_rejection_sync(**kwargs) -> dict:
    """Synchronous wrapper."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _add_rejection_impl(**kwargs))
                return future.result(timeout=15)
        else:
            return loop.run_until_complete(_add_rejection_impl(**kwargs))
    except Exception as e:
        return {"status": "error", "message": str(e)}


@FunctionTool
def add_rejection_to_tracker(
    company: str,
    role: str = "",
    rejection_category: str = "Template",
    stage_reached: str = "ats_filter",
    confidence: float = 0.8,
    signals: str = "",
    what_it_means: str = "",
    user_id: str = ""
) -> dict:
    """Add a decoded rejection to the user's application tracker.

    USE THIS AFTER decoding a rejection to save it to their tracker.
    The rejection will appear in their Tracker tab with full analysis.

    Args:
        company: Company name (required)
        role: Job role (use "Unknown Role" if not known)
        rejection_category: Category from decode (Template, Soft No, Hard No, etc.)
        stage_reached: ats_filter, recruiter_screen, hiring_manager, final_round
        confidence: Confidence score from decode (0-1)
        signals: Comma-separated signals from the rejection
        what_it_means: Human-readable explanation
        user_id: User's ID (from context)

    Returns:
        Success/failure status
    """
    if not user_id:
        return {
            "status": "not_authenticated",
            "message": "User not signed in - rejection decoded but not saved to tracker. They can sign in to save it."
        }

    signals_list = [s.strip() for s in signals.split(",") if s.strip()] if signals else []

    return _add_rejection_sync(
        user_id=user_id,
        company=company,
        role=role,
        rejection_category=rejection_category,
        stage_reached=stage_reached,
        confidence=confidence,
        signals=signals_list,
        what_it_means=what_it_means
    )


# ============================================================================
# TOOL: Link Rejection to Existing Application
# ============================================================================

async def _link_rejection_impl(
    user_id: str,
    application_id: str,
    rejection_category: str,
    stage_reached: str,
    confidence: float,
    signals: List[str],
    what_it_means: str
) -> dict:
    """Link a rejection analysis to an existing application."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Map stage to outcome
            outcome_map = {
                "ats_filter": "rejected_ats",
                "recruiter_screen": "rejected_recruiter",
                "hiring_manager": "rejected_hm",
                "final_round": "rejected_final",
                "unknown": "rejected_ats"
            }
            outcome = outcome_map.get(stage_reached, "rejected_ats")

            payload = {
                "outcome": outcome,
                "rejectionAnalysis": {
                    "category": rejection_category,
                    "confidence": confidence,
                    "signals": signals,
                    "stageReached": stage_reached,
                    "whatItMeans": what_it_means,
                    "decodedAt": "now"
                }
            }

            response = await client.patch(
                f"{BACKEND_URL}/api/applications/maya/{application_id}",
                json=payload,
                headers={
                    "X-User-Id": user_id,
                    "Content-Type": "application/json"
                }
            )

            if response.status_code == 200:
                return {
                    "status": "success",
                    "message": "Linked rejection to existing application",
                    "applicationId": application_id
                }
            else:
                return {
                    "status": "error",
                    "message": f"Failed to link: {response.status_code}"
                }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _link_rejection_sync(**kwargs) -> dict:
    """Synchronous wrapper."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _link_rejection_impl(**kwargs))
                return future.result(timeout=15)
        else:
            return loop.run_until_complete(_link_rejection_impl(**kwargs))
    except Exception as e:
        return {"status": "error", "message": str(e)}


@FunctionTool
def link_rejection_to_application(
    application_id: str,
    rejection_category: str,
    stage_reached: str,
    confidence: float = 0.8,
    signals: str = "",
    what_it_means: str = "",
    user_id: str = ""
) -> dict:
    """Link a decoded rejection to an existing application in the tracker.

    USE THIS when:
    - User got rejected from a company they already have in their tracker
    - You found a matching application using get_user_applications

    Args:
        application_id: ID of the existing application to update
        rejection_category: Category from decode
        stage_reached: ats_filter, recruiter_screen, hiring_manager, final_round
        confidence: Confidence score
        signals: Comma-separated signals
        what_it_means: Human-readable explanation
        user_id: User's ID

    Returns:
        Success/failure status
    """
    if not user_id:
        return {
            "status": "not_authenticated",
            "message": "User not signed in"
        }

    if not application_id:
        return {
            "status": "error",
            "message": "application_id is required"
        }

    signals_list = [s.strip() for s in signals.split(",") if s.strip()] if signals else []

    return _link_rejection_sync(
        user_id=user_id,
        application_id=application_id,
        rejection_category=rejection_category,
        stage_reached=stage_reached,
        confidence=confidence,
        signals=signals_list,
        what_it_means=what_it_means
    )
