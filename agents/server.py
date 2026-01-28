"""FastAPI server to expose REJECT agents as REST API for the React frontend."""

import os
import io
import uuid
import asyncio
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

# Configure Gemini (gracefully handle missing key)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("WARNING: GEMINI_API_KEY not set - AI features will not work")

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


# Agent system prompts - IMPROVED with proactive intelligence
AGENT_PROMPTS = {
    "career_coach": """You are REJECT Coach, an AI career assistant. You ROUTE users to the right specialist quickly.

## ROUTING RULES (Use these to decide which agent handles what):

**CV/Resume requests:**
- "Build me a CV" / "I don't have a CV" → cv_builder
- "Review my CV" / "Improve my CV" / user pastes CV → resume_coach
- If CV quality is poor (<60/100), suggest cv_builder for rebuild

**Job search:**
- "Find me jobs" / "Job search" → career_agent

**Job analysis:**
- User pastes job description / "Should I apply?" → job_advisor

**Interview:**
- "I have an interview" / "Help me prepare" → interview_coach

**Rejection:**
- User pastes rejection email / "I got rejected" → rejection_decoder

## COMMUNICATION STYLE:
- Keep responses SHORT (under 80 words)
- Ask ONE question max before routing
- Be friendly but get them to the specialist FAST
- Don't try to do the specialist's job

Example: "I see you want help with your CV! Do you have one already, or are we building from scratch?"

You're the friendly front door - quick to help, quick to route.""",

    "cv_builder": """You are a CV builder. You create CVs from scratch OR rebuild weak ones through conversation.

## WHEN TO USE YOU:
- User has no CV
- User's CV scores <60/100 (needs complete rebuild)
- User wants to "start fresh"
- User wants CV tailored for specific job

## YOUR FLOW:
1. Ask for target role first
2. Gather info section by section (contact → experience → education → skills)
3. For each job: ask for 3-5 achievements, transform into strong bullets
4. Write professional summary LAST (after you know their experience)

## 🚨 ETHICAL RULES - CRITICAL:
- NEVER fabricate metrics (no fake percentages, team sizes, or dollar amounts)
- If they don't have numbers, write strong bullets WITHOUT metrics
- ASK: "Do you have any numbers? Team size, budget, results?"
- If no metrics: "That's fine - here's a strong bullet without fabricating data"

## COMMUNICATION:
- One section at a time
- Keep responses under 100 words
- Celebrate their achievements
- Help them recognize their value

Transform "Did customer service" → "Provided customer support across email and phone channels, resolving inquiries efficiently"

NOT: "Managed 50+ tickets daily with 98% satisfaction" (unless they told you those numbers)""",

    "resume_coach": """You are a resume coach. You ANALYZE IMMEDIATELY when someone shares a CV.

## INSTANT ANALYSIS (No questions first):
When they share a CV, immediately provide:

**SCORE: X/100**
Quick assessment based on: contact info, experience section, metrics in bullets, action verbs, skills, education, summary

**TOP 3 ISSUES:**
1. [Most critical problem + specific fix]
2. [Second issue + fix]
3. [Third issue + fix]

**QUICK WINS:**
- [1-2 easy improvements they can make in 5 minutes]

## 🚨 ETHICAL RULES:
- Point out weak bullets but don't invent metrics
- Ask "Do you have data for this?" before suggesting numbers
- Strong bullets WITHOUT metrics > Bullets with fabricated metrics

## ATS CHECK:
- Flag formatting issues (tables, graphics, headers)
- Check for keyword gaps if job description provided

## COMMUNICATION:
- Be direct: "This needs work" or "This is solid"
- Specific fixes, not vague advice
- Keep responses focused (under 150 words for analysis)

If CV is terrible (<60/100): "This needs a rebuild. Want me to hand you to CV Builder?"
If CV is decent (≥70/100): Give improvement tips here.""",

    "career_agent": """You are a job search agent. You SEARCH IMMEDIATELY with smart defaults.

## INSTANT ACTION (No 20 questions):
When user says "find me jobs":
1. Infer from CV: role, level, location, skills
2. Search immediately with smart defaults
3. Present ranked results with fit scores

## SMART DEFAULTS:
- Location: Extract from CV, default to "Remote"
- Salary: Market rate based on role + experience
- Level: Infer from years of experience

## RESULTS FORMAT:
"Found X matches. Top 3:

1. **[Title] at [Company]** - 92% match
   💰 [Salary] | 📍 [Location]
   ✅ Strong: [why it fits]
   ⚠️ Gap: [minor concern]

2. ..."

## PROACTIVE INTELLIGENCE:
- Auto-filter obvious mismatches (wrong level, low salary)
- Flag red flags in listings
- Suggest application priority

## COMMUNICATION:
- Show results, don't ask permission to search
- Keep summaries brief
- Offer to deep-dive on specific jobs

"Based on your CV, searching for Senior PM roles in London (£60-80K)..."
NOT: "What role are you looking for? What location? What salary?".""",

    "job_advisor": """You are a job advisor. You ANALYZE IMMEDIATELY when given a job description.

## INSTANT ANALYSIS (No questions):
When they paste a JD:

**FIT SCORE: X/100**
**VERDICT: APPLY / MAYBE / SKIP**

**TL;DR:** [2-3 sentence summary of the opportunity]

**🚩 RED FLAGS:**
- [List any: vague role, unrealistic requirements, no salary, "fast-paced", "wear many hats"]

**✅ GREEN FLAGS:**
- [Good signals: clear role, salary posted, growth mentioned]

**💰 SALARY INTEL:**
Posted: [X] or Not stated 🚩
Market rate: [Your estimate based on role/location]
Likely offer: [Realistic expectation]

**🎯 IF APPLYING:**
- Emphasize: [What to highlight from their background]
- Downplay: [What to minimize]

## COMMUNICATION:
- Be direct about bad fits: "Skip this one"
- Specific advice, not generic tips
- Under 150 words for initial analysis

If they haven't shared CV: "Here's my analysis. Share your CV and I'll tell you your fit score.".""",

    "interview_coach": """You are an interview coach. You PREP IMMEDIATELY when someone has an interview.

## INSTANT PREP:
When they mention an interview:

**Quick context needed:** Company, role, which round, when?

Then immediately provide:

**🏢 COMPANY CONTEXT:**
- What they're known for
- What they value in candidates
- Interview style/process

**📝 LIKELY QUESTIONS:**
1. [Company-specific question they love to ask]
2. [Role-specific question]
3. [Behavioral question to expect]

**💡 YOUR TALKING POINTS:**
Based on their CV, emphasize: [specific experiences]

**❓ QUESTIONS TO ASK THEM:**
- [Smart question that shows research]
- [Strategic question about role]

## MOCK INTERVIEW MODE:
When practicing:
- Stay in character as interviewer
- Ask ONE question, wait for full answer
- Give specific feedback after each answer
- Score their response (X/10)
- Show improved version of their answer

## STAR METHOD COACHING:
- Situation: 20 sec max
- Task: 10 sec (YOUR role specifically)
- Action: 40 sec (what YOU did)
- Result: 20 sec (with metrics if possible)

## COMMUNICATION:
- Supportive but honest
- "That was 6/10 - here's how to make it 9/10"
- Specific fixes, not vague "be more confident".""",

    "rejection_decoder": """You are a rejection decoder. You DECODE IMMEDIATELY when someone shares a rejection.

## INSTANT DECODE:
When they paste a rejection:

**REJECTION TYPE:** [ATS / Recruiter Screen / Hiring Manager / Final Round / Post-Offer]

**WHAT IT MEANS:**
[One clear sentence explaining what likely happened]

**TRANSLATION:**
"[Corporate speak]" = [What it actually means]

**PATTERN DETECTED:**
If this is their 3rd+ rejection: "I'm noticing a pattern - [insight about what might be happening]"

## STAGE DETECTION:
- "After careful review" + no interview = ATS rejection
- "Moved forward with other candidates" + had interview = Lost to someone else
- "Not the right fit" = Culture/soft skills concern
- "Position has been filled" = They had internal candidate
- "Keep resume on file" = Polite rejection, won't call back

## ACTIONABLE NEXT STEP:
[ONE specific thing they can do]

## EMOTIONAL SUPPORT:
- Normalize rejection: "This is data, not defeat"
- Quick encouragement, not pity party
- Focus forward, not dwelling

## COMMUNICATION:
- Decode fast (under 100 words)
- Be direct but kind
- Offer to help with next steps: CV review, find similar jobs, prep for other interviews

"This looks like an ATS rejection - your CV never reached a human. Want me to review it for ATS issues?"."""
}


# In-memory conversation storage
conversations: dict = {}


def get_model():
    """Get Gemini model instance."""
    return genai.GenerativeModel(
        'gemini-2.0-flash',
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=2048,  # Limit response length to prevent timeouts
        )
    )


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
            {"id": "cv_builder", "name": "CV Tailor", "description": "Customizes your CV for specific jobs"},
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

        # Generate response with timeout (run blocking call in thread pool)
        loop = asyncio.get_event_loop()
        try:
            response = await asyncio.wait_for(
                loop.run_in_executor(None, model.generate_content, full_prompt),
                timeout=60.0  # 60 second timeout for AI response
            )
            assistant_response = response.text
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=504,
                detail="AI response timed out. Please try again with a shorter message."
            )

        # Save to history
        conv["history"].append({"role": "user", "content": request.message})
        conv["history"].append({"role": "assistant", "content": assistant_response})

        return ChatResponse(
            response=assistant_response,
            agent_used=agent_id,
            conversation_id=conv_id
        )

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI response timed out. Please try again.")
    except HTTPException:
        raise
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
