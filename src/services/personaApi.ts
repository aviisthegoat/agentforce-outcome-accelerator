import { apiClient } from './api.js';
import { Persona, PersonaFile } from '../models/types.js';

export const personaApi = {
  getAll: async (): Promise<Persona[]> => {
    return apiClient.get<Persona[]>('/personas');
  },

  getById: async (id: string): Promise<Persona> => {
    return apiClient.get<Persona>(`/personas/${id}`);
  },

  getLibrary: async (): Promise<Persona[]> => {
    return apiClient.get<Persona[]>('/personas/library');
  },

  getStarred: async (): Promise<Persona[]> => {
    return apiClient.get<Persona[]>('/personas/starred');
  },

  getAvailable: async (): Promise<Persona[]> => {
    return apiClient.get<Persona[]>('/personas/available');
  },

  star: async (id: string): Promise<void> => {
    return apiClient.post<void>(`/personas/${id}/star`);
  },

  unstar: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`/personas/${id}/star`);
  },

  create: async (persona: Omit<Persona, 'id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<Persona> => {
    // Validate required fields
    if (!persona.name || !persona.name.trim()) {
      throw new Error('Persona name is required');
    }
    if (!persona.type) {
      throw new Error('Persona type is required');
    }
    if (!persona.description || !persona.description.trim()) {
      throw new Error('Persona description is required');
    }
    
    // Transform frontend format to backend format
    const payload = {
      name: persona.name.trim(),
      type: persona.type,
      description: persona.description.trim(),
      avatar_url: persona.avatarUrl || persona.avatar_url || '',
      visibility: persona.visibility || 'private',
      metadata: persona.metadata || {},
    };
    
    const createdPersona = await apiClient.post<Persona>('/personas', payload);
    
    // Verify the created persona has all required fields
    if (!createdPersona.id) {
      throw new Error('Failed to create persona: missing ID in response');
    }
    if (!createdPersona.name) {
      throw new Error('Failed to create persona: missing name in response');
    }
    
    return createdPersona;
  },

  update: async (id: string, updates: Partial<Persona>): Promise<Persona> => {
    const payload: any = {};
    if (updates.name) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.avatarUrl || updates.avatar_url) payload.avatar_url = updates.avatarUrl || updates.avatar_url;
    if (updates.visibility) payload.visibility = updates.visibility;
    if (updates.metadata) payload.metadata = updates.metadata;
    return apiClient.put<Persona>(`/personas/${id}`, payload);
  },

  delete: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`/personas/${id}`);
  },

  getFiles: async (personaId: string): Promise<PersonaFile[]> => {
    return apiClient.get<PersonaFile[]>(`/personas/${personaId}/files`);
  },

  createFile: async (personaId: string, file: Omit<PersonaFile, 'id' | 'persona_id' | 'created_at'>): Promise<PersonaFile> => {
    return apiClient.post<PersonaFile>(`/personas/${personaId}/files`, file);
  },
};

