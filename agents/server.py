"""FastAPI server to expose REJECT agents as REST API for the React frontend."""

import os
import uuid
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai

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


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
