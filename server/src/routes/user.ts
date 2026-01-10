import { Router, Request, Response } from 'express';
import { requireAuth, getAuth, clerkClient } from '@clerk/express';
import * as db from '../db/index.js';

const router = Router();

function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

const FREE_LIMITS = {
  decodes: 5,
  applications: 10,
  insights: 3,
  roleFits: 3
};

// Get current user's subscription and usage
router.get('/me', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const subscription = await db.getSubscription(userId);
    const isPro = subscription?.status === 'pro' || subscription?.status === 'active';

    const monthKey = getMonthKey();
    const usage = await db.getUsage(userId, monthKey);

    res.json({
      userId,
      subscription: {
        isPro,
        status: subscription?.status || 'free',
        planType: subscription?.plan_type
      },
      usage: {
        decodes: {
          used: usage.decodes || 0,
          limit: isPro ? 'unlimited' : FREE_LIMITS.decodes
        },
        applications: {
          used: usage.applications || 0,
          limit: isPro ? 'unlimited' : FREE_LIMITS.applications
        },
        insights: {
          used: usage.insights || 0,
          limit: isPro ? 'unlimited' : FREE_LIMITS.insights
        },
        roleFits: {
          used: usage.roleFits || 0,
          limit: isPro ? 'unlimited' : FREE_LIMITS.roleFits
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

// Increment usage (called after each action)
router.post('/usage/:action', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { action } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const validActions = ['decodes', 'applications', 'insights', 'roleFits'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    const subscription = await db.getSubscription(userId);
    const isPro = subscription?.status === 'pro' || subscription?.status === 'active';

    // Check limits for free users
    if (!isPro) {
      const monthKey = getMonthKey();
      const usage = await db.getUsage(userId, monthKey);
      const currentUsage = usage[action] || 0;
      const limit = FREE_LIMITS[action as keyof typeof FREE_LIMITS];

      if (currentUsage >= limit) {
        return res.status(403).json({
          error: 'Limit reached',
          action,
          used: currentUsage,
          limit
        });
      }
    }

    // Increment usage
    const monthKey = getMonthKey();
    const newCount = await db.incrementUsage(userId, action, monthKey);

    res.json({
      success: true,
      action,
      used: newCount,
      limit: isPro ? 'unlimited' : FREE_LIMITS[action as keyof typeof FREE_LIMITS]
    });
  } catch (error) {
    console.error('Error incrementing usage:', error);
    res.status(500).json({ error: 'Failed to update usage' });
  }
});

// Check if user can perform action (without incrementing)
router.get('/can-use/:action', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { action } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const subscription = await db.getSubscription(userId);
    const isPro = subscription?.status === 'pro' || subscription?.status === 'active';

    if (isPro) {
      return res.json({ allowed: true, remaining: 'unlimited' });
    }

    const monthKey = getMonthKey();
    const usage = await db.getUsage(userId, monthKey);
    const limit = FREE_LIMITS[action as keyof typeof FREE_LIMITS] || 0;
    const used = usage[action] || 0;
    const remaining = Math.max(0, limit - used);

    res.json({
      allowed: remaining > 0,
      remaining,
      limit,
      used
    });
  } catch (error) {
    console.error('Error checking usage:', error);
    res.status(500).json({ error: 'Failed to check usage' });
  }
});

// Sync user from Clerk (called on first API request)
router.post('/sync', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Get email from Clerk
    let email = req.body.email;

    if (!email) {
      // Fetch from Clerk API if not provided
      try {
        const user = await clerkClient.users.getUser(userId);
        email = user.emailAddresses?.[0]?.emailAddress;
        console.log(`User sync: fetched email ${email} for userId ${userId}`);
      } catch (clerkError) {
        // Log but don't fail - user can still be synced with null email
        console.error('Failed to get user from Clerk (continuing anyway):', clerkError);
      }
    }

    await db.upsertUser(userId, email || '');
    console.log(`User sync: successfully upserted user ${userId}`);
    res.json({ success: true, userId, email: email || null });
  } catch (error) {
    console.error('Error syncing user:', error);
    // Return more details in development
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to sync user', details: errorMessage });
  }
});

export default router;
