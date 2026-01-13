import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { generalRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { initDatabase } from './db/index.js';
import healthRouter from './routes/health.js';
import decodeRouter from './routes/decode.js';
import subscribeRouter from './routes/subscribe.js';
import proRouter from './routes/pro.js';
import userRouter from './routes/user.js';
import applicationsRouter from './routes/applications.js';
import stripeWebhookRouter from './routes/stripe-webhook.js';
import knowledgeRouter from './routes/knowledge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8787;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Trust proxy for Railway/production deployments (needed for rate limiter)
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// In production, serve from same origin; in dev, allow Vite dev server
const corsOrigin = NODE_ENV === 'production' ? false : CLIENT_URL;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://*.clerk.accounts.dev", "https://clerk.com", "https://clerk.tryreject.co.uk", "https://plausible.io"],
      connectSrc: ["'self'", "https://*.clerk.accounts.dev", "https://clerk.com", "https://api.clerk.com", "https://clerk.tryreject.co.uk", "https://plausible.io"],
      frameSrc: ["'self'", "https://*.clerk.accounts.dev", "https://clerk.com", "https://clerk.tryreject.co.uk"],
      imgSrc: ["'self'", "data:", "https://*.clerk.com", "https://*.clerk.accounts.dev", "https://clerk.tryreject.co.uk"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      workerSrc: ["'self'", "blob:"],
    }
  }
}));

if (corsOrigin) {
  app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
}

app.use(generalRateLimiter);

// Stripe webhook needs raw body for signature verification
// Must be before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookRouter);

app.use(express.json({ limit: '100kb' }));

// Other Stripe routes (after JSON parsing)
app.use('/api/stripe', stripeWebhookRouter);

// Clerk auth middleware - adds auth info to all requests
app.use(authMiddleware);

// API Routes
app.use('/api/health', healthRouter);
app.use('/api/decode', decodeRouter);
app.use('/api/subscribe', subscribeRouter);
app.use('/api/pro', proRouter);
app.use('/api/user', userRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/knowledge', knowledgeRouter);

// In production, serve the Vite build
if (NODE_ENV === 'production') {
  const clientDistPath = join(__dirname, '../../client/dist');

  if (existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));

    // SPA fallback - serve index.html for non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(join(clientDistPath, 'index.html'));
    });
  } else {
    console.warn('Warning: Client dist folder not found. Run "npm run build:client" first.');
  }
}

app.use(errorHandler);

// 404 handler for API routes
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found' });
  } else if (NODE_ENV !== 'production') {
    res.status(404).json({ error: 'Not found. In development, use the Vite dev server for the frontend.' });
  }
});

// Initialize database and start server
async function start() {
  try {
    // Only init DB if DATABASE_URL is set
    if (process.env.DATABASE_URL) {
      await initDatabase();
      console.log('Database connected');
    } else {
      console.log('No DATABASE_URL - using in-memory storage');
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Environment: ${NODE_ENV}`);
      if (NODE_ENV === 'development') {
        console.log(`CORS enabled for: ${CLIENT_URL}`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
