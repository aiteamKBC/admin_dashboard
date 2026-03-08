import { useEffect, useMemo, useState, useCallback } from "react";

import TopHeader from "../header/TopHeader";
import StatsOverview from "./StatsOverview";
import CoachesOverview from "../coaches/CoachesOverview";
import MonthlySessionsChart from "./MonthlySessionsChart";
import TrackEvidencesChart from "./TrackEvidencesChart";
import UpcomingMeetingCard from "./UpcomingMeetingCard";
import type { Meeting } from "../../types/meetings";
import { normalizeCompletedSessions, filterCompletedSessionsByRange } from "../../helpers/meetings";
import CoachesList from "../coaches/CoachesList";
import Calendar from "./Calendar";
import TodoList from "./TodoList";
import EvidenceBarChart from "./EvidenceBarChart";
import { useReport } from "../../context/ReportContext";


import { fetchAllCoachesAnalytics, CoachAnalytics } from "../../api";

/* ================= helpers ================= */

// Progress review parsing helpers
const isObj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const parseMaybeJson = (v: unknown): any => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
};

const isMonthKey = (k: string) => /^\d{4}-\d{2}$/.test(k);

const normKey = (x: any) => String(x ?? "").trim().toLowerCase();

function extractLearnerKeys(list: any[]): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((l) => normKey(l?.ID || l?.id || l?.Email || l?.email || l?.FullName || l?.fullName))
    .filter(Boolean);
}

function buildDueSetFromPR(
  pr: any,
  months: string[],
  opts?: { includeDueUpcoming?: boolean }
) {
  const includeDueUpcoming = opts?.includeDueUpcoming ?? true;

  const set = new Set<string>();
  const byMonth = isObj(pr?.byMonth) ? pr.byMonth : {};

  for (const m of months) {
    const node = byMonth?.[m];
    const lists = node?.lists || {};
    const overdue = lists?.overdueLearners || [];
    const dueUpcoming = lists?.dueUpcomingLearners || [];

    for (const k of extractLearnerKeys(overdue)) set.add(k);

    if (includeDueUpcoming) {
      for (const k of extractLearnerKeys(dueUpcoming)) set.add(k);
    }
  }

  return set;
}

const parseDDMMYYYY = (s?: string) => {
  if (!s || typeof s !== "string") return null;
  const parts = s.trim().split("-");
  if (parts.length !== 3) return null;

  const dd = Number(parts[0]);
  const mm = Number(parts[1]);
  const yyyy = Number(parts[2]);

  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
  return new Date(yyyy, mm - 1, dd);
};

const getLastProgressReview = (items: ProgressReviewItem[]) => {
  let best: (ProgressReviewItem & { _d: Date }) | null = null;

  for (const it of items) {
    const d = parseDDMMYYYY(it.date);
    if (!d) continue;

    if (!best || d.getTime() > best._d.getTime()) {
      best = { ...(it as any), _d: d };
    }
  }

  return best ? { date: best.date || null, status: best.status || null, raw: best.raw || null } : null;
};

const prStatusBadgeClass = (status?: string) => {
  const s = String(status || "").toLowerCase().trim();

  if (s.includes("completed")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s.includes("in progress")) return "bg-[#FCF3FF] text-[#72587A] border-[#BA8FC7]";
  if (s.includes("not started")) return "bg-gray-100 text-gray-700 border-gray-200";

  return "bg-slate-50 text-slate-700 border-slate-200";
};

const addMonthsToKey = (ym: string, delta: number) => {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;

  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + delta);

  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
};

const countCancelledSessions = (cancelledSessions: any): number => {
  const sessions = cancelledSessions?.sessions;
  if (!Array.isArray(sessions)) return 0;
  return sessions.filter((s: any) => !!s?.cancelledAt).length;
};

const countUpcomingSessions = (
  upcommingSessions?: { meetings?: Meeting[] }
): number => {
  return upcommingSessions?.meetings?.length ?? 0;
};

const countUpcomingMeetings = (meetings: any[] | undefined | null): number => {
  if (!Array.isArray(meetings)) return 0;
  return meetings.length;
};


const getNextMeeting = (
  upcommingSessions?: { meetings?: Meeting[] }
): Meeting | null => {
  const meetings: Meeting[] = upcommingSessions?.meetings ?? [];

  if (meetings.length === 0) return null;

  return [...meetings].sort((a, b) => {
    const aDate = new Date(`${a.date}T${a.timeFrom}`).getTime();
    const bDate = new Date(`${b.date}T${b.timeFrom}`).getTime();
    return aDate - bDate;
  })[0]!;
};

// Filter by time
type TimePeriod = "7d" | "1m" | "3m" | "6m" | "1y";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const getRange = (period: TimePeriod) => {
  const end = startOfDay(new Date()); // today
  let start = end;

  switch (period) {
    case "7d":
      start = addDays(end, -6); // include today => 7 days
      break;
    case "1m":
      start = new Date(end.getFullYear(), end.getMonth() - 1, end.getDate());
      break;
    case "3m":
      start = new Date(end.getFullYear(), end.getMonth() - 3, end.getDate());
      break;
    case "6m":
      start = new Date(end.getFullYear(), end.getMonth() - 6, end.getDate());
      break;
    case "1y":
      start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
      break;
  }

  return { start, end };
};

const inRange = (dateStr: string | null | undefined, start: Date, end: Date) => {
  if (!dateStr) return false;

  // YYYY-MM-DD or ISO
  const d = dateStr.length === 10 ? new Date(dateStr + "T00:00:00") : new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;

  const dd = startOfDay(d).getTime();
  return dd >= start.getTime() && dd <= end.getTime();
};

// meetings: {date:"YYYY-MM-DD", ...}
const filterMeetingsByRange = (meetings: any[] | undefined, start: Date, end: Date) => {
  if (!Array.isArray(meetings)) return [];
  return meetings.filter((m) => inRange(m?.date, start, end));
};

// progress review parsing (from JSONB string)
type ProgressReviewItem = {
  key: string;
  date?: string;
  status?: string;
  raw?: string;
};

