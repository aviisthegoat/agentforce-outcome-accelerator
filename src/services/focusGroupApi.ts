import { apiClient } from './api.js';
import type { FocusGroup } from '../models/types.js';

export const focusGroupApi = {
  getAll: async (): Promise<FocusGroup[]> => {
    const list = await apiClient.get<FocusGroup[]>('/focus-groups');
    return (list || []).map(normalize);
  },

  getById: async (id: string): Promise<FocusGroup> => {
    const group = await apiClient.get<FocusGroup>(`/focus-groups/${id}`);
    return normalize(group);
  },

  create: async (data: { name: string; allowedPersonaTypes?: string[] }): Promise<FocusGroup> => {
    const group = await apiClient.post<FocusGroup>('/focus-groups', data);
    return normalize(group);
  },

  update: async (
    id: string,
    data: { name?: string; personaIds?: string[]; allowedPersonaTypes?: string[] }
  ): Promise<FocusGroup> => {
    const group = await apiClient.put<FocusGroup>(`/focus-groups/${id}`, data);
    return normalize(group);
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete<void>(`/focus-groups/${id}`);
  },
};

function normalize(g: FocusGroup): FocusGroup {
  return {
    ...g,
    createdAt: g.createdAt ?? g.created_at,
    updatedAt: g.updatedAt ?? g.updated_at,
  };
}
