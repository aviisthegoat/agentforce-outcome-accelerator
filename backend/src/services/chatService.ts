import pool from '../config/database.js';
import { ChatSession, Message, Persona } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export async function getChatSessionsByUserId(userId: string): Promise<ChatSession[]> {
  const result = await pool.query(
    `SELECT id, user_id, name, created_at, updated_at
     FROM chat_sessions
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function getChatSessionById(sessionId: string, userId: string): Promise<ChatSession | null> {
  const result = await pool.query(
    `SELECT id, user_id, name, created_at, updated_at
     FROM chat_sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

export async function createChatSession(userId: string, name: string, personaIds: string[]): Promise<ChatSession> {
  const id = uuidv4();
  
  // Create session
  const sessionResult = await pool.query(
    `INSERT INTO chat_sessions (id, user_id, name)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, name, created_at, updated_at`,
    [id, userId, name]
  );

  const session = sessionResult.rows[0];

  // Link personas to session
  if (personaIds.length > 0) {
    const values = personaIds.map((personaId, index) => 
      `($${index * 2 + 1}, $${index * 2 + 2})`
    ).join(', ');
    
    const params: any[] = [];
    personaIds.forEach(personaId => {
      params.push(id, personaId);
    });

    await pool.query(
      `INSERT INTO chat_session_personas (session_id, persona_id)
       VALUES ${values}`,
      params
    );
  }

  return session;
}

export async function updateChatSession(sessionId: string, userId: string, name: string): Promise<ChatSession | null> {
  const result = await pool.query(
    `UPDATE chat_sessions
     SET name = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND user_id = $3
     RETURNING id, user_id, name, created_at, updated_at`,
    [name, sessionId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

export async function deleteChatSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

export async function getSessionPersonas(sessionId: string, userId: string): Promise<Persona[]> {
  // Verify session belongs to user
  const session = await getChatSessionById(sessionId, userId);
  if (!session) {
    return [];
  }

  const result = await pool.query(
    `SELECT p.id, p.user_id, p.name, p.type, p.description, p.avatar_url, p.metadata, p.created_at, p.updated_at
     FROM personas p
     INNER JOIN chat_session_personas csp ON p.id = csp.persona_id
     WHERE csp.session_id = $1`,
    [sessionId]
  );

  return result.rows.map(row => ({
    ...row,
    metadata: row.metadata || {},
  }));
}

export async function getMessagesBySession(sessionId: string, userId: string): Promise<Message[]> {
  // Verify session belongs to user
  const session = await getChatSessionById(sessionId, userId);
  if (!session) {
    return [];
  }

  const result = await pool.query(
    `SELECT id, session_id, sender_type, persona_id, content, created_at
     FROM messages
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );

  return result.rows;
}

export async function createMessage(sessionId: string, userId: string, messageData: Omit<Message, 'id' | 'session_id' | 'created_at'>): Promise<Message> {
  // Verify session belongs to user
  const session = await getChatSessionById(sessionId, userId);
  if (!session) {
    throw new Error('Session not found');
  }

  const id = uuidv4();
  
  // Create message
  const result = await pool.query(
    `INSERT INTO messages (id, session_id, sender_type, persona_id, content)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, session_id, sender_type, persona_id, content, created_at`,
    [id, sessionId, messageData.sender_type, messageData.persona_id || null, messageData.content]
  );

  // Update session updated_at
  await pool.query(
    `UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [sessionId]
  );

  return result.rows[0];
}

export async function deleteMessage(messageId: string, sessionId: string, userId: string): Promise<boolean> {
  // Verify session belongs to user
  const session = await getChatSessionById(sessionId, userId);
  if (!session) {
    throw new Error('Session not found');
  }

  const result = await pool.query(
    `DELETE FROM messages 
     WHERE id = $1 AND session_id = $2`,
    [messageId, sessionId]
  );

  // Update session updated_at
  await pool.query(
    `UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [sessionId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

