const API_ORIGIN =
  ((import.meta as any).env?.VITE_API_ORIGIN)?.toString().trim() || "";

const API_BASE = `${API_ORIGIN}/tasks-api`;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const inFlightGetRequests = new Map<string, Promise<any>>();
const completedGetCache = new Map<string, { expiresAt: number; data: any }>();
const COMPLETED_GET_CACHE_TTL_MS = 15_000;

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

  const res = await fetchWithTimeout(REFRESH_URL, {
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

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const parentSignal = init.signal;
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  function abortFromParent() {
    controller.abort();
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (timedOut) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

async function fetchWithAuthInner(input: string, init: RequestInit = {}) {
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

  let res = await fetchWithTimeout(`${API_BASE}${input}`, {
    ...init,
    headers: buildHeaders(access, init),
  });

  if (res.status !== 401) {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return null;
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
  res = await fetchWithTimeout(`${API_BASE}${input}`, {
    ...init,
    headers: buildHeaders(newAccess, init),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed: ${res.status} ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function fetchWithAuth(input: string, init: RequestInit = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const canDedupe = method === "GET" && !init.body && !init.signal;
  const key = canDedupe ? input : "";

  if (canDedupe) {
    const cached = completedGetCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
    if (cached) completedGetCache.delete(key);

    const existing = inFlightGetRequests.get(key);
    if (existing) return existing;
  } else if (method !== "GET") {
    completedGetCache.clear();
  }

  const request = fetchWithAuthInner(input, init).then((data) => {
    if (canDedupe) {
      completedGetCache.set(key, {
        expiresAt: Date.now() + COMPLETED_GET_CACHE_TTL_MS,
        data,
      });
    }
    return data;
  });
  if (canDedupe) {
    inFlightGetRequests.set(key, request);
    request.finally(() => {
      if (inFlightGetRequests.get(key) === request) {
        inFlightGetRequests.delete(key);
      }
    });
  }

  return request;
}
