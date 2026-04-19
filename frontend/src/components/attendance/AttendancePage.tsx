import { useEffect, useMemo, useState } from "react";

import TopHeader from "../header/TopHeader";
import CoachesList from "../coaches/CoachesList";
import AttendanceTasksPanel from "./AttendanceTasksPanel";
import MonthlySessionsWithLearners from "./MonthlySessionsWithLearners";

import { fetchAllCoachesAnalytics, type CoachAnalytics } from "../../api";

/* ================= TYPES ================= */

type AttendanceCell = {
  value?: number | string | null;
  module?: string | null;
  [k: string]: unknown;
};

type AttendanceRow = {
  id: string;
  fullName: string;
  email: string;
  dates: Record<string, AttendanceCell[]>;
};

type EvidenceMethod = "Call" | "WhatsApp" | "Email" | "Other";

type EvidenceTarget =
  | {
      student: string;
      module?: string | null;
      kind: "absent" | "unknown";
    }
  | null;

/* ================= HELPERS ================= */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const pickISODateKeys = (obj: Record<string, unknown>) =>
  Object.keys(obj).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));

const parseMaybeJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

function normalizeAttendanceCells(rawCell: unknown): AttendanceCell[] {
  const parsed = parseMaybeJson(rawCell);

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        const x = parseMaybeJson(item);

        if (isObj(x)) {
          return {
            ...x,
            module:
              x.module == null || String(x.module).trim() === ""
                ? null
                : String(x.module).trim(),
          } as AttendanceCell;
        }

        if (x == null || x === "") return null;

        return { value: x as any, module: null } as AttendanceCell;
      })
      .filter((x): x is AttendanceCell => !!x);
  }

  if (isObj(parsed)) {
    return [
      {
        ...parsed,
        module:
          parsed.module == null || String(parsed.module).trim() === ""
            ? null
            : String(parsed.module).trim(),
      } as AttendanceCell,
    ];
  }

  if (parsed == null || parsed === "") return [];

  return [{ value: parsed as any, module: null }];
}

function getCellsForDate(
  row: AttendanceRow,
  date: string,
  selectedModule: string
): AttendanceCell[] {
  const cells = row.dates?.[date] ?? [];

  if (selectedModule === "all") return cells;

  return cells.filter(
    (c) => String(c?.module || "").trim() === String(selectedModule).trim()
  );
}

function getAggregatedValue(cells: AttendanceCell[]): 0 | 1 | null {
  const values = cells
    .map((c) => num01(c?.value))
    .filter((v): v is 0 | 1 => v !== null);

  if (values.includes(1)) return 1;
  if (values.includes(0)) return 0;
  return null;
}

function getDisplayModule(cells: AttendanceCell[]): string {
  const modules: string[] = Array.from(
    new Set(
      cells
        .map((c) => String(c?.module || "").trim())
        .filter((m): m is string => m.length > 0)
    )
  );

  if (modules.length === 0) return "";
  if (modules.length === 1) return modules[0] ?? "";
  return "Multiple modules";
}

function toAttendanceRows(raw: unknown): AttendanceRow[] {
  raw = parseMaybeJson(raw);

  if (!raw) return [];

  if (isObj(raw) && Array.isArray((raw as any).learners)) {
    const learners = (raw as any).learners as any[];

    return learners.map((l) => {
      const id = String(l.id ?? l.ID ?? l.learner_id ?? "").trim();
      const fullName = String(l.FullName ?? l.fullName ?? l.name ?? "").trim();
      const email = String(l.Email ?? l.email ?? "").trim();

      const att = parseMaybeJson(l.Attendance ?? l.attendance ?? {});
      const dates: Record<string, AttendanceCell[]> = {};

      if (isObj(att)) {
        for (const d of pickISODateKeys(att)) {
          dates[d] = normalizeAttendanceCells((att as any)[d]);
        }
      }

      return {
        id: id || email || fullName || "unknown",
        fullName: fullName || "Unknown",
        email,
        dates,
      };
    });
  }

  if (isObj(raw)) {
    const out: AttendanceRow[] = [];

    for (const [studentName, datesRaw] of Object.entries(raw)) {
      if (!isObj(datesRaw)) continue;

      const dateKeys = pickISODateKeys(datesRaw);
      if (!dateKeys.length) continue;

      const dates: Record<string, AttendanceCell[]> = {};

      for (const d of dateKeys) {
        dates[d] = normalizeAttendanceCells((datesRaw as any)[d]);
      }

      out.push({
        id: studentName,
        fullName: studentName,
        email: "",
        dates,
      });
    }

    return out;
  }

  return [];
}