type StudentLike = {
  id?: string;
  fullName?: string;
  email?: string;
  overall: number;
  lmsProgress: number;
  aptemProgress: number;
  progressReviewRaw?: any;
  [k: string]: any;
};

// helper to extract progress review items from the raw JSONB field
const extractProgressReviews = (raw: any): ProgressReviewItem[] => {
  if (!raw || typeof raw !== "object") return [];

  const keys = Object.keys(raw).filter((k) =>
    /^Review\s?Status\d+$/i.test(k.replace(/\s+/g, ""))
  );

  keys.sort((a, b) => {
    const na = parseInt(a.match(/\d+/)?.[0] || "0", 10);
    const nb = parseInt(b.match(/\d+/)?.[0] || "0", 10);
    return na - nb;
  });

  const parseValue = (v: any) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) return { raw: s };
    const m = s.match(/^(.+?)\s*\((.+?)\)\s*$/);
    if (!m) return { raw: s };
    return { date: m[1]?.trim(), status: m[2]?.trim(), raw: s };
  };

  return keys.map((k) => ({
    key: k,
    ...parseValue(raw[k]),
  }));
};

// sessions:(date/completedAt/cancelledAt/createdAt)
const extractSessionDate = (s: any): string | null => {
  return (
    s?.date ||
    s?.session_date ||
    s?.created_at ||
    s?.createdAt ||
    s?.completed_at ||
    s?.completedAt ||
    s?.cancelled_at ||
    s?.cancelledAt ||
    null
  );
};

const filterSessionsShapeByRange = (obj: any, start: Date, end: Date) => {
  // if shape: { sessions: [] }
  if (obj && typeof obj === "object" && Array.isArray(obj.sessions)) {
    return {
      ...obj,
      sessions: obj.sessions.filter((s: any) => inRange(extractSessionDate(s), start, end)),
    };
  }

  // if shape: [] directly
  if (Array.isArray(obj)) {
    return obj.filter((s: any) => inRange(extractSessionDate(s), start, end));
  }

  return obj;
};

/* ================= component ================= */

