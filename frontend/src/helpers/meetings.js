export function normalizeCompletedSessions(data) {
    if (!data || typeof data !== "object") {
        return {
            totalSessions: 0,
            totalMinutes: 0,
        };
    }
    let totalSessions = 0;
    let totalMinutes = 0;
    Object.values(data).forEach(day => {
        totalSessions += day.sessions_count ?? 0;
        totalMinutes += day.total_minutes ?? 0;
    });
    return {
        totalSessions,
        totalMinutes,
    };
}
export function filterCompletedSessionsByRange(data, start, end) {
    if (!data || typeof data !== "object")
        return {};
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    const out = {};
    Object.entries(data).forEach(([dateKey, day]) => {
        // يدعم YYYY-MM-DD
        const d = new Date(dateKey.length === 10 ? `${dateKey}T00:00:00` : dateKey);
        if (Number.isNaN(d.getTime()))
            return;
        const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        if (dd >= startDay && dd <= endDay)
            out[dateKey] = day;
    });
    return out;
}
