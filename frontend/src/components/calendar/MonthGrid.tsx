import type { Meeting } from "../../types/meetings";

type Props = {
  monthDate: Date; // أي تاريخ داخل الشهر الحالي
  meetings: Meeting[]; // meetings المفلترة (حسب الكوتشز)
  onPickDate?: (dateISO: string) => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

// Monday-based start (Mon=0..Sun=6)
const startOfWeekMonday = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const toHHMM = (v?: string) => {
  if (!v) return "";
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(v);
  return `${pad(Number(m[1]))}:${m[2]}`;
};

const isCancelledMeeting = (m: Meeting) => {
  const text = `${m.serviceName ?? ""} ${m.customerName ?? ""}`.toLowerCase();
  return text.includes("cancel") || text.includes("canceled") || text.includes("cancelled");
};

export default function MonthGrid({ monthDate, meetings, onPickDate }: Props) {
  const mStart = startOfMonth(monthDate);
  const mEnd = endOfMonth(monthDate);

  const gridStart = startOfWeekMonday(mStart);
  const gridEnd = addDays(startOfWeekMonday(mEnd), 6); // to Sunday

  // build list of days (6 weeks max = 42 cells)
  const days: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
    days.push(new Date(d));
    if (days.length >= 42) break;
  }

  // group meetings per day (sorted by timeFrom)
  const meetingsByDay: Record<string, Meeting[]> = {};
  for (const mt of meetings) {
    if (!mt?.date) continue;
    (meetingsByDay[mt.date] ??= []).push(mt);
  }
  for (const k of Object.keys(meetingsByDay)) {
  const arr = meetingsByDay[k] ?? [];
  arr.sort((a, b) => {
    const ta = toHHMM(a.timeFrom);
    const tb = toHHMM(b.timeFrom);
    return ta.localeCompare(tb);
  });
  meetingsByDay[k] = arr;
}

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayISO = toISO(new Date());

  return (
    <div className="bg-white rounded-2xl border border-[#E6DDF7] shadow-sm overflow-hidden">
      {/* header: weekdays (sticky) */}
      <div className="grid grid-cols-7 border-b border-[#E6DDF7] bg-[#F9F5FF]/60 sticky top-0 z-20">
        {weekDays.map((w) => (
          <div key={w} className="px-3 py-2 text-xs text-[#241453]/70 font-medium">
            {w}
          </div>
        ))}
      </div>

      {/* grid */}
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const iso = toISO(d);
          const inMonth = d.getMonth() === monthDate.getMonth();
          const isToday = iso === todayISO;

          const arr = meetingsByDay[iso] ?? [];
          const count = arr.length;

          const preview = arr.slice(0, 3);
          const rest = Math.max(0, count - preview.length);

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPickDate?.(iso)}
              className={[
                "relative h-[120px] border-t border-l border-[#E6DDF7] p-2 text-left transition",
                "hover:bg-[#F9F5FF]/50",
                !inMonth ? "bg-[#F9F5FF]/25 text-[#241453]/40" : "bg-white",
              ].join(" ")}
            >
              {/* top row: day number + count */}
              <div className="flex items-start justify-between gap-2">
                <div
                  className={[
                    "text-sm font-semibold",
                    isToday ? "text-[#241453]" : "text-[#241453]",
                  ].join(" ")}
                >
                  {d.getDate()}
                </div>

                {count > 0 && (
                  <div className="text-[11px] px-2 py-[2px] rounded-full bg-[#F9F5FF] text-[#241453] border border-[#E6DDF7]">
                    {count}
                  </div>
                )}
              </div>

              {/* today highlight ring */}
              {isToday && (
                <div className="pointer-events-none absolute inset-1 rounded-xl border border-[#644D93]/35" />
              )}

              {/* preview chips */}
              <div className="mt-2 space-y-1">
                {preview.map((m, idx) => {
                  const cancelled = isCancelledMeeting(m);
                  const t = toHHMM(m.timeFrom);
                  const title = (m.serviceName || "Meeting").trim();

                  return (
                    <div
                      key={`${m.meetingId ?? idx}`}
                      className={[
                        "flex items-center gap-2 rounded-lg border px-2 py-1",
                        "bg-[#F9F5FF]/70 border-[#E6DDF7]",
                        cancelled ? "opacity-75" : "",
                      ].join(" ")}
                      title={title}
                    >
                      <span
                        className={[
                          "w-2 h-2 rounded-full shrink-0",
                          cancelled ? "bg-rose-500" : "bg-[#644D93]",
                        ].join(" ")}
                      />
                      <span className="text-[11px] text-[#241453]/80 shrink-0">{t || "—"}</span>
                      <span className="text-[11px] text-[#241453] line-clamp-1">{title}</span>
                    </div>
                  );
                })}

                {rest > 0 && (
                  <div className="text-[11px] text-[#241453]/70 px-1">
                    +{rest} more
                  </div>
                )}

                {count === 0 && inMonth && (
                  <div className="text-[11px] text-[#241453]/40 px-1">No meetings</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
