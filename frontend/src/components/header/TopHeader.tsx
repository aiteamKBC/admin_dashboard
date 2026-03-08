import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import FilterDropdown from "./FilterDropdown";

/* ================= TYPES ================= */

type Coach = {
  id: number;
  case_owner: string;
};

type HeaderStat = {
  label: string;
  value: string;
  sub?: string;
};

type TopHeaderProps = {
  coaches: Coach[];
  onApplyFilters: (filters: { coach: string; period: string }) => void;

  activeCoachId: number | "all" | null;
  activePeriod: string;

  onOpenSidebar?: () => void;

  students?: string[];
  onSelectStudent?: (name: string) => void;

  userName?: string;
  onLogout?: () => void;

  canSwitchCoach?: boolean;

  lockCoachFilter?: boolean;

  stats?: HeaderStat[];
  rightContent?: React.ReactNode;
};

export default function TopHeader({
  coaches,
  onApplyFilters,
  activeCoachId,
  activePeriod,
  onOpenSidebar,
  students = [],
  onSelectStudent,
  userName = "User",
  canSwitchCoach = true,
  lockCoachFilter = false,
  stats,
  rightContent,
}: TopHeaderProps) {
  const [q, setQ] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /* ================= Outside click closes search ================= */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = searchWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        setListOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  /* ================= Filtered suggestions ================= */
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return students.slice(0, 10);
    return students.filter((n) => n.toLowerCase().includes(s)).slice(0, 10);
  }, [q, students]);

  /* ================= Pick a student ================= */
  const pickStudent = useCallback(
    (name: string) => {
      setQ(name);
      setListOpen(false);
      setActiveIndex(-1);
      onSelectStudent?.(name);
    },
    [onSelectStudent]
  );

  /* ================= Keep activeIndex valid ================= */
  useEffect(() => {
    if (!listOpen) {
      setActiveIndex(-1);
      return;
    }
    if (filtered.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((i) => {
      if (i < 0) return -1;
      if (i >= filtered.length) return filtered.length - 1;
      return i;
    });
  }, [listOpen, filtered.length]);

  /* ================= Scroll active option into view ================= */
  useEffect(() => {
    if (!listOpen) return;
    if (activeIndex < 0) return;
    const container = listRef.current;
    if (!container) return;

    const el = container.querySelector<HTMLButtonElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listOpen]);

  /* ================= Keyboard navigation ================= */
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setListOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!listOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setListOpen(true);
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!filtered.length) return;
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!filtered.length) return;
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      if (!listOpen) return;

      const name = filtered[activeIndex];
      if (typeof name === "string") {
        e.preventDefault();
        pickStudent(name);
      }
    }
  };

  /* ================= Avatar initials ================= */
  const initials = useMemo(() => {
    const parts = String(userName || "U")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const first = parts[0]?.[0] ?? "U";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
    return (first + last).toUpperCase();
  }, [userName]);

  const renderStats = (statsArr: HeaderStat[]) => {
    return (
      <div className="flex items-center gap-2 min-w-0">
        {statsArr.map((s) => (
          <div
            key={s.label}
            className="min-w-[160px] max-w-[220px] bg-white border border-gray-200 rounded-xl px-3 py-2"
          >
            <div className="text-[11px] text-gray-500 truncate">{s.label}</div>
            <div className="text-base font-semibold text-[#241453] leading-5">{s.value}</div>
            {s.sub ? <div className="text-[11px] text-gray-400 truncate">{s.sub}</div> : null}
          </div>
        ))}
      </div>
    );
  };

  /* ================= render ================= */
  return (
    <header
      className="
        bg-white rounded-2xl shadow-sm
        px-4 py-3
        flex flex-col gap-3
        sm:flex-row sm:items-center sm:justify-between
      "
    >
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0">
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            className="
              xl:hidden
              w-10 h-10 rounded-xl
              border border-gray-200
              hover:bg-gray-50 transition
              flex items-center justify-center
              text-[#442F73] bg-[#E4E4E4]
            "
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            ☰
          </button>
        )}

        {/* Avatar */}
        <div
          className="
            w-10 h-10 rounded-full
            bg-[#A88CD9] text-white
            flex items-center justify-center
            font-semibold text-sm
            shrink-0
          "
          title={userName}
        >
          {initials || "U"}
        </div>

        {/* Welcome */}
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-[#241453] truncate">
            Welcome {userName}!
          </h2>

          {!canSwitchCoach && (
            <div className="text-[11px] text-gray-500 mt-0.5">
              You can view only your own coach account
            </div>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 md:gap-3 justify-between md:justify-end">
        {/* Replaceable right area */}
        {rightContent ? (
          rightContent
        ) : stats && stats.length ? (
          renderStats(stats)
        ) : (
          /* Student Search, unchanged */
          <div ref={searchWrapRef} className="relative w-full sm:w-[260px]">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setListOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setListOpen(true)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search student..."
              className="
                w-full h-9 px-3
                rounded-lg
                border border-gray-200
                text-sm
                focus:outline-none focus:ring-2 focus:ring-[#A88CD9]
              "
              role="combobox"
              aria-expanded={listOpen}
              aria-controls="students-listbox"
              aria-autocomplete="list"
            />

            {listOpen && filtered.length > 0 && (
              <div
                className="
                  absolute z-50 mt-2 w-full
                  rounded-xl border border-gray-200
                  bg-white shadow-lg overflow-hidden custom-scroll
                "
                role="listbox"
                id="students-listbox"
              >
                <div ref={listRef} className="max-h-56 overflow-auto">
                  {filtered.map((name, idx) => {
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={name}
                        type="button"
                        data-idx={idx}
                        onClick={() => pickStudent(name)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={[
                          "w-full px-3 py-2 text-sm text-left transition text-gray-700",
                          active ? "bg-gray-100" : "hover:bg-gray-100",
                        ].join(" ")}
                        role="option"
                        aria-selected={active}
                      >
                        <span className="truncate block">{name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="px-3 py-2 border-t text-[11px] text-gray-500 flex justify-between">
                  <span>{filtered.length} results</span>
                  <button
                    type="button"
                    onClick={() => {
                      setListOpen(false);
                      setActiveIndex(-1);
                    }}
                    className="text-[#644D93] hover:underline"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filter */}
        <FilterDropdown
          coaches={coaches}
          disabled={false}                 
          lockCoach={lockCoachFilter}      
          onApply={(f) => {
            setListOpen(false);
            setActiveIndex(-1);
            onApplyFilters(f);            
          }}
          activeCoachId={activeCoachId}
          activePeriod={activePeriod}
        />
      </div>
    </header>
  );
}