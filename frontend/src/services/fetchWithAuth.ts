const API_ORIGIN =
  ((import.meta as any).env?.VITE_API_ORIGIN)?.toString().trim() || "";

const API_BASE = `${API_ORIGIN}/tasks-api`;

// Fix: use API_ORIGIN so refresh works locally (localhost:8000) AND in production (same-origin)
const REFRESH_URL = API_ORIGIN
  ? `${API_ORIGIN}/api/token/refresh/`
  : "/api/token/refresh/";

function getAccess() {
  return localStorage.getItem("access") || localStorage.getItem("token") || "";
}

function getRefresh() {
  return localStorage.getItem("refresh") || localStorage.getItem("refresh_token") || "";
}

export function getTokenExpiry(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Returns true if access token is missing OR expires within `bufferMs`
export function isAccessTokenExpiringSoon(bufferMs = 60_000): boolean {
  const token = getAccess();
  if (!token) return true;
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  return Date.now() >= expiry - bufferMs;
}

// Single shared in-flight promise — prevents multiple concurrent refresh calls
let _refreshPromise: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const refresh = getRefresh();
  if (!refresh) throw new Error("Missing refresh token");

  const res = await fetch(REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok || !data?.access) {
    throw new Error(data?.detail || text || `Refresh failed (${res.status})`);
  }

  localStorage.setItem("access", data.access);
  localStorage.setItem("token", data.access);

  // ROTATE_REFRESH_TOKENS=True — always save new refresh token
  if (data.refresh) {
    localStorage.setItem("refresh", data.refresh);
    localStorage.setItem("refresh_token", data.refresh);
  }

  return data.access as string;
}

function refreshAccessToken(): Promise<string> {
  if (!_refreshPromise) {
    _refreshPromise = doRefresh().finally(() => {
      _refreshPromise = null;
    });
  }
  return _refreshPromise;
}

// Exported for proactive refresh in AuthContext
export async function silentRefresh(): Promise<boolean> {
  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
}

function dispatchSessionExpired() {
  window.dispatchEvent(new CustomEvent("auth:session-expired"));
}

function buildHeaders(token: string, init: RequestInit): Headers {
  const h = new Headers(init.headers || {});
  if (!h.has("Content-Type") && !(init.body instanceof FormData)) {
    h.set("Content-Type", "application/json");
  }
  if (token) h.set("Authorization", `Bearer ${token}`);
  return h;
}

export async function fetchWithAuth(input: string, init: RequestInit = {}) {
  let access = getAccess();

  // Proactively refresh if token expires within 30 seconds
  if (isAccessTokenExpiringSoon(30_000) && getRefresh()) {
    try {
      access = await refreshAccessToken();
    } catch {
      dispatchSessionExpired();
      throw new Error("Session expired. Please log in again.");
    }
  }

  let res = await fetch(`${API_BASE}${input}`, {
    ...init,
    headers: buildHeaders(access, init),
  });

  if (res.status !== 401) {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  // 401 received — attempt token refresh
  if (!getRefresh()) {
    dispatchSessionExpired();
    throw new Error("Session expired. Please log in again.");
  }

  let newAccess: string;
  try {
    newAccess = await refreshAccessToken();
  } catch {
    dispatchSessionExpired();
    throw new Error("Session expired. Please log in again.");
  }

  // Retry original request with new token
  res = await fetch(`${API_BASE}${input}`, {
    ...init,
    headers: buildHeaders(newAccess, init),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed: ${res.status} ${text}`);
  }

  return res.json();
}
