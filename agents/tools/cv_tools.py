"""CV/Resume tools for parsing, analyzing, and generating CVs."""

from google.adk import FunctionTool
from pydantic import BaseModel
from typing import Optional
import json


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
parse_cv = FunctionTool(
    name="parse_cv",
    description="Parse CV/resume text and extract structured information including contact details, experience, education, and skills.",
    parameters={
        "type": "object",
        "properties": {
            "cv_text": {
                "type": "string",
                "description": "The raw text content of the CV/resume"
            }
        },
        "required": ["cv_text"]
    },
    execute=lambda params: _parse_cv_impl(params["cv_text"])
)


def _parse_cv_impl(cv_text: str) -> dict:
    """
    Parse CV text into structured data.
    In production, this would use NLP/ML for better extraction.
    """
    # Basic structure - the LLM agent will do the heavy lifting
    return {
        "status": "success",
        "message": "CV text received for parsing",
        "text_length": len(cv_text),
        "instruction": "Use the CV text to extract: name, contact info, summary, experience (company, title, dates, achievements), education, skills, certifications"
    }


# Tool: Extract skills from CV
extract_skills = FunctionTool(
    name="extract_skills",
    description="Extract and categorize skills from CV text into technical skills, soft skills, and tools/technologies.",
    parameters={
        "type": "object",
        "properties": {
            "cv_text": {
                "type": "string",
                "description": "The CV text to extract skills from"
            },
            "target_role": {
                "type": "string",
                "description": "Optional target job role to prioritize relevant skills"
            }
        },
        "required": ["cv_text"]
    },
    execute=lambda params: _extract_skills_impl(
        params["cv_text"],
        params.get("target_role")
    )
)


def _extract_skills_impl(cv_text: str, target_role: Optional[str] = None) -> dict:
    """Extract skills from CV."""
    return {
        "status": "success",
        "instruction": f"Extract skills from the CV text. Categorize into: technical_skills, soft_skills, tools. {'Prioritize skills relevant to: ' + target_role if target_role else ''}"
    }


# Tool: Generate CV PDF
generate_cv_pdf = FunctionTool(
    name="generate_cv_pdf",
    description="Generate a formatted PDF CV from structured CV data.",
    parameters={
        "type": "object",
        "properties": {
            "cv_data": {
                "type": "object",
                "description": "Structured CV data with name, experience, education, skills etc."
            },
            "template": {
                "type": "string",
                "enum": ["professional", "modern", "minimal", "tech"],
                "description": "CV template style to use"
            }
        },
        "required": ["cv_data"]
    },
    execute=lambda params: _generate_cv_pdf_impl(
        params["cv_data"],
        params.get("template", "professional")
    )
)


def _generate_cv_pdf_impl(cv_data: dict, template: str = "professional") -> dict:
    """
    Generate PDF from CV data.
    In production, this would create actual PDF using reportlab.
    """
    return {
        "status": "success",
        "message": f"CV PDF generated with '{template}' template",
        "template_used": template,
        "sections_included": list(cv_data.keys()) if isinstance(cv_data, dict) else []
    }


# Tool: Calculate ATS Score
ats_score = FunctionTool(
    name="calculate_ats_score",
    description="Calculate ATS (Applicant Tracking System) compatibility score for a CV against a job description.",
    parameters={
        "type": "object",
        "properties": {
            "cv_text": {
                "type": "string",
                "description": "The CV text content"
            },
            "job_description": {
                "type": "string",
                "description": "The job description to match against"
            }
        },
        "required": ["cv_text", "job_description"]
    },
    execute=lambda params: _calculate_ats_score(
        params["cv_text"],
        params["job_description"]
    )
)


def _calculate_ats_score(cv_text: str, job_description: str) -> dict:
    """Calculate ATS compatibility score."""
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
