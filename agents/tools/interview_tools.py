"""Interview preparation and practice tools."""

from google.adk.tools import FunctionTool
from typing import Optional


# Tool: Generate Interview Questions
generate_questions = FunctionTool(
    name="generate_interview_questions",
    description="Generate relevant interview questions based on job role, company, and candidate background.",
    parameters={
        "type": "object",
        "properties": {
            "job_title": {
                "type": "string",
                "description": "The job title being interviewed for"
            },
            "company": {
                "type": "string",
                "description": "The company name (optional, for company-specific questions)"
            },
            "cv_text": {
                "type": "string",
                "description": "Candidate's CV for personalized questions (optional)"
            },
            "question_type": {
                "type": "string",
                "enum": ["behavioral", "technical", "situational", "competency", "mixed"],
                "description": "Type of questions to generate"
            },
            "difficulty": {
                "type": "string",
                "enum": ["entry", "mid", "senior", "executive"],
                "description": "Experience level for question difficulty"
            },
            "count": {
                "type": "integer",
                "description": "Number of questions to generate (default 5)"
            }
        },
        "required": ["job_title"]
    },
    execute=lambda params: _generate_questions_impl(
        params["job_title"],
        params.get("company"),
        params.get("cv_text"),
        params.get("question_type", "mixed"),
        params.get("difficulty", "mid"),
        params.get("count", 5)
    )
)


def _generate_questions_impl(
    job_title: str,
    company: Optional[str],
    cv_text: Optional[str],
    question_type: str,
    difficulty: str,
    count: int
) -> dict:
    """Generate interview questions."""
    return {
        "status": "success",
        "instruction": f"""Generate {count} {question_type} interview questions for a {difficulty}-level {job_title} role{' at ' + company if company else ''}.

        For each question provide:
        1. question: The interview question
        2. type: behavioral/technical/situational/competency
        3. what_they_assess: What the interviewer is looking for
        4. good_answer_elements: Key points a strong answer should include
        5. star_prompt: How to structure answer using STAR method (if applicable)
        6. common_mistakes: What to avoid

        {'Personalize questions based on the candidate CV provided.' if cv_text else ''}

        Make questions realistic and commonly asked at top companies."""
    }


# Tool: Evaluate Answer
evaluate_answer = FunctionTool(
    name="evaluate_interview_answer",
    description="Evaluate a candidate's interview answer and provide detailed feedback.",
    parameters={
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "The interview question that was asked"
            },
            "answer": {
                "type": "string",
                "description": "The candidate's answer to evaluate"
            },
            "job_title": {
                "type": "string",
                "description": "The job being interviewed for"
            }
        },
        "required": ["question", "answer"]
    },
    execute=lambda params: _evaluate_answer_impl(
        params["question"],
        params["answer"],
        params.get("job_title")
    )
)


def _evaluate_answer_impl(
    question: str,
    answer: str,
    job_title: Optional[str]
) -> dict:
    """Evaluate interview answer."""
    return {
        "status": "success",
        "instruction": f"""Evaluate this interview answer{' for a ' + job_title + ' role' if job_title else ''}:

        Question: {question}
        Answer: {answer}

        Provide:
        1. overall_score (1-10): How well did they answer
        2. star_analysis:
           - situation: Did they set context? (score 1-10)
           - task: Did they explain their responsibility? (score 1-10)
           - action: Did they describe specific actions? (score 1-10)
           - result: Did they quantify outcomes? (score 1-10)
        3. strengths: What they did well
        4. improvements: Specific ways to improve
        5. missing_elements: Key points they should have included
        6. revised_answer: An improved version of their answer
        7. follow_up_questions: What an interviewer might ask next

        Be encouraging but honest. Focus on actionable feedback."""
    }


# Tool: Mock Interview Session
mock_interview = FunctionTool(
    name="start_mock_interview",
    description="Start a mock interview session with multiple rounds of questions.",
    parameters={
        "type": "object",
        "properties": {
            "job_title": {
                "type": "string",
                "description": "The job title to interview for"
            },
            "company": {
                "type": "string",
                "description": "Company name for context (optional)"
            },
            "interview_type": {
                "type": "string",
                "enum": ["phone_screen", "hiring_manager", "technical", "behavioral", "final_round"],
                "description": "Type of interview to simulate"
            },
            "duration_minutes": {
                "type": "integer",
                "description": "Target duration (determines number of questions)"
            }
        },
        "required": ["job_title", "interview_type"]
    },
    execute=lambda params: _start_mock_interview(
        params["job_title"],
        params.get("company"),
        params["interview_type"],
        params.get("duration_minutes", 30)
    )
)


