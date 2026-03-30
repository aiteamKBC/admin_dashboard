import { useEffect, useMemo, useRef, useState } from "react";

/* ================= TYPES ================= */

type Coach = {
  id: number;
  case_owner: string;
};

type FilterDropdownProps = {
  coaches: Coach[];
  onApply?: (filters: { coach: string; period: string }) => void;

  // controlled values (from Analytics)
  activeCoachId?: number | "all" | null;
  activePeriod?: string; // "7" | "30" | "90" | "180" | "365"

  disabled?: boolean;

  // for AnalyticsMeetings when coach role should not change the filter (always locked to self)
  lockCoach?: boolean;
};

type Option = { value: string; label: string };

/* ================= COMPONENT ================= */

export default function FilterDropdown({
  coaches,
  onApply,
  activeCoachId = "all",
  activePeriod = "7",
  disabled = false,
  lockCoach = false,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);

  const [filters, setFilters] = useState({
    coach: "all",
    period: "7",
  });

  // dropdowns state
  const [coachOpen, setCoachOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);

  /* ================= sync from parent ================= */
  useEffect(() => {
    setFilters({
      coach:
        activeCoachId === "all" || activeCoachId == null
          ? "all"
          : String(activeCoachId),
      period: activePeriod || "7",
    });
  }, [activeCoachId, activePeriod]);

  /* ================= close handlers ================= */

  // close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      const t = e.target as Node;
      if (!wrapRef.current.contains(t)) {
        setOpen(false);
        setCoachOpen(false);
        setPeriodOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setCoachOpen(false);
        setPeriodOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setCoachOpen(false);
      setPeriodOpen(false);
    }
  }, [disabled]);

  /* ================= options ================= */

  const coachOptions: Option[] = useMemo(() => {
  const blockedNames = new Set(["api do not delete"]);

  return [
    { value: "all", label: "All Coaches" },
    ...coaches
      .filter((c) => {
        const name = String(c.case_owner ?? "").trim();
        return name !== "" && !blockedNames.has(name.toLowerCase());
      })
      .map((c) => ({
        value: String(c.id),
        label: String(c.case_owner ?? "").trim(),
      })),
  ];
}, [coaches]);

  const periodOptions: Option[] = useMemo(
    () => [
      { value: "7", label: "Last 7 Days" },
      { value: "30", label: "Last Month" },
      { value: "90", label: "Last 3 Months" },
      { value: "180", label: "Last 6 Months" },
      { value: "365", label: "Last Year" },
    ],
    []
  );

  const coachLabel =
    coachOptions.find((o) => o.value === filters.coach)?.label ?? "All Coaches";

  const periodLabel =
    periodOptions.find((o) => o.value === filters.period)?.label ?? "Last 7 Days";

  /* ================= actions ================= */

  const closeAll = () => {
    setOpen(false);
    setCoachOpen(false);
    setPeriodOpen(false);
  };

  const handleClear = () => {
    if (disabled) return;
    const next = { coach: "all", period: "7" };
    setFilters(next);
    onApply?.(next); // ✅ يرجّع الداتا فورًا
    closeAll();
  };

  const handleApply = () => {
    if (disabled) return;
    onApply?.(filters);
    closeAll();
  };

  /* ================= render ================= */

  return (
    <div className="relative" ref={wrapRef}>
      {/* Filter Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setCoachOpen(false);
          setPeriodOpen(false);
        }}
        className={[
          `
          flex items-center gap-2
          px-3 h-9
          rounded-lg
          border border-[#644D93]
          text-[#644D93] text-sm font-medium
          transition
        `,
          disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-[#A88CD9]/10",
        ].join(" ")}
        title={disabled ? "Not allowed for this role" : "Filter"}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M3 4h18M6 10h12M10 16h4" />
        </svg>
        Filter
      </button>

      {/* Dropdown Panel */}
      {open && !disabled && (
        <div
          className="
            absolute right-0 mt-2 w-[320px]
            bg-white rounded-xl shadow-lg
            border border-gray-200
            p-4 z-50
          "
        >
          {/* Coach Dropdown (Custom) */}
          <div className="mb-3 custom-scroll">
            <label className="text-xs text-[#644D93] mb-1 block">Coach</label>

            <CustomSelect
              value={filters.coach}
              label={coachLabel}
              open={coachOpen}
              setOpen={(v) => {
                if (lockCoach) return;
                setCoachOpen(v);
                if (v) setPeriodOpen(false);
              }}
              options={coachOptions}
              onChange={(val) => {
                if (lockCoach) return;
                setFilters((p) => ({ ...p, coach: val }));
              }}
              disabled={lockCoach}
            />
          </div>

          {/* Time Period Dropdown (Custom) */}
          <div className="mb-4">
            <label className="text-xs text-[#644D93] mb-1 block">Time Period</label>

            <CustomSelect
              value={filters.period}
              label={periodLabel}
              open={periodOpen}
              setOpen={(v) => {
                setPeriodOpen(v);
                if (v) setCoachOpen(false);
              }}
              options={periodOptions}
              onChange={(val) => setFilters((p) => ({ ...p, period: val }))}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={handleClear}
              className="text-sm text-[#644D93] hover:underline"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={handleApply}
              className="
                px-4 py-2
                bg-[#644D93]
                text-white text-sm
                rounded-lg
                hover:bg-[#442F73]
                transition
              "
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= Custom Select ================= */

function CustomSelect({
  value,
  label,
  open,
  setOpen,
  options,
  onChange,
  disabled = false,
}: {
  value: string;
  label: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  options: Option[];
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={[
          `
    w-full h-9 px-3
    border border-gray-200
    rounded-lg
    text-sm text-left
    bg-white
    focus:outline-none focus:ring-2 focus:ring-[#A88CD9]
    flex items-center justify-between
    `,
          disabled ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <span className="truncate">{label}</span>
        <svg
          className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="
            absolute z-50 mt-2 w-full
            rounded-xl border border-gray-200
            bg-white shadow-lg
            overflow-hidden
          "
        >
          <div className="max-h-56 overflow-auto">
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
                  className={`
                    w-full px-3 py-2 text-sm text-left
                    flex items-center justify-between
                    transition
                    ${active
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-700 hover:bg-gray-100"
                    }
                  `}
                >
                  <span className="truncate">{opt.label}</span>
                  {active && <span className="text-xs text-[#644D93]">Selected</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
