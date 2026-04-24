import pool from '../config/database.js';

export interface UserWithStats {
  id: string;
  username: string;
  email?: string;
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
  persona_count: number;
  chat_count: number;
}

export interface PersonaWithOwner {
  id: string;
  user_id: string;
  username: string;
  name: string;
  type: string;
  description?: string;
  avatar_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ChatSessionWithOwner {
  id: string;
  user_id: string;
  username: string;
  name: string;
  message_count: number;
  last_activity: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AdminStats {
  total_users: number;
  total_personas: number;
  total_chat_sessions: number;
  total_messages: number;
  total_simulation_sessions: number;
  admin_users: number;
  unindexed_personas: number;
}

export async function getAllUsers(): Promise<UserWithStats[]> {
  const result = await pool.query(
    `SELECT 
      u.id,
      u.username,
      u.email,
      u.is_admin,
      u.created_at,
      u.updated_at,
      COUNT(DISTINCT p.id) as persona_count,
      COUNT(DISTINCT cs.id) as chat_count
    FROM users u
    LEFT JOIN personas p ON p.user_id = u.id
    LEFT JOIN chat_sessions cs ON cs.user_id = u.id
    GROUP BY u.id, u.username, u.email, u.is_admin, u.created_at, u.updated_at
    ORDER BY u.created_at DESC`
  );

  return result.rows.map(row => ({
    ...row,
    persona_count: parseInt(row.persona_count) || 0,
    chat_count: parseInt(row.chat_count) || 0,
  }));
}

export async function getAllPersonas(): Promise<PersonaWithOwner[]> {
  const result = await pool.query(
    `SELECT 
      p.id,
      p.user_id,
      u.username,
      p.name,
      p.type,
      p.description,
      p.avatar_url,
      p.created_at,
      p.updated_at
    FROM personas p
    INNER JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC`
  );

  return result.rows;
}

export async function getAllChatSessions(): Promise<ChatSessionWithOwner[]> {
  const result = await pool.query(
    `SELECT 
      cs.id,
      cs.user_id,
      u.username,
      cs.name,
      COUNT(DISTINCT m.id) as message_count,
      MAX(m.created_at) as last_activity,
      cs.created_at,
      cs.updated_at
    FROM chat_sessions cs
    INNER JOIN users u ON cs.user_id = u.id
    LEFT JOIN messages m ON m.session_id = cs.id
    GROUP BY cs.id, cs.user_id, u.username, cs.name, cs.created_at, cs.updated_at
    ORDER BY cs.updated_at DESC`
  );

  return result.rows.map(row => ({
    ...row,
    message_count: parseInt(row.message_count) || 0,
    last_activity: row.last_activity || row.updated_at,
  }));
}

export async function getAllMessages(): Promise<any[]> {
  const result = await pool.query(
    `SELECT 
      m.id,
      m.session_id,
      m.sender_type,
      m.persona_id,
      m.content,
      m.created_at,
      cs.user_id,
      u.username
    FROM messages m
    INNER JOIN chat_sessions cs ON m.session_id = cs.id
    INNER JOIN users u ON cs.user_id = u.id
    ORDER BY m.created_at DESC
    LIMIT 1000`
  );

  return result.rows;
}

export async function getUserStats(): Promise<AdminStats> {
  const stats = await pool.query(
    `SELECT 
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM personas) as total_personas,
      (SELECT COUNT(*) FROM chat_sessions) as total_chat_sessions,
      (SELECT COUNT(*) FROM messages) as total_messages,
      (SELECT COUNT(*) FROM simulation_sessions) as total_simulation_sessions,
      (SELECT COUNT(*) FROM users WHERE is_admin = TRUE) as admin_users,
      (SELECT COUNT(*) FROM personas p WHERE NOT EXISTS (
        SELECT 1 FROM knowledge_chunks kc WHERE kc.persona_id = p.id
      )) as unindexed_personas`
  );

  const row = stats.rows[0];
  return {
    total_users: parseInt(row.total_users) || 0,
    total_personas: parseInt(row.total_personas) || 0,
    total_chat_sessions: parseInt(row.total_chat_sessions) || 0,
    total_messages: parseInt(row.total_messages) || 0,
    total_simulation_sessions: parseInt(row.total_simulation_sessions) || 0,
    admin_users: parseInt(row.admin_users) || 0,
    unindexed_personas: parseInt(row.unindexed_personas) || 0,
  };
}


