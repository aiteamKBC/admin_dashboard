import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import type { Meeting } from "../../types/meetings";
import { fetchAllCoachesAnalytics, getCachedCoachesAnalytics, isCacheFresh } from "../../api";
import WeekTimeGrid from "./WeekTimeGrid";
import MonthGrid from "./MonthGrid";

type Coach = { id: number; case_owner: string };

type RawUpcomingMeeting = {
  date?: string;
  timeFrom?: string;
  timeTo?: string;
  serviceName?: string;
  customerName?: string;
  meetingId?: string;
  joinWebUrl?: string | null;
};

type RawDbCalendarEvent = {
  id?: string;
  start?: string; // "2026-02-03T12:00:00.0000000"
  end?: string;   // "2026-02-03T13:00:00.0000000"
  date?: string;  // optional
  subject?: string;
  duration_min?: number;
  joinWebUrl?: string | null;
};

const s = (v: unknown) => (v == null ? "" : String(v));

const pad2 = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const startOfWeekMonday = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // Mon=0
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const toDateKey = (v: unknown) => {
  const m = String(v ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
};

const toHHMM = (v: unknown) => {
  const m = String(v ?? "").match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
};

export default function BookingsCalendarPage({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const [calOpen, setCalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);

  // search coach name
  const [coachQuery, setCoachQuery] = useState("");

  // selected coaches
  const [selectedCoachIds, setSelectedCoachIds] = useState<Set<number>>(new Set());

  // week navigation
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));

  type ViewMode = "workweek" | "week" | "month";
  const [view, setView] = useState<ViewMode>("workweek");

  const shouldHideCoach = (name: string) => {
    const n = (name ?? "").trim().toLowerCase();

    if (!n) return true;

    // hide "Coach 1234"
    if (/^coach\s*\d+$/.test(n)) return true;

    // hide API rows like "API Do Not Delete"
    if (n.includes("api")) return true;

    // hide Phone1 / Phone2
    if (/^phone[12]$/.test(n)) return true;

    return false;
  };

  const processRows = (rawData: any[]) => {
    const rows: any[] = Array.isArray(rawData) ? rawData : [];
    const role = localStorage.getItem("role");
    const username = localStorage.getItem("username");

    const hasCalendarEvents = rows.some((r) => {
      const ce = r?.calendar_events;
      return ce && typeof ce === "object" && Object.keys(ce).length > 0;
    });

    const list: Coach[] = rows
      .map((r: any, idx: number) => {
        const rawId = Number(r?.case_owner_id ?? r?.id);
        const id = Number.isFinite(rawId) && rawId > 0 ? rawId : idx + 1;
        const name = s(r?.case_owner).trim() || `Coach ${id}`;
        return { id, case_owner: name };
      })
      .filter((c) => Boolean(c.case_owner))
      .filter((c) => !shouldHideCoach(c.case_owner))
      .sort((a, b) => a.case_owner.localeCompare(b.case_owner, "en", { sensitivity: "base" }));

    const filteredList =
      role === "coach" && username
        ? list.filter((c) => c.case_owner === username)
        : list;

    const meetings: Meeting[] = [];

    if (hasCalendarEvents) {
      for (const r of rows) {
        const coachIdRaw = Number(r?.case_owner_id ?? r?.id);
        const coachId = Number.isFinite(coachIdRaw) ? coachIdRaw : undefined;
        const coachName = s(r?.case_owner).trim() || (coachId ? `Coach ${coachId}` : "Coach");
        const ce = (r?.calendar_events ?? {}) as Record<string, RawDbCalendarEvent[]>;

        for (const [dayKey, events] of Object.entries(ce)) {
          if (!Array.isArray(events)) continue;
          for (const ev of events) {
            const date = toDateKey(ev?.date ?? dayKey);
            if (!date) continue;
            const svcName = s(ev?.subject);
            if (/^phone[12]$/i.test(svcName.trim())) continue;
            meetings.push({
              date, timeFrom: toHHMM(ev?.start), timeTo: toHHMM(ev?.end),
              serviceName: svcName, customerName: "", meetingId: s(ev?.id),
              joinWebUrl: (ev?.joinWebUrl ?? null) as any, coachId, coachName,
            });
          }
        }
      }
    } else {
      for (const r of rows) {
        if (!Array.isArray(r?.upcomming_sessions?.meetings)) continue;
        const coachIdRaw = Number(r?.id);
        const coachId = Number.isFinite(coachIdRaw) ? coachIdRaw : undefined;
        const coachName = s(r?.case_owner).trim() || (coachId ? `Coach ${coachId}` : "Coach");

        for (const m of r.upcomming_sessions.meetings as RawUpcomingMeeting[]) {
          const date = toDateKey(m?.date);
          if (!date) continue;
          const svcName = s(m?.serviceName);
          if (/^phone[12]$/i.test(svcName.trim())) continue;
          meetings.push({
            date, timeFrom: s(m?.timeFrom), timeTo: s(m?.timeTo),
            serviceName: svcName, customerName: s(m?.customerName),
            meetingId: s(m?.meetingId), joinWebUrl: (m?.joinWebUrl ?? null) as any,
            coachId, coachName,
          });
        }
      }
    }

    return { filteredList, meetings };
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setError(null);

      // 1. Show cache immediately — no loading delay
      const cached = getCachedCoachesAnalytics();
      if (cached) {
        const { filteredList, meetings } = processRows(cached);
        if (mounted) {
          setCoaches(filteredList);
          setAllMeetings(meetings);
          setSelectedCoachIds(new Set(filteredList.length ? [filteredList[0]!.id] : []));
          setLoading(false);
        }
        if (isCacheFresh()) return; // fresh enough — skip network call
      } else {
        setLoading(true);
      }

      // 2. Fetch fresh (2 fast retries, 1s apart)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const data = await fetchAllCoachesAnalytics();
          const { filteredList, meetings } = processRows(data);
          if (!mounted) return;
          setCoaches(filteredList);
          setAllMeetings(meetings);
          setSelectedCoachIds(new Set(filteredList.length ? [filteredList[0]!.id] : []));
          setLoading(false);
          setError(null);
          return;
        } catch {
          if (attempt < 1) await new Promise((r) => setTimeout(r, 1000));
        }
      }

      // 3. All failed — keep cached data silently; else show error
      if (!mounted) return;
      if (!cached) {
        setError("Failed to load calendar data");
        setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [retryKey]);

  const filteredCoaches = useMemo(() => {
    const q = coachQuery.trim().toLowerCase();
    if (!q) return coaches;
    return coaches.filter((c) => c.case_owner.toLowerCase().includes(q));
  }, [coaches, coachQuery]);

  const filteredMeetings = useMemo(() => {
    if (!selectedCoachIds.size) return [];
    return allMeetings.filter((m) => m.coachId && selectedCoachIds.has(m.coachId));
  }, [allMeetings, selectedCoachIds]);

  const weekMeetings = useMemo(() => {
    const start = toISO(weekStart);
    const days = view === "week" ? 7 : 5;
    const end = toISO(addDays(weekStart, days));
    return filteredMeetings.filter((m) => m.date >= start && m.date < end);
  }, [filteredMeetings, weekStart, view]);

  const titleRange = useMemo(() => {
    const end = addDays(weekStart, view === "week" ? 6 : 4);
    const monthName = weekStart.toLocaleDateString("en-GB", { month: "long" });
    return `${monthName} ${weekStart.getDate()}–${end.getDate()}, ${weekStart.getFullYear()}`;
  }, [weekStart, view]);

  const toggleCoach = (id: number) => {
    setSelectedCoachIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

    // close calendar on mobile after selecting a coach
    setCalOpen(false);
  };

  const selectAll = () => setSelectedCoachIds(new Set(coaches.map((c) => c.id)));
  const clearAll = () => setSelectedCoachIds(new Set());

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Top bar */}
      <div className="px-4 py-3 border-b flex items-center gap-3">
        {/* Main sidebar toggle — matches the xl:hidden pattern of other pages */}
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            className="xl:hidden w-10 h-10 rounded-xl border border-gray-200 hover:bg-gray-50 transition flex items-center justify-center text-[#442F73] bg-[#E4E4E4]"
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            ☰
          </button>
        )}

        <div className="font-semibold text-[#241453]">calendar</div>

        {/* Coaches list toggle — visible below lg */}
        <button
          type="button"
          onClick={() => setCalOpen(true)}
          className="lg:hidden w-9 h-9 rounded-lg border border-[#644D93]/30 hover:bg-[#F9F5FF] transition flex items-center justify-center text-[#644D93] bg-[#F4F0FC]"
          aria-label="Show coaches"
          title="Show coaches"
        >
          <Users className="w-4 h-4" />
        </button>


        <div className="flex-1">
          <input
            value={coachQuery}
            onChange={(e) => setCoachQuery(e.target.value)}
            placeholder="Search coach name..."
            className="w-full bg-[#F7F8FB] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#644D93]/30"
            type="text"
          />
        </div>

        <div className="text-xs text-gray-500 flex items-center gap-2">
          {loading ? "Loading…" : error ? (
            <>
              <span className="text-rose-600">{error}</span>
              <button
                onClick={() => setRetryKey((k) => k + 1)}
                className="px-2 py-0.5 text-xs font-medium text-white bg-[#644D93] rounded hover:bg-[#4f3a75] transition"
              >
                Retry
              </button>
            </>
          ) : "Ready"}
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] min-h-[680px]">
        {/* Overlay (mobile/tablet) */}
        {calOpen && (
          <button
            type="button"
            onClick={() => setCalOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            aria-label="Close calendars"
          />
        )}

        {/* Sidebar */}
        <aside
          className={[
            "border-r bg-white p-3 flex flex-col gap-3 h-full",
            "lg:static lg:translate-x-0 lg:w-auto",             // desktop normal
            "fixed left-0 top-0 z-50 h-screen w-72 max-w-[85vw]", // drawer on mobile/tablet
            "transition-transform duration-300",
            calOpen ? "translate-x-0" : "-translate-x-full",
            "lg:transform-none lg:transition-none",              // cancel drawer behavior on desktop
            "lg:block",                                          // show on desktop
          ].join(" ")}
        >

          <div className="flex items-center justify-between lg:hidden">
            <div className="text-sm font-semibold text-[#241453]">Calendars</div>
            <button
              type="button"
              onClick={() => setCalOpen(false)}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 transition flex items-center justify-center"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="rounded-xl border bg-[#F9F5FF]/30 p-3">
            <div className="text-sm font-semibold text-[#241453]">My calendars</div>
            <div className="text-xs text-gray-500 mt-1">Select coaches to show their meetings</div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[#241453]">Calendars</div>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} className="text-xs text-[#644D93] hover:underline">
                Select all
              </button>
              <button type="button" onClick={clearAll} className="text-xs text-[#644D93] hover:underline">
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-1 flex-1 overflow-y-auto pr-1 custom-scroll">
            {filteredCoaches.map((c) => {
              const checked = selectedCoachIds.has(c.id);

              return (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer select-none"
                >
                  {/* Hide native checkbox */}
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCoach(c.id)}
                    className="sr-only"
                  />

                  {/* Custom circle */}
                  <span
                    className={[
                      "w-3 h-3 rounded-full border flex items-center justify-center shrink-0",
                      checked ? "border-[#644D93] bg-[#F9F5FF]" : "border-gray-300 bg-white",
                    ].join(" ")}
                  >
                    {checked ? <span className="w-3 h-3 rounded-full bg-[#644D93]" /> : null}
                  </span>

                  <span className="text-sm text-gray-800">{c.case_owner}</span>
                </label>
              );
            })}

            {!filteredCoaches.length && (
              <div className="text-xs text-gray-500 px-2 py-3">No coaches match “{coachQuery}”.</div>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="p-3 bg-[#F7F8FB] min-w-0">
          {/* Toolbar */}
          <div className="bg-white rounded-2xl border shadow-sm px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
                className="px-3 py-2 rounded-lg border hover:bg-[#F9F5FF] text-sm"
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="w-9 h-9 rounded-lg border hover:bg-[#F9F5FF]"
                aria-label="Prev"
              >
                ‹
              </button>

              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="w-9 h-9 rounded-lg border hover:bg-[#F9F5FF]"
                aria-label="Next"
              >
                ›
              </button>

              <div className="ml-2 font-semibold text-[#241453]">{titleRange}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView("workweek")}
                className={[
                  "px-3 py-2 rounded-lg border text-sm",
                  view === "workweek" ? "bg-[#F9F5FF] text-[#241453]" : "hover:bg-gray-200",
                ].join(" ")}
              >
                Work week
              </button>

              <button
                type="button"
                onClick={() => setView("week")}
                className={[
                  "px-3 py-2 rounded-lg border text-sm",
                  view === "week" ? "bg-[#F9F5FF] text-[#241453]" : "hover:bg-gray-200",
                ].join(" ")}
              >
                Week
              </button>

              <button
                type="button"
                onClick={() => setView("month")}
                className={[
                  "px-3 py-2 rounded-lg border text-sm",
                  view === "month" ? "bg-[#F9F5FF] text-[#241453]" : "hover:bg-gray-200",
                ].join(" ")}
              >
                Month
              </button>
            </div>
          </div>

          {/* Week / Month */}
          {view === "month" ? (
            <MonthGrid
              monthDate={weekStart}
              meetings={filteredMeetings}
              onPickDate={(iso) => {
                const picked = new Date(`${iso}T00:00:00`);
                setWeekStart(startOfWeekMonday(picked));
                setView("workweek");
              }}
            />
          ) : (
            <WeekTimeGrid
              weekStart={weekStart}
              meetings={weekMeetings}
              daysToShow={view === "week" ? 7 : 5}
            />
          )}
        </main>
      </div>
    </div>
  );
}
