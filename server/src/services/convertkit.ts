import Database from 'better-sqlite3';
import { join } from 'path';

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

// Initialize SQLite database for subscriber storage
const DB_PATH = join(process.cwd(), 'data', 'subscribers.db');
let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const { mkdirSync, existsSync } = require('fs');
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Create table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        subscribed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'website'
      )
    `);
  }
  return db;
}

function saveEmailToDb(email: string): boolean {
  const database = getDb();
  try {
    const stmt = database.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)');
    const result = stmt.run(email);
    return result.changes > 0;
  } catch (error) {
    console.error('Database error saving subscriber:', error);
    return false;
  }
}

export function getSubscriberCount(): number {
  const database = getDb();
  const result = database.prepare('SELECT COUNT(*) as count FROM subscribers').get() as { count: number };
  return result.count;
}

export function getAllSubscribers(): string[] {
  const database = getDb();
  const rows = database.prepare('SELECT email FROM subscribers ORDER BY subscribed_at DESC').all() as { email: string }[];
  return rows.map(row => row.email);
}

export async function subscribeToConvertKit(email: string): Promise<{ success: boolean; message: string }> {
  const apiKey = process.env.CONVERTKIT_API_KEY;
  const formId = process.env.CONVERTKIT_FORM_ID;

  // Always save to local DB as backup
  const savedLocally = saveEmailToDb(email);

  // If ConvertKit isn't configured, we're done
  if (!apiKey || !formId || apiKey === 'your-convertkit-api-key-here') {
    console.log('ConvertKit not configured, saved to local database');
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
