import { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

import loginLogo from "../assets/logo.webp";
import loginBg from "../assets/login-logo.png";
import teamsIcon from "../assets/teams-icon.png";

const API_ORIGIN = (import.meta as any).env?.VITE_API_ORIGIN?.toString().trim() || "";
const AUTH_BASE = API_ORIGIN;
const AUTH_BACKEND_ORIGIN = (import.meta as any).env?.VITE_AUTH_BACKEND_ORIGIN?.toString().trim() || "http://localhost:8000";

type AuthResponse = {
  access: string;
  refresh: string;
  role: "qa" | "coach";
  coach_id?: string | null;
  username?: string;
};


export default function Login() {
  const nav = useNavigate();
  const auth = useContext(AuthContext);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);

  const inputClass = useMemo(
    () => `
      w-full h-12 rounded-xl px-4
      border border-black/20
      bg-[white]
      text-[var(--color17)]
      placeholder:text-black/40
      shadow-[inset_0_1px_0_rgba(0,0,0,0.04)]
      focus:outline-[#866CB6] focus:ring-2 focus:ring-[var(--color11)]
      focus:border-transparent
      disabled:opacity-70
    `,
    []
  );

  function persistAuth(data: AuthResponse, fallbackUsername: string) {
    localStorage.setItem("access", data.access);
    localStorage.setItem("refresh", data.refresh);

    localStorage.setItem("token", data.access);
    localStorage.setItem("refresh_token", data.refresh);

    localStorage.setItem("role", data.role);
    localStorage.setItem("coach_id", data.coach_id ?? "");
    localStorage.setItem("username", data.username ?? fallbackUsername);

    auth?.setUser?.({
      username: data.username ?? fallbackUsername,
      role: data.role,
      coach_id: data.coach_id ?? null,
    });
  }

  function makeRequestId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid.replace(/[^A-Za-z0-9_-]/g, "_");
    return `${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }



  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const u = username.trim();
    const p = password.trim();

    try {
      const res = await fetch(`${AUTH_BASE}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });

      const text = await res.text();
      let data: any = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const msg = data?.detail || text || `Login failed (${res.status})`;
        throw new Error(msg);
      }

      if (!data?.role || !data?.access || !data?.refresh) {
        throw new Error("Invalid login response");
      }

      persistAuth(data as AuthResponse, u);
      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function onMicrosoftLogin() {
    setErr(null);
    setLoadingMicrosoft(true);

    const requestId = makeRequestId();

    const w = 520;
    const h = 720;
    const left = window.screenX + Math.max(0, Math.floor((window.outerWidth - w) / 2));
    const top = window.screenY + Math.max(0, Math.floor((window.outerHeight - h) / 2));

    const popup = window.open(
      `${AUTH_BASE}/auth/microsoft/login/?origin=${encodeURIComponent(window.location.origin)}&request_id=${encodeURIComponent(requestId)}`,
      "microsoft-teams-login",
      `popup=yes,width=${w},height=${h},left=${left},top=${top}`
    );

    if (!popup) {
      setLoadingMicrosoft(false);
      setErr("Popup was blocked. Please allow popups and try again.");
      return;
    }

    // COOP severs window.opener when the popup navigates to Microsoft's domain,
    // so postMessage is unreliable in some navigations. Try postMessage first,
    // then fall back to polling the backend if the popup closes.

    const normalizeOrigin = (origin: string) => origin.trim().replace(/\/$/, "");
    const allowedOrigins = new Set([
      normalizeOrigin(window.location.origin),
      normalizeOrigin(AUTH_BACKEND_ORIGIN),
      normalizeOrigin(new URL(AUTH_BASE || window.location.origin, window.location.origin).origin),
    ]);

    let settled = false;
    let messageReceived = false;
    let closePoll: number | undefined;
    let timeoutId: number | undefined;
    let closeGraceId: number | undefined;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (closePoll) window.clearInterval(closePoll);
      if (timeoutId) window.clearTimeout(timeoutId);
      if (closeGraceId) window.clearTimeout(closeGraceId);
    };

    const finalize = (cb: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      cb();
    };

    const onMessage = (event: MessageEvent) => {
      if (!allowedOrigins.has(normalizeOrigin(event.origin))) return;
      const raw = event.data as any;
      let parsed = raw;
      if (typeof raw === "string") {
        try { parsed = JSON.parse(raw); } catch { return; }
      }
      const data = parsed as any;
      if (!data || data.type !== "microsoft-auth-result") return;
      messageReceived = true;
      finalize(() => {
        setLoadingMicrosoft(false);
        if (!data.ok || !data.payload) {
          setErr(data.error || "Microsoft login failed");
          return;
        }
        if (!data.payload.access || !data.payload.refresh || !data.payload.role) {
          setErr("Invalid Microsoft login response");
          return;
        }
        persistAuth(data.payload as AuthResponse, data.payload.username || username.trim() || "user");
        nav("/", { replace: true });
      });
    };

    window.addEventListener("message", onMessage);

    closePoll = window.setInterval(() => {
      if (!popup.closed) return;
      if (messageReceived) {
        finalize(() => { setLoadingMicrosoft(false); });
        return;
      }
      // Give postMessage a short grace period after popup close.
      if (!closeGraceId) {
        closeGraceId = window.setTimeout(() => {
          finalize(() => {
            void (async () => {
              const completed = await completeMicrosoftFromBackend(requestId);
              setLoadingMicrosoft(false);
              if (!completed) setErr("Microsoft login window closed before sign-in completed.");
            })();
          });
        }, 1200);
      }
    }, 400);

    timeoutId = window.setTimeout(() => {
      if (!popup.closed) popup.close();
      finalize(() => {
        void (async () => {
          const completed = await completeMicrosoftFromBackend(requestId);
          setLoadingMicrosoft(false);
          if (!completed) setErr("Microsoft login timed out. Please try again.");
        })();
      });
    }, 120000);
  }

  // Poll backend for a result (used as fallback) — wait up to 5 minutes
  async function completeMicrosoftFromBackend(requestId: string) {
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    const intervalMs = 1500;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${AUTH_BASE}/auth/microsoft/result/?request_id=${encodeURIComponent(requestId)}`);
        const text = await res.text().catch(() => "");
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch {}

        if (res.status === 202 || res.status === 404) {
          // still pending
        } else if (!res.ok) {
          if (data?.detail) {
            setErr(data.detail);
            return true;
          }
          return false;
        } else {
          if (!data?.access || !data?.refresh || !data?.role) {
            setErr("Invalid Microsoft login response");
            return true;
          }
          persistAuth(data as AuthResponse, data.username || username.trim() || "user");
          nav("/", { replace: true });
          return true;
        }
      } catch {
        // ignore network hiccups
      }
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    }
    return false;
  }

  return (
    <div className="fixed inset-0 flex bg-[var(--color16)]">
      {/* LEFT: Form */}
      <div className="w-full lg:w-[46%] flex items-center justify-center px-6 sm:px-10 py-10">
        <form
          onSubmit={onSubmit}
          className="
            w-full max-w-md
            bg-white rounded-2xl
            shadow-[0_20px_60px_rgba(0,0,0,0.08)]
            border border-black/5
            px-8 py-10
          "
        >
          {/* Logo */}
          <div className="flex items-center justify-center mb-8">
            <img
              src={loginLogo}
              alt="Kent Business College"
              className="h-12 w-auto object-contain"
            />
          </div>

          {/* Fields */}
          <div className="space-y-5">
            <div>
              <label
                className="block text-sm mb-2"
                style={{ color: "var(--color17)" }}
              >
                Username or Email
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => setUsername((v) => v.trim())}
                placeholder="Enter your username or email"
                autoComplete="username"
                disabled={loading}
                className={inputClass}
              />
            </div>

            <div>
              <label
                className="block text-sm mb-2"
                style={{ color: "var(--color17)" }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPassword((v) => v.trim())}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={loading}
                className={inputClass}
              />
            </div>

            {err && (
              <div className="text-sm rounded-xl px-4 py-3 bg-red-50 border border-red-100 text-red-700">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || loadingMicrosoft}
              className="
                w-full h-12 rounded-xl font-semibold
                text-white bg-[#241453]
                shadow-sm
                transition
                hover:opacity-95
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <button
              type="button"
              onClick={onMicrosoftLogin}
              disabled={loading || loadingMicrosoft}
              className="
                w-full h-12 rounded-xl font-semibold
                border border-[#d1d5db] bg-white text-[#111827]
                shadow-sm
                transition
                hover:bg-[#f9fafb]
                disabled:opacity-60 disabled:cursor-not-allowed
                flex items-center justify-center gap-3
              "
            >
              <img src={teamsIcon} alt="Microsoft Teams" className="w-5 h-5" />
              {loadingMicrosoft ? "Connecting to Microsoft..." : "Continue with Microsoft Teams"}
            </button>
          </div>
        </form>
      </div>

      {/* RIGHT: Image (No blur) */}
      <div className="hidden lg:block flex-1 relative">
        <img
          src={loginBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/5" />
      </div>
    </div>
  );
}