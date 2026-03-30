import React, { useEffect, useMemo, useState } from "react";

/* ================= TYPES ================= */

type Student = {
    id: string;
    fullName: string;
    email: string;
};

type MeetingSubjectMap = Record<string, string[] | null> | null;

type CoachUpcomingMeeting = {
    date?: string; // "2026-03-02"
    timeFrom?: string; // "09:30"
    timeTo?: string; // "11:00"
    serviceName?: string; // "Coaching with Omar Badr - Emma Rannard"
    customerName?: string;
    coachName?: string;
    joinWebUrl?: string;
};

type CoachUpcomingPayload =
    | { meetings?: CoachUpcomingMeeting[] }
    | CoachUpcomingMeeting[]
    | string
    | null
    | undefined;

type Props = {
    students: Student[];
    meetingSubject?: MeetingSubjectMap;

    /**
     * Optional extra source (schema-agnostic):
     * - could be: calendar_events_jsonb (map or array),
     * - or any wrapper that contains array under value/data/body/items, etc.
     */
    extraSource?: any;

    // Coach-level upcoming sessions
    coachUpcomingSessions?: CoachUpcomingPayload;
};

/* ================= HELPERS ================= */

const pad2 = (n: number) => String(n).padStart(2, "0");
const monthKeyFromDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const safeArr = <T,>(v: any): T[] => (Array.isArray(v) ? v : []);
const safeStr = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));

const parseMaybeJson = (v: any): any => {
    if (typeof v !== "string") return v;
    try {
        return JSON.parse(v);
    } catch {
        return v;
    }
};

type UpcomingSession = {
    date: string;
    display?: string;
    serviceType?: string;
};

const pickISODate = (v: any): string | null => {
    const s = typeof v === "string" ? v : v == null ? "" : String(v);

    // YYYY-MM-DD
    const m1 = s.match(/(\d{4}-\d{2}-\d{2})/);
    if (m1?.[1]) return m1[1];

    // DD/MM/YYYY -> YYYY-MM-DD
    const m2 = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;

    return null;
};

function pickNextUpcomingInfo(
  list: UpcomingSession[],
  month: string,
  sessionType: SessionTypeKey
) {
  if (!list.length) return null;

  const sorted = list.slice().sort((a, b) => a.date.localeCompare(b.date));

  const inMonth = sorted.filter((x) => x.date.startsWith(month));

  const filtered =
    sessionType === "all"
      ? inMonth
      : inMonth.filter((x) => {
          if (sessionType === "support") return x.serviceType === "Support session";
          if (sessionType === "coaching") return x.serviceType === "Coaching session";
          if (sessionType === "progress") return x.serviceType === "Progress review";
          return true;
        });

  const best = filtered[0];
  if (!best) return null;

  return {
    display: best.display ?? best.date ?? "",
    serviceType: best.serviceType ?? "Session",
  };
}

function norm(s: string) {
    return String(s || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}@.\s-]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokensFromText(s: string): string[] {
    const t = norm(s);
    const raw = t.split(/[\s\-_.@]+/g).map((x) => x.trim());
    const stop = new Set(["div", "span", "html", "body"]);
    return raw.filter((x) => x.length >= 3 && !stop.has(x));
}

function emailLocalTokens(email: string): string[] {
    const e = norm(email);
    const local = (e.split("@")[0] ?? "").trim();
    return tokensFromText(local);
}

function normalizeCoachUpcoming(input: CoachUpcomingPayload): CoachUpcomingMeeting[] {
    const data = parseMaybeJson(input);

    if (!data) return [];
    if (Array.isArray(data)) return data as CoachUpcomingMeeting[];

    if (typeof data === "object") {
        const m = (data as any).meetings ?? (data as any).Meetings ?? null;
        if (Array.isArray(m)) return m as CoachUpcomingMeeting[];
    }

    return [];
}

function extractServiceType(serviceName: string) {
    const s = safeStr(serviceName).toLowerCase();

    if (s.includes("progress review")) return "Progress review";
    if (s.includes("support")) return "Support session";
    if (s.includes("coaching")) return "Coaching session";

    // fallback: أول جزء قبل dash
    const head = safeStr(serviceName).split(" - ")[0]?.trim();
    return head || "Session";
}

