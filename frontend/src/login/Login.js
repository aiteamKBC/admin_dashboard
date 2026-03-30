import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import loginLogo from "../assets/logo.webp";
import loginBg from "../assets/login-logo.png";
import teamsIcon from "../assets/teams-icon.png";
const API_ORIGIN = import.meta.env?.VITE_API_ORIGIN?.toString().trim() || "";
const AUTH_BASE = API_ORIGIN;
const AUTH_BACKEND_ORIGIN = import.meta.env?.VITE_AUTH_BACKEND_ORIGIN?.toString().trim() ||
    "http://localhost:8000";
export default function Login() {
    const nav = useNavigate();
    const auth = useContext(AuthContext);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);
    const inputClass = useMemo(() => `
      w-full h-12 rounded-xl px-4
      border border-black/20
      bg-[white]
      text-[var(--color17)]
      placeholder:text-black/40
      shadow-[inset_0_1px_0_rgba(0,0,0,0.04)]
      focus:outline-[#866CB6] focus:ring-2 focus:ring-[var(--color11)]
      focus:border-transparent
      disabled:opacity-70
    `, []);
    function persistAuth(data, fallbackUsername) {
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
        if (uuid)
            return uuid.replace(/[^A-Za-z0-9_-]/g, "_");
        return `${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    }
    async function readMicrosoftResult(requestId) {
        const res = await fetch(`${AUTH_BASE}/auth/microsoft/result/?request_id=${encodeURIComponent(requestId)}`);
        const text = await res.text().catch(() => "");
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = null;
        }
        if (res.status === 202 || res.status === 404) {
            return { pending: true };
        }
        if (!res.ok) {
            return {
                pending: false,
                error: data?.detail || text || `Microsoft login failed (${res.status})`,
            };
        }
        if (!data?.access || !data?.refresh || !data?.role) {
            return { pending: false, error: "Invalid Microsoft login response" };
        }
        return { pending: false, payload: data };
    }
    async function completeMicrosoftFromBackend(requestId) {
        // Keep polling the backend for a successful Microsoft login result.
        // Wait up to 5 minutes (same as backend cache TTL) before giving up.
        const timeoutMs = 5 * 60 * 1000; // 5 minutes
        const intervalMs = 1500; // poll every 1.5s to avoid spamming the server
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const result = await readMicrosoftResult(requestId);
            if (result.payload) {
                persistAuth(result.payload, result.payload.username || username.trim() || "user");
                nav("/", { replace: true });
                return true;
            }
            if (result.error) {
                setErr(result.error);
                return true;
            }
            await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
        }
        return false;
    }
    async function onSubmit(e) {
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
            let data = null;
            try {
                data = text ? JSON.parse(text) : null;
            }
            catch {
                data = null;
            }
            if (!res.ok) {
                const msg = data?.detail || text || `Login failed (${res.status})`;
                throw new Error(msg);
            }
            if (!data?.role || !data?.access || !data?.refresh) {
                throw new Error("Invalid login response");
            }
            persistAuth(data, u);
            nav("/", { replace: true });
        }
        catch (e) {
            setErr(e?.message || "Login failed");
        }
        finally {
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
        const popup = window.open(`${AUTH_BASE}/auth/microsoft/login/?origin=${encodeURIComponent(window.location.origin)}&request_id=${encodeURIComponent(requestId)}`, "microsoft-teams-login", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
        if (!popup) {
            setLoadingMicrosoft(false);
            setErr("Popup was blocked. Please allow popups and try again.");
            return;
        }
        const normalizeOrigin = (origin) => origin.trim().replace(/\/$/, "");
        const allowedOrigins = new Set([
            normalizeOrigin(window.location.origin),
            normalizeOrigin(AUTH_BACKEND_ORIGIN),
            normalizeOrigin(new URL(AUTH_BASE || window.location.origin, window.location.origin).origin),
        ]);
        let settled = false;
        let messageReceived = false;
        let closePoll = 0;
        let timeoutId = 0;
        let closeGraceId = 0;
        const cleanup = () => {
            window.removeEventListener("message", onMessage);
            if (closePoll)
                window.clearInterval(closePoll);
            if (timeoutId)
                window.clearTimeout(timeoutId);
            if (closeGraceId)
                window.clearTimeout(closeGraceId);
        };
        const finalize = (cb) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            cb();
        };
        const onMessage = (event) => {
            if (!allowedOrigins.has(normalizeOrigin(event.origin)))
                return;
            const raw = event.data;
            let parsed = raw;
            if (typeof raw === "string") {
                try {
                    parsed = JSON.parse(raw);
                }
                catch {
                    return;
                }
            }
            const data = parsed;
            if (!data || data.type !== "microsoft-auth-result")
                return;
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
                persistAuth(data.payload, data.payload.username || username.trim() || "user");
                nav("/", { replace: true });
            });
        };
        window.addEventListener("message", onMessage);
        closePoll = window.setInterval(() => {
            if (!popup.closed)
                return;
            if (messageReceived) {
                finalize(() => {
                    setLoadingMicrosoft(false);
                });
                return;
            }
            // Give postMessage a short grace period after popup close.
            if (!closeGraceId) {
                closeGraceId = window.setTimeout(() => {
                    finalize(() => {
                        void (async () => {
                            const completed = await completeMicrosoftFromBackend(requestId);
                            setLoadingMicrosoft(false);
                            if (!completed) {
                                setErr("Microsoft login window closed before sign-in completed.");
                            }
                        })();
                    });
                }, 1200);
            }
        }, 400);
        timeoutId = window.setTimeout(() => {
            if (!popup.closed)
                popup.close();
            finalize(() => {
                void (async () => {
                    const completed = await completeMicrosoftFromBackend(requestId);
                    setLoadingMicrosoft(false);
                    if (!completed) {
                        setErr("Microsoft login timed out. Please try again.");
                    }
                })();
            });
        }, 120000);
    }
    return (_jsxs("div", { className: "fixed inset-0 flex bg-[var(--color16)]", children: [_jsx("div", { className: "w-full lg:w-[46%] flex items-center justify-center px-6 sm:px-10 py-10", children: _jsxs("form", { onSubmit: onSubmit, className: "\n            w-full max-w-md\n            bg-white rounded-2xl\n            shadow-[0_20px_60px_rgba(0,0,0,0.08)]\n            border border-black/5\n            px-8 py-10\n          ", children: [_jsx("div", { className: "flex items-center justify-center mb-8", children: _jsx("img", { src: loginLogo, alt: "Kent Business College", className: "h-12 w-auto object-contain" }) }), _jsxs("div", { className: "space-y-5", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm mb-2", style: { color: "var(--color17)" }, children: "Username or Email" }), _jsx("input", { value: username, onChange: (e) => setUsername(e.target.value), onBlur: () => setUsername((v) => v.trim()), placeholder: "Enter your username or email", autoComplete: "username", disabled: loading, className: inputClass })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm mb-2", style: { color: "var(--color17)" }, children: "Password" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), onBlur: () => setPassword((v) => v.trim()), placeholder: "Enter your password", autoComplete: "current-password", disabled: loading, className: inputClass })] }), err && (_jsx("div", { className: "text-sm rounded-xl px-4 py-3 bg-red-50 border border-red-100 text-red-700", children: err })), _jsx("button", { type: "submit", disabled: loading || loadingMicrosoft, className: "\n                w-full h-12 rounded-xl font-semibold\n                text-white bg-[#241453]\n                shadow-sm\n                transition\n                hover:opacity-95\n                disabled:opacity-60 disabled:cursor-not-allowed\n              ", children: loading ? "Signing in..." : "Sign in" }), _jsxs("button", { type: "button", onClick: onMicrosoftLogin, disabled: loading || loadingMicrosoft, className: "\n                w-full h-12 rounded-xl font-semibold\n                border border-[#d1d5db] bg-white text-[#111827]\n                shadow-sm\n                transition\n                hover:bg-[#f9fafb]\n                disabled:opacity-60 disabled:cursor-not-allowed\n                flex items-center justify-center gap-3\n              ", children: [_jsx("img", { src: teamsIcon, alt: "Microsoft Teams", className: "w-5 h-5" }), loadingMicrosoft ? "Connecting to Microsoft..." : "Continue with Microsoft Teams"] })] })] }) }), _jsxs("div", { className: "hidden lg:block flex-1 relative", children: [_jsx("img", { src: loginBg, alt: "", className: "absolute inset-0 w-full h-full object-cover" }), _jsx("div", { className: "absolute inset-0 bg-black/5" })] })] }));
}
