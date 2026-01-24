"""FastAPI server to expose REJECT agents as REST API for the React frontend."""

import os
import io
import uuid
from typing import Optional, List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
import httpx
from PyPDF2 import PdfReader
from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch

# Load environment
load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Initialize FastAPI
app = FastAPI(
    title="REJECT AI Agents API",
    description="AI-powered career coaching agents for REJECT app",
    version="1.0.0"
)

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "https://tryreject.co.uk",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class ChatRequest(BaseModel):
    message: str
    agent: Optional[str] = "career_coach"
    conversation_id: Optional[str] = None
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    response: str
    agent_used: str
    conversation_id: str


class JobSearchRequest(BaseModel):
    keywords: str
    location: str
    remote_only: Optional[bool] = False


class JobSearchResult(BaseModel):
    title: str
    company: str
    location: str
    salary: Optional[str] = None
    url: str
    description: Optional[str] = None


class CVExportRequest(BaseModel):
    sections: dict  # {name, contact, summary, experience, education, skills}


# Agent system prompts - KEEP RESPONSES SHORT AND CLEAN
AGENT_PROMPTS = {
    "career_coach": """You are REJECT Coach, an AI career assistant. Keep responses short and conversational.

IMPORTANT RULES:
- Keep responses under 100 words
- No bullet point lists unless specifically asked
- No numbered lists unless specifically asked
- Just have a natural conversation
- Ask ONE question at a time
- Be friendly but concise

You help with: CVs, job search, interviews, rejections. Ask what they need help with.""",

    "cv_builder": """You are a CV builder. Help create CVs through conversation.

RULES:
- Keep responses short (under 80 words)
- Ask ONE question at a time
- No long lists - just conversation
- Guide them step by step naturally

Start by asking what role they're targeting.""",

    "resume_coach": """You are a resume coach. Review CVs and give feedback.

RULES:
- Keep responses concise
- Give 2-3 key points max
- Be direct and actionable
- No walls of text

When they share a CV, give a quick score and top 2-3 things to fix.""",

    "career_agent": """You are a job search advisor.

RULES:
- Short, helpful responses
- Ask about their target role and location
- Give practical advice
- No long lectures

Help them think strategically about their job search.""",

    "job_advisor": """You analyze job descriptions.

RULES:
- Give a quick verdict: Apply / Maybe / Skip
- 2-3 sentence summary
- List only major red flags (if any)
- Keep it brief

When they paste a JD, give quick analysis.""",

    "interview_coach": """You help with interview prep.

RULES:
- Keep responses short
- In mock interviews: ask ONE question, wait for answer, give brief feedback
- No long explanations
- Be encouraging but concise

Ask what role they're interviewing for.""",

    "rejection_decoder": """You decode rejection emails.

RULES:
- Keep analysis brief
- Tell them what stage it was (ATS, recruiter, etc)
- One sentence on what it means
- One actionable next step
- Be supportive but concise

When they paste a rejection, give quick decode."""
}


# In-memory conversation storage
conversations: dict = {}


def get_model():
    """Get Gemini model instance."""
    return genai.GenerativeModel('gemini-2.0-flash')


@app.get("/")
async def root():
    """Health check and API info."""
    api_key = os.getenv("GEMINI_API_KEY")
    return {
        "status": "healthy",
        "service": "REJECT AI Agents",
        "version": "1.0.0",
        "gemini_configured": bool(api_key and len(api_key) > 10),
        "agents": list(AGENT_PROMPTS.keys())
    }


