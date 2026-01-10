import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import * as db from '../db/index.js';

const router = Router();

// Initialize Stripe lazily to avoid startup errors when env var is missing
let stripeInstance: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    stripeInstance = new Stripe(key);
  }
  return stripeInstance;
}

// Stripe webhook endpoint
// Note: This needs raw body, so it should be mounted before express.json()
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event: Stripe.Event;

  try {
    // req.body should be raw buffer for webhook signature verification
    event = getStripe().webhooks.constructEvent(
      req.body,
      sig as string,
      webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Get user ID from client_reference_id (set when creating checkout)
        let userId = session.client_reference_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const customerEmail = session.customer_details?.email || session.customer_email;

        // If no client_reference_id, try to find user by email
        if (!userId && customerEmail) {
          const userResult = await db.query(
            'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
            [customerEmail]
          );
          if (userResult.rows[0]) {
            userId = userResult.rows[0].id;
            console.log(`Found user by email: ${customerEmail} -> ${userId}`);
          }
        }

        if (userId) {
          // Determine plan type from the amount
          const amount = session.amount_total || 0;
          const planType = amount >= 9900 ? 'yearly' : 'monthly';

          await db.updateSubscription(userId, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            status: 'active',
            planType
          });

          console.log(`User ${userId} upgraded to Pro (${planType})`);
        } else {
          // Store the payment info anyway, can be linked later
          console.log(`Payment received but no user found. Email: ${customerEmail}, Customer: ${customerId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by customer ID and update
        const result = await db.query(
          'SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1',
          [customerId]
        );

        if (result.rows[0]) {
          const userId = result.rows[0].user_id;
          await db.updateSubscription(userId, {
            status: subscription.status === 'active' ? 'active' : 'inactive'
          });
          console.log(`User ${userId} subscription updated: ${subscription.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by customer ID and downgrade
        const result = await db.query(
          'SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1',
          [customerId]
        );

        if (result.rows[0]) {
          const userId = result.rows[0].user_id;
          await db.updateSubscription(userId, {
            status: 'canceled'
          });
          console.log(`User ${userId} subscription canceled`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Failed to process webhook' });
  }

  res.json({ received: true });
});

// List all users (for debugging)
router.get('/list-users', async (_req: Request, res: Response) => {
  try {
    const result = await db.query('SELECT id, email, created_at FROM users ORDER BY created_at DESC LIMIT 20');
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Manual subscription activation (for admin use when webhook missed)
router.post('/activate-pro', async (req: Request, res: Response) => {
  const { email, planType, userId: directUserId } = req.body;

  if (!email && !directUserId) {
    return res.status(400).json({ error: 'Email or userId required' });
  }

  try {
    let userId = directUserId;

    // Find user by email if no direct userId provided
    if (!userId && email) {
      const userResult = await db.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );

      if (!userResult.rows[0]) {
        // List available users for debugging
        const allUsers = await db.query('SELECT id, email FROM users LIMIT 10');
        return res.status(404).json({
          error: 'User not found with that email',
          searchedEmail: email,
          availableUsers: allUsers.rows
        });
      }

      userId = userResult.rows[0].id;
    }

    await db.updateSubscription(userId, {
      status: 'active',
      planType: planType || 'yearly'
    });

    console.log(`Manually activated Pro for ${email || userId} (${userId})`);
    res.json({ success: true, userId, message: `Pro activated for ${email || userId}` });
  } catch (error) {
    console.error('Error activating Pro:', error);
    res.status(500).json({ error: 'Failed to activate Pro' });
  }
});

// Create Stripe Customer Portal session for managing subscription
router.post('/create-portal-session', async (req: Request, res: Response) => {
  const { customerId, returnUrl } = req.body;

  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID required' });
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || process.env.CLIENT_URL || 'http://localhost:5173'
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// Cancel subscription
router.post('/cancel-subscription', async (req: Request, res: Response) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  try {
    // Get the subscription from database
    const result = await db.query(
      'SELECT stripe_subscription_id, stripe_customer_id FROM subscriptions WHERE user_id = $1',
      [userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const { stripe_subscription_id, stripe_customer_id } = result.rows[0];

    if (!stripe_subscription_id) {
      // No Stripe subscription, just update database status
      await db.updateSubscription(userId, { status: 'canceled' });
      return res.json({ success: true, message: 'Subscription canceled' });
    }

    // Cancel the subscription in Stripe (at period end to let them use remaining time)
    await getStripe().subscriptions.update(stripe_subscription_id, {
      cancel_at_period_end: true
    });

    // Update database
    await db.updateSubscription(userId, { status: 'canceling' });

    console.log(`User ${userId} subscription set to cancel at period end`);
    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the billing period',
      customerId: stripe_customer_id
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Get subscription details (for showing in UI)
router.get('/subscription/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    const result = await db.query(
      'SELECT status, plan_type, stripe_customer_id, stripe_subscription_id, current_period_end FROM subscriptions WHERE user_id = $1',
      [userId]
    );

    if (!result.rows[0]) {
      return res.json({ subscription: null });
    }

    const sub = result.rows[0];
    res.json({
      subscription: {
        status: sub.status,
        planType: sub.plan_type,
        customerId: sub.stripe_customer_id,
        currentPeriodEnd: sub.current_period_end
      }
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Create checkout session with user ID
router.post('/create-checkout', async (req: Request, res: Response) => {
  const { userId, priceId, successUrl, cancelUrl } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || `${process.env.CLIENT_URL}?success=true`,
      cancel_url: cancelUrl || `${process.env.CLIENT_URL}?canceled=true`,
      client_reference_id: userId, // Links payment to user
      metadata: { userId }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

export default router;
