"""FastAPI server to expose REJECT agents as REST API for the React frontend.

Version 3.0.0 - Hybrid Architecture
- Uses ADK Runner for real agent routing and tool execution
- Injects user context from REJECT's backend
- Maintains conversation state across agent handoffs
"""

import os
import io
import uuid
import asyncio
import random
from typing import Optional, List, Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.adk import Runner
from google.adk.sessions import InMemorySessionService
import httpx
from PyPDF2 import PdfReader
from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch

# Import ADK agents
from agents.reject_coach import reject_coach  # The ONE Super Agent (Phase 1.2)
from agents.root_agent import root_career_coach
from agents.cv_builder import cv_builder_agent
from agents.resume_coach import resume_coach_agent
from agents.career_agent import career_agent
from agents.job_advisor import job_advisor_agent
from agents.interview_coach import interview_coach_agent
from agents.rejection_decoder import rejection_decoder_agent
from agents.maya_coach import maya_coach

# Load environment (cwd first, then local agents/.env if present)
load_dotenv()
LOCAL_ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(LOCAL_ENV_PATH):
    load_dotenv(LOCAL_ENV_PATH, override=False)

# Configure Gemini client (gracefully handle missing key)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = None
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
else:
    print("WARNING: GEMINI_API_KEY not set - AI features will not work")

# ADK Runner and Session Service (initialized at startup)
session_service: Optional[InMemorySessionService] = None
adk_runners: dict = {}  # One runner per agent

# Map agent IDs to ADK agent objects
# "reject_coach" is the new unified agent (Phase 1.2) - use this as default
# Legacy agents kept for backwards compatibility
AGENT_MAP = {
    # The ONE Super Agent - default
    "reject_coach": reject_coach,
    # Legacy agents (still work if explicitly requested)
    "career_coach": root_career_coach,
    "cv_builder": cv_builder_agent,
    "resume_coach": resume_coach_agent,
    "career_agent": career_agent,
    "job_advisor": job_advisor_agent,
    "interview_coach": interview_coach_agent,
    "rejection_decoder": rejection_decoder_agent,
    "maya": maya_coach,
}

# Lifespan handler to initialize ADK Runner at startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize ADK Runners for each agent at startup."""
    global session_service, adk_runners

    # Only initialize ADK if Gemini API key is configured
    if GEMINI_API_KEY:
        try:
            print("Initializing ADK Runners...")
            session_service = InMemorySessionService()

            # Create a runner for each agent (all use same app_name for shared sessions)
            for agent_id, agent in AGENT_MAP.items():
                adk_runners[agent_id] = Runner(
                    app_name="REJECT",
                    agent=agent,
                    session_service=session_service,
                )
                print(f"  - {agent_id} runner ready")

            print(f"ADK Runners initialized: {len(adk_runners)} agents")
        except Exception as e:
            print(f"WARNING: Failed to initialize ADK Runners: {e}")
            print("AI chat features will not work, but server will remain healthy")
    else:
        print("WARNING: GEMINI_API_KEY not set - ADK Runners not initialized")
        print("AI chat features will not work, but server will remain healthy")

    yield  # App runs here

    # Cleanup on shutdown
    for agent_id, runner in adk_runners.items():
        try:
            await runner.close()
            print(f"ADK Runner {agent_id} closed")
        except Exception as e:
            print(f"Error closing ADK Runner: {e}")


