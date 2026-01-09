import * as db from '../db/index.js';

interface ConvertKitResponse {
  subscription?: {
    id: number;
    subscriber: {
      id: number;
      email_address: string;
    };
  };
  error?: string;
  message?: string;
}

async function saveEmailToDb(email: string): Promise<boolean> {
  try {
    await db.query(
      `INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
      [email]
    );
    return true;
  } catch (error) {
    console.error('Database error saving subscriber:', error);
    return false;
  }
}

export async function subscribeToConvertKit(email: string): Promise<{ success: boolean; message: string }> {
  const apiKey = process.env.CONVERTKIT_API_KEY;
  const formId = process.env.CONVERTKIT_FORM_ID;

  // Always save to database as backup
  const savedLocally = await saveEmailToDb(email);

  // If ConvertKit isn't configured, we're done
  if (!apiKey || !formId || apiKey === 'your-convertkit-api-key-here') {
    console.log('ConvertKit not configured, saved to database');
    return {
      success: true,
      message: 'Thanks for subscribing!'
    };
  }

  // Try ConvertKit API
  try {
    const response = await fetch(`https://api.convertkit.com/v3/forms/${formId}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        email: email
      })
    });

    const data = await response.json() as ConvertKitResponse;

    if (!response.ok) {
      const errorMessage = data.message || data.error || 'Subscription failed';
      console.error('ConvertKit API error:', response.status);
      // Still return success since we saved locally
      if (savedLocally) {
        return {
          success: true,
          message: 'Thanks for subscribing!'
        };
      }
      throw new Error(errorMessage);
    }

    if (data.subscription) {
      return {
        success: true,
        message: 'Successfully subscribed!'
      };
    }

    // Fallback - if we saved locally, still success
    if (savedLocally) {
      return {
        success: true,
        message: 'Thanks for subscribing!'
      };
    }

    throw new Error('Unexpected response from email service');
  } catch (error) {
    // If ConvertKit fails but we saved locally, still success
    if (savedLocally) {
      console.log('ConvertKit failed, but saved locally');
      return {
        success: true,
        message: 'Thanks for subscribing!'
      };
    }
    throw error;
  }
}
