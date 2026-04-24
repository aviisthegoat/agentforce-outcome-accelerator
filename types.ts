
export type PersonaType = 'synthetic_user' | 'advisor';

export interface Persona {
  id: string;
  name: string;
  type: PersonaType;
  description: string;
  avatarUrl: string;
  createdAt: string;
  metadata: Record<string, any>;
  files: PersonaFile[];
}

export interface PersonaFile {
  id: string;
  name: string;
  content: string;
  type: 'markdown' | 'pdf_analysis' | 'linked_in_profile';
}

export interface Message {
  id: string;
  sessionId: string;
  senderType: 'user' | 'persona';
  personaId?: string;
  content: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  name: string;
  personaIds: string[];
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
}

export type SimulationMode = 
  | 'web_page' 
  | 'marketing' 
  | 'sales_pitch' 
  | 'investor_pitch';

export interface SimulationSession {
  id: string;
  mode: SimulationMode;
  personaId: string;
  bgInfo: string;
  openingLine?: string;
  stimulusImage?: string;
  mimeType?: string;
  createdAt: string;
  name: string;
}