# Initialize FastAPI with lifespan
app = FastAPI(
    title="REJECT AI Agents API",
    description="AI-powered career coaching agents for REJECT app - Hybrid ADK Architecture",
    version="3.0.0",
    lifespan=lifespan,
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
        "https://www.tryreject.co.uk",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class ChatRequest(BaseModel):
    message: str
    agent: Optional[str] = "reject_coach"  # Default to super agent
    conversation_id: Optional[str] = None
    user_id: Optional[str] = None  # Clerk user ID for tracker access
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


# Note: Agent prompts are now in the ADK agents (agents/*.py) with full
# routing, tool support, and user context protocols. See root_agent.py,
# cv_builder.py, resume_coach.py, career_agent.py, job_advisor.py,
# interview_coach.py, rejection_decoder.py


# Rate limit retry configuration
MAX_RETRIES = 3
BASE_DELAY = 1.0  # seconds
MAX_DELAY = 10.0  # seconds


def is_rate_limit_error(error: Exception) -> bool:
    """Check if an error is a rate limit (429) error."""
    error_str = str(error).lower()
    return (
        "429" in error_str or
        "resource_exhausted" in error_str or
        "rate limit" in error_str or
        "quota" in error_str
    )


async def run_with_retry(coro_func, *args, **kwargs):
    """Run an async function with exponential backoff retry for rate limits."""
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            return await coro_func(*args, **kwargs)
        except Exception as e:
            last_error = e
            if is_rate_limit_error(e) and attempt < MAX_RETRIES - 1:
                # Exponential backoff with jitter
                delay = min(BASE_DELAY * (2 ** attempt) + random.uniform(0, 1), MAX_DELAY)
                print(f"Rate limit hit, retrying in {delay:.1f}s (attempt {attempt + 1}/{MAX_RETRIES})")
                await asyncio.sleep(delay)
            else:
                raise

    raise last_error


@app.get("/")
async def root():
    """Health check and API info."""
    return {
        "status": "healthy",
        "service": "REJECT AI Agents",
        "version": "3.0.1",
        "gemini_configured": GEMINI_API_KEY is not None,
        "adk_runners_active": len(adk_runners) > 0,
        "agents": list(AGENT_MAP.keys())
    }


@app.get("/health")
async def health():
    """Simple health check for Railway/load balancers."""
    return {"status": "ok"}


@app.get("/agents")
async def list_agents():
    """List available agents with descriptions."""
    return {
        "agents": [
            # The ONE Super Agent (recommended)
            {"id": "reject_coach", "name": "REJECT Coach", "description": "Your AI career coach with full capabilities - rejection analysis, job search, CV review, interview prep, and emotional support all in one", "recommended": True},
            # Legacy agents (still available)
            {"id": "career_coach", "name": "Career Coach (Legacy)", "description": "Routes to specialist agents - use reject_coach instead"},
            {"id": "cv_builder", "name": "CV Builder", "description": "Builds CVs from scratch"},
            {"id": "resume_coach", "name": "Resume Coach", "description": "Analyzes and improves existing CVs"},
            {"id": "career_agent", "name": "Career Agent", "description": "Smart job search"},
            {"id": "job_advisor", "name": "Job Advisor", "description": "Analyzes job postings"},
            {"id": "interview_coach", "name": "Interview Coach", "description": "Company-specific interview prep"},
            {"id": "rejection_decoder", "name": "Rejection Decoder", "description": "Decodes rejection emails"},
            {"id": "maya", "name": "Maya", "description": "Your AI career coach - handles everything through conversation: rejections, CV, jobs, interviews, and emotional support", "recommended": True}
        ]
    }


def build_user_context_text(user_ctx: dict) -> str:
    """Build formatted user context text for injection into agent session."""
    if not user_ctx:
        return ""

    context_text = ""

    # User identity - IMPORTANT: Maya should know who she's talking to
    user_name = user_ctx.get("userName") or user_ctx.get("fullName")
    if user_name:
        context_text += f"\n\n--- ABOUT THIS USER ---"
        context_text += f"\nName: {user_name}"
        if user_ctx.get("currentTitle"):
            context_text += f"\nCurrent Role: {user_ctx.get('currentTitle')}"
        if user_ctx.get("yearsExperience"):
            context_text += f"\nExperience: {user_ctx.get('yearsExperience')} years"
        if user_ctx.get("skills"):
            skills = user_ctx.get("skills", [])
            if skills:
                context_text += f"\nSkills: {', '.join(skills[:10])}"
        if user_ctx.get("targetRoles"):
            roles = user_ctx.get("targetRoles", [])
            if roles:
                context_text += f"\nLooking for: {', '.join(roles)}"
        if user_ctx.get("hasCv"):
            context_text += f"\n(User has uploaded their CV)"

    # Application history (if available)
    context_text += "\n\n--- USER'S APPLICATION HISTORY ---"

    # User profile from application stats
    profile = user_ctx.get("userProfile", {})
    if profile.get("applicationCount", 0) > 0:
        context_text += f"\nProfile: {profile.get('applicationCount')} applications tracked"
        if profile.get("inferredSeniority"):
            context_text += f", targeting {profile.get('inferredSeniority')} level roles"
        if profile.get("topRoles"):
            context_text += f"\nTop roles applied to: {', '.join(profile.get('topRoles', []))}"
        if profile.get("topIndustries"):
            context_text += f"\nIndustries: {', '.join(profile.get('topIndustries', []))}"

    # Success metrics
    metrics = user_ctx.get("successMetrics", {})
    if metrics.get("totalApplications", 0) > 0:
        context_text += f"\n\nSuccess Metrics:"
        context_text += f"\n- Total applications: {metrics.get('totalApplications')}"
        context_text += f"\n- Offers: {metrics.get('offers')} ({metrics.get('offerRate', '0%')})"
        context_text += f"\n- Currently interviewing: {metrics.get('interviewing')}"
        context_text += f"\n- Ghosted: {metrics.get('ghosted')} ({metrics.get('ghostRate', '0%')})"
        context_text += f"\n- Rejected: {metrics.get('rejected')}"

    # Rejection patterns
    patterns = user_ctx.get("rejectionPatterns", {})
    if patterns.get("total", 0) > 0:
        context_text += f"\n\nRejection Patterns ({patterns.get('total')} rejections):"
        stages = patterns.get("byStage", {})
        if stages.get("ats", 0) > 0:
            context_text += f"\n- ATS stage: {stages.get('ats')}"
        if stages.get("recruiter", 0) > 0:
            context_text += f"\n- Recruiter screen: {stages.get('recruiter')}"
        if stages.get("hiringManager", 0) > 0:
            context_text += f"\n- Hiring manager: {stages.get('hiringManager')}"
        if stages.get("finalRound", 0) > 0:
            context_text += f"\n- Final round: {stages.get('finalRound')}"
        if patterns.get("avgDaysToResponse", 0) > 0:
            context_text += f"\n- Avg response time: {int(patterns.get('avgDaysToResponse'))} days"

    # Top companies with community intelligence
    top_companies = user_ctx.get("topCompanies", [])
    if top_companies:
        context_text += f"\n\nTop Companies Applied To (with Community Intel):"
        for company in top_companies[:3]:
            context_text += f"\n- {company.get('company')}: {company.get('applications')} apps"
            if company.get('rejections', 0) > 0:
                context_text += f" ({company.get('rejections')} rejections)"
            if company.get('lastOutcome'):
                context_text += f", last: {company.get('lastOutcome')}"
            # Add community insights if available
            community = company.get('communityInsights')
            if community:
                context_text += f"\n  📊 COMMUNITY DATA: {community.get('totalCommunityApps', 0)} total apps from REJECT users"
                if community.get('communityGhostRate'):
                    context_text += f", ghost rate: {community.get('communityGhostRate')}"
                if community.get('avgResponseDays'):
                    context_text += f", avg response: {community.get('avgResponseDays')} days"
                signals = community.get('topSignals', [])
                if signals:
                    context_text += f"\n  ⚠️ Top rejection signals: {', '.join(signals[:3])}"

    # Recent applications
    recent = user_ctx.get("recentApplications", [])
    if recent:
        context_text += f"\n\nRecent Applications:"
        for app in recent[:5]:
            context_text += f"\n- {app.get('company')} ({app.get('role')}): {app.get('outcome') or 'pending'}"

    context_text += "\n--- END USER HISTORY ---\n"
    return context_text


# Backend URL for conversation persistence
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8787")


async def fetch_maya_memory(user_id: str) -> Optional[str]:
    """Fetch Maya's memory context for a user from the backend."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{BACKEND_URL}/api/conversations/memory/{user_id}")
            if response.status_code == 200:
                data = response.json()
                return data.get("data", {}).get("memory")
    except Exception as e:
        print(f"[Memory] Failed to fetch memory for {user_id}: {e}")
    return None


async def save_conversation_message(
    user_id: str,
    session_id: str,
    role: str,
    content: str,
    agent_id: str = "maya"
):
    """Save a conversation message to the backend."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{BACKEND_URL}/api/conversations/save",
                json={
                    "userId": user_id,
                    "sessionId": session_id,
                    "role": role,
                    "content": content,
                    "agentId": agent_id
                }
            )
    except Exception as e:
        print(f"[Memory] Failed to save message: {e}")


