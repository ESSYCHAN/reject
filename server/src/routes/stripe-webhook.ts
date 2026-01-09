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
        const userId = session.client_reference_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

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
