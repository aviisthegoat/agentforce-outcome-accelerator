import { useState, useEffect } from 'react';
import { ChatSession } from '../models/types.js';
import { chatApi } from '../services/chatApi.js';

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await chatApi.getSessions();
      // Normalize data format
      const normalized = data.map(s => ({
        ...s,
        createdAt: s.created_at || s.createdAt,
        updatedAt: s.updated_at || s.updatedAt,
        personaIds: s.persona_ids || s.personaIds,
      }));
      setSessions(normalized);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch chat sessions');
      console.error('Error fetching chat sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const createSession = async (name: string, personaIds: string[]) => {
    try {
      const newSession = await chatApi.createSession(name, personaIds);
      const normalized = {
        ...newSession,
        createdAt: newSession.created_at || newSession.createdAt,
        updatedAt: newSession.updated_at || newSession.updatedAt,
        personaIds: newSession.persona_ids || newSession.personaIds,
      };
      setSessions(prev => [normalized, ...prev]);
      return normalized;
    } catch (err: any) {
      setError(err.message || 'Failed to create chat session');
      throw err;
    }
  };

  const updateSession = async (id: string, name: string) => {
    try {
      const updated = await chatApi.updateSession(id, name);
      const normalized = {
        ...updated,
        createdAt: updated.created_at || updated.createdAt,
        updatedAt: updated.updated_at || updated.updatedAt,
        personaIds: updated.persona_ids || updated.personaIds,
      };
      setSessions(prev => prev.map(s => s.id === id ? normalized : s));
      return normalized;
    } catch (err: any) {
      setError(err.message || 'Failed to update chat session');
      throw err;
    }
  };

  const deleteSession = async (id: string) => {
    try {
      await chatApi.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete chat session');
      throw err;
    }
  };

  return {
    sessions,
    loading,
    error,
    fetchSessions,
    createSession,
    updateSession,
    deleteSession,
  };
}


