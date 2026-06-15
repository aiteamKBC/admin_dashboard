interface StatsCardsProps {
  stats: {
    totalLearners: number;
    totalTickets: number;
    avgCompletion: number;
    allCompleted: number;
    lowScoreAreas: number;
    needsReview: number;
    mostCommonCareer: string;
    mostCommonWeakArea: string;
  };
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    { label: 'Total Learners', value: stats.totalLearners, icon: 'ri-user-line', color: 'text-primary-600', bg: 'bg-primary-50' },
    { label: 'Total Result Tickets', value: stats.totalTickets, icon: 'ri-ticket-line', color: 'text-accent-600', bg: 'bg-accent-50' },
    { label: 'Avg. Completion', value: `${stats.avgCompletion}%`, icon: 'ri-pie-chart-line', color: 'text-secondary-600', bg: 'bg-secondary-50' },
    { label: 'All Assessments Done', value: stats.allCompleted, icon: 'ri-check-double-line', color: 'text-secondary-700', bg: 'bg-secondary-50' },
    { label: 'Low Score Areas', value: stats.lowScoreAreas, icon: 'ri-alert-line', color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Needs Admin Review', value: stats.needsReview, icon: 'ri-eye-line', color: 'text-accent-700', bg: 'bg-accent-50' },
    { label: 'Top Career Path', value: stats.mostCommonCareer, icon: 'ri-briefcase-line', color: 'text-primary-600', bg: 'bg-primary-50', isLong: true },
    { label: 'Common Weak Area', value: stats.mostCommonWeakArea, icon: 'ri-focus-2-line', color: 'text-red-500', bg: 'bg-red-50', isLong: true },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-background-50 rounded-2xl border border-background-200/70 p-5 hover:border-primary-200 hover:shadow-md transition-all cursor-default shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center ring-1 ring-inset ring-black/5`}>
              <i className={`${card.icon} text-lg ${card.color}`}></i>
            </div>
            {!card.isLong && <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-secondary-600"><span className="w-1.5 h-1.5 rounded-full bg-secondary-500"></span>Live</span>}
          </div>
          <div className={`font-bold text-foreground-900 ${card.isLong ? 'text-base leading-snug' : 'text-3xl'}`}>{card.value}</div>
          <div className="text-xs uppercase tracking-wider text-foreground-500 mt-2">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
