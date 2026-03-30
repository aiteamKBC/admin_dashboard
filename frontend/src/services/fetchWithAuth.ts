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

  const res = await fetch(`${API_ORIGIN}/api/token/refresh/`, {
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
  const access = getAccess();

  if (access) headers.set("Authorization", `Bearer ${access}`);

  let res = await fetch(`${API_BASE}${input}`, { ...init, headers });

  if (res.status !== 401) return res;

  const newAccess = await refreshAccessToken();

  const headers2 = new Headers(init.headers || {});
  headers2.set("Authorization", `Bearer ${newAccess}`);

  res = await fetch(`${API_BASE}${input}`, { ...init, headers: headers2 });

  return res;
}