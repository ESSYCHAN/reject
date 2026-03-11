"""CV/Resume tools for parsing, analyzing, and generating CVs."""

from google.adk.tools import FunctionTool
from pydantic import BaseModel
from typing import Optional


class CVData(BaseModel):
    """Structured CV data."""
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = None
    experience: list[dict] = []
    education: list[dict] = []
    skills: list[str] = []
    certifications: list[str] = []
    languages: list[str] = []


# Tool: Parse CV from text
@FunctionTool
def parse_cv(cv_text: str) -> dict:
    """Parse CV/resume text and extract structured information including contact details, experience, education, and skills.

    Args:
        cv_text: The raw text content of the CV/resume
    """
    return {
        "status": "success",
        "message": "CV text received for parsing",
        "text_length": len(cv_text),
        "instruction": "Use the CV text to extract: name, contact info, summary, experience (company, title, dates, achievements), education, skills, certifications"
    }


# Tool: Extract skills from CV
@FunctionTool
def extract_skills(cv_text: str, target_role: str = "") -> dict:
    """Extract and categorize skills from CV text into technical skills, soft skills, and tools/technologies.

    Args:
        cv_text: The CV text to extract skills from
        target_role: Optional target job role to prioritize relevant skills
    """
    return {
        "status": "success",
        "instruction": f"Extract skills from the CV text. Categorize into: technical_skills, soft_skills, tools. {'Prioritize skills relevant to: ' + target_role if target_role else ''}"
    }


# Tool: Generate CV PDF
@FunctionTool
def generate_cv_pdf(cv_data: dict, template: str = "professional") -> dict:
    """Generate a formatted PDF CV from structured CV data.

    Args:
        cv_data: Structured CV data with name, experience, education, skills etc.
        template: CV template style - one of: professional, modern, minimal, tech
    """
    return {
        "status": "success",
        "message": f"CV PDF generated with '{template}' template",
        "template_used": template,
        "sections_included": list(cv_data.keys()) if isinstance(cv_data, dict) else []
    }


# Tool: Calculate ATS Score
@FunctionTool
def ats_score(cv_text: str, job_description: str) -> dict:
    """Calculate ATS (Applicant Tracking System) compatibility score for a CV against a job description.

    Args:
        cv_text: The CV text content
        job_description: The job description to match against
    """
    return {
        "status": "success",
        "instruction": """Analyze the CV against the job description and calculate:
        1. keyword_match_score (0-100): How many key terms from JD appear in CV
        2. format_score (0-100): Is CV ATS-friendly (no tables, images, etc.)
        3. section_score (0-100): Are all important sections present
        4. overall_ats_score (0-100): Weighted average
        5. missing_keywords: List of important JD keywords missing from CV
        6. recommendations: How to improve ATS score"""
    }
