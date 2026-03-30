type StatsOverviewProps = {
  stats: {
    completed: number;
    hours: number;
    reviews: number;
    cancelled: number;
    overdue: number;
  };
};

export default function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <div className="relative overflow-hidden rounded-xl p-5 w-full">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "url('data:image/svg+xml;utf8,\
<filter id=\"n\">\
<feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"4\"/>\
</filter>\
<rect width=\"100\" height=\"100\" filter=\"url(%23n)\" opacity=\"0.4\"/>\
</svg>')",
        }}
      />

      <div className="absolute inset-0 bg-gradient-to-r from-[#866CB6] via-[#644D93] to-[#241453]" />

      <div className="relative z-10 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Sessions Overview</h2>
          <p className="text-sm text-indigo-100">Summary of your session activity <span className="text-white">(changed according to filter settings)</span> </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Completed Sessions"
            icon="fa-solid fa-circle-check"
            value={stats.completed}
          />
          <StatCard
            title="Completed Hours"
            icon="fa-solid fa-clock"
            value={stats.hours}
          />
          <StatCard
            title="Cancelled Sessions"
            icon="fa-solid fa-ban"
            value={stats.cancelled}
          />
          <StatCard
            title="Overdue Marking"
            icon="fa-solid fa-triangle-exclamation"
            value={stats.overdue}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number | any;
  icon: string;
}) {
  const safeValue = typeof value === "number" ? value : 0;

  return (
    <div className="bg-white rounded-xl p-4 shadow-lg border border-white/40">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg ">
          <i className={`${icon} text-[#B27715] text-lg`} />
        </span>
        <span className="truncate">{title}</span>
      </div>

      <p className="text-2xl font-bold text-[#644D93] mt-2">{safeValue}</p>
    </div>
  );
}