def _start_mock_interview(
    job_title: str,
    company: Optional[str],
    interview_type: str,
    duration_minutes: int
) -> dict:
    """Initialize mock interview session."""
    questions_count = max(3, duration_minutes // 5)

    interview_structures = {
        "phone_screen": {
            "intro": "Hi, thanks for taking the time to speak with us today. I'm from the recruiting team.",
            "sections": ["background", "motivation", "role_fit", "questions_for_us"],
            "tone": "friendly, screening for basics"
        },
        "hiring_manager": {
            "intro": f"Thanks for coming in. I'm the hiring manager for this {job_title} role.",
            "sections": ["experience_deep_dive", "leadership", "problem_solving", "team_fit"],
            "tone": "conversational but evaluative"
        },
        "technical": {
            "intro": "Let's dive into some technical questions to understand your expertise.",
            "sections": ["technical_knowledge", "problem_solving", "system_design", "debugging"],
            "tone": "focused, detail-oriented"
        },
        "behavioral": {
            "intro": "I'd like to learn more about how you've handled various situations in the past.",
            "sections": ["leadership", "conflict", "failure", "achievement", "teamwork"],
            "tone": "probing, looking for specific examples"
        },
        "final_round": {
            "intro": "Thanks for making it to the final round. We're excited to learn more about you.",
            "sections": ["vision", "culture_fit", "leadership", "strategic_thinking"],
            "tone": "senior, strategic focus"
        }
    }

    structure = interview_structures.get(interview_type, interview_structures["behavioral"])

    return {
        "status": "success",
        "interview_type": interview_type,
        "job_title": job_title,
        "company": company,
        "questions_planned": questions_count,
        "structure": structure,
        "instruction": f"""You are now conducting a {interview_type} interview for a {job_title} role{' at ' + company if company else ''}.

        Opening: {structure['intro']}

        Interview structure:
        - Total questions: {questions_count}
        - Sections to cover: {', '.join(structure['sections'])}
        - Tone: {structure['tone']}

        Guidelines:
        1. Ask one question at a time
        2. Wait for the candidate's answer
        3. Ask natural follow-up questions based on their response
        4. Provide brief acknowledgment before moving to next topic
        5. At the end, offer time for candidate questions
        6. After the interview, provide overall feedback

        Start the interview now with your opening and first question."""
    }


# Tool: Prepare for Specific Company
company_prep = FunctionTool(
    name="prepare_for_company",
    description="Generate company-specific interview preparation including likely questions, culture insights, and talking points.",
    parameters={
        "type": "object",
        "properties": {
            "company": {
                "type": "string",
                "description": "Company name to prepare for"
            },
            "job_title": {
                "type": "string",
                "description": "The specific role"
            },
            "cv_text": {
                "type": "string",
                "description": "Candidate CV for personalized prep (optional)"
            }
        },
        "required": ["company", "job_title"]
    },
    execute=lambda params: _company_prep_impl(
        params["company"],
        params["job_title"],
        params.get("cv_text")
    )
)


def _company_prep_impl(
    company: str,
    job_title: str,
    cv_text: Optional[str]
) -> dict:
    """Prepare for company-specific interview."""
    return {
        "status": "success",
        "instruction": f"""Create a comprehensive interview preparation guide for {job_title} at {company}.

        Include:
        1. company_overview:
           - What they do
           - Company culture and values
           - Recent news/developments
           - Interview process reputation

        2. likely_questions: Top 10 questions they typically ask
           - Include famous questions if the company has them
           - Company values-based questions

        3. talking_points: Key achievements/experiences to highlight
           {'Based on the CV provided, identify specific examples to use.' if cv_text else ''}

        4. questions_to_ask: Smart questions that show research and interest

        5. red_flags_to_watch: Things to look out for during the interview

        6. salary_negotiation: Tips specific to this company

        7. interview_tips: Company-specific advice (dress code, format, etc.)

        Base this on publicly available information about {company}'s interview process and culture."""
    }
