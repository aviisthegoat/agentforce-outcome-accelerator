import { apiClient } from './api.js';

export interface UserWithStats {
  id: string;
  username: string;
  email?: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  persona_count: number;
  chat_count: number;
}

export interface PersonaWithOwner {
  id: string;
  user_id: string;
  username: string;
  name: string;
  type: string;
  description?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionWithOwner {
  id: string;
  user_id: string;
  username: string;
  name: string;
  message_count: number;
  last_activity: string;
  created_at: string;
  updated_at: string;
}

export interface AdminStats {
  total_users: number;
  total_personas: number;
  total_chat_sessions: number;
  total_messages: number;
  total_simulation_sessions: number;
  admin_users: number;
  unindexed_personas: number;
}

export interface ReindexEvent {
  type: 'progress' | 'complete' | 'error';
  current?: number;
  total?: number;
  personaName?: string;
  status?: 'success' | 'error';
  error?: string;
  success?: number;
  failed?: number;
  skipped?: string;
}

export const adminApi = {
  getAllUsers: async (): Promise<UserWithStats[]> => {
    return apiClient.get<UserWithStats[]>('/admin/users');
  },

  getAllPersonas: async (): Promise<PersonaWithOwner[]> => {
    return apiClient.get<PersonaWithOwner[]>('/admin/personas');
  },

  getAllChats: async (): Promise<ChatSessionWithOwner[]> => {
    return apiClient.get<ChatSessionWithOwner[]>('/admin/chats');
  },

  getStats: async (): Promise<AdminStats> => {
    return apiClient.get<AdminStats>('/admin/stats');
  },

  createPersona: async (data: { name: string; type: 'synthetic_user' | 'advisor'; description?: string; avatar_url?: string }): Promise<PersonaWithOwner> => {
    return apiClient.post<PersonaWithOwner>('/admin/personas', data);
  },

  reindexAllPersonas: async (): Promise<{ message: string; count: number }> => {
    return apiClient.post<{ message: string; count: number }>('/admin/reindex-all', {});
  },

  testEmbed: async (): Promise<{ ok: boolean; checks: Record<string, { ok: boolean; detail: string }> }> => {
    return apiClient.get('/admin/test-embed');
  },

  reindexAllPersonasStream: async (onEvent: (event: ReindexEvent) => void): Promise<void> => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${baseUrl}/admin/reindex-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: '{}',
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        const parsed = JSON.parse(text);
        errMsg = parsed.message || parsed.error || errMsg;
      } catch { /* use default */ }
      throw new Error(errMsg);
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data.type === 'complete') {
        onEvent(data);
      } else {
        onEvent({ type: 'complete', success: data.count || 0, failed: 0, total: data.count || 0 });
      }
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Streaming not supported by this browser');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          try {
            onEvent(JSON.parse(line));
          } catch { /* skip malformed lines */ }
        }
      }
    }
    if (buffer.trim()) {
      try {
        onEvent(JSON.parse(buffer));
      } catch { /* skip */ }
    }
  },
};


