import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
// Monday-based start (Mon=0..Sun=6)
const startOfWeekMonday = (date) => {
    const d = new Date(date);
    const day = d.getDay(); // 0 Sun .. 6 Sat
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
};
const addDays = (d, days) => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
};
const toHHMM = (v) => {
    if (!v)
        return "";
    const m = String(v).match(/(\d{1,2}):(\d{2})/);
    if (!m)
        return String(v);
    return `${pad(Number(m[1]))}:${m[2]}`;
};
const isCancelledMeeting = (m) => {
    const text = `${m.serviceName ?? ""} ${m.customerName ?? ""}`.toLowerCase();
    return text.includes("cancel") || text.includes("canceled") || text.includes("cancelled");
};
export default function MonthGrid({ monthDate, meetings, onPickDate }) {
    var _a;
    const mStart = startOfMonth(monthDate);
    const mEnd = endOfMonth(monthDate);
    const gridStart = startOfWeekMonday(mStart);
    const gridEnd = addDays(startOfWeekMonday(mEnd), 6); // to Sunday
    // build list of days (6 weeks max = 42 cells)
    const days = [];
    for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
        days.push(new Date(d));
        if (days.length >= 42)
            break;
    }
    // group meetings per day (sorted by timeFrom)
    const meetingsByDay = {};
    for (const mt of meetings) {
        if (!mt?.date)
            continue;
        (meetingsByDay[_a = mt.date] ?? (meetingsByDay[_a] = [])).push(mt);
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
    return (_jsxs("div", { className: "bg-white rounded-2xl border border-[#E6DDF7] shadow-sm overflow-hidden", children: [_jsx("div", { className: "grid grid-cols-7 border-b border-[#E6DDF7] bg-[#F9F5FF]/60 sticky top-0 z-20", children: weekDays.map((w) => (_jsx("div", { className: "px-3 py-2 text-xs text-[#241453]/70 font-medium", children: w }, w))) }), _jsx("div", { className: "grid grid-cols-7", children: days.map((d) => {
                    const iso = toISO(d);
                    const inMonth = d.getMonth() === monthDate.getMonth();
                    const isToday = iso === todayISO;
                    const arr = meetingsByDay[iso] ?? [];
                    const count = arr.length;
                    const preview = arr.slice(0, 3);
                    const rest = Math.max(0, count - preview.length);
                    return (_jsxs("button", { type: "button", onClick: () => onPickDate?.(iso), className: [
                            "relative h-[120px] border-t border-l border-[#E6DDF7] p-2 text-left transition",
                            "hover:bg-[#F9F5FF]/50",
                            !inMonth ? "bg-[#F9F5FF]/25 text-[#241453]/40" : "bg-white",
                        ].join(" "), children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsx("div", { className: [
                                            "text-sm font-semibold",
                                            isToday ? "text-[#241453]" : "text-[#241453]",
                                        ].join(" "), children: d.getDate() }), count > 0 && (_jsx("div", { className: "text-[11px] px-2 py-[2px] rounded-full bg-[#F9F5FF] text-[#241453] border border-[#E6DDF7]", children: count }))] }), isToday && (_jsx("div", { className: "pointer-events-none absolute inset-1 rounded-xl border border-[#644D93]/35" })), _jsxs("div", { className: "mt-2 space-y-1", children: [preview.map((m, idx) => {
                                        const cancelled = isCancelledMeeting(m);
                                        const t = toHHMM(m.timeFrom);
                                        const title = (m.serviceName || "Meeting").trim();
                                        return (_jsxs("div", { className: [
                                                "flex items-center gap-2 rounded-lg border px-2 py-1",
                                                "bg-[#F9F5FF]/70 border-[#E6DDF7]",
                                                cancelled ? "opacity-75" : "",
                                            ].join(" "), title: title, children: [_jsx("span", { className: [
                                                        "w-2 h-2 rounded-full shrink-0",
                                                        cancelled ? "bg-rose-500" : "bg-[#644D93]",
                                                    ].join(" ") }), _jsx("span", { className: "text-[11px] text-[#241453]/80 shrink-0", children: t || "—" }), _jsx("span", { className: "text-[11px] text-[#241453] line-clamp-1", children: title })] }, `${m.meetingId ?? idx}`));
                                    }), rest > 0 && (_jsxs("div", { className: "text-[11px] text-[#241453]/70 px-1", children: ["+", rest, " more"] })), count === 0 && inMonth && (_jsx("div", { className: "text-[11px] text-[#241453]/40 px-1", children: "No meetings" }))] })] }, iso));
                }) })] }));
}