/* ================= SUBJECT PARSING ================= */

function extractLearnerFromSubject(subject: string): string {
    const s = safeStr(subject);

    if (!s) return "";
    const low = s.toLowerCase();
    if (s.includes("<") || low.includes("div/div")) return "";

    const dashParts = s.split(" - ").map((x) => x.trim()).filter(Boolean);
    if (dashParts.length >= 2) return dashParts[dashParts.length - 1] ?? "";

    const parts2 = s.split("-").map((x) => x.trim()).filter(Boolean);
    if (parts2.length >= 2) return parts2[parts2.length - 1] ?? "";

    return s.trim();
}

type SessionTypeKey = "all" | "support" | "coaching" | "progress";

function detectSessionType(subject: string): SessionTypeKey {
    const s = safeStr(subject).toLowerCase();

    if (s.includes("progress review")) return "progress";
    if (s.includes("support session")) return "support";
    if (s.includes("coaching session") || s.includes("coaching")) return "coaching";

    return "all";
}

function sessionTypeLabel(t: SessionTypeKey) {
    if (t === "support") return "Support sessions";
    if (t === "coaching") return "Coaching sessions";
    if (t === "progress") return "Progress reviews";
    return "All session types";
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
    const ref = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (!open) return;

        const onDown = (e: MouseEvent) => {
            if (!ref.current) return;
            if (!ref.current.contains(e.target as Node)) setOpen(false);
        };

        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open, setOpen]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(!open)}
                className="
          w-full h-10 px-3
          bg-white rounded-xl
          border border-[#E9E2F7]
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

/* ================= MATCHING ================= */

function addTokenWithPrefixes(set: Set<string>, tok: string) {
    const t = (tok ?? "").trim();
    if (!t) return;

    set.add(t);
    if (t.length >= 3) set.add(t.slice(0, 3));
    if (t.length >= 4) set.add(t.slice(0, 4));
}

function makeTokenSetFromText(s: string): Set<string> {
    const out = new Set<string>();
    for (const tok of tokensFromText(s)) addTokenWithPrefixes(out, tok);
    return out;
}

function buildStudentIndex(students: Student[]) {
    const byEmail = new Map<string, Student>();
    const tokenPoolById = new Map<string, Set<string>>();

    const getId = (st: Student) => String(st.id || st.email || st.fullName);

    for (const st of students) {
        const em = norm(st.email);
        if (em) byEmail.set(em, st);

        const id = getId(st);
        const set = new Set<string>();

        for (const t of tokensFromText(st.fullName)) addTokenWithPrefixes(set, t);
        for (const t of emailLocalTokens(st.email)) addTokenWithPrefixes(set, t);

        tokenPoolById.set(id, set);
    }

    return { byEmail, tokenPoolById };
}

function matchStudentSoft(subject: string, idx: ReturnType<typeof buildStudentIndex>, students: Student[]) {
    const subNorm = norm(subject);

    // email inside subject
    for (const [emailKey, st] of idx.byEmail.entries()) {
        if (emailKey && subNorm.includes(emailKey)) return st;
    }

    const candidateRaw = extractLearnerFromSubject(subject);
    if (!candidateRaw) return null;

    const candNorm = norm(candidateRaw);
    if (!candNorm) return null;

    // exact full name
    for (const st of students) {
        if (norm(st.fullName) === candNorm) return st;
    }

    // contains match
    for (const st of students) {
        const fn = norm(st.fullName);
        if (fn && (fn.includes(candNorm) || candNorm.includes(fn))) return st;
    }

    // token overlap
    const candSet = makeTokenSetFromText(candidateRaw);
    if (candSet.size === 0) return null;

    const candTokens = tokensFromText(candidateRaw);

    let best: { st: Student; score: number } | null = null;
    const getId = (st: Student) => String(st.id || st.email || st.fullName);

    for (const st of students) {
        const id = getId(st);
        const pool = idx.tokenPoolById.get(id);
        if (!pool || pool.size === 0) continue;

        let score = 0;
        for (const tok of candSet) {
            if (pool.has(tok)) score++;
        }

        const ok = candTokens.length >= 2 ? score >= 2 : score >= 1 && (candTokens[0]?.length ?? 0) >= 4;
        if (!ok) continue;

        if (!best || score > best.score) best = { st, score };
    }

    return best?.st ?? null;
}

/* ================= SCHEMA-AGNOSTIC NORMALIZER ================= */

type SubjectsByDate = Record<string, string[]>;

const dateKeyFromAny = (v: any): string | null => {
    const s = typeof v === "string" ? v : v == null ? "" : String(v);
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    return m?.[1] ?? null;
};

const subjectFromAny = (e: any): string => {
    if (!e) return "";
    const candidates = [
        e.subject,
        e.meeting_subject,
        e.meetingSubject,
        e.meetingSubjectText,
        e.title,
        e.summary,
        e.topic,
        e.name,
        e.serviceName,
        e.customerName,
    ];

    for (const c of candidates) {
        if (typeof c === "string" && c.trim()) return c.trim();
    }

    const nested = e.data?.subject ?? e.payload?.subject ?? e.body?.subject ?? e?.resource?.subject;
    if (typeof nested === "string" && nested.trim()) return nested.trim();

    return "";
};

const normalizeToSubjectsByDate = (input: any): SubjectsByDate => {
    const out: SubjectsByDate = {};

    const push = (dateKey: string | null, subject: string) => {
        if (!dateKey) return;
        const s = (subject ?? "").trim();
        if (!s) return;
        (out[dateKey] ??= []).push(s);
    };

    // Case 1: map with date keys
    if (input && typeof input === "object" && !Array.isArray(input)) {
        const keys = Object.keys(input);
        const looksLikeDateMap = keys.some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
        if (looksLikeDateMap) {
            for (const k of keys) {
                const v = (input as any)[k];

                if (Array.isArray(v)) {
                    for (const raw of v) push(k, typeof raw === "string" ? raw : String(raw ?? ""));
                    continue;
                }

                if (typeof v === "string") {
                    push(k, v);
                    continue;
                }

                if (v && typeof v === "object") {
                    const arr = v.value ?? v.data?.value ?? v.body?.value ?? v.items ?? v.data ?? null;
                    if (Array.isArray(arr)) {
                        for (const ev of arr) push(k, subjectFromAny(ev));
                        continue;
                    }
                    push(k, subjectFromAny(v));
                }
            }
            return out;
        }
    }

    // Case 2: array of events
    if (Array.isArray(input)) {
        for (const ev of input) {
            const dk =
                dateKeyFromAny(ev?.dateKey) ??
                dateKeyFromAny(ev?.date) ??
                dateKeyFromAny(ev?.start) ??
                dateKeyFromAny(ev?.startDateTime) ??
                dateKeyFromAny(ev?.start?.dateTime) ??
                dateKeyFromAny(ev?.createdAt);

            push(dk, subjectFromAny(ev));
        }
        return out;
    }

    // Case 3: object wrapping array somewhere
    const arr = input?.value ?? input?.data?.value ?? input?.body?.value ?? input?.items ?? input?.data ?? null;
    if (Array.isArray(arr)) return normalizeToSubjectsByDate(arr);

    return out;
};

/* ================= UI HELPERS ================= */

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-full border border-[#E9E2F7] bg-[#F9F5FF] px-2.5 py-1 text-xs font-medium text-[#241453]">
            {children}
        </span>
    );
}

