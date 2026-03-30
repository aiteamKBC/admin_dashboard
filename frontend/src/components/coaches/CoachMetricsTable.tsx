type Metrics = {
  students: number;
  elapsedDays: number;
  status: {
    label: string;
    color: string;
  };
};

export default function CoachMetricsTable({ metrics }: { metrics: Metrics }) {
  return (
    <table className="w-full bg-white rounded-xl">
      <thead>
        <tr className="text-left border-b text-sm text-[#442F73]">
          <th className="p-3">Metric</th>
          <th className="p-3">Value</th>
        </tr>
      </thead>

      <tbody className="text-sm">

        <tr className="border-b">
          <td className="p-3">Students</td>
          <td className="p-3">{metrics.students}</td>
        </tr>

        <tr className="border-b">
          <td className="p-3">No. of  Delayed Days (oldest submission assigned from student)</td>
          <td className="p-3">{metrics.elapsedDays}</td>
        </tr>

        <tr>
          <td className="p-3">Status</td>
          <td className="p-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${metrics.status.color}`}
            >
              {metrics.status.label}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
