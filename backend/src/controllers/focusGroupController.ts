import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import * as focusGroupService from '../services/focusGroupService.js';

export async function listFocusGroups(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const groups = await focusGroupService.getFocusGroups(req.userId!);
    res.json(groups);
  } catch (error) {
    next(error);
  }
}

export async function getFocusGroup(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const group = await focusGroupService.getFocusGroup(id, req.userId!);
    if (!group) {
      return res.status(404).json({ error: 'Focus group not found' });
    }
    res.json(group);
  } catch (error) {
    next(error);
  }
}

export async function createFocusGroup(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { name, allowedPersonaTypes } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }
    const group = await focusGroupService.createFocusGroup(req.userId!, {
      name,
      allowedPersonaTypes: Array.isArray(allowedPersonaTypes) ? allowedPersonaTypes : undefined,
    });
    res.status(201).json(group);
  } catch (error) {
    next(error);
  }
}

export async function updateFocusGroup(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { name, personaIds, allowedPersonaTypes } = req.body;
    const updates: { name?: string; personaIds?: string[]; allowedPersonaTypes?: string[] } = {};
    if (name !== undefined) updates.name = name;
    if (personaIds !== undefined) updates.personaIds = personaIds;
    if (allowedPersonaTypes !== undefined) updates.allowedPersonaTypes = Array.isArray(allowedPersonaTypes) ? allowedPersonaTypes : undefined;
    const group = await focusGroupService.updateFocusGroup(id, req.userId!, updates);
    if (!group) {
      return res.status(404).json({ error: 'Focus group not found' });
    }
    res.json(group);
  } catch (error: any) {
    if (error.message && error.message.startsWith('Persona not found')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
}

export async function deleteFocusGroup(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deleted = await focusGroupService.deleteFocusGroup(id, req.userId!);
    if (!deleted) {
      return res.status(404).json({ error: 'Focus group not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
