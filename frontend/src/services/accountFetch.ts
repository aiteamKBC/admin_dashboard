import { isAccessTokenExpiringSoon, silentRefresh } from "./fetchWithAuth";

const API_ORIGIN =
  ((import.meta as any).env?.VITE_API_ORIGIN)?.toString().trim() || "";

function getAccessToken() {
  return localStorage.getItem("access") || localStorage.getItem("token") || "";
}

function hasRefreshToken() {
  return Boolean(localStorage.getItem("refresh") || localStorage.getItem("refresh_token"));
}

function buildHeaders(init: RequestInit) {
  const headers = new Headers(init.headers || {});
  const token = getAccessToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

export async function accountFetch(input: string, init: RequestInit = {}) {
  if (isAccessTokenExpiringSoon(30_000) && hasRefreshToken()) {
    await silentRefresh();
  }

  let response = await fetch(`${API_ORIGIN}${input}`, {
    ...init,
    headers: buildHeaders(init),
  });

  if (response.status !== 401 || !hasRefreshToken()) {
    return response;
  }

  const refreshed = await silentRefresh();
  if (!refreshed) return response;

  response = await fetch(`${API_ORIGIN}${input}`, {
    ...init,
    headers: buildHeaders(init),
  });

  return response;
}
