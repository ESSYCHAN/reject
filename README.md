# Reject

Turn job rejections into insights. Decode rejection emails and track your applications.

## Features

- **Rejection Decoder**: Paste a rejection email and get AI-powered analysis including category, signals, recommended actions, and follow-up templates
- **Application Tracker**: Track your job applications with status updates and statistics (stored locally)
- **Email Capture**: Subscribe to weekly rejection insights newsletter

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Backend**: Node + Express + TypeScript
- **AI**: OpenAI GPT-4o-mini
- **Email**: ConvertKit
- **Storage**: localStorage (client-side)

## Prerequisites

- Node.js 20+
- OpenAI API key
- ConvertKit API key and Form ID (optional, for email capture)

## Setup

### 1. Clone and install dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Configure environment variables

```bash
# In the server directory
cp .env.example .env
```

Edit `.env` with your API keys:

```
PORT=8787
NODE_ENV=development
OPENAI_API_KEY=sk-your-openai-api-key
CONVERTKIT_API_KEY=your-convertkit-api-key
CONVERTKIT_FORM_ID=your-form-id
CLIENT_URL=http://localhost:5173
```

### 3. Run the application

Open two terminal windows:

**Terminal 1 - Server:**
```bash
cd server
npm run dev
```

**Terminal 2 - Client:**
```bash
cd client
npm run dev
```

The client runs at http://localhost:5173 and the server at http://localhost:8787.

## API Endpoints

### Health Check
```
GET /api/health
```

### Decode Rejection Email
```
POST /api/decode
Content-Type: application/json

{
  "emailText": "Thank you for your interest..."
}
```

Response:
```json
{
  "data": {
    "category": "Template",
    "confidence": 0.85,
    "signals": ["generic language", "no personalization"],
    "what_it_means": "...",
    "keep_on_file_truth": "...",
    "reply_worth_it": "Low",
    "next_actions": ["..."],
    "follow_up_template": "..."
  }
}
```

### Subscribe to Newsletter
```
POST /api/subscribe
Content-Type: application/json

{
  "email": "user@example.com"
}
```

## Rate Limits

- Decode endpoint: 10 requests/minute
- Subscribe endpoint: 5 requests/hour
- General: 100 requests/minute

## Security

- CORS restricted to client origin
- Input validation with Zod
- Rate limiting on all endpoints
- Email content not logged
- Helmet for HTTP headers

## Scripts

### Server
- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript
- `npm start` - Run production build
- `npm run typecheck` - Type check without emitting

### Client
- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run typecheck` - Type check without emitting

## Project Structure

```
reject/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── server/
│   ├── src/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── types/
│   │   └── index.ts
│   ├── package.json
│   └── .env.example
└── README.md
```

## License

MIT