@app.get("/agents")
async def list_agents():
    """List available agents with descriptions."""
    return {
        "agents": [
            {"id": "career_coach", "name": "Career Coach", "description": "Your main AI career coach"},
            {"id": "cv_builder", "name": "CV Builder", "description": "Creates CVs from scratch"},
            {"id": "resume_coach", "name": "Resume Coach", "description": "Analyzes and improves your CV"},
            {"id": "career_agent", "name": "Career Agent", "description": "Helps find matching jobs"},
            {"id": "job_advisor", "name": "Job Advisor", "description": "Analyzes job descriptions"},
            {"id": "interview_coach", "name": "Interview Coach", "description": "Practice interviews"},
            {"id": "rejection_decoder", "name": "Rejection Decoder", "description": "Decodes rejections"}
        ]
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat with an agent using Gemini."""
    agent_id = request.agent or "career_coach"

    if agent_id not in AGENT_PROMPTS:
        raise HTTPException(status_code=400, detail=f"Unknown agent: {agent_id}")

    # Get or create conversation
    conv_id = request.conversation_id or str(uuid.uuid4())
    if conv_id not in conversations:
        conversations[conv_id] = {"agent": agent_id, "history": []}

    conv = conversations[conv_id]

    try:
        model = get_model()
        system_prompt = AGENT_PROMPTS[agent_id]

        # Add context if provided
        context_text = ""
        if request.context:
            if request.context.get("cvText"):
                context_text += f"\n\nUser's CV:\n{request.context['cvText']}"
            if request.context.get("jobDescription"):
                context_text += f"\n\nJob Description:\n{request.context['jobDescription']}"
            if request.context.get("targetRole"):
                context_text += f"\n\nTarget Role: {request.context['targetRole']}"

        # Build conversation history
        history_text = ""
        for msg in conv["history"][-10:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            history_text += f"\n{role}: {msg['content']}"

        # Create the full prompt
        full_prompt = f"""System Instructions: {system_prompt}
{context_text}

Conversation History:{history_text}

User: {request.message}
Please respond helpfully as the assistant."""

        # Generate response
        response = model.generate_content(full_prompt)
        assistant_response = response.text

        # Save to history
        conv["history"].append({"role": "user", "content": request.message})
        conv["history"].append({"role": "assistant", "content": assistant_response})

        return ChatResponse(
            response=assistant_response,
            agent_used=agent_id,
            conversation_id=conv_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload/cv")
async def upload_cv(file: UploadFile = File(...)):
    """Parse uploaded CV (PDF or DOCX) and extract text."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename = file.filename.lower()
    content = await file.read()

    try:
        if filename.endswith('.pdf'):
            # Parse PDF
            pdf_reader = PdfReader(io.BytesIO(content))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() or ""
        elif filename.endswith('.docx'):
            # Parse DOCX
            doc = Document(io.BytesIO(content))
            text = "\n".join([para.text for para in doc.paragraphs])
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF or DOCX.")

        return {"text": text.strip(), "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing file: {str(e)}")


@app.post("/export/cv")
async def export_cv(request: CVExportRequest):
    """Generate a PDF CV from structured data."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    styles = getSampleStyleSheet()

    # Custom styles
    name_style = ParagraphStyle('Name', parent=styles['Heading1'], fontSize=18, spaceAfter=6)
    section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=12, spaceBefore=12, spaceAfter=6, textColor='#333')
    body_style = ParagraphStyle('Body', parent=styles['Normal'], fontSize=10, spaceAfter=4)

    story = []
    sections = request.sections

    # Name
    if sections.get('name'):
        story.append(Paragraph(sections['name'], name_style))

    # Contact
    if sections.get('contact'):
        story.append(Paragraph(sections['contact'], body_style))

    story.append(Spacer(1, 12))

    # Summary
    if sections.get('summary'):
        story.append(Paragraph("PROFESSIONAL SUMMARY", section_style))
        story.append(Paragraph(sections['summary'], body_style))

    # Experience
    if sections.get('experience'):
        story.append(Paragraph("EXPERIENCE", section_style))
        for exp in sections['experience'] if isinstance(sections['experience'], list) else [sections['experience']]:
            story.append(Paragraph(exp, body_style))

    # Education
    if sections.get('education'):
        story.append(Paragraph("EDUCATION", section_style))
        for edu in sections['education'] if isinstance(sections['education'], list) else [sections['education']]:
            story.append(Paragraph(edu, body_style))

    # Skills
    if sections.get('skills'):
        story.append(Paragraph("SKILLS", section_style))
        skills_text = sections['skills'] if isinstance(sections['skills'], str) else ", ".join(sections['skills'])
        story.append(Paragraph(skills_text, body_style))

    doc.build(story)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cv.pdf"}
    )


@app.post("/search/jobs")
async def search_jobs(request: JobSearchRequest):
    """Search for jobs using Adzuna API (free tier available)."""
    # Adzuna API - free tier: 250 requests/month
    app_id = os.getenv("ADZUNA_APP_ID")
    app_key = os.getenv("ADZUNA_APP_KEY")

    if not app_id or not app_key:
        # Return mock results if no API key configured
        return {
            "jobs": [
                {
                    "title": f"{request.keywords} - Example Role",
                    "company": "Example Company",
                    "location": request.location,
                    "salary": "$80,000 - $120,000",
                    "url": "https://example.com/job",
                    "description": "This is a sample job listing. Configure ADZUNA_APP_ID and ADZUNA_APP_KEY for real results."
                }
            ],
            "note": "Configure Adzuna API keys for real job search results"
        }

    try:
        # Determine country code from location
        location_lower = request.location.lower()
        if "uk" in location_lower or "london" in location_lower or "manchester" in location_lower:
            country = "gb"
        elif "us" in location_lower or "new york" in location_lower or "san francisco" in location_lower:
            country = "us"
        elif "canada" in location_lower or "toronto" in location_lower:
            country = "ca"
        elif "australia" in location_lower or "sydney" in location_lower:
            country = "au"
        else:
            country = "gb"  # Default to UK

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.adzuna.com/v1/api/jobs/{country}/search/1",
                params={
                    "app_id": app_id,
                    "app_key": app_key,
                    "what": request.keywords,
                    "where": request.location,
                    "results_per_page": 10,
                    "content-type": "application/json"
                }
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Job search API error")

            data = response.json()
            jobs = []

            for result in data.get("results", []):
                salary = None
                if result.get("salary_min") and result.get("salary_max"):
                    salary = f"${int(result['salary_min']):,} - ${int(result['salary_max']):,}"

                jobs.append({
                    "title": result.get("title", ""),
                    "company": result.get("company", {}).get("display_name", ""),
                    "location": result.get("location", {}).get("display_name", ""),
                    "salary": salary,
                    "url": result.get("redirect_url", ""),
                    "description": result.get("description", "")[:200] + "..." if result.get("description") else None
                })

            return {"jobs": jobs}

    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Job search error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
