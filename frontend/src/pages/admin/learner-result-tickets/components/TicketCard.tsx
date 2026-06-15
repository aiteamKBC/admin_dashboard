interface TicketCardProps {
  ticket: {
    id: string;
    name: string;
    email: string;
    assessmentCompletion: number;
    completedAssessments: number;
    totalAssessments: number;
    overallRisk: string;
    topStrengths: readonly string[];
    weakestAreas: readonly string[];
    recommendedCareer: string;
    lastUpdated: string;
    reviewStatus: string;
    ticketStatus: string;
    flagged: boolean;
  };
  onViewDetails: (id: string) => void;
  onMarkReviewed: (id: string) => void;
  onExport: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

const STATUS_OPTIONS = ['Completed', 'In Progress', 'Not Started', 'Needs Review'] as const;

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

export default function TicketCard({ ticket, onViewDetails, onMarkReviewed, onExport, onStatusChange }: TicketCardProps) {
  const isReviewed = ticket.reviewStatus === 'Reviewed';

  return (
    <div className="bg-background-50 rounded-2xl border border-background-200/70 p-5 shadow-sm hover:border-primary-200 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-sm font-bold text-white">{ticket.name.split(' ').map(n => n[0]).join('')}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground-900">{ticket.name}</h4>
              {ticket.flagged && <i className="ri-flag-line text-red-500 text-xs"></i>}
            </div>
            <p className="text-xs text-foreground-500">{ticket.email}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="relative">
            <select
              value={STATUS_OPTIONS.includes(ticket.ticketStatus as typeof STATUS_OPTIONS[number]) ? ticket.ticketStatus : 'Completed'}
              onChange={(e) => onStatusChange(ticket.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className={`appearance-none pl-2.5 pr-6 py-0.5 rounded-full text-xs font-medium cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-primary-200 ${getStatusColor(ticket.ticketStatus)}`}
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <i className="ri-arrow-down-s-line absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none opacity-70"></i>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${isReviewed ? 'bg-secondary-100 text-secondary-800' : 'bg-background-200 text-foreground-600'}`}>
            <i className={isReviewed ? 'ri-check-double-line' : 'ri-time-line'}></i>
            {isReviewed ? 'Reviewed' : 'Not Reviewed'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-3 text-xs">
        <div>
          <span className="text-foreground-500">Completion</span>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 w-20 h-1.5 bg-background-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${ticket.assessmentCompletion >= 80 ? 'bg-secondary-500' : ticket.assessmentCompletion >= 50 ? 'bg-accent-500' : 'bg-red-400'}`}
                style={{ width: `${ticket.assessmentCompletion}%` }}
              />
            </div>
            <span className="font-medium text-foreground-800 whitespace-nowrap">{ticket.assessmentCompletion}% ({ticket.completedAssessments}/{ticket.totalAssessments})</span>
          </div>
        </div>
        <div>
          <span className="text-foreground-500">Risk</span>
          <div className="mt-0.5">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRiskColor(ticket.overallRisk)}`}>{ticket.overallRisk}</span>
          </div>
        </div>
        <div>
          <span className="text-foreground-500">Career</span>
          <p className="text-xs font-medium text-foreground-800 mt-0.5 whitespace-nowrap">{ticket.recommendedCareer}</p>
        </div>
        <div>
          <span className="text-foreground-500">Updated</span>
          <p className="text-xs font-medium text-foreground-800 mt-0.5">{ticket.lastUpdated}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {ticket.topStrengths.map((s) => (
          <span key={s} className="px-2 py-0.5 rounded-full bg-secondary-50 text-secondary-700 text-xs whitespace-nowrap">
            <i className="ri-arrow-up-line mr-0.5 text-[10px]"></i>{s}
          </span>
        ))}
        {ticket.weakestAreas.map((a) => (
          <span key={a} className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs whitespace-nowrap">
            <i className="ri-arrow-down-line mr-0.5 text-[10px]"></i>{a}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-background-100">
        <button
          onClick={() => onViewDetails(ticket.id)}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-primary-700 text-white rounded-lg hover:bg-primary-800 transition-colors cursor-pointer whitespace-nowrap shadow-sm"
        >
          <i className="ri-eye-line mr-1"></i>View Details
        </button>
        <button
          onClick={() => onMarkReviewed(ticket.id)}
          title={isReviewed ? 'Undo review' : 'Mark as reviewed'}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            isReviewed
              ? 'bg-secondary-50 text-secondary-700 hover:bg-secondary-100'
              : 'bg-background-100 text-foreground-700 hover:bg-background-200'
          }`}
        >
          <i className={`${isReviewed ? 'ri-arrow-go-back-line' : 'ri-check-line'} mr-1`}></i>
          {isReviewed ? 'Undo Review' : 'Mark Reviewed'}
        </button>
        <button
          onClick={() => onExport(ticket.id)}
          className="px-3 py-1.5 text-xs font-medium bg-background-100 text-foreground-600 rounded-lg hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-download-line mr-1"></i>Export
        </button>
      </div>
    </div>
  );
}
