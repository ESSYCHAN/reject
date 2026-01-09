import { clerkMiddleware, getAuth, requireAuth } from '@clerk/express';
import { Request, Response, NextFunction } from 'express';

// Extend Express Request type to include auth
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Basic Clerk middleware - adds auth info to all requests
// Wraps in error handler to prevent crashes
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const middleware = clerkMiddleware();
    middleware(req, res, next);
  } catch (error) {
    console.error('Clerk middleware error:', error);
    next(); // Continue without auth if Clerk fails
  }
};

// Middleware that requires authentication
export const requireAuthentication = requireAuth();

// Optional auth - extracts user ID if authenticated, continues if not
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = getAuth(req);
  req.userId = auth.userId ?? undefined;
  next();
}

// Helper to get user ID from request
export function getUserId(req: Request): string | null {
  const auth = getAuth(req);
  return auth.userId;
}
