import pool from '../config/database.js';
import { Persona, PersonaFile, PersonaVisibility } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { indexPersona as indexPersonaEmbeddings } from './embeddingService.js';

function triggerIndex(personaId: string) {
  (async () => {
    try {
      await indexPersonaEmbeddings(personaId);
    } catch (err: any) {
      console.error(`[EMBEDDING] First attempt failed for persona ${personaId}:`, err?.message || err);
      // Retry once after a short delay
      await new Promise(r => setTimeout(r, 2000));
      try {
        await indexPersonaEmbeddings(personaId);
        console.log(`[EMBEDDING] Retry succeeded for persona ${personaId}`);
      } catch (retryErr: any) {
        console.error(`[EMBEDDING] Retry also failed for persona ${personaId}:`, retryErr?.message || retryErr);
      }
    }
  })();
}

/** Check if user can access persona (owner, or public/global, or starred). */
export async function canAccessPersona(personaId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT p.id, p.user_id, p.visibility,
     EXISTS (SELECT 1 FROM persona_stars ps WHERE ps.persona_id = p.id AND ps.user_id = $2) AS starred
     FROM personas p WHERE p.id = $1`,
    [personaId, userId]
  );
  if (result.rows.length === 0) return false;
  const row = result.rows[0];
  if (row.user_id === userId) return true;
  if (row.visibility === 'public' || row.visibility === 'global') return true;
  if (row.starred) return true;
  return false;
}

export async function getPersonasByUserId(userId: string): Promise<Persona[]> {
  const result = await pool.query(
    `SELECT id, user_id, name, type, description, avatar_url, COALESCE(visibility, 'private') AS visibility, metadata, created_at, updated_at
     FROM personas
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows.map(row => ({
    ...row,
    visibility: row.visibility || 'private',
    metadata: row.metadata || {},
  }));
}

export async function getPersonaById(personaId: string, userId: string): Promise<Persona | null> {
  const canAccess = await canAccessPersona(personaId, userId);
  if (!canAccess) return null;

  const result = await pool.query(
    `SELECT id, user_id, name, type, description, avatar_url, COALESCE(visibility, 'private') AS visibility, metadata, created_at, updated_at
     FROM personas WHERE id = $1`,
    [personaId]
  );

  if (result.rows.length === 0) return null;
  const persona = result.rows[0];
  return {
    ...persona,
    visibility: persona.visibility || 'private',
    metadata: persona.metadata || {},
  };
}

