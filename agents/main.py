"""REJECT AI Agents - Main entry point."""

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Export the root agent for ADK CLI
from agents.root_agent import root_career_coach as root_agent

# Also export individual agents for direct access
from agents import (
    cv_builder_agent,
    resume_coach_agent,
    career_agent,
    job_advisor_agent,
    interview_coach_agent,
    rejection_decoder_agent,
)

__all__ = [
    "root_agent",
    "cv_builder_agent",
    "resume_coach_agent",
    "career_agent",
    "job_advisor_agent",
    "interview_coach_agent",
    "rejection_decoder_agent",
]
