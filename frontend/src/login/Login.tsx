import { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

import loginLogo from "../assets/logo.webp";
import loginBg from "../assets/login-logo.png";

const API_ORIGIN = (import.meta as any).env?.VITE_API_ORIGIN?.toString().trim() || "/tasks-api";

export default function Login() {
  const nav = useNavigate();
  const auth = useContext(AuthContext);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    // Trim to avoid invisible trailing spaces causing 401
    const u = username.trim();
    const p = password.trim();

    try {
      const res = await fetch("/auth/login/", {
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

      if (!data?.role) {
        throw new Error("Invalid login response");
      }

      // 1) Obtain JWT pair (access + refresh) from SimpleJWT
      const pairRes = await fetch(`${API_ORIGIN}/tasks-api/api/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });

      const pairText = await pairRes.text();
      let pair: any = null;
      try {
        pair = pairText ? JSON.parse(pairText) : null;
      } catch {
        pair = null;
      }

      if (!pairRes.ok || !pair?.access || !pair?.refresh) {
        const msg = pair?.detail || pairText || `Failed to obtain tokens (${pairRes.status})`;
        throw new Error(msg);
      }

      // 2) Store tokens
      localStorage.setItem("access", pair.access);
      localStorage.setItem("refresh", pair.refresh);

      localStorage.setItem("token", pair.access);
      localStorage.setItem("refresh_token", pair.refresh);

      localStorage.setItem("role", data.role);
      localStorage.setItem("coach_id", data.coach_id ?? "");
      localStorage.setItem("username", data.username ?? u);

      auth?.setUser?.({
        username: data.username ?? u,
        role: data.role,
        coach_id: data.coach_id ?? null,
      });

      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
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
              disabled={loading}
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