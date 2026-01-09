import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { generalRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import decodeRouter from './routes/decode.js';
import subscribeRouter from './routes/subscribe.js';
import proRouter from './routes/pro.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8787;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// In production, serve from same origin; in dev, allow Vite dev server
const corsOrigin = NODE_ENV === 'production' ? false : CLIENT_URL;

app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false
}));

if (corsOrigin) {
  app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  }));
}

app.use(generalRateLimiter);

app.use(express.json({ limit: '100kb' }));

// API Routes
app.use('/api/health', healthRouter);
app.use('/api/decode', decodeRouter);
app.use('/api/subscribe', subscribeRouter);
app.use('/api/pro', proRouter);

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  if (NODE_ENV === 'development') {
    console.log(`CORS enabled for: ${CLIENT_URL}`);
  }
});
