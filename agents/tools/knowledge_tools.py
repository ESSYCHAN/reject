"""Knowledge Base Tools - Query REJECT's community intelligence database."""

import os
import httpx
from google.adk.tools import FunctionTool


# Backend URL for knowledge base queries
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8787")


async def _query_company_intel_impl(company_name: str) -> dict:
    """Query REJECT's knowledge base for company-specific intelligence."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try the knowledge base endpoint first
            response = await client.get(
                f"{BACKEND_URL}/api/knowledge/company/{company_name}",
                params={"preview": "true"}  # Allow early-stage data
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "status": "success",
                    "company": company_name,
                    "data": data,
                    "summary": _format_company_summary(company_name, data)
                }
            elif response.status_code == 404:
                return {
                    "status": "no_data",
                    "company": company_name,
                    "message": f"No community data available for {company_name} yet. Be the first to track an application here!"
                }
            else:
                return {
                    "status": "error",
                    "company": company_name,
                    "message": f"Failed to fetch data: {response.status_code}"
                }
    except httpx.TimeoutException:
        return {
            "status": "timeout",
            "company": company_name,
            "message": "Knowledge base query timed out. Proceeding without community data."
        }
    except Exception as e:
        return {
            "status": "error",
            "company": company_name,
            "message": f"Error querying knowledge base: {str(e)}"
        }


def _format_company_summary(company_name: str, data: dict) -> str:
    """Format company data into a readable summary for agents."""
    parts = [f"REJECT Community Data for {company_name}:"]

    # Total applications
    total_apps = data.get("totalApplications", 0)
    if total_apps:
        parts.append(f"- {total_apps} applications tracked by REJECT users")

    # Ghost rate
    ghost_rate = data.get("ghostRate")
    if ghost_rate is not None:
        rate_str = f"{ghost_rate:.0f}%" if isinstance(ghost_rate, (int, float)) else ghost_rate
        warning = " HIGH" if (isinstance(ghost_rate, (int, float)) and ghost_rate > 40) else ""
        parts.append(f"- Ghost rate: {rate_str}{warning}")

    # Response time
    avg_days = data.get("avgDaysToResponse")
    if avg_days:
        parts.append(f"- Avg response time: {avg_days:.0f} days")

    # Rejection categories
    categories = data.get("rejectionCategories", [])
    if categories:
        top_cat = categories[0] if categories else None
        if top_cat:
            parts.append(f"- Most common rejection type: {top_cat.get('category')} ({top_cat.get('percentage', 0):.0f}%)")

    # ATS stages
    stages = data.get("atsStages", [])
    if stages:
        ats_filter = next((s for s in stages if s.get("stage") == "ats_filter"), None)
        if ats_filter:
            parts.append(f"- ATS filter rate: {ats_filter.get('percentage', 0):.0f}%")

    # Top signals
    signals = data.get("topSignals", [])
    if signals:
        signal_names = [s.get("signal", "") for s in signals[:3] if s.get("signal")]
        if signal_names:
            parts.append(f"- Top rejection signals: {', '.join(signal_names)}")

    if len(parts) == 1:
        return f"Limited data available for {company_name}."

    return "\n".join(parts)


# Synchronous wrapper for the tool
def _query_company_intel_sync(company_name: str) -> dict:
    """Synchronous wrapper for company intel query."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If we're already in an async context, create a new task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _query_company_intel_impl(company_name))
                return future.result(timeout=15)
        else:
            return loop.run_until_complete(_query_company_intel_impl(company_name))
    except Exception as e:
        return {
            "status": "error",
            "company": company_name,
            "message": f"Error: {str(e)}"
        }


# The FunctionTool for querying company intelligence
@FunctionTool
def query_company_intel(company_name: str) -> dict:
    """Query REJECT's community knowledge base for company-specific intelligence.

    Returns aggregated data from all REJECT users who applied to this company:
    - Total applications tracked
    - Ghost rate (% who never heard back)
    - Average response time in days
    - Most common rejection types
    - ATS filter rate
    - Top rejection signals (e.g., "Overqualified", "Experience mismatch")

    USE THIS TOOL:
    - Before analyzing a job posting (to warn about high ghost rates)
    - When decoding a rejection (to see if it matches community patterns)
    - When user asks about a specific company

    IMPORTANT: This is community-aggregated data, not the user's personal history.

    Args:
        company_name: The company name to look up (e.g., 'Google', 'Stripe', 'Meta')
    """
    return _query_company_intel_sync(company_name)


async def _get_market_patterns_impl() -> dict:
    """Get market-wide rejection patterns across all companies."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{BACKEND_URL}/api/knowledge/market")

            if response.status_code == 200:
                return {
                    "status": "success",
                    "data": response.json()
                }
            else:
                return {
                    "status": "error",
                    "message": f"Failed to fetch market data: {response.status_code}"
                }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error: {str(e)}"
        }


def _get_market_patterns_sync() -> dict:
    """Synchronous wrapper for market patterns query."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _get_market_patterns_impl())
                return future.result(timeout=15)
        else:
            return loop.run_until_complete(_get_market_patterns_impl())
    except Exception as e:
        return {"status": "error", "message": str(e)}


# The FunctionTool for market-wide patterns
@FunctionTool
def get_market_patterns() -> dict:
    """Get market-wide rejection patterns across ALL companies in REJECT's database.

    Returns:
    - Total rejections tracked
    - Overall rejection category distribution
    - ATS stage distribution across all companies
    - Top 20 rejection signals globally
    - Response time patterns
    - Top companies by rejection count

    USE THIS TOOL:
    - To give users context ("Your 60% ATS rejection rate is above the market average of 45%")
    - To benchmark their performance
    - To identify market-wide trends
    """
    return _get_market_patterns_sync()
