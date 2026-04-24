import { apiClient } from './api.js';
import { User } from '../models/types.js';

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const authApi = {
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    if (response.token) {
      apiClient.setToken(response.token);
    }
    return response;
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    if (response.token) {
      apiClient.setToken(response.token);
    }
    return response;
  },

  logout: () => {
    apiClient.setToken(null);
  },
};


