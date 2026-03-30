import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import teamsIcon from "../../assets/teams-icon.png";
const pad2 = (n) => String(n).padStart(2, "0");
const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const toDateTime = (date, time) => {
    const t = (time || "00:00").slice(0, 8); // HH:mm or HH:mm:ss
    return new Date(`${date}T${t}`);
};
export default function UpcomingMeetingCard({ meeting, meetings }) {
    // 1) build list
    const meetingsList = useMemo(() => {
        if (meetings?.length)
            return meetings;
        if (meeting)
            return [meeting];
        return [];
    }, [meetings, meeting]);
    // 2) today only
    const todaysMeetings = useMemo(() => {
        const t = todayKey();
        return (Array.isArray(meetingsList) ? meetingsList : []).filter((m) => String(m?.date || "") === t);
    }, [meetingsList]);
    // 3) sort today list (HOOK لازم يبقى قبل أي return)
    const sortedMeetings = useMemo(() => {
        return [...todaysMeetings].sort((a, b) => {
            const aStart = toDateTime(a.date, a.timeFrom).getTime();
            const bStart = toDateTime(b.date, b.timeFrom).getTime();
            return aStart - bStart;
        });
    }, [todaysMeetings]);
    // 4) tick "now" to update label & auto-pick
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 30000);
        return () => window.clearInterval(id);
    }, []);
    // 5) auto index (current / next / last)
    const autoIndex = useMemo(() => {
        if (!sortedMeetings.length)
            return -1;
        const inProgressIdx = sortedMeetings.findIndex((m) => {
            const start = toDateTime(m.date, m.timeFrom).getTime();
            const end = m.timeTo
                ? toDateTime(m.date, m.timeTo).getTime()
                : start + 60 * 60 * 1000;
            return now >= start && now < end;
        });
        if (inProgressIdx !== -1)
            return inProgressIdx;
        const nextIdx = sortedMeetings.findIndex((m) => {
            const start = toDateTime(m.date, m.timeFrom).getTime();
            return start > now;
        });
        if (nextIdx !== -1)
            return nextIdx;
        return sortedMeetings.length - 1; // all ended today
    }, [sortedMeetings, now]);
    // 6) manual navigation state
    const [index, setIndex] = useState(0);
    // sync manual index with auto index when it changes
    useEffect(() => {
        if (autoIndex >= 0)
            setIndex(autoIndex);
    }, [autoIndex]);
    // 7) render data (بدون Hooks)
    const hasMeetings = sortedMeetings.length > 0;
    const safeIndex = hasMeetings
        ? Math.min(Math.max(index, 0), sortedMeetings.length - 1)
        : 0;
    const currentMeeting = hasMeetings ? sortedMeetings[safeIndex] : null;
    // 8) empty state
    if (!hasMeetings || !currentMeeting) {
        return (_jsx("div", { className: "h-full rounded-xl p-5 bg-gradient-to-br from-[#866CB6] via-[#644D93] to-[#241453] text-white flex items-center justify-center opacity-80", children: _jsx("p", { className: "text-sm", children: "No upcoming meetings" }) }));
    }
    const startTs = toDateTime(currentMeeting.date, currentMeeting.timeFrom).getTime();
    const endTs = currentMeeting.timeTo
        ? toDateTime(currentMeeting.date, currentMeeting.timeTo).getTime()
        : startTs + 60 * 60 * 1000;
    const isEnded = now >= endTs;
    const isInProgress = now >= startTs && now < endTs;
    const isSoon = !isEnded && !isInProgress && startTs - now <= 60 * 60 * 1000;
    const label = isEnded
        ? "Ended"
        : isInProgress
            ? "In progress"
            : isSoon
                ? "Starting soon"
                : "Upcoming meeting";
    const labelClass = isEnded
        ? "text-rose-200"
        : isInProgress
            ? "text-amber-200"
            : isSoon
                ? "text-green-300"
                : "text-indigo-100";
    const hasMultiple = sortedMeetings.length > 1;
    return (_jsxs("div", { className: "relative h-full rounded-xl p-5 overflow-hidden bg-gradient-to-br from-[#866CB6] via-[#644D93] to-[#241453] text-white flex flex-col", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h3", { className: "text-lg font-semibold truncate", children: currentMeeting.serviceName }), _jsx("p", { className: `text-sm ${labelClass}`, children: label })] }), currentMeeting.joinWebUrl ? (_jsx("a", { href: currentMeeting.joinWebUrl, target: "_blank", rel: "noopener noreferrer", className: "shrink-0 w-10 h-10 rounded-full bg-white text-[#644D93] flex items-center justify-center hover:scale-105 transition shadow-lg", title: "Join meeting", children: _jsx("img", { src: teamsIcon, alt: "Microsoft Teams", className: "w-5 h-5" }) })) : (_jsx("div", { className: "shrink-0 w-10 h-10 rounded-full bg-white/20 text-white/70 flex items-center justify-center", title: "No join link", children: "\u2014" }))] }), _jsxs("div", { className: "flex-1 flex items-center gap-4 mt-4", children: [_jsx("div", { className: "w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-semibold", children: currentMeeting.customerName?.charAt(0) ?? "?" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: currentMeeting.customerName }), _jsxs("p", { className: "text-xs text-indigo-100", children: [currentMeeting.timeFrom, " \u2013 ", currentMeeting.timeTo || "—"] })] })] }), hasMultiple && (_jsxs("div", { className: "flex items-center justify-between text-xs text-indigo-100 mt-2", children: [_jsx("button", { type: "button", onClick: () => setIndex((i) => (i - 1 + sortedMeetings.length) % sortedMeetings.length), children: "\u2039 Prev" }), _jsxs("span", { children: [safeIndex + 1, " / ", sortedMeetings.length] }), _jsx("button", { type: "button", onClick: () => setIndex((i) => (i + 1) % sortedMeetings.length), children: "Next \u203A" })] }))] }));
}
