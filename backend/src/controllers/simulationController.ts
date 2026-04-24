import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import * as simulationService from '../services/simulationService.js';
import { SimulationSession } from '../types/index.js';

export async function getSimulationSessions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const sessions = await simulationService.getSimulationSessionsByUserId(req.userId!);
    res.json(sessions);
  } catch (error) {
    next(error);
  }
}

export async function getSimulationSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const session = await simulationService.getSimulationSessionById(id, req.userId!);
    
    if (!session) {
      return res.status(404).json({ error: 'Simulation session not found' });
    }
    
    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function createSimulationSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const sessionData: Omit<SimulationSession, 'id' | 'user_id' | 'created_at' | 'updated_at'> = req.body;
    const hasPersonaId = !!sessionData.persona_id;
    const hasPersonaIds = Array.isArray(sessionData.persona_ids) && sessionData.persona_ids.length >= 2;

    // Validate required fields: need either persona_id or persona_ids (at least 2)
    if ((!hasPersonaId && !hasPersonaIds) || !sessionData.mode || sessionData.bg_info === undefined || sessionData.bg_info === null || !sessionData.name) {
      console.error('Validation failed. Received data:', {
        persona_id: sessionData.persona_id,
        persona_ids: sessionData.persona_ids,
        mode: sessionData.mode,
        bg_info: sessionData.bg_info,
        name: sessionData.name,
        fullBody: req.body
      });
      return res.status(400).json({ error: 'persona_id (or persona_ids with at least 2 IDs), mode, bg_info, and name are required' });
    }

    const session = await simulationService.createSimulationSession(req.userId!, {
      ...sessionData,
      system_prompt: sessionData.system_prompt ?? undefined,
    });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
}

export async function updateSimulationSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const updates: Partial<SimulationSession> = req.body;
    
    const session = await simulationService.updateSimulationSession(id, req.userId!, updates);
    
    if (!session) {
      return res.status(404).json({ error: 'Simulation session not found' });
    }
    
    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function deleteSimulationSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deleted = await simulationService.deleteSimulationSession(id, req.userId!);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Simulation session not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getPersuasionContext(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const context = await simulationService.getPersuasionContext(id, req.userId!);
    if (!context) {
      return res.status(404).json({ error: 'Simulation session not found' });
    }
    res.json(context);
  } catch (error) {
    next(error);
  }
}

export async function createSimulationMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const body = req.body as { sender_type: string; persona_id?: string; content: string; thinking?: string; retrieval_summary?: any; validation?: any };
    if (!body.sender_type || body.content === undefined) {
      return res.status(400).json({ error: 'sender_type and content are required' });
    }
    const simulationMessageService = await import('../services/simulationMessageService.js');
    const message = await simulationMessageService.createMessage(id, req.userId!, {
      sender_type: body.sender_type,
      persona_id: body.persona_id ?? null,
      content: String(body.content),
      thinking: body.thinking ?? null,
      retrieval_summary: body.retrieval_summary ?? null,
      validation: body.validation ?? null,
    });
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
}

export async function createSimulationMessagesBulk(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const body = req.body as { messages: Array<{ sender_type: string; persona_id?: string; content: string; thinking?: string; retrieval_summary?: any; validation?: any }> };
    if (!Array.isArray(body.messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    const simulationMessageService = await import('../services/simulationMessageService.js');
    const messages = await simulationMessageService.createMessagesBulk(
      id,
      req.userId!,
      body.messages.map((m) => ({
        sender_type: m.sender_type,
        persona_id: m.persona_id ?? null,
        content: String(m.content),
        thinking: m.thinking ?? null,
        retrieval_summary: m.retrieval_summary ?? null,
        validation: m.validation ?? null,
      }))
    );
    res.status(201).json(messages);
  } catch (error) {
    next(error);
  }
}

