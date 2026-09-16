import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiFetch,
  clearStoredAuth,
  getStoredAuth,
  refreshSession,
  setStoredAuth,
  TOKEN_REFRESHED_EVENT,
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
  /* True only during the first moments after a reload, while the session is
     being restored. Routes wait on it rather than bouncing to /login, which is
     what made a returning user see the login form for a frame. */
  isRestoring: boolean;
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

  /* Nothing stored means one of two things, and they look identical from here:
     a visitor who has never signed in, or a signed-in user whose localStorage
     was cleared while their refresh cookie is still good. Asking the server
     costs one request and is the difference between those two people. */
  const [isRestoring, setIsRestoring] = useState(() => getStoredAuth() === null);

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
    if (!isRestoring) return;

    let cancelled = false;
    void refreshSession().then((revived) => {
      if (cancelled) return;
      if (revived) {
        const stored = getStoredAuth();
        if (stored) {
          setState({ token: stored.token, username: stored.username, role: stored.role as Role });
        }
      }
      setIsRestoring(false);
    });

    return () => {
      cancelled = true;
    };
    // Runs once on mount; isRestoring only ever goes true -> false.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A silent refresh swaps the access token underneath us; keep context in step
  // with what is actually stored.
  useEffect(() => {
    const handleRefreshed = () => {
      const stored = getStoredAuth();
      if (stored) {
        setState({ token: stored.token, username: stored.username, role: stored.role as Role });
      }
    };
    window.addEventListener(TOKEN_REFRESHED_EVENT, handleRefreshed);
    return () => window.removeEventListener(TOKEN_REFRESHED_EVENT, handleRefreshed);
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
      // The refresh cookie rides on this request (so a browser can reclaim its
      // own session) and the new one comes back on the response.
      credentials: 'same-origin',
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
    isRestoring,
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
