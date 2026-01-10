import rateLimit from 'express-rate-limit';

export const decodeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    error: 'Too many decode requests. Please try again in a minute.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const subscribeRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many subscription attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300, // Increased for app sync
  message: {
    error: 'Too many requests. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for authenticated users on applications endpoint
  skip: (req) => {
    const authHeader = req.headers.authorization;
    const isApplicationsEndpoint = req.path.startsWith('/api/applications');
    return isApplicationsEndpoint && !!authHeader;
  }
});