export default function AnalyticsMeetings({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  /* ---- state ---- */
  const [coaches, setCoaches] = useState<CoachAnalytics[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);

  // selectedCoach is the coach 
  const selectedCoach = useMemo(() => {
    if (!coaches?.length) return null;
    return coaches.find((c: any) => Number(c.id) === Number(selectedCoachId)) ?? coaches[0] ?? null;
  }, [coaches, selectedCoachId]);

  const prRaw =
    (selectedCoach as any)?.overall_progress_review ??
    (selectedCoach as any)?.overallProgressReview;

  const prData = useMemo(() => {
    const x = parseMaybeJson(prRaw);
    return isObj(x) ? x : null;
  }, [prRaw]);

  const role =
    (localStorage.getItem("role") as "qa" | "coach" | "admin" | null) || "coach";

  const isCoachRole = role === "coach";
  const filterDisabled = false;

  const selfCoachId = Number(localStorage.getItem("coach_id") || "");
  const userName = localStorage.getItem("username") || "User";

  const todoCoachId: number | null =
    role === "coach" ? (Number.isFinite(selfCoachId) ? selfCoachId : null) : selectedCoachId;

  // ---- filters state ----
  const [periodFilter, setPeriodFilter] = useState("7");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("7d");
  const [coachFilterId, setCoachFilterId] = useState<number | "all">("all");

  const selectedCoachSafe = useMemo(() => {
    if (!coaches.length) return null;
    return coaches.find((c) => c.id === selectedCoachId) ?? coaches[0];
  }, [coaches, selectedCoachId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { setRows } = useReport();

  /* ---- effects ---- */
  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const data = await fetchAllCoachesAnalytics();
        const arr = Array.isArray(data) ? data : [];

        const normalized = arr
          .map((c: any) => {
            const rawId =
              c.id ??
              c.case_owner_id ??
              c.caseOwnerId ??
              c.coach_id ??
              c.coachId;

            const id = Number(rawId);

            return { ...c, id };
          })
          .filter((c: any) => Number.isFinite(c.id));

        // Filter coaches based on role and username
        const role = localStorage.getItem("role");
        const username = localStorage.getItem("username");

        let filteredCoaches = normalized;

        // If user is a coach, only show their own data
        if (role === "coach" && username) {
          filteredCoaches = normalized.filter((c: any) =>
            c.case_owner === username || c.caseOwner === username
          );
        }
        // If role is "qa", show all coaches (no filtering)

        setCoaches(filteredCoaches);

        const firstId = filteredCoaches[0]?.id ?? null;
        if (role === "coach" && firstId != null) {
          setCoachFilterId(firstId);
        } else {
          setCoachFilterId("all");
        }
        setCoachFilterId("all");
      } catch (err) {
        console.error(err);
        setError("Failed to load analytics");
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  // ---- Selected Coach ----
  const selectCoach = useCallback((coach: CoachAnalytics) => {
    const id = Number((coach as any).id ?? (coach as any).case_owner_id);
    if (!Number.isFinite(id)) return;

    setSelectedCoachId(id);
    // setCoachFilterId(id);
  }, []);

  const activeCoachIdForList = useMemo(
    () => selectedCoachId ?? coaches[0]?.id ?? null,
    [selectedCoachId, coaches]
  );
  // time period mapping
  const periodToTimePeriod = (p: string): TimePeriod => {
    switch (p) {
      case "7":
        return "7d";
      case "30":
        return "1m";
      case "90":
        return "3m";
      case "180":
        return "6m";
      case "365":
        return "1y";
      default:
        return "7d";
    }
  };

  const handleApplyFilters = useCallback(
    (filters: { coach: string; period: string }) => {
      setPeriodFilter(filters.period);
      setTimePeriod(periodToTimePeriod(filters.period));

      if (role === "coach") {
        // الكوتش ما يغيرش coach, بس يفلتر وقت
        return;
      }

      if (filters.coach === "all") {
        setCoachFilterId("all");
        return;
      }

      const id = Number(filters.coach);
      setCoachFilterId(id);
      setSelectedCoachId(id);
    },
    [role]
  );

  // ---- range (based on timePeriod) ----
  const range = useMemo(() => getRange(timePeriod), [timePeriod]);

  // ---- coaches after coach filter ----
  const visibleCoaches = useMemo(() => {
    return coachFilterId === "all"
      ? coaches
      : coaches.filter((c) => c.id === coachFilterId);
  }, [coaches, coachFilterId]);

  /* ---- derived data (NO early returns before hooks) ---- */
  const today = new Date().toISOString().slice(0, 10);

  const normalizeMeeting = useCallback((m: unknown): Meeting | null => {
    if (!m || typeof m !== "object") return null;

    const meeting = m as any;

    return {
      date: typeof meeting.date === "string" ? meeting.date : "",
      timeFrom: typeof meeting.timeFrom === "string" ? meeting.timeFrom : "",
      timeTo: typeof meeting.timeTo === "string" ? meeting.timeTo : "",
      serviceName:
        typeof meeting.serviceName === "string"
          ? meeting.serviceName
          : "Session",
      customerName:
        typeof meeting.customerName === "string"
          ? meeting.customerName
          : typeof meeting.customerName?.name === "string"
            ? meeting.customerName.name
            : "Unknown student",
      joinWebUrl:
        typeof meeting.joinWebUrl === "string" ? meeting.joinWebUrl : null,
    };
  }, []);

  const todayMeetings = useMemo<Meeting[]>(() => {
    return (
      selectedCoachSafe?.upcomming_sessions?.meetings
        ?.map(normalizeMeeting)
        .filter(
          (m): m is Meeting => !!m && m.date === today
        ) ?? []
    );
  }, [selectedCoachSafe, today, normalizeMeeting]);

  const nextMeeting = useMemo<Meeting | null>(() => {
    return getNextMeeting(
      selectedCoachSafe?.upcomming_sessions
        ? {
          meetings: selectedCoachSafe.upcomming_sessions.meetings
            ?.map(normalizeMeeting)
            .filter((m): m is Meeting => !!m),
        }
        : undefined
    );
  }, [selectedCoachSafe, normalizeMeeting]);

  const completedStats = useMemo(() => {
    const filteredCompleted = filterCompletedSessionsByRange(
      selectedCoachSafe?.completed_sessions,
      range.start,
      range.end
    );
    return normalizeCompletedSessions(filteredCompleted);
  }, [selectedCoachSafe, range.start, range.end]);

  const cancelledCountSelected = useMemo(() => {
    const filteredCancelled = filterSessionsShapeByRange(
      selectedCoachSafe?.cancelled_sessions,
      range.start,
      range.end
    );
    return countCancelledSessions(filteredCancelled);
  }, [selectedCoachSafe, range.start, range.end]);

  const monthlyData = useMemo(() => {
    return visibleCoaches.map((coach) => {
      const filteredCompleted = filterCompletedSessionsByRange(
        coach.completed_sessions,
        range.start,
        range.end
      );
      const completed = normalizeCompletedSessions(filteredCompleted);

      const filteredCancelled = filterSessionsShapeByRange(
        coach.cancelled_sessions,
        range.start,
        range.end
      );
      const cancelledCount = countCancelledSessions(filteredCancelled);

      const normalizedMeetings =
        coach.upcomming_sessions?.meetings
          ?.map(normalizeMeeting)
          .filter((m): m is Meeting => !!m) ?? [];

      return {
        key: String(coach.id), // unique
        name: String(coach.case_owner || `Coach ${coach.id}`), // fallback
        completed: completed.totalSessions,
        cancelled: cancelledCount,
        upcomming: normalizedMeetings.length,
      };
    });
  }, [visibleCoaches, normalizeMeeting, range.start, range.end]);

  useEffect(() => {
    const rows = monthlyData.map((r) => ({
      Coach: r.name,
      Completed: Number(r.completed ?? 0),
      Cancelled: Number(r.cancelled ?? 0),
      Upcoming: Number(r.upcomming ?? 0),
    }));

    setRows(rows);
  }, [monthlyData, setRows]);

  /* ================= Calender ================= */
  const calendarDates = useMemo<string[]>(() => {
    const meetings = selectedCoachSafe?.upcomming_sessions?.meetings ?? [];

    return Array.from(
      new Set(
        meetings
          .map(m => m?.date)
          .filter((d): d is string => typeof d === "string")
      )
    );
  }, [selectedCoachSafe]);

  const meetingsByDate = useMemo<Record<string, Meeting[]>>(() => {
    const meetings =
      selectedCoachSafe?.upcomming_sessions?.meetings
        ?.map(normalizeMeeting)
        .filter((m): m is Meeting => !!m) ?? [];

    return meetings.reduce<Record<string, Meeting[]>>((acc, meeting) => {
      const date = meeting.date;   // the key of the meeting
      if (!date) return acc;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(meeting);
      return acc;
    }, {});
  }, [selectedCoachSafe, normalizeMeeting]);

  // ================= student iframe =================
  type StudentAnalytics = {
    id: string;
    fullName: string;
    email: string;
    overall: number;      // 0..100
    lmsProgress: number;  // 0..100
    aptemProgress: number;// 0..100
    raw: Record<string, any>;
  };

  const [studentsModal, setStudentsModal] = useState<{
    open: boolean;
    coachId?: number;
    coachName?: string;
    students?: StudentAnalytics[];
  }>({ open: false });

  // PR filter for the modal (this_month, last_month, last_3_months)
  const [prFilter, setPrFilter] = useState<"this_month" | "last_month" | "last_3_months">("this_month");

  const modalCoach = useMemo(() => {
    if (!studentsModal.open || !studentsModal.coachId) return null;
    return coaches.find((c) => Number(c.id) === Number(studentsModal.coachId)) ?? null;
  }, [studentsModal.open, studentsModal.coachId, coaches]);

  const prRawForModal = useMemo(() => {
    const c: any = modalCoach;
    return c?.overall_progress_review ?? c?.overallProgressReview ?? null;
  }, [modalCoach]);

  const prDataForModal = useMemo(() => {
    const x = parseMaybeJson(prRawForModal);
    return isObj(x) ? x : null;
  }, [prRawForModal]);

  const nowMonthKey = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const selectedMonthsForModal = useMemo(() => {
    const base = nowMonthKey;

    if (prFilter === "this_month") return [base];

    if (prFilter === "last_month") return [addMonthsToKey(base, -1)];

    // last 3 months
    return [addMonthsToKey(base, -3), addMonthsToKey(base, -2), addMonthsToKey(base, -1)];
  }, [nowMonthKey, prFilter]);

  const completedSetForModal = useMemo(() => {
    if (!prDataForModal) return new Set<string>();

    const set = new Set<string>();
    const byMonth = isObj(prDataForModal?.byMonth) ? prDataForModal.byMonth : {};

    for (const m of selectedMonthsForModal) {
      const node = byMonth?.[m];
      const lists = node?.lists || {};
      const completed = lists?.completedLearners || [];

      for (const k of extractLearnerKeys(completed)) set.add(k);
    }

    return set;
  }, [prDataForModal, selectedMonthsForModal]);

  const isPrCompletedThisPeriod = useCallback(
    (st: StudentAnalytics) => {
      const idKey = normKey(st?.id);
      const emailKey = normKey(st?.email);
      return (idKey && completedSetForModal.has(idKey)) || (emailKey && completedSetForModal.has(emailKey));
    },
    [completedSetForModal]
  );

  const completedReviewsForFilter = useMemo(() => {
    if (!prDataForModal) return 0;

    // this_month or last_month
    if (prFilter === "this_month" || prFilter === "last_month") {
      const m = selectedMonthsForModal[0];
      const n = m ? prDataForModal?.byMonth?.[m]?.reviews?.completed : 0;
      return Number(n) || 0;
    }

    // 3 months => sum of the 3 months
    return selectedMonthsForModal.reduce((sum, m) => {
      const n = prDataForModal?.byMonth?.[m]?.reviews?.completed;
      return sum + (Number(n) || 0);
    }, 0);
  }, [prDataForModal, prFilter, selectedMonthsForModal]);

  const dueSetForModal = useMemo(() => {
    if (!prDataForModal) return new Set<string>();

    const includeDueUpcoming = prFilter !== "last_3_months";
    return buildDueSetFromPR(prDataForModal, selectedMonthsForModal, { includeDueUpcoming });
  }, [prDataForModal, selectedMonthsForModal, prFilter]);

  const isPrDueThisPeriod = useCallback(
    (st: StudentAnalytics) => {
      const idKey = normKey(st?.id);
      const emailKey = normKey(st?.email);
      return (idKey && dueSetForModal.has(idKey)) || (emailKey && dueSetForModal.has(emailKey));
    },
    [dueSetForModal]
  );

  const prDueNotDoneCount = useMemo(() => {
    const list = studentsModal.students ?? [];
    return list.filter((s) => isPrDueThisPeriod(s)).length;
  }, [studentsModal.students, isPrDueThisPeriod]);

  const overdueGeneralCount = useMemo(() => {
    const n = prDataForModal?.overall?.learners?.overdueCount ?? 0;
    return Number(n) || 0;
  }, [prDataForModal]);

  const overdueRateForFilter = useMemo(() => {
    if (!prDataForModal) return null;

    if (prFilter === "last_month") {
      const m = selectedMonthsForModal[0];
      const r = m ? prDataForModal?.byMonth?.[m]?.learners?.overdueRate : null;
      return typeof r === "number" ? r : null;
    }

    const months = selectedMonthsForModal;
    const rates = months
      .map((m) => prDataForModal?.byMonth?.[m]?.learners?.overdueRate)
      .filter((x): x is number => typeof x === "number");

    if (!rates.length) return null;
    return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10; // 1 decimal
  }, [prDataForModal, prFilter, selectedMonthsForModal]);

  const overallOverdueRate = useMemo(() => {
    const r = prDataForModal?.overall?.learners?.overdueRate;
    return typeof r === "number" ? r : null;
  }, [prDataForModal]);

  // ---- progress review ----
  const [studentsView, setStudentsView] = useState<"list" | "review">("list");
  const [activeStudent, setActiveStudent] = useState<StudentLike | null>(null);

  const [studentSearch, setStudentSearch] = useState("");

  // Evidence modal state
  const [evidenceModal, setEvidenceModal] = useState<{
    open: boolean;
    loading: boolean;
    error: string | null;
    data: any | null;
    studentEmail?: string;
    studentId?: string;
    studentName?: string;
    markingInProgress?: string | null; // evidence ID being marked
    markingResult?: any | null;
  }>({
    open: false,
    loading: false,
    error: null,
    data: null,
    markingInProgress: null,
    markingResult: null,
  });

  // Result modal state
  const [resultModal, setResultModal] = useState<{
    open: boolean;
    data: any | null;
  }>({
    open: false,
    data: null,
  });

  function normalizeStudent(s: unknown): StudentAnalytics | null {
    if (!s || typeof s !== "object") return null;
    const x = s as any;

    const id = String(x.ID ?? x.id ?? "");
    const fullName = String(x.FullName ?? x.fullName ?? "Unknown");
    const email = String(x.Email ?? x.email ?? "");

    const overall = Number(x.Overall ?? x.overall ?? 0);
    const lms = Number(x.LMSProgress ?? x.lmsProgress ?? 0);
    const aptem = Number(x.AptemProgress ?? x.aptemProgress ?? 0);

    const clamp01 = (n: number) => Math.max(0, Math.min(100, n));

    return {
      id,
      fullName,
      email,
      overall: Number.isFinite(overall) ? clamp01(overall) : 0,
      lmsProgress: Number.isFinite(lms) ? clamp01(lms) : 0,
      aptemProgress: Number.isFinite(aptem) ? clamp01(aptem) : 0,
      raw: x,
    };
  }

  const handleViewStudents = (coach: CoachAnalytics) => {
    selectCoach(coach);

    const raw = (coach as any).students ?? [];
    const normalized = Array.isArray(raw)
      ? raw.map(normalizeStudent).filter((x): x is StudentAnalytics => !!x)
      : [];

    setStudentsModal({
      open: true,
      coachId: coach.id,
      coachName: coach.case_owner,
      students: normalized,
    });

    setPrFilter("this_month");
    setStudentSearch("");
  };

  // Handle load evidence for a student
  const handleLoadEvidence = async (student: StudentAnalytics) => {
    setEvidenceModal({
      open: true,
      loading: true,
      error: null,
      data: null,
      studentEmail: student.email,
      studentId: student.id,
      studentName: student.fullName,
    });

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Authentication token not found");
      }

      const params = new URLSearchParams();
      if (student.email) {
        params.append("student_email", student.email);
      } else if (student.id) {
        params.append("student_id", student.id);
      } else {
        throw new Error("Student email or ID is required");
      }

      const response = await fetch(`/api/accounts/student-components/?${params}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      setEvidenceModal((prev) => ({
        ...prev,
        loading: false,
        data: result.data,
      }));
    } catch (err: any) {
      setEvidenceModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Failed to load evidence",
      }));
    }
  };

  // Parse evidence data from JSON string
  const parseEvidenceData = (evidenceString: string | null | undefined) => {
    if (!evidenceString || typeof evidenceString !== 'string') return [];

    try {
      // Evidence data is a JSON array string
      const parsed = JSON.parse(evidenceString);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          id: item.Id || item.id || '',
          componentId: item.ComponentId || item.componentId || '',
          name: item.Name || item.name || 'Unnamed Evidence',
          url: item.Url || item.url || '',
          status: item.Status || item.status || 'Unknown',
          createdDate: item.CreatedDate || item.createdDate || '',
        }));
      }
    } catch (e) {
      console.error('Failed to parse evidence data:', e);
    }

    return [];
  };

  // Handle marking evidence
  const handleMarkEvidence = async (evidenceItem: any) => {
    if (!evidenceModal.data) return;

    setEvidenceModal((prev) => ({
      ...prev,
      markingInProgress: evidenceItem.id,
      markingResult: null,
    }));

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Authentication token not found");
      }

      const response = await fetch(`/api/accounts/mark-evidence/`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_id: evidenceModal.data.student_id,
          student_email: evidenceModal.data.student_email,
          student_name: evidenceModal.studentName || evidenceModal.data.student_email,
          group: evidenceModal.data.group,
          evidence_id: evidenceItem.id,
          evidence_name: evidenceItem.name,
          evidence_url: evidenceItem.url,
          evidence_status: evidenceItem.status,
          evidence_created_date: evidenceItem.createdDate,
          component_id: evidenceItem.componentId,
          components: evidenceModal.data.components,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      setEvidenceModal((prev) => ({
        ...prev,
        markingInProgress: null,
      }));

      // Open result modal with the marking data
      setResultModal({
        open: true,
        data: result.data,
      });
    } catch (err: any) {
      setEvidenceModal((prev) => ({
        ...prev,
        markingInProgress: null,
        error: err.message || "Failed to mark evidence",
      }));
    }
  };


  // Global students names list (from coaches[].students JSONB)
  const students = useMemo<string[]>(() => {
    const names: string[] = [];

    for (const coach of coaches) {
      const raw = (coach as any).students;
      if (!Array.isArray(raw)) continue;

      for (const s of raw) {
        const st = normalizeStudent(s);
        if (st?.fullName?.trim()) names.push(st.fullName.trim());
      }
    }

    return Array.from(new Set(names));
  }, [coaches]);

  const handleSelectStudent = useCallback(
    (name: string) => {
      for (const coach of coaches) {
        const raw = (coach as any).students;
        if (!Array.isArray(raw)) continue;

        const normalized = raw
          .map(normalizeStudent)
          .filter((x): x is StudentAnalytics => !!x);

        const found = normalized.find(
          (s) => s.fullName.toLowerCase() === name.toLowerCase()
        );

        if (found) {
          //  Activate this coach
          setSelectedCoachId(coach.id);

          //  filter for coach
          setCoachFilterId(coach.id);

          // open modal with students of this coach
          setStudentsModal({
            open: true,
            coachName: coach.case_owner,
            students: normalized,
          });

          setStudentSearch(name);
          return;
        }
      }

      setStudentSearch(name);
    },
    [coaches]
  );

  const filteredStudents = (studentsModal.students ?? []).filter((s) => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  const clamp01 = (n: number) => Math.max(0, Math.min(100, n));

  /* ================= Students Radar ================= */
  const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));

  const toNum100 = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? clamp(n, 0, 100) : 0;
  };

  const ratingToScore = (r: unknown): number => {
    const s = String(r ?? "").trim().toLowerCase();
    if (!s) return 0;

    // handle different casing/spaces
    if (s.includes("excellent")) return 95;
    if (s === "good" || s.includes("good")) return 80;
    if (s.includes("needs attention")) return 55;

    // fallback
    return 60;
  };

  const upcomingCountByCoach = useMemo(() => {
    return coaches.map((coach) =>
      countUpcomingSessions({
        meetings: coach.upcomming_sessions?.meetings
          ?.map(normalizeMeeting)
          .filter((m): m is Meeting => !!m),
      })
    );
  }, [coaches, normalizeMeeting]);

  const maxUpcoming = useMemo(() => {
    const m = Math.max(...upcomingCountByCoach, 0);
    return m <= 0 ? 1 : m; // avoid divide by zero
  }, [upcomingCountByCoach]);

  const selectedUpcomingCount = useMemo(() => {
    return countUpcomingSessions({
      meetings: selectedCoachSafe?.upcomming_sessions?.meetings
        ?.map(normalizeMeeting)
        .filter((m): m is Meeting => !!m),
    });
  }, [selectedCoachSafe, normalizeMeeting]);

  const coachRadarData = useMemo(() => {
    const aptem = toNum100(selectedCoachSafe?.avg_aptem);
    const lms = toNum100(selectedCoachSafe?.avg_lms);
    const overall = toNum100(selectedCoachSafe?.avg_overall);

    const upcomingScore = clamp((selectedUpcomingCount / maxUpcoming) * 100, 0, 100);

    return [
      { metric: "APTEM", value: aptem },
      { metric: "LMS", value: lms },
      { metric: "Overall", value: overall },
      { metric: "Upcoming", value: upcomingScore, raw: selectedUpcomingCount },
    ];
  }, [selectedCoachSafe, selectedUpcomingCount, maxUpcoming]);

  // rating label in radar
  const ratingLabel = useMemo(() => {
    const r = String(selectedCoachSafe?.rating ?? "").trim();
    return r || "—";
  }, [selectedCoachSafe]);

  /* ================= for calender hight ================= */

  const [calendarWeeks, setCalendarWeeks] = useState(5);

  const coachesH =
    calendarWeeks >= 6 ? "h-[640px]" : calendarWeeks <= 4 ? "h-[550px]" : "h-[595px]";

  /* ================= render ================= */

  return (
    <div id="report-area" className="space-y-6">
      {loading && <div>Loading analytics...</div>}

      {error && <div className="text-red-500">{error}</div>}

      {!loading && !error && coaches.length === 0 && (
        <div>No analytics data available</div>
      )}


      {!loading && !error && coaches.length > 0 && selectedCoachSafe && (
        <>
          <TopHeader
            coaches={coaches}
            onApplyFilters={handleApplyFilters}
            onOpenSidebar={onOpenSidebar}
            students={students}
            onSelectStudent={handleSelectStudent}
            activeCoachId={coachFilterId}
            activePeriod={periodFilter}
            userName={userName}
            canSwitchCoach={role === "qa"}
            lockCoachFilter={isCoachRole}
          />

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: Coaches */}
            <div className="lg:col-span-3">
              <div className={`bg-white rounded-2xl p-4 shadow-sm ${coachesH} overflow-y-auto custom-scroll`}>
                <h3 className="text-lg font-bold text-[#442F73] mb-3">Coaches</h3>

                <CoachesList
                  coaches={coaches}
                  activeCoachId={activeCoachIdForList}
                  onSelect={selectCoach}
                  onViewStudents={handleViewStudents}
                />
              </div>
            </div>

            {/* RIGHT: Everything stacked with NO empty gap */}
            <div className="lg:col-span-9 flex flex-col gap-6">
              {/* Row 1: Sessions Overview + Upcoming */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-8">
                  <StatsOverview
                    stats={{
                      completed: completedStats.totalSessions,
                      hours: Math.round(completedStats.totalMinutes / 60),
                      reviews: selectedCoachSafe.evidence_accepted ?? 0,
                      cancelled: cancelledCountSelected,
                      overdue: selectedCoachSafe.evidence_submitted ?? 0,
                    }}
                  />
                </div>

                <div className="lg:col-span-4">
                  <UpcomingMeetingCard meeting={nextMeeting} meetings={todayMeetings} />
                </div>
              </div>

              {/* Row 2: Coach Overview + Calendar (directly under Row 1) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <div className="bg-white rounded-xl p-4 flex flex-col">
                  <h3 className="text-lg font-bold text-[#442F73] mb-3">Coach Overview</h3>

                  <CoachesOverview
                    metrics={{
                      sessions: completedStats.totalSessions,
                      students: selectedCoachSafe.with_student?.length ?? 0,
                      rating: 4.7,
                      elapsedDays: selectedCoachSafe.elapsed_days ?? 0,
                      status:
                        (selectedCoachSafe.elapsed_days ?? 0) <= 5
                          ? { label: "Safe", color: "bg-green-100 text-green-700" }
                          : (selectedCoachSafe.elapsed_days ?? 0) <= 10
                            ? { label: "Need Attention", color: "bg-yellow-100 text-yellow-700" }
                            : { label: "Delayed", color: "bg-red-100 text-red-700" },
                    }}
                  />
                </div>

                <div className="bg-white rounded-xl p-4 flex flex-col">
                  <h3 className="text-lg font-bold text-[#442F73] mb-3">Coach Calendar</h3>
                  <Calendar meetingsByDate={meetingsByDate} 
                  onWeeksChange={setCalendarWeeks}
                  />
                </div>
              </div>
            </div>
          </section>


          {/* Charts */}
          {/* Track Evidences + Todo */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">

            {/* Evidence Chart (NEW) */}
            <div className="bg-white rounded-xl p-4">
              <h3 className="text-lg font-bold text-[#442F73] mb-2">
                Evidence Overview <span className="text-sm font-medium text-[#B27715] mb-2">(releated to coach)</span>
              </h3>

              <EvidenceBarChart
                data={{
                  submitted: selectedCoachSafe.evidence_submitted ?? 0,
                  accepted: selectedCoachSafe.evidence_accepted ?? 0,
                  referred: selectedCoachSafe.evidence_referred ?? 0,
                  total: selectedCoachSafe.total_evidence ?? 0,
                }}
              />
            </div>

            {/* Radar (existing – data later) */}
            <div className="bg-white rounded-xl p-4">
              <h3 className="text-lg font-bold text-[#442F73] ">
                Track Students <span className="text-sm font-medium text-[#B27715] mb-2">(with coach)</span>
              </h3>
              <div>
                <h5 className="text-sm font-normal text-[#442F73] ">All the numbers refers to %</h5>
              </div>

              <TrackEvidencesChart data={coachRadarData} ratingLabel={ratingLabel} />

            </div>

            <div className="bg-white rounded-xl p-4 flex flex-col">
              {Number.isFinite(todoCoachId as number) ? (
                <TodoList coachId={todoCoachId as number} viewerRole={role} />
              ) : (
                <div className="text-sm text-gray-400">Select a coach to view tasks.</div>
              )}
            </div>
          </section>

          {/* Monthly Sessions */}
          <section className="bg-white rounded-xl p-4">
            <h3 className="text-lg font-bold text-[#442F73] mb-2">
              Track Sessions <span className="text-sm font-medium text-[#B27715] mb-2">(Changes according to the filter)</span>
            </h3>
            <MonthlySessionsChart data={monthlyData} />
          </section>
        </>
      )}

      {/* Students Modal */}
      {studentsModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-[#F9F5FF]/50 w-full max-w-5xl h-[80vh] rounded-2xl shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="text-lg font-semibold text-[#442F73]">Students</h3>
                <p className="text-xs text-gray-500">{studentsModal.coachName}</p>
              </div>

              <button
                onClick={() => {
                  setStudentsModal({ open: false });
                  setStudentSearch("");
                  setStudentsView("list");
                  setActiveStudent(null);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#E9D9BD] hover:bg-[#B27715] text-[#241453] hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Search */}
            <div className="px-5 pt-4">
              <input
                type="text"
                placeholder="Search student..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="
            w-full h-9 px-3 rounded-lg
            border border-gray-200
            text-sm
            focus:outline-none focus:ring-2 focus:ring-[#E9D9BD] focus:border-transparent
          "
              />
              <div className="text-sm text-[#442F73] mt-1 font-medium">
                {filteredStudents.length} students
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 custom-scroll custom-scroll--soft">
              {studentsView === "list" ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Sidebar */}
                  <div className="lg:col-span-3">
                    <div className="bg-white/70 rounded-2xl border border-violet-100 p-3">
                      <div className="text-xs font-semibold text-[#241453] mb-2">Progress Review</div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setPrFilter("this_month")}
                          className={[
                            "w-full h-9 rounded-xl text-xs font-medium border transition",
                            prFilter === "this_month"
                              ? "bg-[#fff9f0] border-[#B27715] text-[#B27715]"
                              : "bg-white border-gray-200 text-[#241453] hover:bg-[#F9F5FF]",
                          ].join(" ")}
                        >
                          This month
                        </button>

                        <button
                          type="button"
                          onClick={() => setPrFilter("last_month")}
                          className={[
                            "w-full h-9 rounded-xl text-xs font-medium border transition",
                            prFilter === "last_month"
                              ? "bg-[#fff9f0] border-[#B27715] text-[#B27715]"
                              : "bg-white border-gray-200 text-[#241453] hover:bg-[#F9F5FF]",
                          ].join(" ")}
                        >
                          Last month
                        </button>

                        <button
                          type="button"
                          onClick={() => setPrFilter("last_3_months")}
                          className={[
                            "w-full h-9 rounded-xl text-xs font-medium border transition",
                            prFilter === "last_3_months"
                              ? "bg-[#fff9f0] border-[#B27715] text-[#B27715]"
                              : "bg-white border-gray-200 text-[#241453] hover:bg-[#F9F5FF]",
                          ].join(" ")}
                        >
                          Last 3 months
                        </button>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                          <div className="text-[11px] text-red-700 font-semibold">PR due, not done</div>
                          <div className="text-lg font-bold text-red-800">{prDueNotDoneCount}</div>
                          <div className="text-[11px] text-red-700">
                            {selectedMonthsForModal.length ? selectedMonthsForModal.join(", ") : "No PR data"}
                          </div>
                        </div>

                        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                          <div className="text-[11px] text-emerald-700 font-semibold">PR completed</div>
                          <div className="text-lg font-bold text-emerald-800">{completedReviewsForFilter}</div>
                          <div className="text-[11px] text-emerald-700">
                            {prFilter === "this_month"
                              ? selectedMonthsForModal[0]
                              : prFilter === "last_month"
                                ? selectedMonthsForModal[0]
                                : selectedMonthsForModal.join(", ")}
                          </div>
                        </div>

                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                          <div className="text-[11px] text-gray-600 font-semibold">Overdue learners, overall</div>

                          <div className="mt-1 flex items-end justify-between gap-2">
                            <div className="text-lg font-bold text-gray-800">{overdueGeneralCount}</div>

                            <span className="text-[11px] font-semibold px-2 py-1 rounded-full border bg-white text-gray-700 border-gray-200">
                              {overallOverdueRate == null ? "—" : `${overallOverdueRate}%`}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl bg-white border border-gray-200 p-3">
                          <div className="text-[11px] text-gray-600 font-semibold">Overdue rate</div>
                          <div className="text-lg font-bold text-gray-800">
                            {overdueRateForFilter == null ? "—" : `${overdueRateForFilter}%`}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {prFilter === "this_month"
                              ? "This month"
                              : prFilter === "last_month"
                                ? "Last month"
                                : "Avg, last 3 months"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* List */}
                  <div className="lg:col-span-9">
                    <div className="space-y-2">
                      {filteredStudents.length > 0 ? (
                        filteredStudents.map((s) => {
                          const prDue = isPrDueThisPeriod(s);
                          const prCompleted = isPrCompletedThisPeriod(s);
                          const showPrCard = prDue || prCompleted;

                          const status =
                            s.overall >= 70
                              ? { label: "Good", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                              : s.overall >= 40
                                ? { label: "Need Attention", cls: "bg-amber-50 text-amber-700 border-amber-200" }
                                : { label: "Critical", cls: "bg-rose-50 text-rose-700 border-rose-200" };

                          const Progress = ({ value }: { value: number }) => (
                            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full bg-[#A880F7]" style={{ width: `${clamp01(value)}%` }} />
                            </div>
                          );

                          const studentDashboardUrl = (email?: string) => {
                            const base = "https://www.kentbusinesscollege.net/student_corner/";
                            if (!email) return base;
                            return `${base}?email=${encodeURIComponent(email)}`;
                          };

                          const progressReviewRaw = s.raw;
                          const hasProgressReviews = extractProgressReviews(progressReviewRaw).length > 0;

                          return (
                            <div
                              key={`${s.id}-${s.email}`}
                              className="rounded-2xl border border-violet-100 bg-violet-50/60 hover:bg-violet-50 transition px-4 py-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-violet-950 truncate">{s.fullName}</h4>
                                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${status.cls}`}>
                                      {status.label}
                                    </span>
                                  </div>

                                  <div className="mt-0.5 text-xs text-gray-600">
                                    <span className="font-medium">ID:</span> {s.id || "—"}
                                    <span className="mx-2 text-gray-300">•</span>
                                    <span className="truncate">{s.email || "—"}</span>
                                  </div>

                                  {/* Metrics */}
                                  <div
                                    className={[
                                      "mt-3 grid grid-cols-1 gap-3",
                                      showPrCard ? "sm:grid-cols-4" : "sm:grid-cols-3",
                                    ].join(" ")}
                                  >
                                    <div className="bg-white/70 rounded-xl p-3 border border-gray-100">
                                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span>Overall</span>
                                        <span className="font-semibold text-gray-800">{Math.round(s.overall)}%</span>
                                      </div>
                                      <Progress value={s.overall} />
                                    </div>

                                    <div className="bg-white/70 rounded-xl p-3 border border-gray-100">
                                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span>LMS</span>
                                        <span className="font-semibold text-gray-800">{Math.round(s.lmsProgress)}%</span>
                                      </div>
                                      <Progress value={s.lmsProgress} />
                                    </div>

                                    <div className="bg-white/70 rounded-xl p-3 border border-gray-100">
                                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span>APTEM</span>
                                        <span className="font-semibold text-gray-800">{Math.round(s.aptemProgress)}%</span>
                                      </div>
                                      <Progress value={s.aptemProgress} />
                                    </div>

                                    {prDue ? (
                                      <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                                        <div className="flex justify-between text-xs text-red-700 mb-1">
                                          <span className="font-semibold">PR Due</span>
                                          <span className="font-semibold">Now</span>
                                        </div>
                                        <div className="text-[11px] text-red-700">
                                          {selectedMonthsForModal.length ? selectedMonthsForModal.join(", ") : ""}
                                        </div>
                                      </div>
                                    ) : prCompleted ? (
                                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                        <div className="flex justify-between text-xs text-emerald-700 mb-1">
                                          <span className="font-semibold">PR Completed</span>
                                          {/* <span className="font-semibold">Done</span> */}
                                        </div>
                                        <div className="text-[11px] text-emerald-700">
                                          {selectedMonthsForModal.length ? selectedMonthsForModal.join(", ") : ""}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    onClick={() => {
                                      const url = studentDashboardUrl(s.email);
                                      window.open(url, "_blank", "noopener,noreferrer");
                                    }}
                                    className="
                                text-xs px-3 py-1.5 rounded-lg
                                border border-violet-300
                                text-violet-700
                                bg-white/60
                                hover:bg-violet-600 hover:text-white
                                transition
                              "
                                  >
                                    View dashboard
                                  </button>

                                  <button
                                    onClick={() => {
                                      setActiveStudent(s as any);
                                      setStudentsView("review");
                                    }}
                                    className={`
                                text-xs px-3 py-1.5 rounded-lg border
                                ${hasProgressReviews
                                        ? "border-[#CEA869] text-[#B27715] bg-white/60 hover:bg-[#B27715] hover:text-white"
                                        : "border-gray-300 text-gray-400 bg-white/50 cursor-not-allowed"
                                      }
                                transition
                              `}
                                    disabled={!hasProgressReviews}
                                    title={!hasProgressReviews ? "No Progress Review data" : "View Progress Review"}
                                  >
                                    Progress Review
                                  </button>

                                  <button
                                    onClick={() => handleLoadEvidence(s)}
                                    className="
                                text-xs px-3 py-1.5 rounded-lg
                                border border-blue-300
                                text-blue-700
                                bg-white/60
                                hover:bg-blue-600 hover:text-white
                                transition
                              "
                                  >
                                    Load evidences
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-gray-500 text-center mt-10">No students found</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                // ===================== Review Details View =====================
                <div className="space-y-4">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setStudentsView("list");
                      setActiveStudent(null);
                    }}
                    className="inline-flex items-center gap-2 text-sm text-violet-700 hover:text-violet-900"
                  >
                    <span className="text-lg">←</span>
                    Back to students
                  </button>

                  <div className="rounded-2xl border border-violet-100 bg-white/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-violet-950 truncate">
                          {activeStudent?.fullName || "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-600">
                          <span className="font-medium">ID:</span> {activeStudent?.id || "—"}
                          <span className="mx-2 text-gray-300">•</span>
                          <span className="truncate">{activeStudent?.email || "—"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs font-semibold text-gray-700 mb-2">Progress Review Details</div>

                      {(() => {
                        const raw = (activeStudent as any)?.raw;
                        const items = extractProgressReviews(raw);

                        const stForFlags: any = activeStudent;
                        const prDue = stForFlags ? isPrDueThisPeriod(stForFlags) : false;
                        const prCompleted = stForFlags ? isPrCompletedThisPeriod(stForFlags) : false;

                        if (!items.length) {
                          return <div className="text-sm text-gray-500">No Progress Review data available.</div>;
                        }

                        const lastPR = getLastProgressReview(items);

                        return (
                          <div className="space-y-2">
                            {/* Last PR Summary */}
                            {lastPR?.date ? (
                              <div className="mb-2 text-xs text-gray-700">
                                <span className="font-semibold">Last Progress Review:</span>{" "}
                                <span className="font-medium">{lastPR.date}</span>

                                {lastPR.status ? (
                                  <>
                                    <span className="mx-2 text-gray-300">•</span>
                                    <span
                                      className={[
                                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                                        prStatusBadgeClass(lastPR.status),
                                      ].join(" ")}
                                    >
                                      {lastPR.status}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            ) : (
                              <div className="mb-2 text-xs text-gray-500">Last Progress Review: —</div>
                            )}

                            {/* List */}
                            {items.map((it) => (
                              <div
                                key={it.key}
                                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white/70 px-3 py-2"
                              >
                                <div className="text-xs font-medium text-gray-700">{it.key}</div>

                                <div className="text-xs text-gray-600 truncate">
                                  {it.date ? <span className="mr-2">{it.date}</span> : null}

                                  {it.status ? (
                                    <span
                                      className={[
                                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                                        prStatusBadgeClass(it.status),
                                      ].join(" ")}
                                    >
                                      {!prDue && prCompleted && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                                          PR Completed
                                        </span>
                                      )}
                                      {it.status}
                                    </span>
                                  ) : (
                                    <span className="text-gray-500">{it.raw || "—"}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div >
  );
}
