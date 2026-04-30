import { CoachAnalytics } from "../../api";
import { useEffect, useRef } from "react";

type CoachesListProps = {
  coaches: CoachAnalytics[];
  activeCoachId: number | null;
  onSelect: (coach: CoachAnalytics) => void;
  onViewStudents?: (coach: CoachAnalytics) => void;
};

export default function CoachesList({
  coaches,
  activeCoachId,
  onSelect,
  onViewStudents,
}: CoachesListProps) {
  // 1) Active ref
  const activeRef = useRef<HTMLLIElement | null>(null);

  // 2) Auto-scroll active into view when activeCoachId changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeCoachId]);

  return (
  <div className="w-full min-w-0 overflow-hidden">
    <ul className="space-y-1 w-full">
      {coaches
        .filter((c) => {
          const name = String((c as any)?.case_owner ?? "").trim();
          return name.length > 0 && !/^phone[12]$/i.test(name);
        })
        .map((coach) => {
          const isActive =
            activeCoachId != null && String(activeCoachId) === String(coach.id);

          return (
            <li
              key={coach.id}
              ref={isActive ? activeRef : null}
              className={[
                "group flex items-center justify-between gap-3",
                "px-3 py-2 rounded-xl border",
                "transition",
                isActive
                  ? "bg-violet-50 border-violet-50"
                  : "bg-white border-transparent hover:border-[#F1F1F1] hover:bg-[#F1F1F1]",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => onSelect(coach)}
                className={[
                  "min-w-0 flex-1 text-left",
                  "text-sm truncate",
                  isActive ? "text-[#442F73] font-semibold" : "text-gray-700",
                ].join(" ")}
                title={coach.case_owner}
              >
                {coach.case_owner}
              </button>

              {onViewStudents && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewStudents(coach);
                  }}
                  className={[
                    "shrink-0 inline-flex items-center gap-2",
                    "h-8 px-3 rounded-lg",
                    "text-xs font-medium ",
                    "bg-[#A88CD9]",
                    "border-[#A88CD9]",
                    isActive
                      ? "bg-gradient-to-r from-[#b27615c5] via-[#CEA869] to-[#E3C07F] text-white border-[#CEA869] hover:from-[#9D6912] hover:via-[#B27715] hover:to-[#CEA869]"
                      : "bg-[#ececec] text-[#B27715] border-[#F3E9DA] hover:bg-gradient-to-r hover:from-[#B27715] hover:via-[#CEA869] hover:to-[#E3C07F] hover:text-white",
                    "transition active:scale-[0.98]",
                    "focus:outline-none focus:ring-2 focus:ring-[#B27715]/50 rounded-lg",
                    isActive
                      ? "opacity-100 pointer-events-auto"
                      : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity",
                  ].join(" ")}
                >
                  <span>Students</span>
                </button>
              )}
            </li>
          );
        })}
    </ul>
  </div>
);
}
