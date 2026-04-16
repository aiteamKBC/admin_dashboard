const API_ORIGIN =
  ((import.meta as any).env?.VITE_API_ORIGIN)?.toString().trim() || "";

const API_BASE = `${API_ORIGIN}/tasks-api`;

function getAccess() {
  return localStorage.getItem("access") || localStorage.getItem("token") || "";
}

function getRefresh() {
  return localStorage.getItem("refresh") || localStorage.getItem("refresh_token") || "";
}

async function refreshAccessToken() {
  const refresh = getRefresh();
  if (!refresh) throw new Error("Missing refresh token");

  const res = await fetch(`/api/token/refresh/`, {
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

  if (data.refresh) {
    localStorage.setItem("refresh", data.refresh);
    localStorage.setItem("refresh_token", data.refresh);
  }

  return data.access as string;
}

export async function fetchWithAuth(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});

  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const access = getAccess();

  if (access) {
    headers.set("Authorization", `Bearer ${access}`);
  }

  let res = await fetch(`${API_BASE}${input}`, { ...init, headers });

  if (res.status !== 401) {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  const refresh = getRefresh();
  if (!refresh) {
    throw new Error("Unauthorized: missing refresh token");
  }

  const newAccess = await refreshAccessToken();

  const headers2 = new Headers(init.headers || {});
  if (!headers2.has("Content-Type") && !(init.body instanceof FormData)) {
    headers2.set("Content-Type", "application/json");
  }
  headers2.set("Authorization", `Bearer ${newAccess}`);

  res = await fetch(`${API_BASE}${input}`, { ...init, headers: headers2 });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed: ${res.status} ${text}`);
  }

  return res.json();
}