import { useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import Login from "./Login";
import styles from "./InclusionTransition.module.css";

const api = (import.meta.env.VITE_API_ORIGIN || "").trim();
const verifierKey = "inclusion_lms_verifier";
type LoginResult = {
  access: string; refresh: string; role: "qa" | "coach";
  username: string; email?: string; coach_id?: string | null;
};

async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`${api}/auth/lms/${path}/`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "LMS sign-in failed.");
  return data;
}

export default function LmsLogin({ callback = false }: { callback?: boolean }) {
  const setUser = useContext(AuthContext)?.setUser;
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<Promise<LoginResult | null | undefined> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!operation.current) {
      operation.current = (async () => {
        if (callback) {
          const assertion = new URLSearchParams(window.location.hash.slice(1)).get("assertion");
          window.history.replaceState(null, "", window.location.pathname);
          const verifier = sessionStorage.getItem(verifierKey);
          sessionStorage.removeItem(verifierKey);
          if (!assertion || !verifier) throw new Error("This sign-in has expired. Please try again.");
          return request<LoginResult>("complete", { assertion, verifier });
        }
        const config = await request<{ enabled: boolean }>("config");
        if (!config.enabled) return null;
        const result = await request<{ verifier: string; url: string }>("start", {});
        sessionStorage.setItem(verifierKey, result.verifier);
        window.location.replace(result.url);
        return undefined;
      })();
    }
    operation.current.then(data => {
      if (cancelled) return;
      if (data === null) { setLegacy(true); return; }
      if (!data) return;
      if (!data.access || !data.refresh || !["qa", "coach"].includes(data.role)) {
        throw new Error("Invalid LMS sign-in response.");
      }
      for (const [key, value] of Object.entries({
        access: data.access, token: data.access, refresh: data.refresh, refresh_token: data.refresh,
        role: data.role, username: data.username, email: data.email || "", coach_id: data.coach_id || "",
      })) localStorage.setItem(key, String(value));
      setUser?.({ username: data.username, role: data.role, email: data.email, coach_id: data.coach_id });
      window.location.replace("/");
    }).catch(error => { if (!cancelled) setError(error.message || "LMS sign-in failed."); });
    return () => { cancelled = true; };
  }, [callback, setUser]);

  if (legacy) return <Login />;
  return <div className={styles.screen}>
    <div className={styles.content}>
      <div className={styles.emblem} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg>
      </div>
      <h1>Inclusion &amp; Safeguarding</h1>
      {error ? <><p role="alert" className={styles.error}>{error}</p>
        <a href="/login" className={styles.retry}>Try LMS sign-in again</a></>
        : <div role="status" aria-live="polite" aria-label="Opening Inclusion & Safeguarding">
          <p>A moment for your wellbeing.</p>
          <div className={styles.dots} aria-hidden="true"><span/><span/><span/></div>
        </div>}
    </div>
  </div>;
}