async def check_and_summarize_if_needed(user_id: str):
    """Check if conversation is getting long and trigger summarization."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Check conversation stats
            stats_response = await client.get(f"{BACKEND_URL}/api/conversations/stats/{user_id}")
            if stats_response.status_code != 200:
                return

            stats = stats_response.json().get("data", {})
            message_count = stats.get("messageCount", 0)

            # Only summarize if we have 50+ messages
            if message_count < 50:
                return

            print(f"[Memory] Conversation has {message_count} messages, triggering summarization...")

            # Get messages to summarize
            to_summarize_response = await client.get(f"{BACKEND_URL}/api/conversations/to-summarize/{user_id}")
            if to_summarize_response.status_code != 200:
                return

            messages_data = to_summarize_response.json().get("data", {})
            messages = messages_data.get("messages", [])

            if len(messages) < 20:
                return

            # Build a summary using Gemini
            if not gemini_client:
                return

            conversation_text = "\n".join([
                f"{'User' if m['role'] == 'user' else 'Maya'}: {m['content'][:300]}"
                for m in messages[-40:]  # Last 40 messages to summarize
            ])

            summary_prompt = f"""Summarize this conversation between a user and Maya (an AI career coach) into a brief memory context.
Focus on:
- User's name, role, experience level
- Their job search situation (applications, rejections, interviews)
- Emotional state and key struggles
- Any specific companies or roles they mentioned
- Important context Maya should remember

