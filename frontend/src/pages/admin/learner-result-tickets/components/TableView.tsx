const STATUS_OPTIONS = ['Completed', 'In Progress', 'Not Started', 'Needs Review'] as const;

interface TableViewProps {
  tickets: Array<{
    id: string;
    name: string;
    email: string;
    assessmentCompletion: number;
    overallRisk: string;
    recommendedCareer: string;
    ticketStatus: string;
    reviewStatus: string;
    lastUpdated: string;
    reviewedBy: string | null;
  }>;
  onViewDetails: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onMarkReviewed: (id: string) => void;
  onExport: (id: string) => void;
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    Completed: 'bg-secondary-100 text-secondary-800',
    'In Progress': 'bg-accent-100 text-accent-800',
    'Not Started': 'bg-background-200 text-foreground-500',
    'Needs Review': 'bg-red-50 text-red-700',
  };
  return colors[status] || 'bg-background-200 text-foreground-600';
}

function getRiskColor(risk: string) {
  const colors: Record<string, string> = {
    Low: 'bg-secondary-100 text-secondary-800',
    Moderate: 'bg-accent-100 text-accent-800',
    High: 'bg-red-50 text-red-700',
  };
  return colors[risk] || 'bg-background-200 text-foreground-600';
}

function getReviewColor(status: string) {
  const colors: Record<string, string> = {
    Reviewed: 'bg-secondary-100 text-secondary-800',
    'Needs Review': 'bg-red-50 text-red-700',
    'Not Reviewed': 'bg-background-200 text-foreground-600',
  };
  return colors[status] || 'bg-background-200 text-foreground-600';
}

export default function TableView({ tickets, onViewDetails, onStatusChange, onMarkReviewed, onExport }: TableViewProps) {
  return (
    <div className="bg-background-50 rounded-2xl border border-background-200/70 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b border-background-200 bg-background-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Ticket ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Learner</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Completion</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Risk</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Career</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Review</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Last Updated</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Reviewed By</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="border-b border-background-100 hover:bg-background-100/50 transition-colors">
                <td className="px-4 py-3 text-xs font-mono text-foreground-600 whitespace-nowrap">{ticket.id}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary-700">{ticket.name.split(' ').map(n => n[0]).join('')}</span>
                    </div>
                    <span className="text-xs font-medium text-foreground-800 whitespace-nowrap">{ticket.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-foreground-600 whitespace-nowrap">{ticket.email}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-background-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${ticket.assessmentCompletion >= 80 ? 'bg-secondary-500' : ticket.assessmentCompletion >= 50 ? 'bg-accent-500' : 'bg-red-400'}`}
                        style={{ width: `${ticket.assessmentCompletion}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-foreground-800 whitespace-nowrap">{ticket.assessmentCompletion}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getRiskColor(ticket.overallRisk)}`}>{ticket.overallRisk}</span>
                </td>
                <td className="px-4 py-3 text-xs text-foreground-700 max-w-[160px] truncate whitespace-nowrap">{ticket.recommendedCareer}</td>
                <td className="px-4 py-3">
                  <div className="relative">
                    <select
                      value={ticket.ticketStatus}
                      onChange={(e) => onStatusChange(ticket.id, e.target.value)}
                      className={`appearance-none min-w-32 pl-2.5 pr-7 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border border-transparent focus:outline-none focus:border-primary-300 cursor-pointer ${getStatusColor(ticket.ticketStatus)}`}
                    >
                      {STATUS_OPTIONS.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-xs text-foreground-500 pointer-events-none"></i>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getReviewColor(ticket.reviewStatus)}`}>{ticket.reviewStatus}</span>
                </td>
                <td className="px-4 py-3 text-xs text-foreground-600 whitespace-nowrap">{ticket.lastUpdated}</td>
                <td className="px-4 py-3 text-xs text-foreground-500 whitespace-nowrap">{ticket.reviewedBy || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => onViewDetails(ticket.id)} className="w-8 h-8 rounded-md bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors cursor-pointer flex items-center justify-center" title="View details">
                      <i className="ri-eye-line"></i>
                    </button>
                    <button
                      onClick={() => onMarkReviewed(ticket.id)}
                      disabled={ticket.reviewStatus === 'Reviewed'}
                      className={`w-8 h-8 rounded-md transition-colors flex items-center justify-center ${ticket.reviewStatus === 'Reviewed' ? 'bg-secondary-50 text-secondary-700 cursor-default' : 'bg-background-100 text-foreground-700 hover:bg-background-200 cursor-pointer'}`}
                      title={ticket.reviewStatus === 'Reviewed' ? 'Reviewed' : 'Mark reviewed'}
                    >
                      <i className={ticket.reviewStatus === 'Reviewed' ? 'ri-check-double-line' : 'ri-check-line'}></i>
                    </button>
                    <button onClick={() => onExport(ticket.id)} className="w-8 h-8 rounded-md bg-background-100 text-foreground-700 hover:bg-background-200 transition-colors cursor-pointer flex items-center justify-center" title="Export PDF">
                      <i className="ri-download-line"></i>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
