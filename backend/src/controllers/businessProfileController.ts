import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import * as businessProfileService from '../services/businessProfileService.js';

export async function getBusinessProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const profile = await businessProfileService.getByUserId(userId);
    if (!profile) {
      return res.json(null);
    }
    const payload = {
      ...profile,
      created_at: profile.created_at instanceof Date ? profile.created_at.toISOString() : profile.created_at,
      updated_at: profile.updated_at instanceof Date ? profile.updated_at.toISOString() : profile.updated_at,
    };
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function upsertBusinessProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const rawBody = req.body;
    const body: Record<string, unknown> =
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
        ? rawBody
        : {};
    // Strip server-only fields so they are never taken from client
    const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...rest } = body;
    const profile = await businessProfileService.upsert(userId, rest as Record<string, unknown>);
    console.log('[business-profile] upserted for user', userId, 'id', profile.id);
    // Ensure JSON-serializable response (dates to ISO strings)
    const payload = {
      ...profile,
      created_at: profile.created_at instanceof Date ? profile.created_at.toISOString() : profile.created_at,
      updated_at: profile.updated_at instanceof Date ? profile.updated_at.toISOString() : profile.updated_at,
    };
    res.json(payload);
  } catch (error: unknown) {
    const err = error as Error & { code?: string; detail?: string };
    console.error('upsertBusinessProfile error:', err?.message, err?.code, err?.detail, error);
    if (!res.headersSent) {
      res.status(500).json({
        error: err?.message || 'Failed to save business profile',
        message: err?.message,
        ...(err?.code && { code: err.code }),
        ...(err?.detail && { detail: err.detail }),
      });
    } else {
      next(error);
    }
  }
}
