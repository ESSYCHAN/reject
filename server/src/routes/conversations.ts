import { Router, Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import {
  saveMessage,
  getRecentMessages,
  getSessionMessages,
  saveConversationSummary,
  getConversationSummary,
  buildMayaMemory,
  clearConversationHistory,
  getConversationStats,
  getMessagesForSummarization,
  pruneOldMessages
} from '../db/index.js';

const router = Router();

/**
 * GET /api/conversations/:userId
 * Get recent messages for a user (for restoring chat on refresh)
 */
router.get(
  '/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);
      const { userId } = req.params;

      // Only allow users to fetch their own conversations
      if (auth?.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const messages = await getRecentMessages(userId, limit);

      res.json({ data: messages });
    } catch (error) {
      console.error('[conversations] Error fetching messages:', error);
      next(error);
    }
  }
);

/**
 * GET /api/conversations/session/:sessionId
 * Get messages for a specific session
 */
router.get(
  '/session/:sessionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);

      const messages = await getSessionMessages(sessionId, limit);

      res.json({ data: messages });
    } catch (error) {
      console.error('[conversations] Error fetching session messages:', error);
      next(error);
    }
  }
);

/**
 * POST /api/conversations/save
 * Save a conversation message
 */
router.post(
  '/save',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, sessionId, role, content, agentId } = req.body;

      if (!userId || !sessionId || !role || !content) {
        res.status(400).json({
          error: 'Missing required fields',
          details: 'userId, sessionId, role, and content are required'
        });
        return;
      }

      if (!['user', 'assistant'].includes(role)) {
        res.status(400).json({
          error: 'Invalid role',
          details: 'role must be "user" or "assistant"'
        });
        return;
      }

      const id = await saveMessage(userId, sessionId, role, content, agentId || 'maya');

      res.json({ data: { id, saved: true } });
    } catch (error) {
      console.error('[conversations] Error saving message:', error);
      next(error);
    }
  }
);

/**
 * GET /api/conversations/summary/:userId
 * Get conversation summary for Maya's memory
 */
router.get(
  '/summary/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      const summary = await getConversationSummary(userId);

      res.json({ data: { summary } });
    } catch (error) {
      console.error('[conversations] Error fetching summary:', error);
      next(error);
    }
  }
);

/**
 * POST /api/conversations/summary
 * Save/update conversation summary
 */
router.post(
  '/summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, summary } = req.body;

      if (!userId || !summary) {
        res.status(400).json({
          error: 'Missing required fields',
          details: 'userId and summary are required'
        });
        return;
      }

      await saveConversationSummary(userId, summary);

      res.json({ data: { saved: true } });
    } catch (error) {
      console.error('[conversations] Error saving summary:', error);
      next(error);
    }
  }
);

/**
 * GET /api/conversations/memory/:userId
 * Get Maya's full memory context (summary + recent messages)
 * Used by the Python agent server to inject context
 */
router.get(
  '/memory/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      const memory = await buildMayaMemory(userId);

      res.json({ data: { memory } });
    } catch (error) {
      console.error('[conversations] Error building memory:', error);
      next(error);
    }
  }
);

/**
 * DELETE /api/conversations/:userId
 * Clear all conversation history for a user (fresh start)
 */
router.delete(
  '/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);
      const { userId } = req.params;

      // Only allow users to clear their own conversations
      if (auth?.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      await clearConversationHistory(userId);

      console.log(`[conversations] Cleared history for user ${userId.slice(0, 8)}...`);
      res.json({ data: { cleared: true } });
    } catch (error) {
      console.error('[conversations] Error clearing history:', error);
      next(error);
    }
  }
);

/**
 * GET /api/conversations/stats/:userId
 * Get conversation stats for a user
 */
router.get(
  '/stats/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);
      const { userId } = req.params;

      if (auth?.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      const stats = await getConversationStats(userId);

      res.json({ data: stats });
    } catch (error) {
      console.error('[conversations] Error getting stats:', error);
      next(error);
    }
  }
);

/**
 * POST /api/conversations/summarize/:userId
 * Trigger summarization of old messages
 * This is called periodically or when conversation gets too long
 */
router.post(
  '/summarize/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { summary } = req.body;

      if (!summary) {
        res.status(400).json({ error: 'Summary text required' });
        return;
      }

      // Save the new summary
      await saveConversationSummary(userId, summary);

      // Prune old messages (keep last 20)
      const prunedCount = await pruneOldMessages(userId, 20);

      console.log(`[conversations] Summarized and pruned ${prunedCount} messages for user ${userId.slice(0, 8)}...`);
      res.json({ data: { summarized: true, prunedMessages: prunedCount } });
    } catch (error) {
      console.error('[conversations] Error summarizing:', error);
      next(error);
    }
  }
);

/**
 * GET /api/conversations/to-summarize/:userId
 * Get messages that need to be summarized (for the AI to process)
 */
router.get(
  '/to-summarize/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      const messages = await getMessagesForSummarization(userId, 20);

      res.json({ data: { messages, count: messages.length } });
    } catch (error) {
      console.error('[conversations] Error getting messages to summarize:', error);
      next(error);
    }
  }
);

export default router;