function CountPill({ n, tone = "gold" }: { n: number; tone?: "gold" | "purple" | "gray" }) {
    const cls =
        tone === "gold"
            ? "bg-[#FFF6E8] text-[#B27715] border-[#F3E3C8]"
            : tone === "purple"
                ? "bg-[#F9F5FF] text-[#241453] border-[#E9E2F7]"
                : "bg-gray-50 text-gray-700 border-gray-200";

    return (
        <span
            className={`inline-flex h-5 min-w-[28px] items-center justify-center rounded-full border px-2 text-[11px] font-semibold ${cls}`}
        >
            {n}
        </span>
    );
}

function Panel({
    title,
    count,
    children,
    heightClass = "h-[560px]",
}: {
    title: string;
    count: number;
    children: React.ReactNode;
    heightClass?: string;
}) {
    return (
        <div className={["rounded-2xl border border-[#E9E2F7] bg-white shadow-sm flex flex-col", heightClass].join(" ")}>
            <div className="px-4 py-3 border-b border-[#F1EAFB] bg-gradient-to-r from-[#F9F5FF] to-white rounded-t-2xl flex items-center justify-between">
                <div className="text-sm font-semibold text-[#241453]">{title}</div>
                <CountPill n={count} />
            </div>
            <div className="p-3 flex-1 overflow-y-auto custom-scroll">{children}</div>
        </div>
    );
}

