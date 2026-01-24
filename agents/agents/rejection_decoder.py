"""Rejection Decoder Agent - Analyzes rejection emails and provides coaching."""

from google.adk import LlmAgent, FunctionTool


# Tool: Decode rejection email
decode_rejection = FunctionTool(
    name="decode_rejection",
    description="Analyze a rejection email to determine what it really means, what stage it was sent from, and what the candidate can learn.",
    parameters={
        "type": "object",
        "properties": {
            "rejection_text": {
                "type": "string",
                "description": "The full text of the rejection email"
            },
            "job_title": {
                "type": "string",
                "description": "The job they applied for (optional)"
            },
            "company": {
                "type": "string",
                "description": "The company name (optional)"
            },
            "application_context": {
                "type": "string",
                "description": "Any context about their application (how far they got, etc.)"
            }
        },
        "required": ["rejection_text"]
    },
    execute=lambda params: {
        "status": "success",
        "instruction": f"""Analyze this rejection email and provide:

        1. **Stage Detection**
           - Where in the process was this sent?
           - ATS/automated (before human review)
           - Recruiter screen
           - Hiring manager review
           - Post-interview
           - Final round rejection
           - Offer stage

        2. **What It Really Means**
           - Decode the corporate speak
           - What's the actual reason (as far as can be inferred)?
           - Is this a form letter or personalized?

        3. **Likelihood Assessment**
           - Was this competitive or were they never in the running?
           - Signs they were a strong candidate
           - Signs it was a quick filter

        4. **What They Can Learn**
           - If ATS: Likely keyword/qualification mismatch
           - If recruiter: Positioning or fit issues
           - If post-interview: Specific feedback (if any)

        5. **Actionable Next Steps**
           - Should they reapply in the future?
           - How to improve for similar roles
           - Whether to ask for feedback (and how)

        6. **Emotional Support**
           - Normalize the rejection
           - Perspective on the process
           - Encouragement to continue

        Rejection email: {params['rejection_text']}
        Job: {params.get('job_title', 'Not specified')}
        Company: {params.get('company', 'Not specified')}
        Context: {params.get('application_context', 'None provided')}"""
    }
)


# Tool: Analyze rejection patterns
analyze_patterns = FunctionTool(
    name="analyze_rejection_patterns",
    description="Analyze multiple rejections to identify patterns and systemic issues.",
    parameters={
        "type": "object",
        "properties": {
            "rejections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "company": {"type": "string"},
                        "role": {"type": "string"},
                        "stage": {"type": "string"},
                        "rejection_text": {"type": "string"}
                    }
                },
                "description": "List of rejection data"
            }
        },
        "required": ["rejections"]
    },
    execute=lambda params: {
        "status": "success",
        "instruction": """Analyze these rejections for patterns:

        1. **Stage Distribution**
           - How many at each stage?
           - If mostly ATS: CV/keyword issues
           - If mostly recruiter: Positioning issues
           - If mostly post-interview: Interview performance

        2. **Common Themes**
           - Similar reasons across rejections?
           - Role type patterns?
           - Company type patterns?

        3. **Systemic Issues**
           - What's the root cause?
           - CV issues vs interview issues vs targeting issues

        4. **Recommendations**
           - Prioritized list of what to fix
           - Specific actions to take
           - What to try differently

        5. **Encouragement**
           - Contextualize their success rate
           - Industry norms for applications:interviews
           - Progress indicators"""
    }
)


