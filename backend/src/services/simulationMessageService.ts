import pool from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export interface SimulationMessageRow {
  id: string;
  simulation_session_id: string;
  sender_type: string;
  persona_id: string | null;
  content: string;
  thinking: string | null;
  retrieval_summary: any | null;
  validation: any | null;
  created_at: Date;
}

export async function getMessagesBySessionId(
  sessionId: string,
  userId: string
): Promise<SimulationMessageRow[]> {
  const result = await pool.query(
    `SELECT sm.id, sm.simulation_session_id, sm.sender_type, sm.persona_id, sm.content, sm.thinking, sm.retrieval_summary, sm.validation, sm.created_at
     FROM simulation_messages sm
     INNER JOIN simulation_sessions ss ON ss.id = sm.simulation_session_id AND ss.user_id = $2
     WHERE sm.simulation_session_id = $1
     ORDER BY sm.created_at ASC`,
    [sessionId, userId]
  );
  return result.rows;
}

export async function createMessage(
  sessionId: string,
  userId: string,
  data: {
    sender_type: string;
    persona_id?: string | null;
    content: string;
    thinking?: string | null;
    retrieval_summary?: any | null;
    validation?: any | null;
  }
): Promise<SimulationMessageRow> {
  const sessionResult = await pool.query(
    'SELECT id FROM simulation_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  if (sessionResult.rows.length === 0) {
    throw new Error('Simulation session not found');
  }
  const id = uuidv4();
  const result = await pool.query(
    `INSERT INTO simulation_messages (id, simulation_session_id, sender_type, persona_id, content, thinking, retrieval_summary, validation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, simulation_session_id, sender_type, persona_id, content, thinking, retrieval_summary, validation, created_at`,
    [
      id,
      sessionId,
      data.sender_type,
      data.persona_id ?? null,
      data.content,
      data.thinking ?? null,
      data.retrieval_summary ? JSON.stringify(data.retrieval_summary) : null,
      data.validation ? JSON.stringify(data.validation) : null,
    ]
  );
  return result.rows[0];
}

export async function createMessagesBulk(
  sessionId: string,
  userId: string,
  messages: Array<{
    sender_type: string;
    persona_id?: string | null;
    content: string;
    thinking?: string | null;
    retrieval_summary?: any | null;
    validation?: any | null;
  }>
): Promise<SimulationMessageRow[]> {
  const sessionResult = await pool.query(
    'SELECT id FROM simulation_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  if (sessionResult.rows.length === 0) {
    throw new Error('Simulation session not found');
  }
  const results: SimulationMessageRow[] = [];
  for (const data of messages) {
    const row = await createMessage(sessionId, userId, data);
    results.push(row);
  }
  return results;
}