function num01(v: unknown): 0 | 1 | null {
  if (v === 0 || v === "0") return 0;
  if (v === 1 || v === "1") return 1;
  return null;
}

function authHeaders(extra?: Record<string, string>) {
  const token = localStorage.getItem("token");
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function postTask(coachId: number, payload: { text: string; evidence?: any }) {
  const res = await fetch(`/tasks-api/coaches/${coachId}/tasks/`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function uploadEvidenceImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/tasks-api/evidence/upload/", {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `Upload failed (${res.status})`);

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const proofUrl = data?.absolute_url || data?.url || "";
  if (!proofUrl) {
    throw new Error("Upload succeeded but no file URL was returned");
  }

  return proofUrl;
}

/* ================= CUSTOM SELECT ================= */

type CustomSelectOption<T extends string> = { value: T; label: string };

function CustomSelect<T extends string>(props: {
  value: T;
  label: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  options: Array<CustomSelectOption<T>>;
  onChange: (val: T) => void;
  disabled?: boolean;
}) {
  const { value, label, open, setOpen, options, onChange, disabled } = props;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="
          w-full h-10 px-3
          bg-white rounded-xl
          border border-gray-200
          flex items-center justify-between gap-2
          text-sm text-[#241453]
          hover:bg-[#F9F5FF]
          transition
          disabled:opacity-60 disabled:cursor-not-allowed
        "
      >
        <span className="truncate">{label}</span>
        <span className="text-gray-400">▾</span>
      </button>

      {open && !disabled && (
        <div
          className="
            absolute left-0 right-0 mt-2
            bg-white rounded-xl shadow-lg
            border border-gray-200
            overflow-hidden
            z-50
          "
        >
          <div className="max-h-64 overflow-y-auto custom-scroll">
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={[
                    "w-full text-left px-3 py-2 text-sm transition",
                    "hover:bg-[#F9F5FF]",
                    active ? "bg-[#fff9f0] text-[#B27715]" : "text-[#241453]",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= COMPONENT ================= */

export default function AttendancePage({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const [coaches, setCoaches] = useState<CoachAnalytics[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);

  const [selectedModule, setSelectedModule] = useState<string>("all");
  const [date, setDate] = useState<string>("");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // evidence panel state
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget>(null);
  const [method, setMethod] = useState<EvidenceMethod | "">("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const canSaveEvidence = method !== "" && !!proofFile && !saving;

  const resetEvidenceForm = () => {
    setNotes("");
    setMethod("");
    setProofFile(null);
  };

  // Role
  const viewerRole = (localStorage.getItem("role") as "qa" | "coach" | null) || "coach";
  const isQA = viewerRole === "qa";

  const selfCoachId = Number(localStorage.getItem("coach_id") || "");
  const canSwitchCoach = isQA;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchAllCoachesAnalytics();
        const arr = Array.isArray(data) ? data : [];

        const normalized = arr
          .map((c: any) => {
            const rawId = c.id ?? c.case_owner_id ?? c.caseOwnerId ?? c.coach_id ?? c.coachId;
            const id = Number(rawId);
            return { ...c, id };
          })
          .filter((c: any) => Number.isFinite(c.id));

        setCoaches(normalized);

        if (isQA) {
          setSelectedCoachId(normalized[0]?.id ?? null);
        } else {
          const mine = normalized.find((c: any) => Number(c.id) === Number(selfCoachId));
          setSelectedCoachId(mine?.id ?? (Number.isFinite(selfCoachId) ? selfCoachId : null));
        }
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Failed to load coaches");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isQA, selfCoachId]);

  const selectedCoach = useMemo(() => {
    if (!coaches.length) return null;
    return coaches.find((c) => c.id === selectedCoachId) ?? coaches[0];
  }, [coaches, selectedCoachId]);

  const coachName = useMemo(() => {
    return String((selectedCoach as any)?.case_owner ?? (isQA ? "QA" : "Coach"));
  }, [selectedCoach, isQA]);

  const attendanceRows = useMemo(() => {
    const raw = (selectedCoach as any)?.attendance;
    return toAttendanceRows(raw);
  }, [selectedCoach]);

  const modules = useMemo(() => {
    const set = new Set<string>();

    for (const r of attendanceRows) {
      for (const cells of Object.values(r.dates)) {
        for (const cell of cells) {
          const m = String(cell?.module || "").trim();
          if (m) set.add(m);
        }
      }
    }

    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [attendanceRows]);

  const availableDates = useMemo(() => {
    const all = new Set<string>();

    for (const r of attendanceRows) {
      for (const [d, cells] of Object.entries(r.dates)) {
        if (selectedModule === "all") {
          all.add(d);
        } else if (
          cells.some((c) => String(c?.module || "").trim() === selectedModule)
        ) {
          all.add(d);
        }
      }
    }

    return Array.from(all).sort();
  }, [attendanceRows, selectedModule]);

  const moduleName = useMemo(() => {
    if (selectedModule !== "all") return selectedModule;
    if (!date) return "";

    const modulesForDate = Array.from(
      new Set(
        attendanceRows.flatMap((r) =>
          (r.dates?.[date] ?? [])
            .map((c) => String(c?.module || "").trim())
            .filter(Boolean)
        )
      )
    );

    if (!modulesForDate.length) return "";
    if (modulesForDate.length === 1) return modulesForDate[0];
    return "Multiple modules";
  }, [attendanceRows, date, selectedModule]);

  const summary = useMemo(() => {
    if (!date) return { present: 0, absent: 0, unknown: 0 };

    let present = 0;
    let absent = 0;
    let unknown = 0;

    for (const r of attendanceRows) {
      const belongs =
        selectedModule === "all"
          ? true
          : Object.values(r.dates).some((cells) =>
              cells.some((c) => String(c?.module || "").trim() === selectedModule)
            );

      if (!belongs) continue;

      const cells = getCellsForDate(r, date, selectedModule);
      const v = getAggregatedValue(cells);

      if (v === 1) present++;
      else if (v === 0) absent++;
      else unknown++;
    }

    return { present, absent, unknown };
  }, [attendanceRows, date, selectedModule]);

  const absenceStats = useMemo(() => {
    const byModule: Record<string, { present: number; absent: number; unknown: number }> = {};
    const bySession: Record<
      string,
      { date: string; module: string; present: number; absent: number; unknown: number }
    > = {};
    const byDate: Record<string, { date: string; present: number; absent: number; unknown: number }> = {};

    let present = 0;
    let absent = 0;
    let unknown = 0;

    const rate = (a: number, p: number) => {
      const denom = a + p;
      if (!denom) return 0;
      return Math.round((a / denom) * 1000) / 10;
    };

    for (const r of attendanceRows) {
      for (const [d, cells] of Object.entries(r.dates)) {
        for (const cell of cells) {
          const m = String(cell?.module || "").trim() || "Unknown module";
          const v = num01(cell?.value);

          if (v === 1) present++;
          else if (v === 0) absent++;
          else unknown++;

          if (!byModule[m]) byModule[m] = { present: 0, absent: 0, unknown: 0 };
          if (v === 1) byModule[m].present++;
          else if (v === 0) byModule[m].absent++;
          else byModule[m].unknown++;

          if (!byDate[d]) byDate[d] = { date: d, present: 0, absent: 0, unknown: 0 };
          if (v === 1) byDate[d].present++;
          else if (v === 0) byDate[d].absent++;
          else byDate[d].unknown++;

          const key = `${d}|||${m}`;
          if (!bySession[key]) {
            bySession[key] = { date: d, module: m, present: 0, absent: 0, unknown: 0 };
          }

          if (v === 1) bySession[key].present++;
          else if (v === 0) bySession[key].absent++;
          else bySession[key].unknown++;
        }
      }
    }

    const overall = {
      present,
      absent,
      unknown,
      tracked: present + absent,
      rate: rate(absent, present),
    };

    const modulesArr = Object.entries(byModule)
      .map(([module, s]) => ({
        module,
        ...s,
        tracked: s.present + s.absent,
        rate: rate(s.absent, s.present),
      }))
      .sort((a, b) => b.rate - a.rate);

    const sessionsArr = Object.values(bySession)
      .map((s) => ({
        ...s,
        tracked: s.present + s.absent,
        rate: rate(s.absent, s.present),
      }))
      .sort((a, b) =>
        a.date === b.date ? a.module.localeCompare(b.module) : a.date.localeCompare(b.date)
      );

    const datesArr = Object.values(byDate)
      .map((s) => ({
        ...s,
        tracked: s.present + s.absent,
        rate: rate(s.absent, s.present),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let selectedSession: null | {
      label: string;
      present: number;
      absent: number;
      unknown: number;
      tracked: number;
      rate: number;
    } = null;

    if (date) {
      if (selectedModule === "all") {
        const x = byDate[date];
        if (x) {
          selectedSession = {
            label: `${date} , All modules`,
            present: x.present,
            absent: x.absent,
            unknown: x.unknown,
            tracked: x.present + x.absent,
            rate: rate(x.absent, x.present),
          };
        }
      } else {
        const key = `${date}|||${selectedModule}`;
        const x = bySession[key];
        if (x) {
          selectedSession = {
            label: `${date} , ${selectedModule}`,
            present: x.present,
            absent: x.absent,
            unknown: x.unknown,
            tracked: x.present + x.absent,
            rate: rate(x.absent, x.present),
          };
        }
      }
    }

    return { overall, modulesArr, sessionsArr, datesArr, selectedSession };
  }, [attendanceRows, date, selectedModule]);

  const absentRows = useMemo(() => {
    if (!date) {
      return [] as Array<{ id: string; fullName: string; email: string; module?: string | null }>;
    }

    const rows: Array<{ id: string; fullName: string; email: string; module?: string | null }> = [];

    for (const r of attendanceRows) {
      const belongs =
        selectedModule === "all"
          ? true
          : Object.values(r.dates).some((cells) =>
              cells.some((c) => String(c?.module || "").trim() === selectedModule)
            );

      if (!belongs) continue;

      const cells = getCellsForDate(r, date, selectedModule);
      const v = getAggregatedValue(cells);

      if (v === 0) {
        rows.push({
          id: r.id,
          fullName: r.fullName,
          email: r.email,
          module:
            selectedModule === "all"
              ? getDisplayModule(cells) || null
              : selectedModule,
        });
      }
    }

    const s = q.trim().toLowerCase();

    return rows
      .filter((r) =>
        s ? r.fullName.toLowerCase().includes(s) || r.email.toLowerCase().includes(s) : true
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [attendanceRows, date, q, selectedModule]);

  const unknownRows = useMemo(() => {
    if (!date) {
      return [] as Array<{ id: string; fullName: string; email: string; module?: string | null }>;
    }

    const rows: Array<{ id: string; fullName: string; email: string; module?: string | null }> = [];

    for (const r of attendanceRows) {
      const belongs =
        selectedModule === "all"
          ? true
          : Object.values(r.dates).some((cells) =>
              cells.some((c) => String(c?.module || "").trim() === selectedModule)
            );

      if (!belongs) continue;

      const cells = getCellsForDate(r, date, selectedModule);
      const v = getAggregatedValue(cells);

      if (v === null) {
        rows.push({
          id: r.id,
          fullName: r.fullName,
          email: r.email,
          module:
            selectedModule === "all"
              ? getDisplayModule(cells) || null
              : selectedModule,
        });
      }
    }

    const s = q.trim().toLowerCase();

    return rows
      .filter((r) =>
        s ? r.fullName.toLowerCase().includes(s) || r.email.toLowerCase().includes(s) : true
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [attendanceRows, date, q, selectedModule]);

  // dropdown open states
  const [moduleOpen, setModuleOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const moduleOptions = useMemo(
    () =>
      modules.map((m) => ({
        value: m,
        label: m === "all" ? "All modules" : m,
      })),
    [modules]
  );

  const moduleLabel = useMemo(() => {
    return moduleOptions.find((o) => o.value === selectedModule)?.label ?? "All modules";
  }, [moduleOptions, selectedModule]);

  const dateOptions = useMemo(
    () =>
      (availableDates?.slice().reverse() ?? []).map((d) => ({
        value: d,
        label: d,
      })),
    [availableDates]
  );

  const dateLabel = useMemo(() => {
    if (!date) return "Select date";
    return dateOptions.find((o) => o.value === date)?.label ?? "Select date";
  }, [dateOptions, date]);

  const methodOptions = useMemo(
    () => [
      { value: "Call", label: "Call" },
      { value: "WhatsApp", label: "WhatsApp" },
      { value: "Email", label: "Email" },
      { value: "Other", label: "Other" },
    ],
    []
  );

  const methodLabel = method ? method : "Select method...";
  const [methodOpen, setMethodOpen] = useState(false);

  useEffect(() => {
    setSelectedModule("all");
    setDate("");
    setQ("");
    setEvidenceTarget(null);
    setSavedMsg(null);
    resetEvidenceForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCoachId]);

  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(null), 3000);
    return () => clearTimeout(t);
  }, [savedMsg]);

  const handleSaveEvidence = async (student: string, rowModule?: string | null) => {
    if (!selectedCoach || !date) return;

    if (!method) return alert("Please select method");
    if (!proofFile) return alert("Please upload a proof image");

    setSaving(true);
    setSavedMsg(null);

    try {
      const proofUrl = await uploadEvidenceImage(proofFile);

      const coachNameForTask = (selectedCoach as any).case_owner;
      const moduleForTask = String(rowModule ?? moduleName ?? "");

      const text = [
        "Attendance follow-up",
        `Coach: ${coachNameForTask}`,
        `Student: ${student}`,
        `Date: ${date}`,
        moduleForTask ? `Module: ${moduleForTask}` : null,
        `Action: ${method}`,
        notes.trim() ? `Notes: ${notes.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const evidence = {
        type: "attendance_followup",
        coach_id: selectedCoach.id,
        coach_name: coachNameForTask,
        student,
        date,
        module: moduleForTask || null,
        method,
        notes: notes.trim() || null,
        proof_url: proofUrl,
        proof_meta: {
          name: proofFile.name,
          mime: proofFile.type,
          size: proofFile.size,
        },
        created_at: new Date().toISOString(),
      };

      await postTask(selectedCoach.id, { text, evidence });

      setSavedMsg("Saved Successfully ✅");
      setEvidenceTarget(null);
      resetEvidenceForm();
    } catch (e: any) {
      alert(e?.message || "Failed to save evidence");
    } finally {
      setSaving(false);
    }
  };

  // Monthly sessions props
  const studentsList = useMemo(() => {
    const raw = (selectedCoach as any)?.students;
    return Array.isArray(raw)
      ? raw.map((s: any) => {
          const ap =
            s.accounts_profile ??
            s.accountsProfile ??
            s.AccountsProfile ??
            s.profile ??
            s.Profile ??
            null;

          return {
            ...s,
            id: String(s.ID ?? s.id ?? ""),
            fullName: String(s.FullName ?? s.fullName ?? "Unknown"),
            email: String(s.Email ?? s.email ?? ""),
            upcomming_sessions:
              s.upcomming_sessions ??
              s.upcoming_sessions ??
              s.upcomingSessions ??
              ap?.upcomming_sessions ??
              ap?.upcoming_sessions ??
              ap ??
              null,
          };
        })
      : [];
  }, [selectedCoach]);

  const meetingSubject = useMemo(() => {
    return ((selectedCoach as any)?.meeting_subject ?? null) as any;
  }, [selectedCoach]);

  if (loading) return <div className="text-sm text-[#241453]">Loading attendance...</div>;

  return (
    <div id="report-area" className="min-h-[calc(100vh-110px)] flex flex-col gap-4">
      <TopHeader
        coaches={coaches}
        activeCoachId={selectedCoachId ?? "all"}
        canSwitchCoach={canSwitchCoach}
        activePeriod={"7"}
        onApplyFilters={(f) => {
          const id = f.coach === "all" ? null : Number(f.coach);
          setSelectedCoachId(Number.isFinite(id as any) ? (id as any) : null);
        }}
        onOpenSidebar={onOpenSidebar}
        userName={isQA ? "QA" : coachName}
        rightContent={
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-[140px] bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
              <div className="text-[10px] text-gray-500 truncate">Session absence rate</div>
              <div className="text-sm font-semibold text-[#241453] leading-4">
                {absenceStats.selectedSession ? `${absenceStats.selectedSession.rate}%` : "—"}
              </div>
              <div className="text-[10px] text-gray-400 truncate">
                {absenceStats.selectedSession?.label ?? "Pick a date"}
              </div>
            </div>

            <div className="min-w-[140px] bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
              <div className="text-[10px] text-gray-500 truncate">Coach overall absence rate</div>
              <div className="text-sm font-semibold text-[#241453] leading-4">
                {absenceStats.overall.rate}%
              </div>
              <div className="text-[10px] text-gray-400 truncate">
                Tracked: {absenceStats.overall.tracked}
              </div>
            </div>
          </div>
        }
      />

      {savedMsg && (
        <div className="fixed right-6 top-24 z-50">
          <div className="flex items-center gap-3 bg-green-50 border border-green-100 text-green-700 px-4 py-2 rounded-lg shadow">
            <div className="text-sm">{savedMsg}</div>
            <button
              type="button"
              onClick={() => setSavedMsg(null)}
              className="text-green-700 opacity-80 hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ================= Fixed-height top section (only) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 xl:grid-cols-12 gap-4 items-stretch min-h-0 lg:h-[620px]">
        {/* Coaches list (QA only) */}
        {isQA && (
          <div className="lg:col-span-3 xl:col-span-2 order-1 bg-white rounded-2xl shadow-sm p-3 flex flex-col min-h-0 overflow-hidden h-full">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-base font-semibold text-[#241453]">Coaches</h3>
              <span className="text-xs text-[#442F73]">{coaches.length}</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-1">
              <div className="min-h-0">
                <CoachesList
                  coaches={coaches}
                  activeCoachId={selectedCoachId}
                  onSelect={(c) => setSelectedCoachId(c.id)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Attendance column */}
        <div
          className={[
            isQA ? "lg:col-span-7 xl:col-span-7 order-2" : "lg:col-span-12 xl:col-span-12",
            "flex flex-col min-h-0 h-full overflow-hidden",
          ].join(" ")}
        >
          {/* Header card */}
          <div className="bg-white rounded-2xl shadow-sm p-4 shrink-0 relative">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#241453] truncate whitespace-nowrap">
                  Attendance{selectedCoach ? ` , ${(selectedCoach as any).case_owner}` : ""}
                </h2>
              </div>

              <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 min-w-0">
                {/* Module */}
                <div className="lg:col-span-6 min-w-0">
                  <CustomSelect
                    value={selectedModule}
                    label={moduleLabel}
                    open={moduleOpen}
                    setOpen={(v) => {
                      setModuleOpen(v);
                      if (v) setDateOpen(false);
                    }}
                    options={moduleOptions}
                    disabled={modules.length <= 1}
                    onChange={(val: string) => {
                      setSelectedModule(val);
                      setSavedMsg(null);
                      setEvidenceTarget(null);
                      resetEvidenceForm();
                    }}
                  />
                </div>

                {/* Date */}
                <div className="lg:col-span-3 min-w-0">
                  <CustomSelect
                    value={date}
                    label={dateLabel}
                    open={dateOpen}
                    setOpen={(v) => {
                      setDateOpen(v);
                      if (v) setModuleOpen(false);
                    }}
                    options={dateOptions}
                    disabled={!availableDates.length}
                    onChange={(val: string) => {
                      setDate(val);
                      setSavedMsg(null);
                      setEvidenceTarget(null);
                      resetEvidenceForm();
                    }}
                  />
                </div>

                {/* Search */}
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search student..."
                  className="w-full lg:col-span-3 min-w-0 border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {error && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {!!moduleName && (
              <div className="mt-3 text-xs text-[#442F73] bg-[#F9F5FF] border border-[#E9E2F7] rounded-lg px-3 py-2">
                <span className="font-medium">Module:</span> {moduleName}
              </div>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-gray-50 border px-3 py-2">
                <div className="text-xs text-gray-500">Present</div>
                <div className="text-lg font-semibold text-gray-800">{summary.present}</div>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                <div className="text-xs text-red-700">Absent</div>
                <div className="text-lg font-semibold text-red-700">{summary.absent}</div>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                <div className="text-xs text-amber-700">
                  Unknown (Counted when there is no attendance record for the selected date)
                </div>
                <div className="text-lg font-semibold text-amber-700">{summary.unknown}</div>
              </div>
            </div>
          </div>

          {/* 3 Panels row (fills remaining height) */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch flex-1 min-h-0">
            {/* Absent */}
            <div className="lg:col-span-4 bg-white rounded-2xl shadow-sm p-4 flex flex-col min-h-0 h-full">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#F1ECFF] shrink-0">
                <h3 className="text-sm font-semibold text-[#241453]">Absent students</h3>
                <span className="text-xs text-[#442F73] bg-[#F9F5FF] border border-[#E9E2F7] px-2 py-0.5 rounded-full">
                  {absentRows.length}
                </span>
              </div>

              {!date ? (
                <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
                  Pick a date.
                </div>
              ) : absentRows.length === 0 ? (
                <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
                  No absences.
                </div>
              ) : (
                <div className="mt-3 space-y-2 flex-1 min-h-0 overflow-y-auto custom-scroll pr-1">
                  {absentRows.map((r) => {
                    const active =
                      evidenceTarget?.student === r.fullName && evidenceTarget?.kind === "absent";

                    return (
                      <div
                        key={r.id}
                        className={[
                          "border rounded-xl px-3 py-2.5 transition",
                          "flex items-center justify-between gap-3",
                          active ? "border-[#B27715] bg-[#fff9f0]" : "border-gray-100 hover:border-[#E9E2F7]",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{r.fullName}</div>
                          {r.email ? <div className="text-xs text-gray-500 truncate">{r.email}</div> : null}
                          {r.module ? <div className="text-xs text-gray-500 mt-0.5 truncate">{r.module}</div> : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSavedMsg(null);
                            resetEvidenceForm();
                            setEvidenceTarget({
                              student: r.fullName,
                              module: r.module ?? null,
                              kind: "absent",
                            });
                          }}
                          className={[
                            "shrink-0 h-9 px-3 rounded-lg text-xs font-medium transition border whitespace-nowrap",
                            active
                              ? "bg-gradient-to-r from-[#B27715] via-[#CEA869] to-[#E3C07F] text-white border-transparent"
                              : "bg-white text-[#B27715] border-[#E9E2F7] hover:bg-[#F9F5FF]",
                          ].join(" ")}
                        >
                          Add evidence
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Unknown */}
            <div className="lg:col-span-4 bg-white rounded-2xl shadow-sm p-4 flex flex-col min-h-0 h-full">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#F1ECFF] shrink-0">
                <h3 className="text-sm font-semibold text-[#241453]">Unknown students</h3>
                <span className="text-xs text-[#442F73] bg-[#F9F5FF] border border-[#E9E2F7] px-2 py-0.5 rounded-full">
                  {unknownRows.length}
                </span>
              </div>

              {!date ? (
                <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
                  Pick a date.
                </div>
              ) : unknownRows.length === 0 ? (
                <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
                  No unknowns.
                </div>
              ) : (
                <div className="mt-3 space-y-2 flex-1 min-h-0 overflow-y-auto custom-scroll pr-1">
                  {unknownRows.map((r) => {
                    const active =
                      evidenceTarget?.student === r.fullName && evidenceTarget?.kind === "unknown";

                    return (
                      <div
                        key={r.id}
                        className={[
                          "border rounded-xl px-3 py-2.5 transition",
                          "flex items-center justify-between gap-3",
                          active ? "border-[#B27715] bg-[#fff9f0]" : "border-gray-100 hover:border-[#E9E2F7]",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{r.fullName}</div>
                          {r.email ? <div className="text-xs text-gray-500 truncate">{r.email}</div> : null}
                          <div className="text-xs text-amber-700 mt-0.5">No attendance record for this date</div>
                          {r.module ? <div className="text-xs text-gray-500 mt-0.5 truncate">{r.module}</div> : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSavedMsg(null);
                            resetEvidenceForm();
                            setEvidenceTarget({
                              student: r.fullName,
                              module: r.module ?? null,
                              kind: "unknown",
                            });
                          }}
                          className={[
                            "shrink-0 h-9 px-3 rounded-lg text-xs font-medium transition border whitespace-nowrap",
                            active
                              ? "bg-gradient-to-r from-[#B27715] via-[#CEA869] to-[#E3C07F] text-white border-transparent"
                              : "bg-white text-[#B27715] border-[#E9E2F7] hover:bg-[#F9F5FF]",
                          ].join(" ")}
                        >
                          Add evidence
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Evidence */}
            <div className="lg:col-span-4 bg-white rounded-2xl shadow-sm p-4 flex flex-col min-h-0 h-full">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#F1ECFF] shrink-0">
                <h3 className="text-sm font-semibold text-[#241453]">Add evidence</h3>

                {evidenceTarget ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEvidenceTarget(null);
                      resetEvidenceForm();
                    }}
                    className="text-xs px-3 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              {!evidenceTarget ? (
                <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400 px-6 text-center">
                  Select a student from <span className="font-medium mx-1">Absent</span> or{" "}
                  <span className="font-medium mx-1">Unknown</span> to add evidence.
                </div>
              ) : (
                <div className="mt-3 border rounded-xl p-3 flex-1 min-h-0 flex flex-col overflow-y-auto custom-scroll">
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-[#241453] truncate">{evidenceTarget.student}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">Date:</span> {date || "—"}
                      {evidenceTarget.module || moduleName ? (
                        <>
                          {" "}
                          <span className="text-gray-300">•</span>{" "}
                          <span className="font-medium">Module:</span> {String(evidenceTarget.module ?? moduleName)}
                        </>
                      ) : null}{" "}
                      <span className="text-gray-300">•</span>{" "}
                      <span className="font-medium">Type:</span>{" "}
                      {evidenceTarget.kind === "absent" ? "Absent" : "Unknown"}
                    </div>
                  </div>

                  <label className="text-xs font-medium text-gray-700">Method</label>
                  <label className="text-xs text-[#644D93] mb-1 block">Method</label>

                  <CustomSelect
                    value={method}
                    label={methodLabel}
                    open={methodOpen}
                    setOpen={setMethodOpen}
                    options={methodOptions}
                    onChange={(val) => setMethod(val as any)}
                  />

                  <label className="mt-3 text-xs font-medium text-gray-700">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Add any notes..."
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm resize-none"
                  />

                  <label className="mt-3 text-xs font-medium text-gray-700">Proof image</label>

                  <div className="mt-1 flex items-center gap-2">
                    <label className="h-10 inline-flex items-center justify-center px-3 rounded-xl border border-[#E9E2F7] bg-white text-sm text-[#241453] cursor-pointer hover:bg-[#F9F5FF] transition">
                      Choose file
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                    </label>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-700 truncate">
                        {proofFile ? proofFile.name : "No file chosen"}
                      </div>
                      {proofFile ? (
                        <div className="text-xs text-gray-400">{Math.round(proofFile.size / 1024)} KB</div>
                      ) : null}
                    </div>
                  </div>

                  {proofFile ? (
                    <div className="mt-2 text-xs text-gray-600">
                      Selected: <span className="font-medium">{proofFile.name}</span>{" "}
                      <span className="text-gray-400">({Math.round(proofFile.size / 1024)} KB)</span>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-400">No file selected.</div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveEvidence(evidenceTarget.student, evidenceTarget.module ?? null)}
                      disabled={!canSaveEvidence || !date}
                      className={[
                        "h-10 px-4 rounded-lg text-sm font-medium transition w-full",
                        !canSaveEvidence || !date
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-gradient-to-r from-[#B27715] via-[#CEA869] to-[#E3C07F] text-white",
                      ].join(" ")}
                    >
                      {saving ? "Saving..." : "Save evidence"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        resetEvidenceForm();
                        setEvidenceTarget(null);
                      }}
                      className="h-10 px-4 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>

                  {!date && (
                    <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      Please select a date first.
                    </div>
                  )}

                  {!method && <div className="mt-2 text-xs text-gray-400">Tip: pick a method to enable saving.</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* QA-only tasks panel */}
        {isQA && selectedCoach && (
          <div className="lg:col-span-12 xl:col-span-3 order-3 min-h-0 h-full overflow-hidden">
            <div className="h-full min-h-0 overflow-y-auto custom-scroll">
              <AttendanceTasksPanel coachId={selectedCoach.id} viewerRole="qa" />
            </div>
          </div>
        )}
      </div>

      {/* ================= Monthly sessions (below, normal page flow) ================= */}
      <div className="mt-4">
        {selectedCoach && (
          <MonthlySessionsWithLearners
            students={studentsList}
            meetingSubject={meetingSubject}
            coachUpcomingSessions={selectedCoach?.upcomming_sessions ?? selectedCoach?.upcomming_sessions}
          />
        )}
      </div>
    </div>
  );
}