"""CV Builder Agent - Creates CVs from scratch through guided conversation."""

from google.adk import LlmAgent, FunctionTool
from pydantic import BaseModel
from typing import Optional
import json


class CVSection(BaseModel):
    """A section of the CV being built."""
    name: str
    content: dict
    completed: bool = False


# Tool: Save CV Section
save_section = FunctionTool(
    name="save_cv_section",
    description="Save a completed section of the CV being built.",
    parameters={
        "type": "object",
        "properties": {
            "section_name": {
                "type": "string",
                "enum": ["contact", "summary", "experience", "education", "skills", "certifications", "languages", "projects"],
                "description": "Which section to save"
            },
            "content": {
                "type": "object",
                "description": "The structured content for this section"
            }
        },
        "required": ["section_name", "content"]
    },
    execute=lambda params: {
        "status": "success",
        "section": params["section_name"],
        "saved": True,
        "message": f"Saved {params['section_name']} section"
    }
)


# Tool: Generate Achievement Bullet
generate_bullet = FunctionTool(
    name="generate_achievement_bullet",
    description="Transform a job responsibility or achievement description into a powerful, metrics-driven CV bullet point.",
    parameters={
        "type": "object",
        "properties": {
            "raw_description": {
                "type": "string",
                "description": "The user's description of what they did"
            },
            "job_title": {
                "type": "string",
                "description": "Their job title for context"
            },
            "target_role": {
                "type": "string",
                "description": "Role they're targeting (optional)"
            }
        },
        "required": ["raw_description"]
    },
    execute=lambda params: {
        "status": "success",
        "instruction": f"""Transform this into a powerful CV bullet point:

        Raw: {params['raw_description']}
        Job Title: {params.get('job_title', 'Not specified')}
        Target Role: {params.get('target_role', 'Not specified')}

        Guidelines:
        1. Start with a strong action verb
        2. Include quantifiable metrics (%, $, #) where possible
        3. Show impact/result, not just responsibility
        4. Keep to 1-2 lines
        5. Use industry-relevant keywords

        Provide:
        - bullet: The transformed bullet point
        - alternatives: 2 alternative versions
        - metrics_suggestions: What metrics they could add if they have the data"""
    }
)


# Tool: Generate Professional Summary
generate_summary = FunctionTool(
    name="generate_professional_summary",
    description="Generate a professional summary/objective for the CV based on experience and target role.",
    parameters={
        "type": "object",
        "properties": {
            "experience_years": {
                "type": "integer",
                "description": "Years of experience"
            },
            "current_role": {
                "type": "string",
                "description": "Current or most recent job title"
            },
            "target_role": {
                "type": "string",
                "description": "Role they're targeting"
            },
            "key_skills": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Top skills to highlight"
            },
            "key_achievements": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Top achievements to mention"
            }
        },
        "required": ["target_role"]
    },
    execute=lambda params: {
        "status": "success",
        "instruction": f"""Generate a professional summary for:

        Target Role: {params['target_role']}
        Experience: {params.get('experience_years', 'Not specified')} years
        Current Role: {params.get('current_role', 'Not specified')}
        Key Skills: {', '.join(params.get('key_skills', []))}
        Achievements: {', '.join(params.get('key_achievements', []))}

        Provide:
        - summary: 3-4 sentence professional summary
        - objective_version: Alternative as career objective (for career changers)
        - headline_version: LinkedIn-style one-liner

        Make it specific, not generic. Avoid clichés like "hard-working team player"."""
    }
)


# Tool: Export CV
export_cv = FunctionTool(
    name="export_cv",
    description="Export the completed CV to a specific format.",
    parameters={
        "type": "object",
        "properties": {
            "cv_data": {
                "type": "object",
                "description": "Complete CV data structure"
            },
            "format": {
                "type": "string",
                "enum": ["pdf", "docx", "txt", "json"],
                "description": "Export format"
            },
            "template": {
                "type": "string",
                "enum": ["professional", "modern", "minimal", "tech", "creative"],
                "description": "Visual template to use"
            }
        },
        "required": ["cv_data", "format"]
    },
    execute=lambda params: {
        "status": "success",
        "format": params["format"],
        "template": params.get("template", "professional"),
        "message": f"CV exported as {params['format'].upper()}",
        "instruction": "In production, this generates actual file. Return confirmation and offer next steps."
    }
)


# The CV Builder Agent
cv_builder_agent = LlmAgent(
    name="cv_builder",
    model="gemini-2.0-flash",
    description="Creates professional CVs from scratch through guided conversation. Helps users who don't have a CV or want to build a new one.",
    instruction="""You are a professional CV/Resume builder assistant. Your job is to help users create a compelling CV from scratch through friendly conversation.

## Your Approach

1. **Start by understanding their goal**
   - What role are they targeting?
   - What's their experience level?
   - Any specific companies or industries?

2. **Guide them through sections in order**
   - Contact Information (name, email, phone, location, LinkedIn)
   - Professional Summary (craft this AFTER gathering experience info)
   - Work Experience (most recent first)
   - Education
   - Skills (technical and soft)
   - Optional: Certifications, Projects, Languages

3. **For each experience entry, ask**
   - Company name and your job title
   - Dates (month/year to month/year)
   - 3-5 key achievements or responsibilities
   - Then transform their descriptions into powerful bullets

4. **Best Practices**
   - Use strong action verbs (Led, Delivered, Increased, Built)
   - Include metrics wherever possible (%, $, numbers)
   - Focus on achievements over responsibilities
   - Tailor language to target role
   - Keep it concise (1-2 pages max)

5. **Be encouraging and helpful**
   - If they struggle to think of achievements, ask probing questions
   - Suggest metrics they might be able to include
   - Offer alternatives and let them choose

6. **At the end**
   - Review the complete CV
   - Offer to export in their preferred format
   - Suggest improvements or next steps

## Conversation Style
- Friendly and professional
- One section at a time - don't overwhelm
- Celebrate their achievements
- Ask clarifying questions
- Provide examples when helpful

Remember: Many people undersell themselves. Help them recognize and articulate their value.""",
    tools=[
        save_section,
        generate_bullet,
        generate_summary,
        export_cv,
    ]
)
