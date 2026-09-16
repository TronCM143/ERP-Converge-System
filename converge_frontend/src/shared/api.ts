const TOKEN_KEY = 'converge_auth_token';
const USERNAME_KEY = 'converge_auth_username';
const ROLE_KEY = 'converge_auth_role';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredAuth(): { token: string; username: string; role: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  const role = localStorage.getItem(ROLE_KEY);
  if (!token || !username || !role) return null;
  return { token, username, role };
}

export function setStoredAuth(token: string, username: string, role: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  localStorage.setItem(ROLE_KEY, role);
}

export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(ROLE_KEY);
}

// Dispatched when a session is genuinely over — the refresh below could not
// revive it — so the AuthContext can force a logout, without api.ts needing to
// import React/router.
export const UNAUTHORIZED_EVENT = 'converge:unauthorized';

// Dispatched after a silent refresh replaces the access token, so anything
// holding the old one can pick up the new.
export const TOKEN_REFRESHED_EVENT = 'converge:token-refreshed';

/* Resuming a session.

   The access token is deliberately short-lived, so an expired one is the normal
   state of affairs for anyone who closed the tab yesterday — not a reason to
   throw them back to the login page. The refresh cookie is httpOnly, so this
   code cannot read it and does not need to: the browser attaches it, and the
   server answers with a new access token or refuses.

   Single-flight on purpose. A dashboard fires half a dozen requests at once, and
   all of them will 401 together; without this they would each rotate the refresh
   token, and every rotation but the last would invalidate the others. */
let refreshInFlight: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        // Same-origin already sends the cookie; explicit so a future move to a
        // separate API host does not quietly break sign-in.
        credentials: 'same-origin'
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (!data?.token) return false;

      setStoredAuth(data.token, data.username, data.role);
      window.dispatchEvent(new Event(TOKEN_REFRESHED_EVENT));
      return true;
    } catch {
      // A network failure is not an expired session. Report it as a failed
      // refresh; the caller surfaces the original error rather than logging out.
      return false;
    } finally {
      // Cleared on the next tick so callers awaiting this promise all see the
      // same result before a new attempt can start.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

function buildHeaders(options: RequestInit): Headers {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // FormData must NOT get an explicit Content-Type — the browser sets
  // multipart/form-data with the boundary itself.
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let response = await fetch(path, { ...options, headers: buildHeaders(options), credentials: 'same-origin' });

  // Login and refresh are excluded: a 401 from either IS the answer, and
  // retrying /refresh through itself would loop.
  const isAuthEndpoint = path.startsWith('/api/auth/refresh') || path.startsWith('/api/auth/login');

  if (response.status === 401 && !isAuthEndpoint) {
    /* One attempt to revive the session, then the request runs again with the
       new token. Retried once and only once: if the second call still says 401
       the session really is gone, and a loop would just hammer the server.

       A retry is safe here because a 401 means the server rejected the request
       before doing anything — no write happened that this could duplicate. */
    const revived = await refreshSession();

    if (revived) {
      // A body stream can only be read once, so a retry is only possible when
      // the body can be re-sent. Everything in this app posts a string or
      // FormData, both of which can.
      response = await fetch(path, { ...options, headers: buildHeaders(options), credentials: 'same-origin' });
    }

    if (!revived || response.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
  }

  return response;
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || body.title || message;
    } catch {
      // ignore body parse failure
    }
    throw new Error(message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
