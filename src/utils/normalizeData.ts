import { Persona, ChatSession, Message, SimulationSession } from '../models/types.js';

/**
 * Normalize persona data from API format to frontend format
 */
export function normalizePersona(persona: Persona): Persona {
  return {
    ...persona,
    avatarUrl: persona.avatar_url || persona.avatarUrl,
    createdAt: persona.created_at || persona.createdAt,
    updatedAt: persona.updated_at || persona.updatedAt,
  };
}

/**
 * Normalize chat session data from API format to frontend format
 */
export function normalizeChatSession(session: ChatSession): ChatSession {
  return {
    ...session,
    createdAt: session.created_at || session.createdAt,
    updatedAt: session.updated_at || session.updatedAt,
    personaIds: session.persona_ids || session.personaIds,
  };
}

/**
 * Normalize message data from API format to frontend format
 */
export function normalizeMessage(message: Message): Message {
  return {
    ...message,
    sessionId: message.session_id || message.sessionId,
    senderType: message.sender_type || message.senderType,
    personaId: message.persona_id || message.personaId,
    createdAt: message.created_at || message.createdAt,
  };
}

/**
 * Normalize simulation session data from API format to frontend format
 */
export function normalizeSimulationSession(session: SimulationSession): SimulationSession {
  return {
    ...session,
    createdAt: session.created_at || session.createdAt,
    updatedAt: session.updated_at || session.updatedAt,
    personaId: session.persona_id || session.personaId,
    bgInfo: session.bg_info || session.bgInfo,
    openingLine: session.opening_line || session.openingLine,
    stimulusImage: session.stimulus_image || session.stimulusImage,
    mimeType: session.mime_type || session.mimeType,
  };
}


