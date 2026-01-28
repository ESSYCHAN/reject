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
    // First try to get subscription by userId
    let subscription = await db.getSubscription(userId);

    // If no subscription found, try to get user's email from Clerk and check by email
    if (!subscription) {
      try {
        const user = await clerkClient.users.getUser(userId);
        const email = user.emailAddresses?.[0]?.emailAddress;
        if (email) {
          // Check if there's a subscription linked to this email in users table
          const userByEmail = await db.query(
            'SELECT u.id, s.status, s.plan_type FROM users u LEFT JOIN subscriptions s ON u.id = s.user_id WHERE LOWER(u.email) = LOWER($1)',
            [email]
          );
          if (userByEmail.rows[0]?.status) {
            subscription = {
              status: userByEmail.rows[0].status,
              plan_type: userByEmail.rows[0].plan_type
            };
            console.log(`Found subscription by email ${email}: status=${subscription.status}`);

            // Also migrate the subscription to this userId if it belongs to a different user
            const existingUserId = userByEmail.rows[0].id;
            if (existingUserId !== userId) {
              console.log(`Migrating subscription from ${existingUserId} to ${userId}`);
              // Upsert the current user
              await db.upsertUser(userId, email);
              // Copy subscription to new userId
              await db.updateSubscription(userId, {
                status: subscription.status,
                planType: subscription.plan_type
              });
            }
          }
        }
      } catch (clerkError) {
        console.error('Failed to check subscription by email:', clerkError);
      }
    }

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

// Get user's rejection archive (persists even after app deletion)
router.get('/rejection-archive', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const archive = await db.getUserRejectionArchive(userId);
    res.json({ archive });
  } catch (error) {
    console.error('Error fetching rejection archive:', error);
    res.status(500).json({ error: 'Failed to fetch rejection archive' });
  }
});

// Sync user from Clerk (called on first API request)
router.post('/sync', requireAuth(), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Get email from request body (preferred - client already has it from Clerk)
    let email = req.body.email;

    if (!email) {
      // Fetch from Clerk API if not provided
      try {
        const user = await clerkClient.users.getUser(userId);
        email = user.emailAddresses?.[0]?.emailAddress;
      } catch {
        // Clerk lookup failed, continue without email
      }
    }

    // Try to upsert the user - if this fails, still return success if we can
    try {
      await db.upsertUser(userId, email || '');
    } catch (dbError) {
      console.error('Failed to upsert user:', dbError);
    }

    // Check if this email has a Pro subscription we should link
    if (email) {
      try {
        const existingSub = await db.query(
          'SELECT u.id, s.status, s.plan_type FROM users u JOIN subscriptions s ON u.id = s.user_id WHERE LOWER(u.email) = LOWER($1) AND s.status IN ($2, $3)',
          [email, 'active', 'pro']
        );
        if (existingSub.rows[0] && existingSub.rows[0].id !== userId) {
          await db.updateSubscription(userId, {
            status: existingSub.rows[0].status,
            planType: existingSub.rows[0].plan_type
          });
        }
      } catch (subError) {
        console.error('Failed to check/link subscription:', subError);
      }
    }

    res.json({ success: true, userId, email: email || null });
  } catch (error) {
    console.error('Error syncing user:', error);
    // Return more details in development
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to sync user', details: errorMessage });
  }
});

export default router;