Keep it under 200 words. Write in third person about the user.

Conversation:
{conversation_text}

Summary:"""

            response = gemini_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=summary_prompt
            )

            summary = response.text.strip() if response.text else None

            if summary:
                # Save the summary and prune old messages
                await client.post(
                    f"{BACKEND_URL}/api/conversations/summarize/{user_id}",
                    json={"summary": summary}
                )
                print(f"[Memory] Summarized conversation for user {user_id[:8]}...")

    except Exception as e:
        print(f"[Memory] Summarization check failed: {e}")


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat with an agent using ADK Runner for real agent routing and tool execution."""
    agent_id = request.agent or "career_coach"

    if agent_id not in AGENT_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown agent: {agent_id}")

    if agent_id not in adk_runners or not session_service:
        raise HTTPException(
            status_code=503,
            detail=f"ADK Runner for {agent_id} not initialized. Check server startup logs."
        )

    # Get the runner for this specific agent
    runner = adk_runners[agent_id]

    # Get or create conversation/session
    conv_id = request.conversation_id or str(uuid.uuid4())
    # Use Clerk user ID if provided (enables tracker access), else generate one
    user_id = request.user_id or f"user_{conv_id}"

    try:
        # Build session state with user context
        state = {}

        if request.context:
            # Store raw context in state for agents to access
            if request.context.get("cvText"):
                state["cv_text"] = request.context["cvText"]
            if request.context.get("jobDescription"):
                state["job_description"] = request.context["jobDescription"]
            if request.context.get("targetRole"):
                state["target_role"] = request.context["targetRole"]
            if request.context.get("userContext"):
                state["user_context"] = request.context["userContext"]

        # Build the message with context prepended
        message_text = request.message

        # Prepend user context to message so agent sees it
        context_prefix = ""

        # MEMORY INJECTION: Fetch Maya's memory for this user
        if request.user_id and agent_id == "maya":
            memory_context = await fetch_maya_memory(request.user_id)
            if memory_context:
                context_prefix += f"\n\n{memory_context}"

        # CRITICAL: Include user_id so Maya can pass it to tracker tools
        if request.user_id:
            context_prefix += f"\n\n[SYSTEM: User is authenticated. user_id={request.user_id} - USE THIS in tracker tool calls]"

        if request.context:
            if request.context.get("cvText"):
                context_prefix += f"\n\n[User's CV provided - {len(request.context['cvText'])} characters]"
            if request.context.get("jobDescription"):
                context_prefix += f"\n\n[Job Description provided]\n{request.context['jobDescription'][:500]}..."
            if request.context.get("userContext"):
                context_prefix += build_user_context_text(request.context["userContext"])

        if context_prefix:
            message_text = f"{context_prefix}\n\nUser message: {request.message}"

        # Check if session exists, create if not
        existing_session = None
        try:
            existing_session = await session_service.get_session(
                app_name="REJECT",
                user_id=user_id,
                session_id=conv_id
            )
        except Exception:
            pass  # Session doesn't exist yet

        if not existing_session:
            # Create new session with state
            await session_service.create_session(
                app_name="REJECT",
                user_id=user_id,
                session_id=conv_id,
                state=state
            )

        # Run the agent with retry logic for rate limits
        async def execute_agent():
            """Execute the agent and collect response."""
            text = ""
            responding_agent = agent_id

            async for event in runner.run_async(
                user_id=user_id,
                session_id=conv_id,
                new_message=types.Content(
                    role="user",
                    parts=[types.Part(text=message_text)]
                )
            ):
                # Track which agent responded
                if hasattr(event, 'author') and event.author and event.author != "user":
                    responding_agent = event.author

                # Check for errors in event
                if hasattr(event, 'error_message') and event.error_message:
                    raise Exception(f"Agent error: {event.error_message}")

                # Collect text from final response
                if hasattr(event, 'is_final_response') and event.is_final_response():
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if hasattr(part, 'text') and part.text:
                                text += part.text
                    break
                # Fallback: collect text from any non-tool events
                elif event.content and event.content.parts:
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            text += part.text

            return text, responding_agent

        # Execute with retry for rate limits
        response_text = ""
        agent_used = agent_id

        for attempt in range(MAX_RETRIES):
            try:
                response_text, agent_used = await execute_agent()
                break  # Success, exit retry loop
            except Exception as e:
                if is_rate_limit_error(e) and attempt < MAX_RETRIES - 1:
                    delay = min(BASE_DELAY * (2 ** attempt) + random.uniform(0, 1), MAX_DELAY)
                    print(f"Rate limit hit, retrying in {delay:.1f}s (attempt {attempt + 1}/{MAX_RETRIES})")
                    await asyncio.sleep(delay)
                else:
                    raise  # Re-raise if not rate limit or out of retries

        if not response_text:
            response_text = "I apologize, but I couldn't generate a response. Please try again."

        # PERSISTENCE: Save both user message and Maya's response
        if request.user_id and agent_id == "maya":
            # Save user message (use original message, not the one with context prefix)
            await save_conversation_message(
                user_id=request.user_id,
                session_id=conv_id,
                role="user",
                content=request.message,
                agent_id=agent_id
            )
            # Save Maya's response
            await save_conversation_message(
                user_id=request.user_id,
                session_id=conv_id,
                role="assistant",
                content=response_text.strip(),
                agent_id=agent_id
            )

            # Check if we need to summarize (runs in background, non-blocking)
            asyncio.create_task(check_and_summarize_if_needed(request.user_id))

        return ChatResponse(
            response=response_text.strip(),
            agent_used=agent_used,
            conversation_id=conv_id
        )

    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI response timed out. Please try again.")
    except Exception as e:
        error_str = str(e)
        print(f"Chat error: {error_str}")

        # Check for rate limit errors and provide helpful message
        if is_rate_limit_error(e):
            raise HTTPException(
                status_code=429,
                detail="The AI service is temporarily overloaded. Please wait a moment and try again."
            )

        raise HTTPException(status_code=500, detail=error_str)


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
    app_key = os.getenv("ADZUNA_APP_KEY") or os.getenv("ADZUNA_API_KEY")

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
