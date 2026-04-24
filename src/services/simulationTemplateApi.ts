import { apiClient } from './api.js';

export type SimulationType =
  | 'report'
  | 'persuasion_simulation'
  | 'response_simulation'
  | 'survey'
  | 'persona_conversation'
  | 'idea_generation';

export interface SimulationInputField {
  name: string;
  type: 'text' | 'image' | 'table' | 'pdf' | 'multiple_choice' | 'business_profile' | 'survey_questions';
  required: boolean;
  /** For multiple_choice: list of option strings */
  options?: string[];
}

/** Survey question for Generated survey mode */
export interface SurveyQuestion {
  type: 'text' | 'numeric' | 'multiple_choice';
  question: string;
  options?: string[];
}

export interface SimulationTemplate {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  required_input_fields: SimulationInputField[];
  system_prompt: string;
  is_active: boolean;
  simulation_type?: SimulationType;
  allowed_persona_types?: string[];
  persona_count_min?: number;
  persona_count_max?: number;
  type_specific_config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateSimulationRequest {
  title: string;
  description?: string;
  icon?: string;
  required_input_fields: SimulationInputField[];
  system_prompt?: string;
  is_active?: boolean;
  simulation_type?: SimulationType;
  allowed_persona_types?: string[];
  persona_count_min?: number;
  persona_count_max?: number;
  type_specific_config?: Record<string, unknown>;
}

export interface UpdateSimulationRequest {
  title?: string;
  description?: string;
  icon?: string;
  required_input_fields?: SimulationInputField[];
  system_prompt?: string;
  is_active?: boolean;
  simulation_type?: SimulationType;
  allowed_persona_types?: string[];
  persona_count_min?: number;
  persona_count_max?: number;
  type_specific_config?: Record<string, unknown>;
}

export const simulationTemplateApi = {
  // Public endpoint - get active simulations
  getAll: async (): Promise<SimulationTemplate[]> => {
    return apiClient.get<SimulationTemplate[]>('/simulations/templates');
  },

  // Admin endpoints
  getAllAdmin: async (includeInactive: boolean = false): Promise<SimulationTemplate[]> => {
    return apiClient.get<SimulationTemplate[]>(`/admin/simulations?includeInactive=${includeInactive}`);
  },

  getById: async (id: string): Promise<SimulationTemplate> => {
    return apiClient.get<SimulationTemplate>(`/admin/simulations/${id}`);
  },

  create: async (data: CreateSimulationRequest): Promise<SimulationTemplate> => {
    return apiClient.post<SimulationTemplate>('/admin/simulations', data);
  },

  update: async (id: string, data: UpdateSimulationRequest): Promise<SimulationTemplate> => {
    return apiClient.put<SimulationTemplate>(`/admin/simulations/${id}`, data);
  },

  /** Generate system prompt from config (for review/edit before save) */
  previewPrompt: async (data: CreateSimulationRequest): Promise<{ system_prompt: string }> => {
    return apiClient.post<{ system_prompt: string }>('/admin/simulations/preview-prompt', data);
  },

  delete: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`/admin/simulations/${id}`);
  },
};