export async function createPersona(userId: string, personaData: Omit<Persona, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Persona> {
  const id = uuidv4();
  const visibility = personaData.visibility || 'private';
  const name = (personaData.name && typeof personaData.name === 'string' && personaData.name.trim())
    ? personaData.name.trim()
    : 'Unnamed Persona';

  const result = await pool.query(
    `INSERT INTO personas (id, user_id, name, type, description, avatar_url, visibility, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, user_id, name, type, description, avatar_url, visibility, metadata, created_at, updated_at`,
    [
      id,
      userId,
      name,
      personaData.type,
      personaData.description,
      personaData.avatar_url,
      visibility,
      JSON.stringify(personaData.metadata || {}),
    ]
  );

  const persona = result.rows[0];
  triggerIndex(persona.id);
  return {
    ...persona,
    visibility: persona.visibility || 'private',
    metadata: persona.metadata || {},
  };
}

/** Admin-only: create a persona that is visible to everyone (visibility = 'global'). */
export async function createGlobalPersona(adminUserId: string, personaData: Pick<Persona, 'name' | 'type' | 'description'> & { avatar_url?: string; metadata?: Record<string, any> }): Promise<Persona> {
  const id = uuidv4();
  const name = (personaData.name && typeof personaData.name === 'string' && personaData.name.trim())
    ? personaData.name.trim()
    : 'Unnamed Persona';
  const result = await pool.query(
    `INSERT INTO personas (id, user_id, name, type, description, avatar_url, visibility, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'global', $7)
     RETURNING id, user_id, name, type, description, avatar_url, visibility, metadata, created_at, updated_at`,
    [
      id,
      adminUserId,
      name,
      personaData.type,
      personaData.description || '',
      personaData.avatar_url || '',
      JSON.stringify(personaData.metadata || {}),
    ]
  );
  const persona = result.rows[0];
  triggerIndex(persona.id);
  return {
    ...persona,
    visibility: persona.visibility || 'global',
    metadata: persona.metadata || {},
  };
}

export async function updatePersona(personaId: string, userId: string, updates: Partial<Persona>): Promise<Persona | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramCount++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push(`description = $${paramCount++}`);
    values.push(updates.description);
  }
  if (updates.avatar_url !== undefined) {
    fields.push(`avatar_url = $${paramCount++}`);
    values.push(updates.avatar_url);
  }
  if (updates.visibility !== undefined) {
    // Owner can only set 'private' or 'public', not 'global'
    const v = updates.visibility === 'global' ? undefined : updates.visibility;
    if (v !== undefined) {
      fields.push(`visibility = $${paramCount++}`);
      values.push(v);
    }
  }
  if (updates.metadata !== undefined) {
    fields.push(`metadata = $${paramCount++}`);
    values.push(JSON.stringify(updates.metadata));
  }

  if (fields.length === 0) {
    return getPersonaById(personaId, userId);
  }

  values.push(personaId, userId);

  const result = await pool.query(
    `UPDATE personas
     SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
     RETURNING id, user_id, name, type, description, avatar_url, visibility, metadata, created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  const persona = result.rows[0];
  if (updates.description !== undefined) {
    triggerIndex(persona.id);
  }
  return {
    ...persona,
    visibility: persona.visibility || 'private',
    metadata: persona.metadata || {},
  };
}

export async function deletePersona(personaId: string, userId: string): Promise<boolean> {
  const groupsResult = await pool.query(
    `SELECT DISTINCT fgp.focus_group_id
     FROM focus_group_personas fgp
     INNER JOIN focus_groups fg ON fg.id = fgp.focus_group_id AND fg.user_id = $2
     WHERE fgp.persona_id = $1`,
    [personaId, userId]
  );
  const affectedGroupIds: string[] = groupsResult.rows.map(
    (r: { focus_group_id: string }) => r.focus_group_id
  );

  const result = await pool.query(
    'DELETE FROM personas WHERE id = $1 AND user_id = $2',
    [personaId, userId]
  );

  const deleted = result.rowCount !== null && result.rowCount > 0;
  if (deleted && affectedGroupIds.length > 0) {
    const { deleteFocusGroupsNowEmpty } = await import('./focusGroupService.js');
    await deleteFocusGroupsNowEmpty(userId, affectedGroupIds);
  }
  return deleted;
}

export async function getPersonaFiles(personaId: string, userId: string): Promise<PersonaFile[]> {
  const allowed = await canAccessPersona(personaId, userId);
  if (!allowed) return [];

  const result = await pool.query(
    `SELECT id, persona_id, name, content, type, created_at
     FROM persona_files
     WHERE persona_id = $1
     ORDER BY created_at ASC`,
    [personaId]
  );

  return result.rows;
}

export async function createPersonaFile(personaId: string, userId: string, fileData: Omit<PersonaFile, 'id' | 'persona_id' | 'created_at'>): Promise<PersonaFile> {
  const allowed = await canAccessPersona(personaId, userId);
  if (!allowed) {
    throw new Error('Persona not found');
  }

  const id = uuidv4();
  
  const result = await pool.query(
    `INSERT INTO persona_files (id, persona_id, name, content, type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, persona_id, name, content, type, created_at`,
    [id, personaId, fileData.name, fileData.content, fileData.type]
  );

  triggerIndex(personaId);
  return result.rows[0];
}

/** List public and global personas; optional starred flag for current user. */
export async function getPublicPersonas(userId?: string): Promise<(Persona & { starred?: boolean })[]> {
  const result = userId
    ? await pool.query(
        `SELECT p.id, p.user_id, p.name, p.type, p.description, p.avatar_url, COALESCE(p.visibility, 'private') AS visibility, p.metadata, p.created_at, p.updated_at,
         EXISTS (SELECT 1 FROM persona_stars ps WHERE ps.persona_id = p.id AND ps.user_id = $1) AS starred
         FROM personas p
         WHERE p.visibility IN ('public', 'global')
         ORDER BY p.created_at DESC`,
        [userId]
      )
    : await pool.query(
        `SELECT id, user_id, name, type, description, avatar_url, COALESCE(visibility, 'private') AS visibility, metadata, created_at, updated_at, FALSE AS starred
         FROM personas
         WHERE visibility IN ('public', 'global')
         ORDER BY created_at DESC`
      );

  return result.rows.map(row => ({
    ...row,
    visibility: row.visibility || 'private',
    metadata: row.metadata || {},
    starred: Boolean(row.starred),
  }));
}

/** List personas the user has starred (that they are allowed to see). */
export async function getStarredPersonas(userId: string): Promise<Persona[]> {
  const result = await pool.query(
    `SELECT p.id, p.user_id, p.name, p.type, p.description, p.avatar_url, COALESCE(p.visibility, 'private') AS visibility, p.metadata, p.created_at, p.updated_at
     FROM persona_stars ps
     INNER JOIN personas p ON p.id = ps.persona_id
     WHERE ps.user_id = $1
       AND (p.user_id = $1 OR p.visibility IN ('public', 'global'))
     ORDER BY p.created_at DESC`,
    [userId]
  );

  return result.rows.map(row => ({
    ...row,
    visibility: row.visibility || 'private',
    metadata: row.metadata || {},
  }));
}

export async function starPersona(personaId: string, userId: string): Promise<void> {
  const allowed = await canAccessPersona(personaId, userId);
  if (!allowed) {
    throw new Error('Persona not found');
  }
  await pool.query(
    `INSERT INTO persona_stars (user_id, persona_id) VALUES ($1, $2) ON CONFLICT (user_id, persona_id) DO NOTHING`,
    [userId, personaId]
  );
}

export async function unstarPersona(personaId: string, userId: string): Promise<void> {
  await pool.query(
    'DELETE FROM persona_stars WHERE user_id = $1 AND persona_id = $2',
    [userId, personaId]
  );
}

export interface PersonaWithSource extends Persona {
  source: 'owned' | 'starred';
}

/** Personas the user can use in chat/simulations: owned + starred (no duplicates). */
export async function getPersonasAvailableForUser(userId: string): Promise<PersonaWithSource[]> {
  const owned = await getPersonasByUserId(userId);
  const starred = await getStarredPersonas(userId);
  const ownedIds = new Set(owned.map(p => p.id));
  const starredIds = new Set(starred.map(p => p.id));
  const combined: PersonaWithSource[] = [
    ...owned.map(p => ({ ...p, source: 'owned' as const, starred: starredIds.has(p.id) })),
    ...starred.filter(p => !ownedIds.has(p.id)).map(p => ({ ...p, source: 'starred' as const, starred: true })),
  ];
  return combined;
}


