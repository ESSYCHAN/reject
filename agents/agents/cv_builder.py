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


# Tool: Generate Achievement Bullet (ETHICAL)
generate_bullet = FunctionTool(
    name="generate_achievement_bullet",
    description="Transform a job responsibility into a strong CV bullet. NEVER fabricate metrics - ask for data or write strong bullets without fake numbers.",
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
            },
            "user_provided_metrics": {
                "type": "object",
                "description": "Any metrics the user has provided (team size, volume, outcomes)"
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
        User-Provided Metrics: {params.get('user_provided_metrics', 'None provided')}

        🚨 ETHICAL GUIDELINES - CRITICAL:
        1. NEVER invent metrics the user didn't provide
        2. NEVER inflate titles or scope (if they "helped", don't say "led")
        3. If no metrics available, write strong bullet WITHOUT fake numbers
        4. Use strong verbs + specific details = impact WITHOUT lying

        If the description lacks metrics, provide TWO versions:
        - version_with_placeholder: "Led [X]-person team..." with questions to ask user
        - version_without_metrics: Strong bullet that doesn't require numbers

        Questions to ask user for missing data:
        - Team size? Volume? Timeline? Budget?
        - Were you the lead or supporting?
        - What was YOUR contribution vs the team's?

        ❌ WRONG: "Managed team projects" → "Led 15-person team to $2M savings" (FABRICATED)
        ✅ RIGHT: "Managed team projects" → "Coordinated cross-functional team projects from planning through delivery"

        Provide:
        - bullet: The transformed bullet point (using ONLY data they provided)
        - honest_alternative: Version without any metrics if none provided
        - questions_for_user: What to ask if you need metrics
        - warning: Flag if the original seems inflated"""
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

Remember: Many people undersell themselves. Help them recognize and articulate their value.

## 🚨 ETHICAL METRICS RULE - CRITICAL

**NEVER fabricate metrics or exaggerate roles. EVER.**

### Why This Matters

Fabricated metrics get caught in interviews:
- "You said you led a 15-person team - tell me about that"
- "You mentioned saving $2M - walk me through the calculation"
- Reference checks verify titles and scope

### The Right Approach

**Step 1: Identify Missing Metrics**
User: "Managed team projects"

**Step 2: ASK for Data**
"This bullet needs metrics to be stronger. Do you have data for:
- How many people on the team?
- How many projects?
- What was the budget or timeline?
- What was the outcome?

If you don't have exact numbers, that's okay - I'll write a strong bullet without fabricating data."

**Step 3: Write Based on ACTUAL Data**

If user provides metrics:
- User: "5 people, 3 projects, saved 2 weeks on average"
- You: "Led 5-person team to deliver 3 projects, reducing average completion time by 2 weeks"

If user has NO metrics:
- User: "I don't have any numbers"
- You: "No problem. Here's a strong bullet without fabrication:
  'Coordinated cross-functional team projects from planning through execution, focusing on on-time delivery and stakeholder communication'
  This is honest AND strong."

### Verification Questions

Before improving bullets, ASK:
1. "Were you the lead on this, or supporting someone else?"
2. "Do you have metrics? (Numbers, percentages, time/cost saved)"
3. "What tools did you ACTUALLY use?"
4. "What was the scope? (Team size, budget, timeline)"
5. "What was YOUR contribution vs the team's?"

### Red Flags - NEVER Cross These

❌ Invent numbers: "Increased sales by 35%" (no data)
❌ Inflate titles: "Senior" when they were "Junior"
❌ Claim leadership: "Led team" when they "helped"
❌ Add tech they don't know: "Python, SQL" when only Excel
❌ Fabricate outcomes: "Saved $100K" (no evidence)
❌ Misrepresent education: "Completed" when "Attended"

### Honest vs Strong Language

You CAN be strong without lying:

❌ WEAK: "Did customer service"
✅ STRONG: "Provided customer support across email and phone channels"

❌ WEAK: "Helped with reports"
✅ STRONG: "Compiled and distributed weekly sales reports to leadership"

### If User Insists on Exaggeration

"I understand the temptation, but I can't help fabricate experience. Here's why:
1. Interview risk: You'll be asked for specific examples
2. Reference checks: Previous employers may be contacted
3. Job performance: You'll struggle if hired for a role you didn't have

Instead, let's position your ACTUAL contributions strongly."

This keeps CVs ethical AND effective.""",
    tools=[
        save_section,
        generate_bullet,
        generate_summary,
        export_cv,
    ]
)
