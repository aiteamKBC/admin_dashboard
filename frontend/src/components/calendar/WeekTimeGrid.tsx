import React, { useMemo, useState } from "react";
import type { Meeting } from "../../types/meetings";

/* ================= TYPES ================= */

type Props = {
  weekStart: Date; // Monday
  meetings: Meeting[];
  startHour?: number; // default 8
  endHour?: number; // default 20
  daysToShow?: number; // default 5 (work week)
};

type Positioned = Meeting & {
  _startMin: number;
  _endMin: number;
  _left: number; // 0..1
  _width: number; // 0..1
};

type MoreChip = {
  startMin: number;
  endMin: number;
  count: number;
};

/* ================= HELPERS ================= */

const pad2 = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtTime = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const parseTimeToMinutes = (t?: string) => {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
};

const isCancelledMeeting = (m: Meeting) => {
  const text = `${m.serviceName ?? ""} ${m.customerName ?? ""}`.toLowerCase();
  return text.includes("cancel") || text.includes("canceled") || text.includes("cancelled");
};

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && aE > bS;

function normalizeMeeting(m: Meeting, dayStartMin: number, dayEndMin: number) {
  const s = parseTimeToMinutes(m.timeFrom) ?? dayStartMin;
  const eRaw = parseTimeToMinutes(m.timeTo) ?? Math.min(s + 30, dayEndMin);
  const e = Math.max(eRaw, s + 15);
  return {
    start: clamp(s, 0, 24 * 60),
    end: clamp(e, 0, 24 * 60),
  };
}

/* ================= OUTLOOK-LIKE OVERLAP LAYOUT (CAPPED) ================= */

function layoutDay(
  meetings: Meeting[],
  dayStartMin: number,
  dayEndMin: number
): { positioned: Positioned[]; more: MoreChip[] } {
  type Item = { m: Meeting; start: number; end: number; idx: number };

  const items: Item[] = meetings
    .map((m, idx) => {
      const { start, end } = normalizeMeeting(m, dayStartMin, dayEndMin);
      return { m, start, end, idx };
    })
    .filter(Boolean) as Item[];

  items.sort((a, b) => a.start - b.start || a.end - b.end || a.idx - b.idx);

  // Build overlap clusters
  const clusters: Item[][] = [];
  let cur: Item[] = [];
  let curEnd = -1;

  for (const it of items) {
    if (!cur.length) {
      cur = [it];
      curEnd = it.end;
      continue;
    }
    if (it.start < curEnd) {
      cur.push(it);
      curEnd = Math.max(curEnd, it.end);
    } else {
      clusters.push(cur);
      cur = [it];
      curEnd = it.end;
    }
  }
  if (cur.length) clusters.push(cur);

  const positioned: Positioned[] = [];
  const more: MoreChip[] = [];

  const MAX_COLS = 4;

  for (const cluster of clusters) {
    // assign stable slots (interval partitioning)
    const slotEnd: number[] = [];
    const slotOf = new Map<Item, number>();

    for (const it of cluster) {
      let slot = 0;
      for (; slot < slotEnd.length; slot++) {
        if ((slotEnd[slot] ?? Number.NEGATIVE_INFINITY) <= it.start) break;
      }
      if (slot === slotEnd.length) slotEnd.push(it.end);
      else slotEnd[slot] = it.end;

      slotOf.set(it, slot);
    }

    const totalSlots = Math.max(1, slotEnd.length);
    const cols = Math.min(totalSlots, MAX_COLS);

    // build "more" slices where concurrency exceeds MAX_COLS
    const points = Array.from(new Set(cluster.flatMap((it) => [it.start, it.end]))).sort((a, b) => a - b);

    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a == null || b == null || b <= a) continue;

      const active = cluster.filter((it) => it.start < b && it.end > a);
      if (active.length <= MAX_COLS) continue;

      const hiddenCount = active.length - MAX_COLS;

      const last = more[more.length - 1];
      if (last && last.endMin === a) {
        last.endMin = b;
        last.count = Math.max(last.count, hiddenCount);
      } else {
        more.push({ startMin: a, endMin: b, count: hiddenCount });
      }
    }

    // place only first MAX_COLS
    for (const it of cluster) {
      const slot = slotOf.get(it) ?? 0;
      if (slot >= MAX_COLS) continue;

      const width = 1 / cols;
      const left = slot * width;

      positioned.push({
        ...it.m,
        _startMin: it.start,
        _endMin: it.end,
        _left: left,
        _width: width,
      });
    }
  }

  return { positioned, more };
}

