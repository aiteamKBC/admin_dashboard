import React, { useEffect, useMemo, useState } from "react";

import { fetchWithAuth } from "@/services/fetchWithAuth";

type Props = {
  coachId: number;
  viewerRole?: "qa" | "coach";
};

type Task = {
  id?: string;
  text?: string;
  created_at?: string;
  updated_at?: string;
  evidence?: any;
};

type EvidenceItem = {
  taskId: string;
  createdAt: string;
  coachName: string;
  student: string;
  date: string;
  module: string;
  method: string;
  notes: string;
  proofUrl: string;
  reviewed: boolean;
};

async function fetchCoachTasks(coachId: number): Promise<Task[]> {
  const res = await fetchWithAuth(`/tasks-api/coaches/${coachId}/tasks/`, {
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Failed to load tasks (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// PATCH reviewed flag 
async function patchTaskReviewed(coachId: number, taskId: string, reviewed: boolean) {
  const res = await fetchWithAuth(`/tasks-api/coaches/${coachId}/tasks/${taskId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
    evidence: { reviewed },
    }),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `Update failed (${res.status})`);

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

//DELETE task 
async function deleteTask(coachId: number, taskId: string) {
  const res = await fetchWithAuth(`/tasks-api/coaches/${coachId}/tasks/${taskId}/`, {
    method: "DELETE",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `Delete failed (${res.status})`);
  return true;
}

function safeText(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export default function AttendanceTasksPanel({ coachId, viewerRole = "qa" }: Props) {
  // QA-only
  if (viewerRole !== "qa") return null;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");

  // per-item loading states
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!coachId || !Number.isFinite(coachId)) return;

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await fetchCoachTasks(coachId);
        if (!cancelled) setTasks(data);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load evidence");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [coachId]);

  const API_ORIGIN = (import.meta as any)?.env?.VITE_API_ORIGIN || "http://127.0.0.1:8000";

  const toAbsoluteUrl = (u: string) => {
    if (!u) return "";
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    if (u.startsWith("/")) return `${API_ORIGIN}${u}`;
    return `${API_ORIGIN}/${u}`;
  };

  const evidenceItems = useMemo<EvidenceItem[]>(() => {
    const only = tasks
      .filter((t) => t?.evidence && t.evidence?.type === "attendance_followup")
      .map((t) => {
        const ev = t.evidence ?? {};
        return {
          taskId: safeText(t.id),
          createdAt: safeText(ev.created_at || t.created_at),
          coachName: safeText(ev.coach_name),
          student: safeText(ev.student),
          date: safeText(ev.date),
          module: safeText(ev.module),
          method: safeText(ev.method),
          notes: safeText(ev.notes),
          proofUrl: safeText(ev.proof_url),
          reviewed: !!(ev.reviewed ?? ev.reviewed_by_qa ?? false),
        };
      })
      .filter((x) => !!x.taskId);

    const s = q.trim().toLowerCase();
    if (!s) return only;

    return only.filter((x) => {
      return (
        x.student.toLowerCase().includes(s) ||
        x.date.toLowerCase().includes(s) ||
        x.module.toLowerCase().includes(s) ||
        x.method.toLowerCase().includes(s) ||
        x.coachName.toLowerCase().includes(s)
      );
    });
  }, [tasks, q]);

  async function toggleReviewed(taskId: string, next: boolean) {
    if (!taskId) return;
    setErr(null);

    // optimistic UI
    const prev = tasks;
    setTasks((old) =>
      old.map((t) => {
        if (safeText(t.id) !== taskId) return t;
        const ev = { ...(t.evidence ?? {}), reviewed: next };
        return { ...t, evidence: ev };
      })
    );

    try {
      setBusyId(taskId);
      await patchTaskReviewed(coachId, taskId, next);
    } catch (e: any) {
      setTasks(prev); // rollback
      setErr(e?.message || "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  async function removeTask(taskId: string) {
    if (!taskId) return;

    // confirm 
    const ok = window.confirm("Delete this evidence item?");
    if (!ok) return;

    setErr(null);

    // optimistic remove
    const prev = tasks;
    setTasks((old) => old.filter((t) => safeText(t.id) !== taskId));

    try {
      setBusyId(taskId);
      await deleteTask(coachId, taskId);
    } catch (e: any) {
      setTasks(prev); // rollback
      setErr(e?.message || "Failed to delete");
    } finally {
      setBusyId(null);
    }
  }

  return (
      <div className="bg-white rounded-2xl shadow-sm p-4 h-full min-h-0 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[#241453]">Evidence (Attendance)</h3>
          <p className="text-xs text-gray-500 mt-1">Showing attendance follow-up evidence saved into Tasks</p>
        </div>

        <span className="text-xs text-gray-500 shrink-0">{evidenceItems.length}</span>
      </div>

      <div className="mt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search evidence..."
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {loading && <div className="text-sm text-gray-500 mt-3">Loading evidence...</div>}

      {!loading && err && (
        <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {!loading && !err && evidenceItems.length === 0 && (
        <div className="text-sm text-gray-400 mt-3">No evidence found.</div>
      )}

      {!loading && evidenceItems.length > 0 && (
  <div className="mt-3 space-y-2 flex-1 min-h-0 overflow-y-auto custom-scroll pr-1">
          {evidenceItems.map((x) => {
            const isBusy = busyId === x.taskId;

            return (
              <div key={x.taskId} className="border rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      {/*Reviewed checkbox */}
                      <label className="mt-0.5 flex items-center gap-2 text-xs text-gray-600 select-none">
                        <input
                          type="checkbox"
                          checked={x.reviewed}
                          disabled={isBusy}
                          onChange={(e) => toggleReviewed(x.taskId, e.target.checked)}
                        />
                        Reviewed
                      </label>

                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">
                          {x.student || "Unknown student"}{" "}
                          <span className="text-gray-400 font-normal">—</span>{" "}
                          <span className="text-gray-700">{x.date || "No date"}</span>
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                          {x.module ? `Module: ${x.module} • ` : ""}
                          {x.method ? `Method: ${x.method}` : "Method: —"}
                        </div>

                        {!!x.coachName && (
                          <div className="text-xs text-gray-500 mt-1">Coach: {x.coachName}</div>
                        )}

                        {!!x.notes && (
                          <div className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">
                            Notes: {x.notes}
                          </div>
                        )}

                        {!!x.createdAt && (
                          <div className="text-[11px] text-gray-400 mt-2">Created: {x.createdAt}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    {x.proofUrl ? (
                      <a
                        href={toAbsoluteUrl(x.proofUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        View proof
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">No proof</span>
                    )}

                    {/* delete button */}
                    <button
                      type="button"
                      onClick={() => removeTask(x.taskId)}
                      disabled={isBusy}
                      className="w-8 h-8 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-red-600 transition disabled:opacity-60"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {isBusy && <div className="mt-2 text-[11px] text-gray-400">Updating...</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
