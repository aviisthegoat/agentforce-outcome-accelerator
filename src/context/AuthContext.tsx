import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../models/types.js';
import { authApi, RegisterRequest, LoginRequest } from '../services/authApi.js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in (token exists)
    const token = localStorage.getItem('auth_token');
    if (token) {
      // Token exists, but we don't have user info
      // In a real app, you might want to verify the token and fetch user info
      // For now, we'll just check if token exists
      const savedUser = localStorage.getItem('auth_user');
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          // Ensure isAdmin is set for backwards compatibility
          const isAdminValue = parsedUser.is_admin === true || parsedUser.is_admin === 'true' || parsedUser.is_admin === 1 || parsedUser.isAdmin === true;
          parsedUser.isAdmin = isAdminValue;
          parsedUser.is_admin = isAdminValue;
          setUser(parsedUser);
        } catch (e) {
          console.error('Failed to parse saved user', e);
        }
      }
    }
    setLoading(false);
  }, []);

  const login = async (data: LoginRequest) => {
    const response = await authApi.login(data);
    const isAdminValue = response.user.is_admin === true || response.user.is_admin === 'true' || response.user.is_admin === 1;
    const userData = {
      ...response.user,
      isAdmin: isAdminValue,
      is_admin: isAdminValue,
    };
    setUser(userData);
    localStorage.setItem('auth_user', JSON.stringify(userData));
  };

  const register = async (data: RegisterRequest) => {
    const response = await authApi.register(data);
    const isAdminValue = response.user.is_admin === true || response.user.is_admin === 'true' || response.user.is_admin === 1;
    const userData = {
      ...response.user,
      isAdmin: isAdminValue,
      is_admin: isAdminValue,
    };
    setUser(userData);
    localStorage.setItem('auth_user', JSON.stringify(userData));
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    localStorage.removeItem('auth_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.isAdmin === true || user?.is_admin === true || false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