/* ================= UI: Event Card (Light theme) ================= */

function EventCard({ m }: { m: Positioned }) {
  const cancelled = isCancelledMeeting(m);

  const title = (m.serviceName || "Meeting").trim();
  const subtitle = (m.customerName || m.coachName || "").trim();

  const veryNarrow = m._width <= 0.22;

  const base =
    "h-full rounded-xl border shadow-sm overflow-hidden px-2 py-1.5 " +
    "hover:shadow-md hover:z-20 hover:scale-[1.01] transition";

  const normalCard = "bg-[#F9F5FF]/70 border-[#E6DDF7]";
  const cancelCard = "bg-rose-50 border-rose-200";

  const dot = cancelled ? "bg-rose-500" : "bg-[#644D93]";
  const badge = cancelled
    ? "bg-white/70 border-rose-200 text-rose-700"
    : "bg-white/70 border-[#E6DDF7] text-[#241453]";

  return (
    <div className={[base, cancelled ? cancelCard : normalCard].join(" ")}>
      <div className="flex items-start gap-2">
        <div className={["mt-0.5 w-2.5 h-2.5 rounded-full shrink-0", dot].join(" ")} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[12px] font-semibold text-[#241453] line-clamp-1">{title}</div>

            {!veryNarrow && (
              <span className={["ml-auto text-[10px] px-2 py-0.5 rounded-full border shrink-0", badge].join(" ")}>
                {cancelled ? "Cancelled" : "Scheduled"}
              </span>
            )}
          </div>

          {!veryNarrow && (
            <div className="mt-0.5 text-[11px] text-[#241453]/70 line-clamp-1">{subtitle || "—"}</div>
          )}

          <div className="mt-0.5 text-[11px] text-[#241453]/80">
            <span className="opacity-90">
              {m.timeFrom || ""} {m.timeTo ? `- ${m.timeTo}` : ""}
            </span>
          </div>

          {!veryNarrow && m.joinWebUrl ? (
            <a
              href={m.joinWebUrl as any}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-[11px] text-[#241453] underline underline-offset-2"
            >
              Join
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ================= UI: More Modal (iframe-like panel) ================= */

type MoreModalState = {
  open: boolean;
  dayKey: string;
  dayLabel: string;
  rangeLabel: string;
  items: Meeting[];
};

type HoverState =
  | { open: false }
  | { open: true; x: number; y: number; m: Meeting };

const buildHoverDetails = (m: Meeting) => {
  const title = (m.serviceName || "Meeting").trim();
  const learner = (m.customerName || "").trim();
  const coach = (m.coachName || "").trim();
  const time = `${m.timeFrom || ""}${m.timeTo ? ` - ${m.timeTo}` : ""}`.trim();
  return { title, learner, coach, time };
};

function HoverTooltip({ state }: { state: HoverState }) {
  if (!state.open) return null;

  const { title, learner, coach, time } = buildHoverDetails(state.m);

  const left = Math.min(state.x + 12, window.innerWidth - 360);
  const top = Math.min(state.y + 12, window.innerHeight - 180);

  return (
    <div className="fixed z-[80] pointer-events-none" style={{ left, top }}>
      <div className="w-[340px] rounded-xl border border-[#E6DDF7] bg-white shadow-xl p-3">
        <div className="text-sm font-semibold text-[#241453] line-clamp-2">{title}</div>

        <div className="mt-1 text-xs text-[#241453]/70 space-y-1">
          {learner ? (
            <div>
              <span className="font-medium">Learner:</span> {learner}
            </div>
          ) : null}

          {coach ? (
            <div>
              <span className="font-medium">Coach:</span> {coach}
            </div>
          ) : null}

          {state.m.date ? (
            <div>
              <span className="font-medium">Date:</span> {state.m.date}
            </div>
          ) : null}

          {time ? (
            <div>
              <span className="font-medium">Time:</span> {time}
            </div>
          ) : null}

          {state.m.meetingId ? (
            <div className="truncate">
              <span className="font-medium">Event ID:</span> {state.m.meetingId}
            </div>
          ) : null}

          {state.m.joinWebUrl ? (
            <div className="truncate">
              <span className="font-medium">Join:</span> {String(state.m.joinWebUrl)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MoreModal({
  state,
  onClose,
}: {
  state: MoreModalState;
  onClose: () => void;
}) {
  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* overlay */}
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
        aria-label="Close"
      />

      {/* panel */}
      <div className="absolute left-1/2 top-1/2 w-[min(720px,92vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-2xl border bg-white shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-[#F9F5FF]/60 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[#241453]">{state.dayLabel}</div>
              <div className="text-xs text-[#241453]/70">{state.rangeLabel}</div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-sm"
            >
              Close
            </button>
          </div>

          {/* "iframe feel" scroll area */}
          <div className="p-3 bg-[#F9F5FF]/35">
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="max-h-[60vh] overflow-auto">
                {state.items.length ? (
                  <div className="divide-y">
                    {state.items.map((m, idx) => {
                      const cancelled = isCancelledMeeting(m);
                      const title = (m.serviceName || "Meeting").trim();
                      const sub = (m.customerName || m.coachName || "").trim();

                      return (
                        <div key={`${m.meetingId ?? idx}`} className="p-3 flex items-start gap-3">
                          <span
                            className={[
                              "mt-1 w-2.5 h-2.5 rounded-full shrink-0",
                              cancelled ? "bg-rose-500" : "bg-[#644D93]",
                            ].join(" ")}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-sm text-[#241453] truncate">{title}</div>
                              <span
                                className={[
                                  "ml-auto text-[11px] px-2 py-0.5 rounded-full border shrink-0",
                                  cancelled
                                    ? "bg-rose-50 border-rose-200 text-rose-700"
                                    : "bg-[#F9F5FF] border-[#E6DDF7] text-[#241453]",
                                ].join(" ")}
                              >
                                {cancelled ? "Cancelled" : "Scheduled"}
                              </span>
                            </div>

                            <div className="mt-0.5 text-xs text-[#241453]/70 truncate">{sub || "—"}</div>

                            <div className="mt-1 text-xs text-[#241453]/80">
                              {m.timeFrom || ""} {m.timeTo ? `- ${m.timeTo}` : ""}
                              {m.joinWebUrl ? (
                                <a
                                  href={m.joinWebUrl as any}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ml-3 underline underline-offset-2"
                                >
                                  Join
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-sm text-[#241453]/70">No meetings found.</div>
                )}
              </div>
            </div>

            <div className="mt-2 text-xs text-[#241453]/60">
              Showing meetings that overlap the selected “more” time slice.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= MAIN GRID ================= */

export default function WeekTimeGrid({
  weekStart,
  meetings,
  startHour = 8,
  endHour = 20,
  daysToShow = 5,
}: Props) {
  const nDays = daysToShow ?? 5;

  const days = useMemo(() => Array.from({ length: nDays }, (_, i) => addDays(weekStart, i)), [weekStart, nDays]);

  const hourSlots = Math.max(1, endHour - startHour);
  const hours = useMemo(() => Array.from({ length: hourSlots }, (_, i) => startHour + i), [startHour, endHour]);

  const ROW_H = 72;
  const DAY_TOP_PAD = 44;

  const hoursHeight = ROW_H * hourSlots;
  const startMin = startHour * 60;
  const endMin = endHour * 60;
  const totalMin = endMin - startMin;

  const EVENT_GAP_X = 6;
  const EVENT_GAP_Y = 2;
  const MIN_EVENT_PX = 18;

  const meetingsByDay = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    for (const m of meetings) {
      if (!m?.date) continue;
      (map[m.date] ??= []).push(m);
    }
    return map;
  }, [meetings]);

  const dayColsStyle = useMemo(() => ({ gridTemplateColumns: `repeat(${nDays}, minmax(0, 1fr))` }), [nDays]);

  // More modal state
  const [moreState, setMoreState] = useState<MoreModalState>({
    open: false,
    dayKey: "",
    dayLabel: "",
    rangeLabel: "",
    items: [],
  });

  const [hover, setHover] = useState<HoverState>({ open: false });

  const openMore = (dayKey: string, dayDate: Date, sliceStart: number, sliceEnd: number, dayMeetings: Meeting[]) => {
    const items = dayMeetings
      .map((m) => {
        const { start, end } = normalizeMeeting(m, startMin, endMin);
        return { m, start, end };
      })
      .filter((x) => overlaps(x.start, x.end, sliceStart, sliceEnd))
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .map((x) => x.m);

    const dayLabel = dayDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const rangeLabel = `${fmtTime(sliceStart)} – ${fmtTime(sliceEnd)} (overlaps)`;

    setMoreState({
      open: true,
      dayKey,
      dayLabel,
      rangeLabel,
      items,
    });
  };

  return (
    <>
      <div className="border rounded-2xl overflow-hidden bg-white">
        {/* IMPORTANT: one horizontal scroller for BOTH header + body */}
        <div className="overflow-x-auto">
          {/* keep same min width for header + body */}
          <div style={{ minWidth: 80 + nDays * 180 }}>
            {/* Header row (sticky) */}
            <div className="grid grid-cols-[80px_1fr] border-b bg-[#241453]/60 sticky top-0 z-30">
              <div className="p-3 text-xs text-[#241453]/60" />
              <div className="grid" style={dayColsStyle}>
                {days.map((d) => {
                  const key = toISO(d);
                  const label = d.toLocaleDateString("en-GB", { weekday: "short" });
                  const num = d.getDate();

                  return (
                    <div key={key} className="px-3 py-2 border-l border-[#E6DDF7]">
                      <div className="text-xs text-[#FEF9FF]">{label}</div>
                      <div className="text-sm font-semibold text-[#FEF9FF]/80">{num}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Body (vertical scroll ONLY) */}
            <div className="max-h-[1024px] overflow-y-auto overflow-x-hidden">
              <div className="grid grid-cols-[80px_1fr]">
                {/* Times (sticky left) */}
                <div className="border-r border-[#E6DDF7] sticky left-0 z-20 bg-white">
                  <div className="border-b border-[#E6DDF7]" style={{ height: DAY_TOP_PAD }} />
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="px-3 flex items-start pt-2 text-xs text-[#241453]/60 border-b border-[#E6DDF7]"
                      style={{ height: ROW_H }}
                    >
                      {h <= 11 ? `${h} AM` : h === 12 ? `12 PM` : `${h - 12} PM`}
                    </div>
                  ))}
                </div>

                {/* Days */}
                <div className="grid" style={dayColsStyle}>
                  {days.map((d) => {
                    const dayKey = toISO(d);
                    const dayMeetings = meetingsByDay[dayKey] ?? [];

                    const { positioned, more } = layoutDay(dayMeetings, startMin, endMin);

                    const visibleEvents = positioned.filter((m) => m._endMin > startMin && m._startMin < endMin);
                    const visibleMore = more.filter((x) => x.endMin > startMin && x.startMin < endMin && x.count > 0);

                    const dayHeight = DAY_TOP_PAD + hoursHeight;

                    type HoverState =
                      | { open: false }
                      | { open: true; x: number; y: number; m: Meeting };

                    const buildHoverDetails = (m: Meeting) => {
                      const title = (m.serviceName || "Meeting").trim();
                      const sub = (m.customerName || "").trim();
                      const coach = (m.coachName || "").trim();
                      const time = `${m.timeFrom || ""}${m.timeTo ? ` - ${m.timeTo}` : ""}`.trim();

                      return { title, sub, coach, time };
                    };

                    function HoverTooltip({ state }: { state: HoverState }) {
                      if (!state.open) return null;

                      const { title, sub, coach, time } = buildHoverDetails(state.m);

                      const left = Math.min(state.x + 12, window.innerWidth - 360);
                      const top = Math.min(state.y + 12, window.innerHeight - 180);

                      return (
                        <div
                          className="fixed z-[80] pointer-events-none"
                          style={{ left, top }}
                        >
                          <div className="w-[340px] rounded-xl border border-[#E6DDF7] bg-white shadow-xl p-3">
                            <div className="text-sm font-semibold text-[#241453] line-clamp-2">{title}</div>

                            <div className="mt-1 text-xs text-[#241453]/70 space-y-1">
                              {sub ? <div><span className="font-medium">Learner:</span> {sub}</div> : null}
                              {coach ? <div><span className="font-medium">Coach:</span> {coach}</div> : null}
                              {state.m.date ? <div><span className="font-medium">Date:</span> {state.m.date}</div> : null}
                              {time ? <div><span className="font-medium">Time:</span> {time}</div> : null}
                              {state.m.meetingId ? <div className="truncate"><span className="font-medium">Event ID:</span> {state.m.meetingId}</div> : null}
                              {state.m.joinWebUrl ? <div className="truncate"><span className="font-medium">Join:</span> {String(state.m.joinWebUrl)}</div> : null}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={dayKey} className="relative border-l border-[#E6DDF7]" style={{ height: dayHeight }}>
                        <div className="border-b border-[#E6DDF7]" style={{ height: DAY_TOP_PAD }} />
                        {hours.map((h) => (
                          <div key={h} className="border-b border-[#E6DDF7]" style={{ height: ROW_H }} />
                        ))}

                        <div className="absolute inset-0">
                          {visibleEvents.map((m, i) => {
                            const clampedS = clamp(m._startMin, startMin, endMin);
                            const clampedE = clamp(m._endMin, startMin, endMin);

                            const durMin = Math.max(1, clampedE - clampedS);
                            const naturalH = (durMin / totalMin) * hoursHeight;

                            const height = Math.max(MIN_EVENT_PX, naturalH) - EVENT_GAP_Y;

                            const top =
                              DAY_TOP_PAD + ((clampedS - startMin) / totalMin) * hoursHeight + EVENT_GAP_Y / 2;

                            const leftPct = clamp(m._left ?? 0, 0, 1) * 100;
                            const widthPct = clamp(m._width ?? 1, 0.02, 1) * 100;

                            const style: React.CSSProperties = {
                              top,
                              height: Math.max(8, height),
                              left: `calc(${leftPct}% + ${EVENT_GAP_X / 2}px)`,
                              width: `calc(${widthPct}% - ${EVENT_GAP_X}px)`,
                              zIndex: 10,
                            };

                            return (
                              <div
                                key={`${m.meetingId ?? m.customerName ?? "m"}-${m._startMin}-${i}`}
                                className="absolute"
                                style={style}
                                onMouseEnter={(e) => {
                                  setHover({ open: true, x: e.clientX, y: e.clientY, m });
                                }}
                                onMouseMove={(e) => {
                                  setHover((prev) => (prev.open ? { ...prev, x: e.clientX, y: e.clientY } : prev));
                                }}
                                onMouseLeave={() => setHover({ open: false })}
                              >
                                <EventCard m={m} />
                              </div>
                            );
                          })}

                          {visibleMore.map((x, i) => {
                            const clampedS = clamp(x.startMin, startMin, endMin);
                            const clampedE = clamp(x.endMin, startMin, endMin);

                            const top = DAY_TOP_PAD + ((clampedS - startMin) / totalMin) * hoursHeight + 2;

                            const sliceMin = Math.max(1, clampedE - clampedS);
                            const naturalH = (sliceMin / totalMin) * hoursHeight;

                            return (
                              <button
                                key={`more-${dayKey}-${i}`}
                                type="button"
                                onClick={() => openMore(dayKey, d, clampedS, clampedE, dayMeetings)}
                                className="absolute text-left"
                                style={{
                                  top,
                                  left: "calc(0% + 6px)",
                                  width: "calc(25% - 10px)",
                                  height: Math.min(28, Math.max(18, naturalH)),
                                  zIndex: 15,
                                }}
                              >
                                <div className="h-full rounded-lg border border-[#E6DDF7] bg-[#F9F5FF]/90 shadow-sm px-2 flex items-center text-[11px] text-[#241453]">
                                  +{x.count} more
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


      <MoreModal
        state={moreState}
        onClose={() => setMoreState((p) => ({ ...p, open: false }))}
      />
      <HoverTooltip state={hover} />
    </>
  );
}
