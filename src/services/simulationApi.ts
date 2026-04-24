import { apiClient } from './api.js';
import { SimulationSession } from '../models/types.js';

function normalizeSession(s: SimulationSession & { persona_ids?: string[]; system_prompt?: string | null }): SimulationSession {
  return {
    ...s,
    personaId: s.persona_id ?? s.personaId,
    personaIds: s.persona_ids ?? s.personaIds,
    bgInfo: s.bg_info ?? s.bgInfo,
    openingLine: s.opening_line ?? s.openingLine,
    stimulusImage: s.stimulus_image ?? s.stimulusImage,
    mimeType: s.mime_type ?? s.mimeType,
    systemPrompt: s.system_prompt ?? s.systemPrompt,
    createdAt: s.created_at ?? s.createdAt,
    updatedAt: s.updated_at ?? s.updatedAt,
  };
}

export const simulationApi = {
  getAll: async (): Promise<SimulationSession[]> => {
    const list = await apiClient.get<(SimulationSession & { persona_ids?: string[] })[]>('/simulations');
    return list.map(normalizeSession);
  },

  getById: async (id: string): Promise<SimulationSession> => {
    const s = await apiClient.get<SimulationSession & { persona_ids?: string[] }>(`/simulations/${id}`);
    return normalizeSession(s);
  },

  create: async (session: Omit<SimulationSession, 'id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<SimulationSession> => {
    const personaIds = session.personaIds ?? session.persona_ids;
    const singlePersonaId = session.personaId || session.persona_id;
    const hasMultiple = Array.isArray(personaIds) && personaIds.length >= 2;

    if (!singlePersonaId && !hasMultiple) {
      throw new Error('persona_id or persona_ids (at least 2) is required: No persona selected');
    }
    if (!session.mode) {
      throw new Error('mode is required: Simulation mode must be selected');
    }
    if (!session.name || !session.name.trim()) {
      throw new Error('name is required: Simulation name cannot be empty');
    }

    const payload: Record<string, unknown> = {
      persona_id: hasMultiple ? personaIds![0] : singlePersonaId,
      mode: session.mode,
      bg_info: session.bgInfo !== undefined ? String(session.bgInfo) : (session.bg_info !== undefined ? String(session.bg_info) : ''),
      opening_line: session.openingLine !== undefined ? (session.openingLine || null) : (session.opening_line !== undefined ? (session.opening_line || null) : null),
      stimulus_image: session.stimulusImage !== undefined ? (session.stimulusImage || null) : (session.stimulus_image !== undefined ? (session.stimulus_image || null) : null),
      mime_type: session.mimeType !== undefined ? (session.mimeType || null) : (session.mime_type !== undefined ? (session.mime_type || null) : null),
      name: session.name.trim(),
    };
    if (session.systemPrompt != null || session.system_prompt != null) {
      payload.system_prompt = session.systemPrompt ?? session.system_prompt ?? null;
    }
    if (hasMultiple) {
      payload.persona_ids = personaIds;
    }

    if (payload.bg_info === undefined || payload.bg_info === null) {
      payload.bg_info = '';
    }

    const result = await apiClient.post<SimulationSession & { persona_ids?: string[] }>('/simulations', payload);
    return normalizeSession(result);
  },

  update: async (id: string, updates: Partial<SimulationSession>): Promise<SimulationSession> => {
    const payload: any = {};
    if (updates.name) payload.name = updates.name;
    if (updates.bgInfo || updates.bg_info) payload.bg_info = updates.bgInfo || updates.bg_info;
    if (updates.openingLine || updates.opening_line) payload.opening_line = updates.openingLine || updates.opening_line;
    if (updates.stimulusImage || updates.stimulus_image) payload.stimulus_image = updates.stimulusImage || updates.stimulus_image;
    if (updates.mimeType || updates.mime_type) payload.mime_type = updates.mimeType || updates.mime_type;
    return apiClient.put<SimulationSession>(`/simulations/${id}`, payload);
  },

  delete: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`/simulations/${id}`);
  },

  getPersuasionContext: async (sessionId: string): Promise<{ systemPrompt: string | null; fullConversation: string; persuasionScore: number | null }> => {
    return apiClient.get<{ systemPrompt: string | null; fullConversation: string; persuasionScore: number | null }>(`/simulations/${sessionId}/persuasion-context`);
  },

  createMessage: async (
    sessionId: string,
    message: { sender_type: string; persona_id?: string; content: string; thinking?: string; retrieval_summary?: any; validation?: any }
  ): Promise<unknown> => {
    return apiClient.post(`/simulations/${sessionId}/messages`, message);
  },

  createMessagesBulk: async (
    sessionId: string,
    messages: Array<{ sender_type: string; persona_id?: string; content: string; thinking?: string; retrieval_summary?: any; validation?: any }>
  ): Promise<unknown[]> => {
    return apiClient.post<unknown[]>(`/simulations/${sessionId}/messages/bulk`, { messages });
  },
};

