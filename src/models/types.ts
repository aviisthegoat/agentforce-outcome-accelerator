import type { AgentPipelineEvent } from '../services/agentApi.js';

export type PersonaType = 'synthetic_user' | 'advisor';

export type PersonaVisibility = 'private' | 'public' | 'global';

export interface Persona {
  id: string;
  user_id?: string;
  name: string;
  type: PersonaType;
  description: string;
  avatarUrl?: string;
  avatar_url?: string;
  visibility?: PersonaVisibility;
  starred?: boolean;
  /** Set when loaded via getAvailable: owned personas can be deleted; starred can be unstarred. */
  source?: 'owned' | 'starred';
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  metadata: Record<string, any>;
  files?: PersonaFile[];
}

export interface PersonaFile {
  id: string;
  persona_id?: string;
  name: string;
  content: string;
  type: 'markdown' | 'pdf_analysis' | 'linked_in_profile';
  createdAt?: string;
  created_at?: string;
}

export interface Message {
  id: string;
  sessionId?: string;
  session_id?: string;
  senderType: 'user' | 'persona' | 'moderator';
  sender_type?: 'user' | 'persona' | 'moderator';
  personaId?: string;
  persona_id?: string;
  content: string;
  thinking?: string;
  retrieval_summary?: {
    queries: string[];
    chunks: { source_type: string; source_name: string; score: number; preview: string }[];
    ragEmpty: boolean;
  } | null;
  validation?: {
    alignment_score: number;
    completeness_score?: number;
    flags: string[];
    suggestions: string[];
    completeness_flags?: string[];
    completeness_suggestions?: string[];
  } | null;
  /** Serialized agent pipeline (4 steps + complete) for this reply */
  pipeline_events?: AgentPipelineEvent[];
  createdAt?: string;
  created_at?: string;
}

export interface ChatSession {
  id: string;
  userId?: string;
  user_id?: string;
  name: string;
  personaIds?: string[];
  persona_ids?: string[];
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  is_admin?: boolean;
  isAdmin?: boolean;
}

export interface BusinessProfile {
  id?: string;
  user_id?: string;
  business_name?: string | null;
  mission_statement?: string | null;
  vision_statement?: string | null;
  description_main_offerings?: string | null;
  key_features_or_benefits?: string | null;
  unique_selling_proposition?: string | null;
  pricing_model?: string | null;
  customer_segments?: string | null;
  geographic_focus?: string | null;
  industry_served?: string | null;
  what_differentiates?: string | null;
  market_niche?: string | null;
  revenue_streams?: string | null;
  distribution_channels?: string | null;
  key_personnel?: string | null;
  major_achievements?: string | null;
  revenue?: string | null;
  key_performance_indicators?: string | null;
  funding_rounds?: string | null;
  website?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type SimulationMode = 
  | 'web_page' 
  | 'marketing' 
  | 'sales_pitch' 
  | 'investor_pitch';

export interface SimulationSession {
  id: string;
  userId?: string;
  user_id?: string;
  personaId: string;
  persona_id?: string;
  personaIds?: string[];
  persona_ids?: string[];
  mode: SimulationMode;
  bgInfo?: string;
  bg_info?: string;
  openingLine?: string;
  opening_line?: string;
  stimulusImage?: string;
  stimulus_image?: string;
  mimeType?: string;
  mime_type?: string;
  name: string;
  systemPrompt?: string | null;
  system_prompt?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface FocusGroup {
  id: string;
  name: string;
  personaIds: string[];
  /** When set, "Personas in this group" is restricted to these persona types (e.g. Synthetic User, Advisor). */
  allowedPersonaTypes?: string[];
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

