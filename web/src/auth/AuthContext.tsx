/**
 * Session state.
 *
 * The session itself lives in an HttpOnly cookie the backend sets — this
 * context only mirrors *who* is signed in, resolved by asking the server.
 * Nothing here reads or stores a token, so there is no copy of the session
 * for a script on the page to steal.
 */

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import type { CrmUser, UserProfile } from "@/lib/types";

interface AuthState {
  user: CrmUser | null;
  profile: UserProfile | null;
  /** True until the initial session probe finishes — avoids a login flash. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<CrmUser | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Probe the existing cookie once on mount. A 401 is the expected answer for
  // a visitor who is simply not signed in — it is not an error worth showing.
  React.useEffect(() => {
    let cancelled = false;
    api.auth
      .session()
      .then((s) => {
        if (cancelled) return;
        setUser(s.user);
        setProfile(s.profile);
      })
      .catch((err) => {
        if (!cancelled && !(err instanceof ApiError && err.isUnauthenticated)) {
          // A non-401 means the backend is reachable but unhappy; leave the
          // user signed out and let the login screen surface it on retry.
          console.warn("No se pudo recuperar la sesión:", err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    setUser(res.user);
    setProfile(res.profile);
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      // Clear locally even if the call failed — the user asked to sign out.
      setUser(null);
      setProfile(null);
    }
  }, []);

  const value = React.useMemo<AuthState>(
    () => ({ user, profile, loading, login, logout }),
    [user, profile, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
