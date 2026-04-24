import pool from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { canAccessPersona } from './personaService.js';

export interface FocusGroupRow {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface FocusGroup {
  id: string;
  name: string;
  personaIds: string[];
  allowedPersonaTypes?: string[];
  created_at?: Date;
  updated_at?: Date;
}

export async function getFocusGroups(userId: string): Promise<FocusGroup[]> {
  const groupsResult = await pool.query(
    `SELECT id, user_id, name, allowed_persona_types, created_at, updated_at FROM focus_groups WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  const groups: FocusGroup[] = [];
  for (const row of groupsResult.rows) {
    const membersResult = await pool.query(
      `SELECT persona_id, position FROM focus_group_personas WHERE focus_group_id = $1 ORDER BY position ASC, persona_id ASC`,
      [row.id]
    );
    const personaIds = membersResult.rows.map((r: { persona_id: string }) => r.persona_id);
    const allowedPersonaTypes = row.allowed_persona_types != null
      ? (Array.isArray(row.allowed_persona_types) ? row.allowed_persona_types : []) as string[]
      : undefined;
    groups.push({
      id: row.id,
      name: row.name,
      personaIds,
      allowedPersonaTypes: allowedPersonaTypes?.length ? allowedPersonaTypes : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }
  return groups;
}

export async function getFocusGroup(id: string, userId: string): Promise<FocusGroup | null> {
  const result = await pool.query(
    `SELECT id, user_id, name, allowed_persona_types, created_at, updated_at FROM focus_groups WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const membersResult = await pool.query(
    `SELECT persona_id, position FROM focus_group_personas WHERE focus_group_id = $1 ORDER BY position ASC, persona_id ASC`,
    [id]
  );
  const personaIds = membersResult.rows.map((r: { persona_id: string }) => r.persona_id);
  const allowedPersonaTypes = row.allowed_persona_types != null
    ? (Array.isArray(row.allowed_persona_types) ? row.allowed_persona_types : []) as string[]
    : undefined;
  return {
    id: row.id,
    name: row.name,
    personaIds,
    allowedPersonaTypes: allowedPersonaTypes?.length ? allowedPersonaTypes : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createFocusGroup(userId: string, data: { name: string; allowedPersonaTypes?: string[] }): Promise<FocusGroup> {
  const id = uuidv4();
  const name = (data.name && data.name.trim()) ? data.name.trim() : 'Untitled Group';
  const allowedPersonaTypes = data.allowedPersonaTypes?.length ? JSON.stringify(data.allowedPersonaTypes) : null;
  const result = await pool.query(
    `INSERT INTO focus_groups (id, user_id, name, allowed_persona_types) VALUES ($1, $2, $3, $4) RETURNING id, name, created_at, updated_at`,
    [id, userId, name, allowedPersonaTypes]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    personaIds: [],
    allowedPersonaTypes: data.allowedPersonaTypes?.length ? data.allowedPersonaTypes : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function updateFocusGroup(
  focusGroupId: string,
  userId: string,
  updates: { name?: string; personaIds?: string[]; allowedPersonaTypes?: string[] }
): Promise<FocusGroup | null> {
  const existing = await getFocusGroup(focusGroupId, userId);
  if (!existing) return null;

  if (updates.name !== undefined) {
    const name = (updates.name && updates.name.trim()) ? updates.name.trim() : existing.name;
    await pool.query(
      `UPDATE focus_groups SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
      [name, focusGroupId, userId]
    );
  }

  if (updates.allowedPersonaTypes !== undefined) {
    const allowedPersonaTypes = updates.allowedPersonaTypes?.length ? JSON.stringify(updates.allowedPersonaTypes) : null;
    await pool.query(
      `UPDATE focus_groups SET allowed_persona_types = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
      [allowedPersonaTypes, focusGroupId, userId]
    );
  }

  if (updates.personaIds !== undefined) {
    for (const personaId of updates.personaIds) {
      const allowed = await canAccessPersona(personaId, userId);
      if (!allowed) {
        throw new Error(`Persona not found or not accessible: ${personaId}`);
      }
    }
    await pool.query(`DELETE FROM focus_group_personas WHERE focus_group_id = $1`, [focusGroupId]);
    for (let i = 0; i < updates.personaIds.length; i++) {
      await pool.query(
        `INSERT INTO focus_group_personas (focus_group_id, persona_id, position) VALUES ($1, $2, $3) ON CONFLICT (focus_group_id, persona_id) DO UPDATE SET position = $3`,
        [focusGroupId, updates.personaIds[i], i]
      );
    }
  }

  return getFocusGroup(focusGroupId, userId);
}

export async function deleteFocusGroup(id: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM focus_groups WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

/** Deletes focus groups in `focusGroupIds` that have no members (caller should pass groups that contained a removed persona). */
export async function deleteFocusGroupsNowEmpty(userId: string, focusGroupIds: string[]): Promise<void> {
  if (focusGroupIds.length === 0) return;
  await pool.query(
    `DELETE FROM focus_groups fg
     WHERE fg.user_id = $1
     AND fg.id = ANY($2::uuid[])
     AND NOT EXISTS (
       SELECT 1 FROM focus_group_personas fgp WHERE fgp.focus_group_id = fg.id
     )`,
    [userId, focusGroupIds]
  );
}

export async function setFocusGroupPersonas(
  focusGroupId: string,
  userId: string,
  personaIds: string[]
): Promise<FocusGroup | null> {
  return updateFocusGroup(focusGroupId, userId, { personaIds });
}
