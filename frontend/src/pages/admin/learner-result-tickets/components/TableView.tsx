import { useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../../../../context/AuthContext';
import type { LearnerDataset } from '../useLearnerData';

const STATUS_OPTIONS = ['Completed', 'In Progress', 'Not Started', 'Needs Review'] as const;

const EXAM_KEYS: [string, string][] = [
  ['wellbeingAssessment',   'Wellbeing'],
  ['psychologicalCapital',  'Psychological'],
  ['personalityTraits',     'Personality'],
  ['careerAdaptability',    'Career Adaptability'],
  ['careerInterests',       'Career Interests'],
  ['emotionalIntelligence', 'Emotional Intelligence'],
  ['workValues',            'Work Values'],
  ['englishCognitive',      'English & Cognitive'],
  ['mathLogical',           'Math & Logical'],
  ['knowledgeAssessment',   'Knowledge'],
  ['skillsAssessment',      'Skills'],
  ['behaviorsAssessment',   'Behaviors'],
  ['learningStyle',         'Learning Style'],
];

function ReviewedByCell({ value, onChange }: { value: string | null; onChange: (name: string) => void }) {
  const auth = useContext(AuthContext);
  const defaultName = auth?.user?.username || 'Admin';
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function select(name: string) {
    onChange(name);
    setOpen(false);
    setInput('');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-foreground-600 hover:text-primary-700 hover:underline cursor-pointer transition-colors text-left"
      >
        {value || <span className="text-foreground-300">—</span>}
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-52 bg-background-50 rounded-xl shadow-lg border border-background-200 overflow-hidden">
          {/* Custom name input */}
          <div className="p-2 border-b border-background-100">
            <input
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && input.trim()) select(input.trim()); }}
              placeholder="Type a name…"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-background-200 focus:outline-none focus:border-primary-300 bg-background-50 text-foreground-800 placeholder-foreground-300"
            />
            {input.trim() && (
              <button
                onClick={() => select(input.trim())}
                className="mt-1.5 w-full text-left text-xs px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors cursor-pointer"
              >
                Use &quot;{input.trim()}&quot;
              </button>
            )}
          </div>
          {/* Fixed defaults */}
          <div className="p-2">
            <p className="text-[10px] text-foreground-400 uppercase tracking-wide mb-1 px-1">Quick select</p>
            <button
              onClick={() => select('Tina Wright')}
              className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-background-100 transition-colors cursor-pointer text-foreground-700 font-medium"
            >
              <i className="ri-user-star-line mr-1.5 text-primary-500" />Tina Wright
            </button>
            {defaultName !== 'Tina Wright' && (
              <button
                onClick={() => select(defaultName)}
                className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-background-100 transition-colors cursor-pointer text-foreground-600"
              >
                <i className="ri-user-line mr-1.5 text-foreground-400" />{defaultName}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  data: LearnerDataset;
  onViewDetails: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onMarkReviewed: (id: string) => void;
  onExport: (id: string) => void;
  onReviewedByChange: (id: string, name: string) => void;
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

function ExamChecklist({ ticketId, data }: { ticketId: string; data: LearnerDataset }) {
  const total = EXAM_KEYS.length;
  const doneKeys = EXAM_KEYS.filter(([key]) => !!(data[key as keyof LearnerDataset] as Record<string, unknown>)[ticketId]);
  const done = doneKeys.length;
  const allDone = done === total;

  return (
    <div className="flex flex-col gap-1.5 min-w-[160px]">
      {/* Badge + progress */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${allDone ? 'bg-secondary-100 text-secondary-700' : 'bg-accent-100 text-accent-700'}`}>
          {allDone
            ? <><i className="ri-checkbox-circle-fill" />{done}/{total} Done</>
            : <><i className="ri-time-line" />{done}/{total} In Progress</>
          }
        </span>
      </div>
      {/* Mini progress bar */}
      <div className="h-1 rounded-full bg-background-200 overflow-hidden w-full">
        <div
          className={`h-full rounded-full ${allDone ? 'bg-secondary-500' : 'bg-accent-500'}`}
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
      {/* Show tags only if not all done */}
      {!allDone && (
        <div className="flex flex-wrap gap-1">
          {EXAM_KEYS.map(([key, label]) => {
            const isDone = !!(data[key as keyof LearnerDataset] as Record<string, unknown>)[ticketId];
            return isDone ? (
              <span key={key} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-secondary-50 text-secondary-700">
                <i className="ri-check-line text-secondary-500" />{label}
              </span>
            ) : (
              <span key={key} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-background-200 text-foreground-400 line-through">
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TableView({ tickets, data, onViewDetails, onStatusChange, onMarkReviewed, onExport, onReviewedByChange }: TableViewProps) {
  return (
    <div className="bg-background-50 rounded-2xl border border-background-200/70 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1400px] text-sm">
          <thead>
            <tr className="border-b border-background-200 bg-background-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Learner ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Learner</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Completion</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Exams</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-foreground-600 whitespace-nowrap">Risk</th>
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
                <td className="px-4 py-4">
                  <ExamChecklist ticketId={ticket.id} data={data} />
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getRiskColor(ticket.overallRisk)}`}>{ticket.overallRisk}</span>
                </td>
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
                <td className="px-4 py-3">
                  <ReviewedByCell value={ticket.reviewedBy} onChange={(name) => onReviewedByChange(ticket.id, name)} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => onViewDetails(ticket.id)} className="w-8 h-8 rounded-md bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors cursor-pointer flex items-center justify-center" title="View details">
                      <i className="ri-eye-line"></i>
                    </button>
                    <button
                      onClick={() => onMarkReviewed(ticket.id)}
                      className={`w-8 h-8 rounded-md transition-colors flex items-center justify-center cursor-pointer ${ticket.reviewStatus === 'Reviewed' ? 'bg-secondary-50 text-secondary-700 hover:bg-secondary-100' : 'bg-background-100 text-foreground-700 hover:bg-background-200'}`}
                      title={ticket.reviewStatus === 'Reviewed' ? 'Undo review' : 'Mark reviewed'}
                    >
                      <i className={ticket.reviewStatus === 'Reviewed' ? 'ri-arrow-go-back-line' : 'ri-check-line'}></i>
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
