"""Job search and analysis tools for Career Agent."""

from google.adk.tools import FunctionTool
from typing import Optional
import os
import httpx


# Tool: Search Jobs
search_jobs = FunctionTool(
    name="search_jobs",
    description="Search for job listings globally using multiple job board APIs. Returns matching jobs with title, company, location, salary, and description.",
    parameters={
        "type": "object",
        "properties": {
            "keywords": {
                "type": "string",
                "description": "Job title or keywords to search for (e.g., 'Product Manager', 'Software Engineer')"
            },
            "location": {
                "type": "string",
                "description": "Location to search in (e.g., 'London', 'New York', 'Remote')"
            },
            "salary_min": {
                "type": "number",
                "description": "Minimum salary (optional)"
            },
            "remote_only": {
                "type": "boolean",
                "description": "Only return remote jobs"
            },
            "page": {
                "type": "integer",
                "description": "Page number for pagination (default 1)"
            }
        },
        "required": ["keywords", "location"]
    },
    execute=lambda params: _search_jobs_impl(
        params["keywords"],
        params["location"],
        params.get("salary_min"),
        params.get("remote_only", False),
        params.get("page", 1)
    )
)


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


# Tool: Analyze Job Description
analyze_job_description = FunctionTool(
    name="analyze_job_description",
    description="Analyze a job description for red flags, requirements, salary insights, and company culture signals.",
    parameters={
        "type": "object",
        "properties": {
            "job_description": {
                "type": "string",
                "description": "The full job description text"
            },
            "job_title": {
                "type": "string",
                "description": "The job title (optional, for context)"
            }
        },
        "required": ["job_description"]
    },
    execute=lambda params: _analyze_jd_impl(
        params["job_description"],
        params.get("job_title")
    )
)


def _analyze_jd_impl(job_description: str, job_title: Optional[str] = None) -> dict:
    """Analyze job description for insights."""
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
match_cv_to_job = FunctionTool(
    name="match_cv_to_job",
    description="Calculate how well a CV matches a specific job description and identify gaps.",
    parameters={
        "type": "object",
        "properties": {
            "cv_text": {
                "type": "string",
                "description": "The CV/resume text"
            },
            "job_description": {
                "type": "string",
                "description": "The job description to match against"
            }
        },
        "required": ["cv_text", "job_description"]
    },
    execute=lambda params: _match_cv_job_impl(
        params["cv_text"],
        params["job_description"]
    )
)


def _match_cv_job_impl(cv_text: str, job_description: str) -> dict:
    """Match CV against job description."""
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
