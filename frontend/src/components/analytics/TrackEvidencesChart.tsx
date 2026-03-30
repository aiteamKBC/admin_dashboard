import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";

type RadarMetric = {
  metric: string;
  value: number;   // 0..100
  raw?: number;    // upcoming count
};

type Props = {
  data: RadarMetric[];
  ratingLabel?: string; 
};

const ratingPillClass = (rating?: string) => {
  const s = String(rating ?? "").toLowerCase();
  if (s.includes("excellent")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s.includes("good")) return "bg-violet-50 text-violet-700 border-violet-200";
  if (s.includes("needs attention")) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
};

export default function TrackEvidencesChart({ data, ratingLabel }: Props) {
  return (
    <div className="relative h-[220px]">
      {/* Rating label (top-right) */}
      <div className="absolute right-2 z-10">
        <span
          className={[
            "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border",
            ratingPillClass(ratingLabel),
          ].join(" ")}
        >
          {ratingLabel && ratingLabel !== "—" ? ratingLabel : "No rating"}
        </span>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as RadarMetric;

              return (
                <div className="bg-[#241453] text-white text-xs rounded-md px-3 py-2 shadow-lg">
                  <div className="flex justify-between gap-3">
                    <span>{p.metric}</span>
                    <span className="font-semibold">{Math.round(p.value)}</span>
                  </div>

                  {typeof p.raw === "number" && p.metric === "Upcoming" && (
                    <div className="text-gray-200 mt-1">
                     No. of meetings: <span className="font-semibold">{p.raw}</span>
                    </div>
                  )}
                </div>
              );
            }}
          />

          <Radar
            dataKey="value"
            stroke="#866CB6"
            fill="#A88CD9"
            fillOpacity={0.35}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
