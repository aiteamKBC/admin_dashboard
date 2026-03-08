const API_ORIGIN =
  (import.meta as any).env?.VITE_API_ORIGIN?.toString().trim() ||
  "http://127.0.0.1:8000";

function getAccess() {
  return localStorage.getItem("access") || localStorage.getItem("token") || "";
}
function getRefresh() {
  return localStorage.getItem("refresh") || localStorage.getItem("refresh_token") || "";
}

async function refreshAccessToken() {
  const refresh = getRefresh();
  if (!refresh) throw new Error("Missing refresh token");

  const res = await fetch(`${API_ORIGIN}/tasks-api/api/token/refresh/`, {
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
  localStorage.setItem("token", data.access); // compat

  if (data.refresh) {
    localStorage.setItem("refresh", data.refresh);
    localStorage.setItem("refresh_token", data.refresh); // compat
  }

  return data.access as string;
}

export async function fetchWithAuth(input: RequestInfo, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const access = getAccess();
  if (access) headers.set("Authorization", `Bearer ${access}`);

  let res = await fetch(input, { ...init, headers });

  if (res.status !== 401) return res;

  // لو 401, جرّبي refresh مرة واحدة
  const newAccess = await refreshAccessToken();

  const headers2 = new Headers(init.headers || {});
  headers2.set("Authorization", `Bearer ${newAccess}`);

  res = await fetch(input, { ...init, headers: headers2 });
  return res;
}