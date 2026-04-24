const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const API_ERROR_EVENT = 'api-network-error';
let apiErrorDebounce: ReturnType<typeof setTimeout> | null = null;

function notifyApiError(message: string) {
  if (typeof window === 'undefined') return;
  if (apiErrorDebounce) clearTimeout(apiErrorDebounce);
  apiErrorDebounce = setTimeout(() => {
    apiErrorDebounce = null;
    window.dispatchEvent(new CustomEvent(API_ERROR_EVENT, { detail: { message } }));
  }, 300);
}

export function getApiErrorEventName() {
  return API_ERROR_EVENT;
}

// In production, VITE_API_URL must be set or requests will try localhost and fail with "Failed to fetch"
if (import.meta.env.PROD && (!import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL.includes('localhost'))) {
  console.error(
    'VITE_API_URL is not set for production. Set it in your host (e.g. Render) to your backend URL, e.g. https://persona-builder-backend.onrender.com/api'
  );
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Load token from localStorage
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (token && typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('Load failed')) {
        const base = import.meta.env.VITE_API_URL || '';
        const hint = import.meta.env.PROD && (!base || base.includes('localhost'))
          ? ' Set VITE_API_URL to your backend URL in the frontend environment (e.g. on Render) and redeploy.'
          : ' Check that the backend is running and CORS allows this origin.';
        const userMessage = 'Cannot reach the API.' + hint;
        notifyApiError(userMessage);
        throw new Error(userMessage);
      }
      throw err;
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      // Use message field if available (development mode), otherwise use error field
      const errorMessage = error.message || error.error || `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

