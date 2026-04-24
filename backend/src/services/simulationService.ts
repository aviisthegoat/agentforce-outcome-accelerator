import pool from '../config/database.js';
import { SimulationSession } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as simulationMessageService from './simulationMessageService.js';

export interface PersuasionContext {
  systemPrompt: string | null;
  fullConversation: string;
  persuasionScore: number | null;
}

export async function getSimulationSessionsByUserId(userId: string): Promise<SimulationSession[]> {
  const result = await pool.query(
    `SELECT id, user_id, persona_id, persona_ids, mode, bg_info, opening_line, stimulus_image, mime_type, name, system_prompt, created_at, updated_at
     FROM simulation_sessions
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );

  return result.rows.map(mapRowToSession);
}

function mapRowToSession(row: any): SimulationSession {
  return {
    id: row.id,
    user_id: row.user_id,
    persona_id: row.persona_id,
    persona_ids: row.persona_ids != null ? (Array.isArray(row.persona_ids) ? row.persona_ids : (typeof row.persona_ids === 'string' ? JSON.parse(row.persona_ids) : row.persona_ids)) : undefined,
    mode: row.mode,
    bg_info: row.bg_info,
    opening_line: row.opening_line,
    stimulus_image: row.stimulus_image,
    mime_type: row.mime_type,
    name: row.name,
    system_prompt: row.system_prompt ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getSimulationSessionById(sessionId: string, userId: string): Promise<SimulationSession | null> {
  const result = await pool.query(
    `SELECT id, user_id, persona_id, persona_ids, mode, bg_info, opening_line, stimulus_image, mime_type, name, system_prompt, created_at, updated_at
     FROM simulation_sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToSession(result.rows[0]);
}

export async function createSimulationSession(
  userId: string,
  sessionData: Omit<SimulationSession, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<SimulationSession> {
  const id = uuidv4();
  const personaIdsJson = sessionData.persona_ids != null && Array.isArray(sessionData.persona_ids)
    ? JSON.stringify(sessionData.persona_ids)
    : null;
  const personaId = sessionData.persona_ids?.[0] ?? sessionData.persona_id;

  const result = await pool.query(
    `INSERT INTO simulation_sessions (id, user_id, persona_id, persona_ids, mode, bg_info, opening_line, stimulus_image, mime_type, name, system_prompt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, user_id, persona_id, persona_ids, mode, bg_info, opening_line, stimulus_image, mime_type, name, system_prompt, created_at, updated_at`,
    [
      id,
      userId,
      personaId,
      personaIdsJson,
      sessionData.mode,
      sessionData.bg_info,
      sessionData.opening_line || null,
      sessionData.stimulus_image || null,
      sessionData.mime_type || null,
      sessionData.name,
      sessionData.system_prompt ?? null,
    ]
  );

  return mapRowToSession(result.rows[0]);
}

export async function updateSimulationSession(
  sessionId: string,
  userId: string,
  updates: Partial<SimulationSession>
): Promise<SimulationSession | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramCount++}`);
    values.push(updates.name);
  }
  if (updates.bg_info !== undefined) {
    fields.push(`bg_info = $${paramCount++}`);
    values.push(updates.bg_info);
  }
  if (updates.opening_line !== undefined) {
    fields.push(`opening_line = $${paramCount++}`);
    values.push(updates.opening_line);
  }
  if (updates.stimulus_image !== undefined) {
    fields.push(`stimulus_image = $${paramCount++}`);
    values.push(updates.stimulus_image);
  }
  if (updates.mime_type !== undefined) {
    fields.push(`mime_type = $${paramCount++}`);
    values.push(updates.mime_type);
  }
  if (updates.system_prompt !== undefined) {
    fields.push(`system_prompt = $${paramCount++}`);
    values.push(updates.system_prompt);
  }

  if (fields.length === 0) {
    return getSimulationSessionById(sessionId, userId);
  }

  values.push(sessionId, userId);

  const result = await pool.query(
    `UPDATE simulation_sessions
     SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
     RETURNING id, user_id, persona_id, persona_ids, mode, bg_info, opening_line, stimulus_image, mime_type, name, system_prompt, created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToSession(result.rows[0]);
}

export async function deleteSimulationSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM simulation_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

/** Last "Persuasion: N%" in a message wins when the model emits the line more than once. */
function parseLastPersuasionScoreFromContent(content: string): number | null {
  const re = /Persuasion\s*:\s*(\d+(?:\.\d+)?)\s*%/gi;
  const matches = [...content.matchAll(re)];
  if (matches.length === 0) return null;
  return clampPersuasionScore(parseFloat(matches[matches.length - 1][1]));
}

/** Clamp persuasion score to 1-100 for display. */
function clampPersuasionScore(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/** Human-like labels for persuasion context when actual names are not available. */
const DEFAULT_USER_LABEL = 'Alex';
const DEFAULT_PERSONA_LABEL = 'Jordan';

export async function getPersuasionContext(
  sessionId: string,
  userId: string
): Promise<PersuasionContext | null> {
  const session = await getSimulationSessionById(sessionId, userId);
  if (!session) return null;
  const messages = await simulationMessageService.getMessagesBySessionId(sessionId, userId);
  const fullConversation = messages
    .map((m) => {
      const label = m.sender_type === 'user' ? DEFAULT_USER_LABEL : DEFAULT_PERSONA_LABEL;
      return `${label}: ${m.content}`;
    })
    .join('\n\n');
  let persuasionScore: number | null = null;
  // Search all persona messages (newest first) for the persuasion line so we always get a score when present
  const personaMessages = messages.filter((m) => m.sender_type === 'persona');
  for (let i = personaMessages.length - 1; i >= 0; i--) {
    const score = parseLastPersuasionScoreFromContent(personaMessages[i].content);
    if (score != null) {
      persuasionScore = score;
      break;
    }
  }
  return {
    systemPrompt: session.system_prompt ?? null,
    fullConversation,
    persuasionScore,
  };
}
