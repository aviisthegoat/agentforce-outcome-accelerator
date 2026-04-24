import { apiClient } from './api.js';
import { ChatSession, Message, Persona } from '../models/types.js';

export const chatApi = {
  getSessions: async (): Promise<ChatSession[]> => {
    return apiClient.get<ChatSession[]>('/chat/sessions');
  },

  getSession: async (id: string): Promise<ChatSession> => {
    return apiClient.get<ChatSession>(`/chat/sessions/${id}`);
  },

  createSession: async (name: string, personaIds: string[]): Promise<ChatSession> => {
    return apiClient.post<ChatSession>('/chat/sessions', { name, personaIds });
  },

  updateSession: async (id: string, name: string): Promise<ChatSession> => {
    return apiClient.put<ChatSession>(`/chat/sessions/${id}`, { name });
  },

  deleteSession: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`/chat/sessions/${id}`);
  },

  getSessionPersonas: async (sessionId: string): Promise<Persona[]> => {
    return apiClient.get<Persona[]>(`/chat/sessions/${sessionId}/personas`);
  },

  getMessages: async (sessionId: string): Promise<Message[]> => {
    return apiClient.get<Message[]>(`/chat/sessions/${sessionId}/messages`);
  },

  createMessage: async (sessionId: string, message: Omit<Message, 'id' | 'session_id' | 'created_at'>): Promise<Message> => {
    // Transform frontend format to backend format
    const payload = {
      sender_type: message.senderType || message.sender_type,
      persona_id: message.personaId || message.persona_id,
      content: message.content,
    };
    return apiClient.post<Message>(`/chat/sessions/${sessionId}/messages`, payload);
  },

  deleteMessage: async (sessionId: string, messageId: string): Promise<void> => {
    return apiClient.delete<void>(`/chat/sessions/${sessionId}/messages/${messageId}`);
  },
};

