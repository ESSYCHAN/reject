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
export const authMiddleware = clerkMiddleware();

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
