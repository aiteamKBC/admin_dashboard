import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type Props = {
  data: {
    submitted: number;
    accepted: number;
    referred: number;
    total: number;
  };
};

const COLOR_MAP: Record<string, string> = {
  Submitted: "#B27715",
  Accepted: "#aaaaaa",
  Referred: "#D6A5E6",
  Total: "#866CB6",
};

function CenterTotal({ total }: { total: number }) {
  return (
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
      <tspan
        x="50%"
        dy={-15}
        fill={COLOR_MAP.Total}
        fontSize={12}
        fontWeight={600}
      >
        Total
      </tspan>
      <tspan
        x="50%"
        dy={22}
        fill={COLOR_MAP.Total}
        fontSize={26}
        fontWeight={700}
      >
        {total}
      </tspan>
    </text>
  );
}

export default function EvidencePieChart({ data }: Props) {
  const submitted = Math.max(0, data.submitted || 0);
  const accepted = Math.max(0, data.accepted || 0);
  const referred = Math.max(0, data.referred || 0);

  const partsSum = submitted + accepted + referred;
  const total = Math.max(0, data.total || 0, partsSum);
  const rest = Math.max(0, total - partsSum);

  const overlayData = [
    { key: "Submitted", value: submitted },
    { key: "Accepted", value: accepted },
    { key: "Referred", value: referred },
    { key: "Rest", value: rest },
  ].filter((d) => d.value > 0);

  const legendItems = [
    { key: "Submitted", color: COLOR_MAP.Submitted },
    { key: "Accepted", color: COLOR_MAP.Accepted },
    { key: "Referred", color: COLOR_MAP.Referred },
    { key: "Total", color: COLOR_MAP.Total },
  ];

  return (
    <div className="w-full">
      <div className="h-[240px]">
        <ResponsiveContainer>
          <PieChart>
            {/* Base: Total full ring */}
            {total > 0 && (
              <Pie
                data={[{ key: "Total", value: total }]}
                dataKey="value"
                nameKey="key"
                innerRadius={60}
                outerRadius={90}
                isAnimationActive={false}
                paddingAngle={0}
              >
                <Cell fill={COLOR_MAP.Total} />
              </Pie>
            )}

            {/* Overlay: parts, rest is transparent so base Total shows */}
            <Pie
              data={overlayData}
              dataKey="value"
              nameKey="key"
              innerRadius={60}
              outerRadius={90}
              isAnimationActive={false}
              paddingAngle={0}
            >
              {overlayData.map((item) => (
                <Cell
                  key={item.key}
                  fill={
                    item.key === "Rest"
                      ? "rgba(0,0,0,0)"
                      : COLOR_MAP[item.key] || "#ccc"
                  }
                />
              ))}
            </Pie>

            {/* Center total number */}
            <CenterTotal total={total} />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;

                const p = payload[0];
                const name = String(p?.name || "");
                const value = Number(p?.value || 0);

                if (name === "Rest") return null;

                return (
                  <div className="bg-[#241453] text-white text-xs px-3 py-2 rounded-lg shadow">
                    <div className="font-medium">{name}</div>
                    <div>{value} evidences</div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 mt-4">
        {legendItems.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-2 text-xs text-gray-600"
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}