# Tool: Draft follow-up
draft_followup = FunctionTool(
    name="draft_rejection_followup",
    description="Draft a professional follow-up email to request feedback after rejection.",
    parameters={
        "type": "object",
        "properties": {
            "rejection_stage": {
                "type": "string",
                "enum": ["ats", "recruiter", "post_phone_screen", "post_interview", "final_round"],
                "description": "At what stage they were rejected"
            },
            "company": {
                "type": "string",
                "description": "Company name"
            },
            "interviewer_name": {
                "type": "string",
                "description": "Name of interviewer/contact if known"
            },
            "what_to_ask": {
                "type": "string",
                "description": "What specific feedback they want"
            }
        },
        "required": ["rejection_stage", "company"]
    },
    execute=lambda params: {
        "status": "success",
        "instruction": f"""Draft a professional follow-up email for:

        Stage: {params['rejection_stage']}
        Company: {params['company']}
        Contact: {params.get('interviewer_name', 'Unknown')}
        Specific question: {params.get('what_to_ask', 'General feedback')}

        Guidelines:
        - Keep it SHORT (3-5 sentences max)
        - Be gracious, not defensive
        - Make the ask specific and easy to answer
        - Don't ask if ATS rejection (no one to ask)
        - Express genuine interest in feedback
        - Leave door open for future opportunities

        Provide:
        - email_subject: Short, professional subject line
        - email_body: The email text
        - when_to_send: Timing advice
        - expectations: Realistic expectations for response"""
    }
)


# The Rejection Decoder Agent
rejection_decoder_agent = LlmAgent(
    name="rejection_decoder",
    model="gemini-2.0-flash",
    description="Analyzes rejection emails to explain what happened, why, and what to do next. Provides emotional support and actionable advice.",
    instruction="""You are a supportive career coach who helps people understand and learn from job rejections. You decode corporate speak, identify patterns, and help them improve.

## Your Philosophy

Rejection is information, not failure. Every "no" teaches something and gets them closer to the right "yes."

## When Someone Shares a Rejection

### 1. Acknowledge Their Feelings
- Rejections sting - validate that
- Don't minimize or rush to silver linings
- Then shift to constructive analysis

### 2. Decode the Email

**Stage Detection**
Identify where this happened:
- **ATS/Auto-reject**: Generic, fast, no human saw the application
- **Recruiter Screen**: Post-resume review, before interviews
- **Post-Interview**: After speaking with humans
- **Final Round**: Close but didn't make it
- **Post-Offer**: Rare but happens (rescinded offers)

**Translation**
Decode common phrases:
- "Moved forward with candidates whose experience more closely matches" =
  You didn't have a specific requirement (or they had internal candidate)
- "Highly competitive role" =
  Many applicants, you didn't stand out enough
- "Not the right fit at this time" =
  Vague - could be skills, culture, or just better candidates
- "Keep your resume on file" =
  Standard line, rarely means anything
- "Encourage you to apply for future roles" =
  Sometimes genuine, especially if you made it far

### 3. Help Them Learn

Based on the stage:

**ATS Rejection**
- CV likely didn't have right keywords
- May not have met minimum requirements
- Check: Did they apply to a realistic role?

**Recruiter Rejection**
- Resume didn't tell a compelling story
- Positioning may be off
- May have been outcompeted on specific criteria

**Post-Interview Rejection**
- Interview performance matters
- Could be technical, behavioral, or culture fit
- Worth asking for specific feedback

### 4. Actionable Next Steps

- What to improve for next time
- Whether to follow up (and how)
- How to reframe for future applications
- Similar roles that might be better fits

### 5. Emotional Support

- Normalize the process (most applications don't succeed)
- Share perspective (top candidates get rejected all the time)
- Encourage persistence
- Celebrate what they did right

## Pattern Analysis

When they've had multiple rejections:
- Look for common stages (all ATS = CV issue)
- Look for common feedback themes
- Identify if they're targeting wrong roles
- Calculate realistic expectations

## Communication Style
- Empathetic first, analytical second
- Honest but not harsh
- Focus on what's controllable
- Celebrate small wins
- Be the supportive friend who's also strategic

## Remember
- Rejection is part of every successful job search
- The goal is to learn and improve, not to dwell
- Help them see progress, not just setbacks
- Sometimes the rejection was about them; sometimes it wasn't""",
    tools=[
        decode_rejection,
        analyze_patterns,
        draft_followup,
    ]
)
