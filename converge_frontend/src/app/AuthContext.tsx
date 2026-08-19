import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiFetch,
  clearStoredAuth,
  getStoredAuth,
  setStoredAuth,
  UNAUTHORIZED_EVENT
} from '../shared/api';

/* 'engineer' is the approver: it reaches the quotation approval dashboard and
   nothing else. Kept distinct from 'admin' so approval authority and system
   administration are separate, and so approval notifications can target a role
   by name (UserNotification.TargetRole). */
export type Role = 'quotation' | 'purchasing' | 'admin' | 'engineer';

interface AuthState {
  token: string | null;
  username: string | null;
  role: Role | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<Role>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const stored = getStoredAuth();
    return stored
      ? { token: stored.token, username: stored.username, role: stored.role as Role }
      : { token: null, username: null, role: null };
  });

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // best-effort; clear local state regardless
    }
    clearStoredAuth();
    setState({ token: null, username: null, role: null });
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredAuth();
      setState({ token: null, username: null, role: null });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Login failed.');
    }

    const role = data.role as Role;
    setStoredAuth(data.token, data.username, role);
    setState({ token: data.token, username: data.username, role });
    return role;
  }, []);

  const value: AuthContextValue = {
    ...state,
    isAuthenticated: Boolean(state.token),
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
