# REJECT AI Agents

AI-powered career coaching agents built with Google ADK (Agent Development Kit).

## Agents

| Agent | Purpose |
|-------|---------|
| **Career Coach** | Root orchestrator - routes to specialists |
| **CV Builder** | Creates CVs from scratch |
| **Resume Coach** | Analyzes and improves existing CVs |
| **Career Agent** | Searches jobs globally, matches to CV |
| **Job Advisor** | Deep analysis of job descriptions |
| **Interview Coach** | Mock interviews and preparation |
| **Rejection Decoder** | Analyzes rejections, finds patterns |

## Setup

### Prerequisites

- Python 3.10+
- Google Gemini API key

### Installation

```bash
cd agents

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys
```

### Environment Variables

```env
# Required
GEMINI_API_KEY=your_gemini_api_key

# Optional - for job search
JSEARCH_API_KEY=your_rapidapi_key
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_API_KEY=your_adzuna_api_key
```

## Running

### ADK Dev UI (Recommended for development)

```bash
# Run with ADK dev tools
npx @google/adk-devtools web

# Access at http://localhost:8000
```

### ADK CLI

```bash
# Chat with agent in terminal
npx @google/adk-devtools run main.py
```

### FastAPI Server (For React frontend)

```bash
# Run API server
python server.py

# Or with uvicorn
uvicorn server:app --reload --port 8080
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/agents` | GET | List available agents |
| `/chat` | POST | Chat with any agent |
| `/analyze/cv` | POST | Analyze CV |
| `/search/jobs` | POST | Search for jobs |
| `/analyze/job` | POST | Analyze job description |
| `/decode/rejection` | POST | Decode rejection email |
| `/prepare/interview` | POST | Get interview prep |

## Architecture

```
agents/
├── agents/           # Agent definitions
│   ├── cv_builder.py
│   ├── resume_coach.py
│   ├── career_agent.py
│   ├── job_advisor.py
│   ├── interview_coach.py
│   ├── rejection_decoder.py
│   └── root_agent.py
├── tools/            # Shared tools
│   ├── cv_tools.py
│   ├── job_tools.py
│   └── interview_tools.py
├── main.py           # ADK entry point
├── server.py         # FastAPI server
└── requirements.txt
```

## Deployment

### Local Development

```bash
python server.py
```

### Vertex AI Agent Engine

```bash
# Deploy to Google Cloud
adk deploy --target vertex-ai
```

### Cloud Run

```bash
# Build and deploy
gcloud run deploy reject-agents \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

## Integration with React Frontend

The agents expose a REST API that the React frontend can call:

```typescript
// Example: Chat with career coach
const response = await fetch('http://localhost:8080/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "Help me find PM jobs in London",
    agent: "career_coach"
  })
});

const data = await response.json();
console.log(data.response);
```

## Development

### Adding a New Agent

1. Create agent file in `agents/`
2. Define tools in `tools/` if needed
3. Export from `agents/__init__.py`
4. Add to `AGENTS` dict in `server.py`
5. Add API endpoints if needed

### Testing Agents

```bash
# Run with ADK CLI for quick testing
npx @google/adk-devtools run main.py

# Or use the web UI
npx @google/adk-devtools web
```
