"""Job search and analysis tools for Career Agent."""

from google.adk.tools import FunctionTool
from typing import Optional
import os
import httpx
import asyncio


async def _search_jsearch(
    keywords: str,
    location: str,
    salary_min: Optional[float],
    remote_only: bool,
    page: int,
    api_key: str
) -> dict:
    """Search using JSearch API."""
    query = f"{keywords} in {location}"
    if remote_only:
        query += " remote"

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://jsearch.p.rapidapi.com/search",
            params={
                "query": query,
                "page": str(page),
                "num_pages": "1"
            },
            headers={
                "X-RapidAPI-Key": api_key,
                "X-RapidAPI-Host": "jsearch.p.rapidapi.com"
            }
        )

        if response.status_code == 200:
            data = response.json()
            jobs = data.get("data", [])

            return {
                "status": "success",
                "source": "jsearch",
                "total_results": len(jobs),
                "page": page,
                "jobs": [
                    {
                        "title": job.get("job_title"),
                        "company": job.get("employer_name"),
                        "location": job.get("job_city", "") + ", " + job.get("job_country", ""),
                        "salary_min": job.get("job_min_salary"),
                        "salary_max": job.get("job_max_salary"),
                        "remote": job.get("job_is_remote", False),
                        "description": job.get("job_description", "")[:500],
                        "url": job.get("job_apply_link"),
                        "posted": job.get("job_posted_at_datetime_utc")
                    }
                    for job in jobs
                ]
            }

        return {
            "status": "error",
            "message": f"JSearch API error: {response.status_code}"
        }


async def _search_adzuna(
    keywords: str,
    location: str,
    salary_min: Optional[float],
    page: int,
    app_id: str,
    api_key: str
) -> dict:
    """Search using Adzuna API."""
    # Adzuna uses country codes
    country_map = {
        "uk": "gb", "united kingdom": "gb", "london": "gb",
        "us": "us", "usa": "us", "united states": "us", "new york": "us",
        "germany": "de", "berlin": "de",
        "france": "fr", "paris": "fr",
        "australia": "au", "sydney": "au",
    }

    country = "gb"  # Default
    for key, code in country_map.items():
        if key in location.lower():
            country = code
            break

    async with httpx.AsyncClient() as client:
        params = {
            "app_id": app_id,
            "app_key": api_key,
            "what": keywords,
            "where": location,
            "results_per_page": 20,
            "page": page
        }

        if salary_min:
            params["salary_min"] = int(salary_min)

        response = await client.get(
            f"https://api.adzuna.com/v1/api/jobs/{country}/search/{page}",
            params=params
        )

        if response.status_code == 200:
            data = response.json()
            jobs = data.get("results", [])

            return {
                "status": "success",
                "source": "adzuna",
                "total_results": data.get("count", 0),
                "page": page,
                "jobs": [
                    {
                        "title": job.get("title"),
                        "company": job.get("company", {}).get("display_name"),
                        "location": job.get("location", {}).get("display_name"),
                        "salary_min": job.get("salary_min"),
                        "salary_max": job.get("salary_max"),
                        "description": job.get("description", "")[:500],
                        "url": job.get("redirect_url"),
                        "posted": job.get("created")
                    }
                    for job in jobs
                ]
            }

        return {
            "status": "error",
            "message": f"Adzuna API error: {response.status_code}"
        }


async def _search_jobs_impl(
    keywords: str,
    location: str,
    salary_min: Optional[float] = None,
    remote_only: bool = False,
    page: int = 1
) -> dict:
    """
    Search jobs using JSearch API (RapidAPI).
    Falls back to Adzuna if JSearch unavailable.
    """
    jsearch_key = os.getenv("JSEARCH_API_KEY")

    if jsearch_key:
        return await _search_jsearch(keywords, location, salary_min, remote_only, page, jsearch_key)

    # Fallback to Adzuna
    adzuna_id = os.getenv("ADZUNA_APP_ID")
    adzuna_key = os.getenv("ADZUNA_API_KEY")

    if adzuna_id and adzuna_key:
        return await _search_adzuna(keywords, location, salary_min, page, adzuna_id, adzuna_key)

    return {
        "status": "error",
        "message": "No job API keys configured. Set JSEARCH_API_KEY or ADZUNA_APP_ID + ADZUNA_API_KEY in .env"
    }


def _search_jobs_sync(
    keywords: str,
    location: str,
    salary_min: Optional[float] = None,
    remote_only: bool = False,
    page: int = 1
) -> dict:
    """Synchronous wrapper for job search."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    _search_jobs_impl(keywords, location, salary_min, remote_only, page)
                )
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(
                _search_jobs_impl(keywords, location, salary_min, remote_only, page)
            )
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Tool: Search Jobs
@FunctionTool
def search_jobs(
    keywords: str,
    location: str,
    salary_min: float = 0,
    remote_only: bool = False,
    page: int = 1
) -> dict:
    """Search for job listings globally using multiple job board APIs. Returns matching jobs with title, company, location, salary, and description.

    Args:
        keywords: Job title or keywords to search for (e.g., 'Product Manager', 'Software Engineer')
        location: Location to search in (e.g., 'London', 'New York', 'Remote')
        salary_min: Minimum salary (optional)
        remote_only: Only return remote jobs
        page: Page number for pagination (default 1)
    """
    return _search_jobs_sync(
        keywords,
        location,
        salary_min if salary_min > 0 else None,
        remote_only,
        page
    )


# Tool: Analyze Job Description
@FunctionTool
def analyze_job_description(job_description: str, job_title: str = "") -> dict:
    """Analyze a job description for red flags, requirements, salary insights, and company culture signals.

    Args:
        job_description: The full job description text
        job_title: The job title (optional, for context)
    """
    return {
        "status": "success",
        "instruction": f"""Analyze this job description{' for ' + job_title if job_title else ''} and provide:

        1. fit_score (0-100): Overall role attractiveness
        2. red_flags: List of concerning phrases/requirements with explanations
        3. green_flags: Positive signals about the role/company
        4. requirements:
           - must_have: Essential requirements
           - nice_to_have: Preferred but not required
           - hidden: Implied requirements not explicitly stated
        5. salary_analysis:
           - stated_range: If mentioned
           - estimated_range: Based on role/location if not stated
           - transparency_score: How open are they about compensation
        6. culture_signals: What the language suggests about work environment
        7. recommendation: Apply / Maybe / Skip with reasoning
        8. questions_to_ask: What to clarify in an interview"""
    }


# Tool: Match CV to Job
@FunctionTool
def match_cv_to_job(cv_text: str, job_description: str) -> dict:
    """Calculate how well a CV matches a specific job description and identify gaps.

    Args:
        cv_text: The CV/resume text
        job_description: The job description to match against
    """
    return {
        "status": "success",
        "instruction": """Compare the CV against the job description and provide:

        1. overall_fit_score (0-100): How well the candidate matches
        2. skills_match:
           - matched: Skills in CV that match JD requirements
           - missing: Required skills not found in CV
           - extra: CV skills not in JD (transferable value)
        3. experience_match:
           - years_required: From JD
           - years_candidate: From CV
           - relevance_score: How relevant is their experience
        4. education_match: Does education meet requirements
        5. gaps: Specific gaps to address
        6. strengths: Where candidate exceeds requirements
        7. cv_improvements: Specific changes to improve match
        8. cover_letter_points: Key points to emphasize in application"""
    }
