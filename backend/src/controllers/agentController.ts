import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { runAgentTurn, runAgentTurnStreaming } from '../services/agentService.js';
import { indexSessionContext, retrieve as retrieveChunks, indexPersona } from '../services/embeddingService.js';
import pool from '../config/database.js';

export async function turn(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { personaId, personaIds, sessionId, history, userMessage, simulationInstructions, previousThinking, image, mimeType } = req.body;

    if (!personaId || !userMessage) {
      return res.status(400).json({ error: 'personaId and userMessage are required' });
    }

    const params = {
      personaId,
      personaIds: personaIds || [personaId],
      sessionId: sessionId || undefined,
      userId: req.userId || undefined,
      history: Array.isArray(history) ? history : [],
      userMessage,
      simulationInstructions: simulationInstructions || undefined,
      previousThinking: previousThinking || undefined,
      image: image || undefined,
      mimeType: mimeType || undefined,
    };

    const wantStream = req.query.stream === '1' || (req.headers.accept || '').includes('application/x-ndjson');

    if (wantStream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      await runAgentTurnStreaming(params, (event) => {
        res.write(JSON.stringify(event) + '\n');
      });
      res.end();
    } else {
      const result = await runAgentTurn(params);
      res.json(result);
    }
  } catch (error) {
    next(error);
  }
}

export async function indexContext(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId, fields } = req.body;

    if (!sessionId || !fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'sessionId and fields are required' });
    }

    await indexSessionContext(sessionId, fields);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function retrieveContext(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { query, personaIds, sessionId, topK } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const chunks = await retrieveChunks(
      query,
      Array.isArray(personaIds) ? personaIds : [],
      sessionId || undefined,
      typeof topK === 'number' ? topK : 10,
    );

    res.json({ chunks });
  } catch (error) {
    next(error);
  }
}

export async function indexUnindexed(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await pool.query(
      `SELECT p.id FROM personas p
       WHERE p.user_id = $1
         AND NOT EXISTS (SELECT 1 FROM knowledge_chunks kc WHERE kc.persona_id = p.id)`,
      [userId]
    );

    const unindexedIds: string[] = result.rows.map((r: any) => r.id);

    if (unindexedIds.length === 0) {
      return res.json({ message: 'All personas are already indexed', indexed: 0, total: 0 });
    }

    res.json({ message: `Indexing ${unindexedIds.length} persona(s) in the background`, indexed: unindexedIds.length });

    (async () => {
      let success = 0;
      let failed = 0;
      for (const id of unindexedIds) {
        try {
          await indexPersona(id);
          success++;
        } catch (err: any) {
          failed++;
          console.error(`Index failed for persona ${id}:`, err?.message || err);
        }
      }
      console.log(`User ${userId} index-unindexed: ${success} succeeded, ${failed} failed out of ${unindexedIds.length}`);
    })();
  } catch (error) {
    next(error);
  }
}
