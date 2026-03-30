import { useEffect, useMemo, useState } from "react";

type Evidence = {
  type?: string;
  proof_url?: string; // may be "/media/..." OR "http(s)://..."
  proof_meta?: {
    name?: string;
    mime?: string;
    size?: number;
  };
  [k: string]: any;
};

type ApiTask = {
  id: string;
  coach_id?: number;
  text: string;
  done: boolean;
  created_at?: string;
  updated_at?: string;
  evidence?: Evidence;
};

type ViewerRole = "coach" | "qa" | "admin";

type TodoListProps = {
  coachId: number;
  viewerRole?: ViewerRole;
};

const API_ORIGIN =
  (import.meta as any).env?.VITE_API_ORIGIN?.toString().trim() ||
  "";

async function refreshAccessToken(): Promise<string> {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) throw new Error("Session expired, please login again");

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
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    throw new Error(data?.detail || "Session expired, please login again");
  }

  localStorage.setItem("token", data.access);
  return data.access;
}

/** JSON fetch wrapper with auth + auto refresh */
async function http<T>(url: string, opts?: RequestInit): Promise<T> {
  const fullUrl = /^https?:\/\//i.test(url) ? url : `${API_ORIGIN}${url}`;

  const doFetch = async (token?: string) => {
    const res = await fetch(fullUrl, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers as Record<string, string> | undefined),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return { res, text, json };
  };

  // 1) try with current access
  let access = localStorage.getItem("token") || "";
  let { res, text, json } = await doFetch(access);

  // 2) if token expired, refresh and retry once
  if (res.status === 401) {
    access = await refreshAccessToken();
    ({ res, text, json } = await doFetch(access));
  }

  if (!res.ok) {
    throw new Error(json?.detail || json?.message || text || `Request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;

  // json already parsed if possible
  if (json != null) return json as T;

  try {
    return (text ? JSON.parse(text) : undefined) as T;
  } catch {
    return text as unknown as T;
  }
}

/**  Attendance task even if no proof */
function isAttendanceTask(t: ApiTask) {
  const ev = t?.evidence;
  const isAttendanceType = String(ev?.type || "") === "attendance_followup";
  const textLooksAttendance = String(t?.text || "")
    .toLowerCase()
    .includes("attendance follow-up");
  return isAttendanceType || textLooksAttendance;
}

/** ✅ Django origin (local) or production origin */

function toAbsoluteUrlMaybe(url: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url; // already absolute

  const path = url.startsWith("/") ? url : `/${url}`;
  return `${API_ORIGIN}${path}`;
}

export default function TodoList({ coachId, viewerRole = "coach" }: TodoListProps) {
  const [todos, setTodos] = useState<ApiTask[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  //  if not QA/Admin hide Attendance tasks
  const shouldHideAttendance = viewerRole !== "qa" && viewerRole !== "admin";

  //  Add trailing slashes (important for Django/DRF)
  const LIST_URL = `/tasks-api/coaches/${coachId}/tasks/`;
  const DETAIL_URL = (taskId: string) => `/tasks-api/coaches/${coachId}/tasks/${taskId}/`;
  
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const data = await http<ApiTask[]>(LIST_URL);
        const arr = Array.isArray(data) ? data : [];

        const filtered = shouldHideAttendance
          ? arr.filter((t) => !isAttendanceTask(t))
          : arr;

        if (!cancelled) setTodos(filtered);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load tasks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (coachId) load();

    return () => {
      cancelled = true;
    };
  }, [coachId, shouldHideAttendance, LIST_URL]);

  // ✅ pendingCount for visible tasks only (after filtering)
  const pendingCount = useMemo(() => todos.filter((t) => !t.done).length, [todos]);

  const addTask = async () => {
    const text = title.trim();
    if (!text) return;

    setSaving(true);
    setErr(null);

    try {
      const created = await http<ApiTask>(LIST_URL, {
        method: "POST",
        body: JSON.stringify({ text }),
      });

      // ✅ if role coach and created task looks attendance for any reason → hide it
      if (!shouldHideAttendance || !isAttendanceTask(created)) {
        setTodos((prev) => [created, ...prev]);
      }

      setTitle("");
    } catch (e: any) {
      setErr(e?.message || "Failed to add task");
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (task: ApiTask) => {
    const nextDone = !task.done;

    // optimistic
    setTodos((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done: nextDone } : t))
    );

    try {
      await http<ApiTask>(DETAIL_URL(task.id), {
        method: "PATCH",
        body: JSON.stringify({ done: nextDone }),
      });
    } catch (e: any) {
      // rollback
      setTodos((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t))
      );
      setErr(e?.message || "Failed to update task");
    }
  };

  const deleteTask = async (taskId: string) => {
    const snapshot = todos;
    setTodos((prev) => prev.filter((t) => t.id !== taskId));

    try {
      await http<void>(DETAIL_URL(taskId), { method: "DELETE" });
    } catch (e: any) {
      setTodos(snapshot);
      setErr(e?.message || "Failed to delete task");
    }
  };

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addTask();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-[#442F73]">Today's Tasks</h3>
        <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">
          Pending {pendingCount}
        </span>
      </div>

      {err && (
        <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      <div className="flex-1 min-h-0 max-h-[200px] overflow-y-auto custom-scroll">
        {loading ? (
          <div className="text-sm text-gray-500">Loading tasks...</div>
        ) : todos.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-sm text-gray-400">No tasks yet.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {todos.map((todo) => {
              const proofRaw = todo.evidence?.proof_url || "";
              const proofUrl = proofRaw ? toAbsoluteUrlMaybe(proofRaw) : "";
              const canViewProof = !!proofUrl;

              return (
                <div
                  key={todo.id}
                  className={`p-3 rounded-lg flex items-center justify-between gap-3 ${todo.done ? "bg-gray-100" : "bg-[#F9F5FF]"
                    }`}
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={todo.done}
                      onChange={() => toggleTask(todo)}
                    />

                    <div className="min-w-0">
                      <div
                        className={`text-sm truncate ${todo.done ? "line-through text-gray-500" : "text-gray-800"
                          }`}
                        title={todo.text}
                      >
                        {todo.text}
                      </div>

                      {canViewProof && (
                        <a
                          href={proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex mt-1 text-xs text-[#B27715] hover:underline"
                          title="Open proof image"
                          onClick={(e) => {
                            if (!proofUrl) {
                              e.preventDefault();
                              setErr("Proof URL is missing / invalid");
                            }
                          }}
                        >
                          View proof
                          {todo.evidence?.proof_meta?.name
                            ? ` — ${todo.evidence.proof_meta.name}`
                            : ""}
                        </a>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => deleteTask(todo.id)}
                    className="text-xs text-gray-500 hover:text-red-600 transition shrink-0"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>


      <div className="mt-3 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onEnter}
          placeholder="New task..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
          disabled={saving}
        />
        <button
          onClick={addTask}
          disabled={saving}
          className="px-4 rounded-lg bg-gradient-to-r from-[#cea769] to-[#b27715] text-white text-sm disabled:opacity-60"
        >
          {saving ? "Saving..." : "Add"}
        </button>
      </div>
    </div>
  );
}
