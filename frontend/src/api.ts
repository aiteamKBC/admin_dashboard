import type { CompletedSessionsMap } from "./helpers/meetings";
import { fetchWithAuth } from "./services/fetchWithAuth";

export type CancelledSessionsPayload = {
  sessions?: Array<{
    serviceName?: string;
    customerName?: string;
    cancelledAt?: string; // ISO datetime
    date?: string;        // optional if backend provides it
  }>;
};

export type CoachAnalytics = {
  id: number;
  case_owner: string;
  owner_phone: string;

  total_evidence: number;
  evidence_submitted: number;
  evidence_accepted: number;
  evidence_referred: number;

  completed_sessions: CompletedSessionsMap | null;
  completed_sessions_hours: number | null;
   cancelled_sessions: CancelledSessionsPayload | null;
  upcomming_sessions?: {
    meetings?: {
      date?: string;
      timeFrom?: string;
      timeTo?: string;
      coachName?: string;
      meetingId?: string;
      serviceName?: string;
      customerName?: string;
    }[];
  };

  nearest_appointement: string | null;
  last_sub_date: string | null;
  elapsed_days: number;

  with_student: string[];
  staff_id: string;

  avg_aptem?: number | null;
  avg_lms?: number | null;
  avg_overall?: number | null;
  rating?: string | null;
  students?: Record<string, unknown>[];
  student_count?: number;
  coach_email?: string;
  caseload_only?: boolean;
};

type CoachesAnalyticsResponse = {
  success: boolean;
  count: number;
  rows: CoachAnalytics[];
};

const API_BASE_URL = "/api";
const API_KEY =
  "1d1296c572361241a2935363bac9aee3e6054252a24b9de076485d2c58829b21";

const CACHE_KEY = "kbc_coaches_analytics_learners_v1";
const cacheKey = () => `${CACHE_KEY}:${localStorage.getItem("role")}:${localStorage.getItem("email") || localStorage.getItem("username")}`;
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export function getCachedCoachesAnalytics(): CoachAnalytics[] | null {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const { rows, ts } = JSON.parse(raw) as { rows: CoachAnalytics[]; ts: number };
    if (Date.now() - ts > CACHE_TTL) return null;
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/** Returns true if cache exists and is younger than `maxAgeMs` (default 5 min) */
export function isCacheFresh(maxAgeMs = 5 * 60 * 1000): boolean {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return false;
    const { ts } = JSON.parse(raw) as { ts: number };
    return Date.now() - ts < maxAgeMs;
  } catch {
    return false;
  }
}

function saveAnalyticsCache(rows: CoachAnalytics[]) {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({ rows, ts: Date.now() }));
  } catch { /* quota exceeded — silently ignore */ }
}

export async function fetchAllCoachesAnalytics(): Promise<CoachAnalytics[]> {
  const response = await fetch(`${API_BASE_URL}/coaches/all`, {
    headers: {
      "x-api-key": API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data: CoachesAnalyticsResponse = await response.json();
  const rows = await refreshCoachesCaseloads(data.rows);
  saveAnalyticsCache(rows);
  return rows;
}

type CaseloadGroup = {
  display_id: number;
  coach_email: string;
  coach_name: string;
  coach_ids: string[];
  students: Record<string, unknown>[];
};

export async function refreshCoachesCaseloads(rows: CoachAnalytics[]): Promise<CoachAnalytics[]> {
  const data: { groups: CaseloadGroup[] } = await fetchWithAuth(
    `/coach-caseloads/?_=${Date.now()}`, { cache: "no-store" },
  );
  const normalise = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const used = new Set<string>();
  const updated = rows.filter((coach) => !coach.caseload_only).map((coach) => {
    const id = String(coach.id ?? (coach as any).case_owner_id);
    const matches = data.groups.filter((group) => group.coach_ids.includes(id));
    const emailMatches = data.groups.filter((group) =>
      coach.coach_email && group.coach_email === normalise(coach.coach_email));
    const nameMatches = data.groups.filter((group) =>
      normalise(coach.case_owner) && normalise(group.coach_name) === normalise(coach.case_owner));
    const candidates = matches.length ? matches : emailMatches.length ? emailMatches : nameMatches;
    const group = candidates.length === 1 ? candidates[0] : undefined;
    if (group) used.add(group.coach_email);
    const students = group?.students ?? [];
    return {
      ...coach,
      case_owner: coach.case_owner || group?.coach_name || "",
      coach_email: group?.coach_email ?? coach.coach_email,
      students,
      student_count: students.length,
      with_student: students.map((student) => String(student.FullName ?? "")),
    };
  });
  for (const group of data.groups) {
    if (used.has(group.coach_email)) continue;
    updated.push({
      id: group.display_id, case_owner: group.coach_name || group.coach_email,
      coach_email: group.coach_email, caseload_only: true,
      students: group.students, student_count: group.students.length,
      with_student: group.students.map((student) => String(student.FullName ?? "")),
      owner_phone: "", staff_id: "", total_evidence: 0, evidence_submitted: 0,
      evidence_accepted: 0, evidence_referred: 0, completed_sessions: null,
      completed_sessions_hours: null, cancelled_sessions: null,
      nearest_appointement: null, last_sub_date: null, elapsed_days: 0,
    });
  }
  return updated;
}
