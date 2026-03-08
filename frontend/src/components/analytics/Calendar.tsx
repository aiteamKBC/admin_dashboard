import { useMemo, useState } from "react";
import type { Meeting } from "../../types/meetings";

type CalendarProps = {
  meetingsByDate?: Record<string, Meeting[]>;
  onWeeksChange?: (weeks: number) => void;
};

const dateKeyToday = () => {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`; // YYYY-MM-DD
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const SERVICE_ALIASES: Array<[RegExp, string]> = [
  [/monthly coaching review/i, "MCM"],
  [/progress review/i, "PR"],
  [/support session/i, "Support"],
  [/coaching/i, "Coaching"],
  [/induction/i, "Induction"],
  [/workshop/i, "Workshop"],
];

function shortServiceName(serviceName?: unknown) {
  const s = typeof serviceName === "string" ? serviceName.trim() : "";
  if (!s) return "Session";

  for (const [re, label] of SERVICE_ALIASES) {
    if (re.test(s)) return label;
  }

  // fallback: remove "with X", take first 2 to 3 words, then hard-trim
  const lower = s.toLowerCase();
  const token = " with ";
  const pos = lower.indexOf(token);
  const base = (pos >= 0 ? s.slice(0, pos) : s).trim();

  const firstWords = base
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  return firstWords.length > 14 ? `${firstWords.slice(0, 14)}...` : firstWords;
}

export default function Calendar({ meetingsByDate = {}, onWeeksChange }: CalendarProps) {
  const today = new Date();
  const todayKey = useMemo(() => dateKeyToday(), []);

  const [currentDate, setCurrentDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;

  const weeksInMonth = Math.ceil((firstDayIndex + daysInMonth) / 7);

  useMemo(() => {
    onWeeksChange?.(weeksInMonth);
    return null;
  }, [weeksInMonth, onWeeksChange]);

  const meetingsByDateFuture = useMemo<Record<string, Meeting[]>>(() => {
    const out: Record<string, Meeting[]> = {};
    for (const [k, v] of Object.entries(meetingsByDate || {})) {
      if (k >= todayKey) out[k] = Array.isArray(v) ? v : [];
    }
    return out;
  }, [meetingsByDate, todayKey]);

  const highlightedDays = useMemo(() => {
    return new Set(
      Object.keys(meetingsByDateFuture)
        .map((d) => new Date(`${d}T00:00:00`))
        .filter((d) => d.getMonth() === month && d.getFullYear() === year)
        .map((d) => d.getDate())
    );
  }, [meetingsByDateFuture, month, year]);

  const formatDateKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition"
        >
          ‹
        </button>

        <p className="text-sm font-semibold text-gray-800">
          {currentDate.toLocaleString("default", { month: "long" })} {year}
        </p>

        <button
          onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition"
        >
          ›
        </button>
      </div>

      {/* Days of week */}
      <div className="grid grid-cols-7 gap-2 text-center text-xs text-gray-400 mb-3">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-2 text-sm">
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <div key={`empty-${i}`} className="h-9" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = formatDateKey(year, month, day);

          const meetingsForDay = Array.isArray(meetingsByDateFuture[dateKey])
            ? meetingsByDateFuture[dateKey]
            : [];

          const isHighlighted = meetingsForDay.length > 0;

          const isToday =
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear();

          return (
            <div key={day} className="relative group h-9 flex items-center justify-center">
              <div
                className={`
                  w-9 h-9 flex items-center justify-center rounded-full cursor-pointer
                  transition
                  ${isHighlighted
                    ? "bg-gradient-to-r from-[#b27715] to-[#cea769] text-white font-semibold shadow-sm"
                    : isToday
                      ? "border border-[#B27715] text-[#241453] font-medium"
                      : "text-[#241453] hover:bg-gray-100"
                  }
                `}
              >
                {day}
              </div>

              {/* Tooltip */}
              {meetingsForDay.length > 0 && (
                <div
                  className="
                    absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
                    hidden group-hover:block
                    bg-[#241453] text-white text-xs rounded-md px-3 py-2
                    shadow-lg whitespace-nowrap
                  "
                >
                  {meetingsForDay.map((m, idx) => {
                    const student =
                      typeof m.customerName === "string" ? m.customerName : "Unknown student";
                    const serviceShort = shortServiceName((m as any).serviceName);

                    return (
                      <div key={idx} className="mb-1 last:mb-0 flex items-center gap-2">
                        <span className="inline-flex items-center rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold">
                          {serviceShort}
                        </span>

                        <span className="font-medium">{student}</span>

                        <span className="text-gray-300">
                          ({String((m as any).timeFrom ?? "--")} to {String((m as any).timeTo ?? "--")})
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}