/* ================= COMPONENT ================= */

export default function MonthlySessionsWithLearners({
    students,
    meetingSubject,
    extraSource,
    coachUpcomingSessions,
}: Props) {
    const [month, setMonth] = useState<string>(() => monthKeyFromDate(new Date()));
    const [sessionType, setSessionType] = useState<SessionTypeKey>("all");

    const [monthOpen, setMonthOpen] = useState(false);
    const [typeOpen, setTypeOpen] = useState(false);

    const studentIndex = useMemo(() => buildStudentIndex(students), [students]);

    const byDate = useMemo(() => {
        const a = normalizeToSubjectsByDate(meetingSubject);
        const b = normalizeToSubjectsByDate(extraSource);

        const merged: SubjectsByDate = { ...a };
        for (const [k, list] of Object.entries(b)) {
            (merged[k] ??= []).push(...list);
        }
        return merged;
    }, [meetingSubject, extraSource]);

    const coachMeetings = useMemo(
        () => normalizeCoachUpcoming(coachUpcomingSessions),
        [coachUpcomingSessions]
    );

    const availableMonths = useMemo(() => {
        const months = new Set<string>();

        // A) months from sessions (byDate)
        for (const k of Object.keys(byDate)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(k)) months.add(k.slice(0, 7));
        }

        // B) months from upcoming (coachUpcomingSessions)
        for (const m of coachMeetings) {
            const d = pickISODate(m?.date);
            if (d) months.add(d.slice(0, 7));
        }

        const arr = Array.from(months);
        if (arr.length === 0) return [monthKeyFromDate(new Date())];

        return arr.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    }, [byDate, coachMeetings]);

    const availableSessionTypes = useMemo(() => {
        const set = new Set<SessionTypeKey>();

        for (const [dateKey, list] of Object.entries(byDate)) {
            if (!dateKey.startsWith(month)) continue;

            for (const raw of safeArr<string>(list)) {
                const subject = safeStr(raw).trim();
                if (!subject) continue;

                const t = detectSessionType(subject);
                if (t !== "all") set.add(t);
            }
        }

        return (["all", ...Array.from(set)] as SessionTypeKey[]);
    }, [byDate, month]);

    const monthOptions = useMemo(() => availableMonths.map((m) => ({ value: m, label: m })), [availableMonths]);

    const monthLabel = useMemo(() => {
        return monthOptions.find((o) => o.value === month)?.label ?? (monthOptions[0]?.label ?? "—");
    }, [monthOptions, month]);

    const typeOptions = useMemo(
        () => availableSessionTypes.map((t) => ({ value: t, label: sessionTypeLabel(t) })),
        [availableSessionTypes]
    );

    const typeLabel = useMemo(() => {
        return typeOptions.find((o) => o.value === sessionType)?.label ?? "All session types";
    }, [typeOptions, sessionType]);

    useEffect(() => {
        if (sessionType !== "all" && !availableSessionTypes.includes(sessionType)) {
            setSessionType("all");
        }
    }, [availableSessionTypes, sessionType]);

    useEffect(() => {
        if (!availableMonths.includes(month)) {
            setMonth(availableMonths[0] ?? monthKeyFromDate(new Date()));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableMonths.join("|")]);

    const computed = useMemo(() => {
        const byId = new Map<
            string,
            {
                student: Student;
                count: number;
                subjects: Record<string, { count: number }>;
                lastDate: string | null;
            }
        >();

        const unmatched = new Map<
            string,
            {
                key: string;
                count: number;
                examples: string[];
            }
        >();

        const getId = (st: Student) => String(st.id || st.email || st.fullName);

        const ensure = (st: Student) => {
            const id = getId(st);
            let rec = byId.get(id);
            if (!rec) {
                rec = { student: st, count: 0, subjects: {}, lastDate: null };
                byId.set(id, rec);
            }
            return rec;
        };

        const pushUnmatched = (subject: string) => {
            const extracted = extractLearnerFromSubject(subject);
            const k = extracted ? extracted : "Unknown / Junk";
            const cur = unmatched.get(k);
            if (cur) {
                cur.count += 1;
                if (cur.examples.length < 3 && !cur.examples.includes(subject)) cur.examples.push(subject);
            } else {
                unmatched.set(k, { key: k, count: 1, examples: [subject] });
            }
        };

        // sessions from unified byDate
        for (const [dateKey, list] of Object.entries(byDate)) {
            if (!dateKey.startsWith(month)) continue;

            const subjects = safeArr<string>(list);
            for (const raw of subjects) {
                const subject = safeStr(raw).trim();
                if (!subject) continue;

                if (subject.toLowerCase().includes("div/div") || subject.includes("<")) {
                    pushUnmatched(subject);
                    continue;
                }

                if (sessionType !== "all") {
                    const t = detectSessionType(subject);
                    if (t !== sessionType) continue;
                }

                const st = matchStudentSoft(subject, studentIndex, students);
                if (!st) {
                    pushUnmatched(subject);
                    continue;
                }

                const rec = ensure(st);
                rec.count += 1;

                if (!rec.lastDate || dateKey > rec.lastDate) rec.lastDate = dateKey;

                const key = subject;
                if (!rec.subjects[key]) rec.subjects[key] = { count: 0 };
                rec.subjects[key].count += 1;
            }
        }

        // upcoming per student from coachUpcomingSessions
        // upcoming per student from coachUpcomingSessions
        const upcomingById = new Map<string, UpcomingSession[]>();
        const coachMeetings = normalizeCoachUpcoming(coachUpcomingSessions);

        for (const m of coachMeetings) {
            // 1) robust date, مش date بس
            const date =
                pickISODate((m as any)?.date) ??
                pickISODate((m as any)?.start) ??
                pickISODate((m as any)?.startDateTime) ??
                pickISODate((m as any)?.start?.dateTime);

            if (!date) continue;

            // 2) subject fallback, مش serviceName بس
            const subject = safeStr(
                (m as any)?.serviceName ||
                (m as any)?.customerName ||      // مهم جدا
                (m as any)?.subject ||
                (m as any)?.title
            ).trim();

            if (!subject) continue;

            // 3) match, جربي serviceName, وبعدين customerName
            const st =
                matchStudentSoft(subject, studentIndex, students) ||
                matchStudentSoft(safeStr((m as any)?.customerName), studentIndex, students);

            if (!st) continue;

            const id = String(st.id || st.email || st.fullName);

            const tf = safeStr((m as any)?.timeFrom).trim();
            const tt = safeStr((m as any)?.timeTo).trim();
            const display = tf && tt ? `${date} (${tf}-${tt})` : date;

            const serviceType = extractServiceType(subject);

            // filter by selected session type
            if (sessionType !== "all") {
                const typeMap: Record<string, SessionTypeKey> = {
                    "Support session": "support",
                    "Coaching session": "coaching",
                    "Progress review": "progress",
                };

                const mapped = typeMap[serviceType] ?? "all";

                if (mapped !== sessionType) continue;
            }

            const arr = upcomingById.get(id) ?? [];
            arr.push({ date, display, serviceType });
            upcomingById.set(id, arr);
        }

        for (const [id, arr] of upcomingById.entries()) {
            const uniq = new Map<string, UpcomingSession>();
            for (const s of arr) if (!uniq.has(s.date)) uniq.set(s.date, s);
            upcomingById.set(id, Array.from(uniq.values()).sort((a, b) => a.date.localeCompare(b.date)));
        }

        const all = students.map((st) => {
            const id = getId(st);
            const rec = byId.get(id);
            const total = rec?.count ?? 0;

            const subjectLines = Object.entries(rec?.subjects ?? {})
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 3)
                .map(([subject, meta]) => ({ subject, count: meta.count }));

            const upcoming = upcomingById.get(id) ?? [];
            const nextUpcoming = pickNextUpcomingInfo(upcoming, month, sessionType);

            return { student: st, total, subjectLines, lastDate: rec?.lastDate ?? null, nextUpcoming };
        });

        const withSessions = all.filter((x) => x.total > 0).sort((a, b) => b.total - a.total);

        const bookedUpcomingOnly = all
            .filter((x) => x.total === 0 && !!x.nextUpcoming)
            .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));

        const noSessionsNoUpcoming = all
            .filter((x) => x.total === 0 && !x.nextUpcoming)
            .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));

        const totalSessions = withSessions.reduce((sum, x) => sum + x.total, 0);
        const unmatchedList = Array.from(unmatched.values()).sort((a, b) => b.count - a.count);

        return { withSessions, bookedUpcomingOnly, noSessionsNoUpcoming, totalSessions, unmatchedList };
    }, [byDate, month, studentIndex, students, sessionType, coachUpcomingSessions]);

    return (
        <div id="report-area" className="bg-white rounded-2xl shadow-sm p-4 border border-[#F1EAFB]">
            {/* Header */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-semibold text-[#241453]">
                            Monthly coaching meetings <span className="font-medium text-[#B27715]">"MCM"</span>
                            <span className="ml-2 text-[#442F73]">({month})</span>
                        </h3>
                    </div>
                </div>

                {/* Right side controls */}
                <div className="w-full lg:w-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap lg:justify-end">
                    {/* Month */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-xs text-[#442F73] shrink-0">Month</span>
                        <div className="w-full sm:w-[160px]">
                            <CustomSelect
                                value={month}
                                label={monthLabel}
                                open={monthOpen}
                                setOpen={(v) => {
                                    setMonthOpen(v);
                                    if (v) setTypeOpen(false);
                                }}
                                options={monthOptions}
                                onChange={(val) => setMonth(val)}
                            />
                        </div>
                    </div>

                    {/* Type */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-xs text-[#442F73] shrink-0">Session type</span>
                        <div className="w-full sm:w-[220px]">
                            <CustomSelect
                                value={sessionType}
                                label={typeLabel}
                                open={typeOpen}
                                setOpen={(v) => {
                                    setTypeOpen(v);
                                    if (v) setMonthOpen(false);
                                }}
                                options={typeOptions}
                                onChange={(val) => setSessionType(val)}
                            />
                        </div>
                    </div>

                    {/* Chips */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Chip>
                            Total sessions <span className="ml-2 font-semibold text-[#B27715]">{computed.totalSessions}</span>
                        </Chip>

                        <Chip>
                            Learners with sessions{" "}
                            <span className="ml-2 font-semibold text-[#B27715]">{computed.withSessions.length}</span>
                        </Chip>
                    </div>
                </div>
            </div>

            {/* Panels (4 equal) */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                {/* With sessions */}
                <div className="lg:col-span-3">
                    <Panel title="With sessions (Students have sessions this month)" count={computed.withSessions.length}>
                        {computed.withSessions.length === 0 ? (
                            <div className="text-sm text-gray-400">No learners with sessions this month.</div>
                        ) : (
                            <div className="space-y-2">
                                {computed.withSessions.map((x) => {
                                    const st = x.student;
                                    return (
                                        <div
                                            key={st.id || st.email}
                                            className="border border-gray-100 rounded-xl p-3 hover:border-[#E9E2F7] hover:bg-[#FCFAFF] transition"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                    <div className="text-sm font-semibold text-gray-800 truncate">{st.fullName}</div>

                                                    {x.lastDate ? (
                                                        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-[#F9F5FF] text-[#442F73] border-[#E9E2F7]">
                                                            {x.lastDate}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">
                                                    x{x.total}
                                                </span>
                                            </div>

                                            <div className="text-xs text-gray-500 mt-0.5 truncate">{st.email || "—"}</div>

                                            {x.subjectLines?.length ? (
                                                <div className="mt-2 space-y-1">
                                                    {x.subjectLines.map((s, idx2) => (
                                                        <div key={idx2} className="text-xs text-gray-600 truncate">
                                                            <span className="font-medium">x{s.count}</span>
                                                            <span className="text-gray-400"> • </span>
                                                            {s.subject}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Panel>
                </div>

                {/* Booked upcoming only */}
                <div className="lg:col-span-3">
                    <Panel title="Booked upcoming (No sessions yet, but booked a session)" count={computed.bookedUpcomingOnly.length}>
                        {computed.bookedUpcomingOnly.length === 0 ? (
                            <div className="text-sm text-gray-400">No learners booked upcoming sessions.</div>
                        ) : (
                            <div className="space-y-2">
                                {computed.bookedUpcomingOnly.map((x) => (
                                    <div
                                        key={x.student.id || x.student.email}
                                        className="border border-gray-100 rounded-xl p-3 hover:border-[#E9E2F7] hover:bg-[#FCFAFF] transition"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-[#241453] leading-5 break-words">{x.student.fullName}</div>
                                                <div className="text-xs text-gray-500 mt-0.5 truncate">{x.student.email || "—"}</div>
                                            </div>

                                            {x.nextUpcoming ? (
                                                <div className="shrink-0 flex flex-col items-end gap-1">
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-[#FFF6E8] text-[#B27715] border-[#F3E3C8]">
                                                        {x.nextUpcoming.serviceType}
                                                    </span>

                                                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-[#F9F5FF] text-[#442F73] border-[#E9E2F7]">
                                                        {x.nextUpcoming.display}
                                                    </span>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                </div>

                {/* No sessions and no upcoming */}
                <div className="lg:col-span-3">
                    <Panel title="No sessions (No sessions and no upcoming booking)" count={computed.noSessionsNoUpcoming.length}>
                        {computed.noSessionsNoUpcoming.length === 0 ? (
                            <div className="text-sm text-gray-400">All learners either had sessions or booked upcoming ✅</div>
                        ) : (
                            <div className="space-y-2">
                                {computed.noSessionsNoUpcoming.map((x) => (
                                    <div
                                        key={x.student.id || x.student.email}
                                        className="border border-gray-100 rounded-xl p-3 hover:border-[#E9E2F7] hover:bg-[#FCFAFF] transition"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-[#241453] truncate">{x.student.fullName}</div>
                                            <div className="text-xs text-gray-500 mt-0.5 truncate">{x.student.email || "—"}</div>
                                        </div>

                                        <div className="text-[11px] mt-2 text-red-600">No sessions, no upcoming booking</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                </div>

                {/* Unmatched */}
                <div className="lg:col-span-3">
                    <Panel
                        title="Unmatched students (Students may don't match students with coach)"
                        count={computed.unmatchedList.length}
                    >
                        {computed.unmatchedList.length === 0 ? (
                            <div className="text-sm text-gray-400">All students matched ✅</div>
                        ) : (
                            <div className="space-y-2">
                                {computed.unmatchedList.map((u) => (
                                    <div
                                        key={u.key}
                                        className="border border-gray-100 rounded-xl p-3 hover:border-[#E9E2F7] hover:bg-[#FCFAFF] transition"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-[#241453] truncate">{u.key}</div>
                                            </div>
                                            <CountPill n={u.count} tone="gray" />
                                        </div>

                                        {u.examples?.length ? (
                                            <div className="mt-2 space-y-1">
                                                {u.examples.map((ex, i) => (
                                                    <div key={i} className="text-xs text-gray-600 truncate">
                                                        {ex}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                </div>
            </div>
        </div>
    );
}