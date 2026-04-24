import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import * as adminService from '../services/adminService.js';
import * as personaService from '../services/personaService.js';
import pool from '../config/database.js';
import { indexPersona, embedTexts } from '../services/embeddingService.js';

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const users = await adminService.getAllUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
}

export async function getPersonas(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const personas = await adminService.getAllPersonas();
    res.json(personas);
  } catch (error) {
    next(error);
  }
}

export async function getChatSessions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const chats = await adminService.getAllChatSessions();
    res.json(chats);
  } catch (error) {
    next(error);
  }
}

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const messages = await adminService.getAllMessages();
    res.json(messages);
  } catch (error) {
    next(error);
  }
}

export async function getStats(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const stats = await adminService.getUserStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

export async function createPersona(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const body = req.body as { name: string; type: string; description?: string; avatar_url?: string };
    if (!body.name || !body.name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!body.type || !['synthetic_user', 'advisor'].includes(body.type)) {
      return res.status(400).json({ error: 'Type must be synthetic_user or advisor' });
    }
    const persona = await personaService.createGlobalPersona(req.userId!, {
      name: body.name.trim(),
      type: body.type as 'synthetic_user' | 'advisor',
      description: (body.description || '').trim() || 'Global persona',
      avatar_url: body.avatar_url || '',
    });
    res.status(201).json(persona);
  } catch (error) {
    next(error);
  }
}

export async function testEmbed(req: AuthRequest, res: Response, next: NextFunction) {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('${') || key === 'your-gemini-api-key-here') {
    checks.api_key = { ok: false, detail: `Key is missing or placeholder (length=${key?.length || 0})` };
  } else {
    checks.api_key = { ok: true, detail: `Set, starts with ${key.substring(0, 8)}…, length=${key.length}` };
  }

  try {
    const tableCheck = await pool.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_name = 'knowledge_chunks'`
    );
    const exists = parseInt(tableCheck.rows[0].cnt) > 0;
    checks.knowledge_chunks_table = { ok: exists, detail: exists ? 'Exists' : 'Table not found' };
  } catch (err: any) {
    checks.knowledge_chunks_table = { ok: false, detail: err.message };
  }

  try {
    const colCheck = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'knowledge_chunks' AND column_name = 'embedding'`
    );
    if (colCheck.rows.length > 0) {
      checks.embedding_column = { ok: true, detail: `Type: ${colCheck.rows[0].data_type}` };
    } else {
      checks.embedding_column = { ok: false, detail: 'Column not found' };
    }
  } catch (err: any) {
    checks.embedding_column = { ok: false, detail: err.message };
  }

  if (checks.api_key.ok) {
    try {
      const embeddings = await embedTexts(['test embedding call']);
      if (embeddings.length > 0 && embeddings[0].length > 0) {
        checks.embed_api_call = { ok: true, detail: `Returned ${embeddings[0].length}-dim vector` };
      } else {
        checks.embed_api_call = { ok: false, detail: 'No embeddings returned' };
      }
    } catch (err: any) {
      checks.embed_api_call = { ok: false, detail: err.message };
    }
  } else {
    checks.embed_api_call = { ok: false, detail: 'Skipped (API key not configured)' };
  }

  try {
    const personaCount = await pool.query('SELECT COUNT(*) as cnt FROM personas');
    const chunkCount = await pool.query('SELECT COUNT(*) as cnt FROM knowledge_chunks');
    checks.data = {
      ok: true,
      detail: `${personaCount.rows[0].cnt} personas, ${chunkCount.rows[0].cnt} knowledge chunks`
    };
  } catch (err: any) {
    checks.data = { ok: false, detail: err.message };
  }

  const allOk = Object.values(checks).every(c => c.ok);
  res.json({ ok: allOk, checks });
}

export async function reindexAll(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name FROM personas p
       WHERE NOT EXISTS (SELECT 1 FROM knowledge_chunks kc WHERE kc.persona_id = p.id)`
    );
    const personas: { id: string; name: string }[] = result.rows;
    const total = personas.length;

    if (total === 0) {
      return res.json({ type: 'complete', success: 0, failed: 0, total: 0, skipped: 'all already embedded' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let success = 0;
    let failed = 0;

    for (let i = 0; i < personas.length; i++) {
      const { id, name } = personas[i];
      try {
        await indexPersona(id);
        success++;
        res.write(JSON.stringify({ type: 'progress', current: i + 1, total, personaName: name, status: 'success' }) + '\n');
      } catch (err: any) {
        failed++;
        const errorMsg = err?.message || String(err);
        console.error(`Reindex failed for persona ${id} (${name}):`, errorMsg);
        res.write(JSON.stringify({ type: 'progress', current: i + 1, total, personaName: name, status: 'error', error: errorMsg }) + '\n');
      }
    }

    res.write(JSON.stringify({ type: 'complete', success, failed, total }) + '\n');
    res.end();
    console.log(`Reindex complete: ${success} succeeded, ${failed} failed out of ${total} total`);
  } catch (error) {
    if (!res.headersSent) {
      next(error);
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      res.write(JSON.stringify({ type: 'error', error: msg }) + '\n');
      res.end();
    }
  }
}


