import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import * as chatService from '../services/chatService.js';
import { ChatSession, Message } from '../types/index.js';

export async function getChatSessions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const sessions = await chatService.getChatSessionsByUserId(req.userId!);
    res.json(sessions);
  } catch (error) {
    next(error);
  }
}

export async function getChatSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const session = await chatService.getChatSessionById(id, req.userId!);
    
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }
    
    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function createChatSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { name, personaIds } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const session = await chatService.createChatSession(
      req.userId!,
      name,
      personaIds || []
    );
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
}

export async function updateChatSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const session = await chatService.updateChatSession(id, req.userId!, name);
    
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }
    
    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function deleteChatSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deleted = await chatService.deleteChatSession(id, req.userId!);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Chat session not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getSessionPersonas(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const personas = await chatService.getSessionPersonas(sessionId, req.userId!);
    res.json(personas);
  } catch (error) {
    next(error);
  }
}

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const messages = await chatService.getMessagesBySession(sessionId, req.userId!);
    res.json(messages);
  } catch (error) {
    next(error);
  }
}

export async function createMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const messageData: Omit<Message, 'id' | 'session_id' | 'created_at'> = req.body;
    
    if (!messageData.content || !messageData.sender_type) {
      return res.status(400).json({ error: 'Content and sender_type are required' });
    }

    const message = await chatService.createMessage(sessionId, req.userId!, messageData);
    res.status(201).json(message);
  } catch (error: any) {
    if (error.message === 'Session not found') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
}

export async function deleteMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId, messageId } = req.params;
    const deleted = await chatService.deleteMessage(messageId, sessionId, req.userId!);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    res.status(204).send();
  } catch (error: any) {
    if (error.message === 'Session not found') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
}

