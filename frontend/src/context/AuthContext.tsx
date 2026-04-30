import { createContext, useState, ReactNode, useEffect, useCallback } from "react";
import { silentRefresh, isAccessTokenExpiringSoon } from "../services/fetchWithAuth";

type User = {
  username: string;
  role: "qa" | "coach";
  coach_id?: string | null;
};

type AuthContextType = {
  user: User | null;
  setUser: (user: User | null) => void;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Load user from localStorage once on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role") as User["role"] | null;
    const username = localStorage.getItem("username");
    const coach_id = localStorage.getItem("coach_id");

    if (token && role && username) {
      setUser({ username, role, coach_id: coach_id || null });
    } else {
      setUser(null);
    }
  }, []);

  const clearAuthAndRedirect = useCallback(() => {
    localStorage.removeItem("access");
    localStorage.removeItem("token");
    localStorage.removeItem("refresh");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("role");
    localStorage.removeItem("coach_id");
    localStorage.removeItem("username");
    setUser(null);
    window.location.replace("/login");
  }, []);

  // Listen for auth:session-expired dispatched by fetchWithAuth
  useEffect(() => {
    const handler = () => clearAuthAndRedirect();
    window.addEventListener("auth:session-expired", handler);
    return () => window.removeEventListener("auth:session-expired", handler);
  }, [clearAuthAndRedirect]);

  // Global proactive token refresh — runs across the whole app, independent of
  // user state, keyed only on whether a refresh token exists in localStorage.
  useEffect(() => {
    async function maybeRefresh() {
      if (!localStorage.getItem("refresh")) return;

      if (isAccessTokenExpiringSoon(5 * 60 * 1000)) {
        const ok = await silentRefresh();
        if (!ok) clearAuthAndRedirect();
      }
    }

    // Check immediately (handles page reload after a long absence)
    maybeRefresh();

    // Re-check every 3 minutes — well within the 60-min access token window
    const interval = setInterval(maybeRefresh, 3 * 60 * 1000);

    // Re-check when the user comes back to the tab
    function onVisibilityChange() {
      if (document.visibilityState === "visible") maybeRefresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Re-check when localStorage changes in another tab (cross-tab sync)
    function onStorage(e: StorageEvent) {
      if (e.key === "refresh" && !e.newValue) {
        // Refresh token was cleared in another tab → treat as logout
        setUser(null);
      }
    }
    window.addEventListener("storage", onStorage);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [clearAuthAndRedirect]);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
