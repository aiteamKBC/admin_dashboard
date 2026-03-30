import CoachMetricsTable from "./CoachMetricsTable";

type CoachesOverviewProps = {
  metrics: {
    sessions: number;
    students: number;
    rating: number;
    elapsedDays: number;
    status: {
      label: string;
      color: string;
    };
  };
};


export default function CoachesOverview({ metrics }: CoachesOverviewProps) {
  return (
    <section >
      <CoachMetricsTable metrics={metrics} />
    </section>
  );
}
