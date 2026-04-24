import { useState, useEffect } from 'react';
import { Persona } from '../models/types.js';
import { personaApi } from '../services/personaApi.js';

export function usePersonas() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPersonas = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await personaApi.getAll();
      // Normalize data format
      const normalized = data.map(p => ({
        ...p,
        avatarUrl: p.avatar_url || p.avatarUrl,
        createdAt: p.created_at || p.createdAt,
        updatedAt: p.updated_at || p.updatedAt,
      }));
      setPersonas(normalized);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch personas');
      console.error('Error fetching personas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersonas();
  }, []);

  const createPersona = async (persona: Omit<Persona, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => {
    try {
      const newPersona = await personaApi.create(persona);
      const normalized = {
        ...newPersona,
        avatarUrl: newPersona.avatar_url || newPersona.avatarUrl,
        createdAt: newPersona.created_at || newPersona.createdAt,
        updatedAt: newPersona.updated_at || newPersona.updatedAt,
      };
      setPersonas(prev => [normalized, ...prev]);
      return normalized;
    } catch (err: any) {
      setError(err.message || 'Failed to create persona');
      throw err;
    }
  };

  const updatePersona = async (id: string, updates: Partial<Persona>) => {
    try {
      const updated = await personaApi.update(id, updates);
      const normalized = {
        ...updated,
        avatarUrl: updated.avatar_url || updated.avatarUrl,
        createdAt: updated.created_at || updated.createdAt,
        updatedAt: updated.updated_at || updated.updatedAt,
      };
      setPersonas(prev => prev.map(p => p.id === id ? normalized : p));
      return normalized;
    } catch (err: any) {
      setError(err.message || 'Failed to update persona');
      throw err;
    }
  };

  const deletePersona = async (id: string) => {
    try {
      await personaApi.delete(id);
      setPersonas(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete persona');
      throw err;
    }
  };

  return {
    personas,
    loading,
    error,
    fetchPersonas,
    createPersona,
    updatePersona,
    deletePersona,
  };
}

/** Personas the user can use in chat/simulations: owned + starred. */
export function useAvailablePersonas() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPersonas = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await personaApi.getAvailable();
      const normalized = data.map((p: Persona) => ({
        ...p,
        avatarUrl: p.avatar_url || p.avatarUrl,
        createdAt: p.created_at || p.createdAt,
        updatedAt: p.updated_at || p.updatedAt,
      }));
      setPersonas(normalized);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch personas');
      console.error('Error fetching available personas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersonas();
  }, []);

  return {
    personas,
    loading,
    error,
    fetchPersonas,
  };
}


