import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LearnerDataset } from '../useLearnerData';

// ── Types ────────────────────────────────────────────────────────────────────
type HistoryAssessment = {
  overallScore: number | null;
  rating: string;
  subScores: Record<string, number | null>;
  submittedAt: string | null;
};
type HistorySubmission = {
  submissionId: number;
  date: string;
  assessments: Record<string, HistoryAssessment>;
};

// ── History Modal ─────────────────────────────────────────────────────────────
const HISTORY_LABELS: [string, string][] = [
  ['wellbeingAssessment',   'Wellbeing'],
  ['psychologicalCapital',  'Psychological Capital'],
  ['personalityTraits',     'Personality Traits'],
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

function scoreDeltaStyle(current: number | null, prev: number | null) {
  if (current === null || prev === null) return '';
  if (current > prev) return 'text-green-600';
  if (current < prev) return 'text-red-500';
  return 'text-foreground-400';
}

function scoreDeltaIcon(current: number | null, prev: number | null) {
  if (current === null || prev === null) return '';
  if (current > prev) return '▲';
  if (current < prev) return '▼';
  return '—';
}

function HistoryModal({ learnerName, email, onClose }: { learnerName: string; email: string; onClose: () => void }) {
  const [submissions, setSubmissions] = useState<HistorySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/accounts/learner-result-tickets/history/?email=${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setSubmissions(d.submissions ?? []); setLoading(false); })
      .catch(() => { setErr('Failed to load history.'); setLoading(false); });
  }, [email]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground-950/50" onClick={onClose} />
      <div className="relative bg-background-50 rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200">
          <div>
            <h3 className="text-sm font-semibold text-foreground-900">Assessment History</h3>
            <p className="text-xs text-foreground-500 mt-0.5">{learnerName} · {email}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-background-100 flex items-center justify-center cursor-pointer transition-colors">
            <i className="ri-close-line text-foreground-500 text-sm" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-auto p-5">
          {loading && <p className="text-xs text-foreground-400 text-center py-8">Loading history…</p>}
          {err && <p className="text-xs text-red-500 text-center py-8">{err}</p>}
          {!loading && !err && submissions.length === 0 && (
            <p className="text-xs text-foreground-400 text-center py-8">No submissions found.</p>
          )}
          {!loading && !err && submissions.length > 0 && (
            <div className="space-y-5">
              {/* Score comparison table */}
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 font-semibold text-foreground-600 bg-background-100 rounded-l-lg sticky left-0 min-w-[160px]">Assessment</th>
                    {submissions.map((s, i) => (
                      <th key={s.submissionId} className="text-center py-2 px-3 font-semibold text-foreground-600 bg-background-100 whitespace-nowrap min-w-[110px]">
                        <span className="block text-foreground-400 font-normal">#{i + 1}</span>
                        {s.date}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HISTORY_LABELS.map(([key, label]) => {
                    const hasAny = submissions.some(s => s.assessments[key]);
                    if (!hasAny) return null;
                    return (
                      <tr key={key} className="border-t border-background-100 hover:bg-background-50">
                        <td className="py-2.5 px-3 font-medium text-foreground-700 sticky left-0 bg-background-50">{label}</td>
                        {submissions.map((s, i) => {
                          const curr = s.assessments[key];
                          const prev = i > 0 ? submissions[i - 1]!.assessments[key] : null;
                          const score = curr?.overallScore ?? null;
                          const prevScore = prev?.overallScore ?? null;
                          const barColor = score === null ? 'bg-background-200' : score >= 80 ? 'bg-secondary-500' : score >= 60 ? 'bg-accent-500' : score >= 40 ? 'bg-accent-400' : 'bg-red-400';
                          return (
                            <td key={s.submissionId} className="py-2.5 px-3 text-center">
                              {score === null ? (
                                <span className="text-foreground-300">—</span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="w-full h-1.5 rounded-full bg-background-200 overflow-hidden">
                                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="font-semibold text-foreground-800">{score}%</span>
                                    {i > 0 && (
                                      <span className={`text-[10px] font-bold ${scoreDeltaStyle(score, prevScore)}`}>
                                        {scoreDeltaIcon(score, prevScore)}
                                        {score !== null && prevScore !== null && score !== prevScore
                                          ? ` ${Math.abs(score - prevScore)}`
                                          : ''}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-foreground-400">{curr?.rating}</span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Completion checklist per submission */}
              <div>
                <h4 className="text-xs font-semibold text-foreground-600 uppercase tracking-wider mb-3">Completion per Submission</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {submissions.map((s, i) => {
                    const total = HISTORY_LABELS.length;
                    const done = HISTORY_LABELS.filter(([key]) => !!s.assessments[key]).length;
                    const allDone = done === total;
                    return (
                      <div key={s.submissionId} className="bg-background-100 rounded-xl p-4 flex flex-col gap-2">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-foreground-400 font-medium">Submission #{i + 1}</span>
                            <p className="text-xs font-semibold text-foreground-800 mt-0.5">{s.date}</p>
                          </div>
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${allDone ? 'bg-secondary-100 text-secondary-700' : 'bg-accent-100 text-accent-700'}`}>
                            {allDone
                              ? <><i className="ri-checkbox-circle-fill text-secondary-500" /> {done}/{total} Done</>
                              : <><i className="ri-time-line text-accent-500" /> {done}/{total} In Progress</>
                            }
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 rounded-full bg-background-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${allDone ? 'bg-secondary-500' : 'bg-accent-500'}`}
                            style={{ width: `${Math.round((done / total) * 100)}%` }}
                          />
                        </div>
                        {/* Checklist */}
                        <div className="grid grid-cols-1 gap-0.5 mt-1">
                          {HISTORY_LABELS.map(([key, label]) => {
                            const isDone = !!s.assessments[key];
                            return (
                              <div key={key} className="flex items-center gap-1.5">
                                {isDone
                                  ? <i className="ri-checkbox-circle-fill text-secondary-500 text-xs flex-shrink-0" />
                                  : <i className="ri-circle-line text-foreground-300 text-xs flex-shrink-0" />
                                }
                                <span className={`text-[11px] ${isDone ? 'text-foreground-700' : 'text-foreground-300'}`}>{label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        {!loading && !err && submissions.length > 1 && (
          <div className="px-5 py-3 border-t border-background-100 flex items-center gap-4 text-[10px] text-foreground-400">
            <span><span className="text-green-600 font-bold">▲</span> Improved</span>
            <span><span className="text-red-500 font-bold">▼</span> Declined</span>
            <span><span className="font-bold">—</span> No change</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface TicketDetailDrawerProps {
  learnerId: string;
  isOpen: boolean;
  onClose: () => void;
  data: LearnerDataset;
  onMarkReviewed: (id: string) => void;
  onExport: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

const STATUS_OPTIONS = ['Completed', 'In Progress', 'Not Started', 'Needs Review'] as const;

const assessmentSections = [
  ['wellbeingAssessment', 'Wellbeing Assessment'],
  ['psychologicalCapital', 'Psychological Capital'],
  ['personalityTraits', 'Personality Traits'],
  ['careerAdaptability', 'Career Adaptability'],
  ['careerInterests', 'Career Interests (RIASEC)'],
  ['emotionalIntelligence', 'Emotional Intelligence'],
  ['workValues', 'Work Values'],
  ['englishCognitive', 'English & Cognitive Skills'],
  ['mathLogical', 'Mathematics & Logical Skills'],
  ['knowledgeAssessment', 'Knowledge Assessment'],
  ['skillsAssessment', 'Skills Assessment'],
  ['behaviorsAssessment', 'Behaviors Assessment'],
  ['learningStyle', 'Learning Style'],
] as const;

function getBadgeColor(value: string) {
  const colors: Record<string, string> = {
    Reviewed: 'bg-secondary-100 text-secondary-800',
    Completed: 'bg-secondary-100 text-secondary-800',
    Low: 'bg-secondary-100 text-secondary-800',
    High: 'bg-red-50 text-red-700',
    'Needs Review': 'bg-red-50 text-red-700',
    Moderate: 'bg-accent-100 text-accent-800',
    'In Progress': 'bg-accent-100 text-accent-800',
    'Not Reviewed': 'bg-background-200 text-foreground-600',
    'Not Started': 'bg-background-200 text-foreground-600',
  };
  return colors[value] || 'bg-background-200 text-foreground-600';
}

function ScoreBar({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-xs text-foreground-400">Not assessed</span>;
  const color = score >= 80 ? 'bg-secondary-500' : score >= 60 ? 'bg-accent-500' : score >= 40 ? 'bg-accent-400' : 'bg-red-400';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-background-200 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-medium text-foreground-700">{score}%</span>
    </div>
  );
}

function SubScoresModal({ title, subScores, onClose }: { title: string; subScores: Record<string, number | null>; onClose: () => void }) {
  const entries = Object.entries(subScores);
  const max = Math.max(...entries.map(([, v]) => v ?? 0), 5);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground-950/50" onClick={onClose} />
      <div className="relative bg-background-50 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200">
          <h3 className="text-sm font-semibold text-foreground-900">{title} — Detailed Scores</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-background-100 flex items-center justify-center cursor-pointer transition-colors">
            <i className="ri-close-line text-foreground-500 text-sm" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          {entries.length === 0 ? (
            <p className="text-xs text-foreground-400 text-center py-4">No sub-score data available.</p>
          ) : entries.map(([dim, val]) => {
            const pct = val !== null && val !== undefined ? Math.round((val / max) * 100) : null;
            const barColor = pct === null ? 'bg-background-200' : pct >= 80 ? 'bg-secondary-500' : pct >= 60 ? 'bg-accent-500' : pct >= 40 ? 'bg-accent-400' : 'bg-red-400';
            const level = val === null ? 'N/A' : val >= 4.2 ? 'Very High' : val >= 3.4 ? 'High' : val >= 2.6 ? 'Moderate' : val >= 1.8 ? 'Low' : 'Very Low';
            const levelColor = val === null ? 'text-foreground-400' : val >= 4.2 ? 'text-secondary-700' : val >= 3.4 ? 'text-secondary-600' : val >= 2.6 ? 'text-accent-700' : val >= 1.8 ? 'text-orange-600' : 'text-red-600';
            return (
              <div key={dim}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground-700">{dim}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${levelColor}`}>{level}</span>
                    <span className="text-xs text-foreground-500 w-8 text-right">{val !== null && val !== undefined ? val.toFixed(2) : '—'}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-background-200 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct ?? 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-background-100 text-right">
          <span className="text-xs text-foreground-400">Score scale: 1 (Very Low) → 5 (Very High)</span>
        </div>
      </div>
    </div>
  );
}

export default function TicketDetailDrawer({ learnerId, isOpen, onClose, data, onMarkReviewed, onExport, onStatusChange }: TicketDetailDrawerProps) {
  const learner = data.learners.find(l => l.id === learnerId);
  const [activeTab, setActiveTab] = useState<'overview' | 'career'>('overview');
  const [viewDataFor, setViewDataFor] = useState<{ title: string; subScores: Record<string, number | null> } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const openHistory = useCallback(() => setShowHistory(true), []);
  const closeHistory = useCallback(() => setShowHistory(false), []);
  const recommendations = useMemo(
    () => learner ? ((data.careerRecommendations as Record<string, any[]>)[learner.id] ?? []) : [],
    [data.careerRecommendations, learner],
  );
  const skillsToDevelop: string[] = useMemo(
    () => learner ? (((data as any).skillsToDevelop as Record<string, string[]>)?.[learner.id] ?? []) : [],
    [(data as any).skillsToDevelop, learner],
  );

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !learner) return null;

  return (
    <>
    {showHistory && learner && (
      <HistoryModal learnerName={learner.name} email={learner.email} onClose={closeHistory} />
    )}
    {viewDataFor && (
      <SubScoresModal
        title={viewDataFor.title}
        subScores={viewDataFor.subScores}
        onClose={() => setViewDataFor(null)}
      />
    )}
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground-950/40" onClick={onClose}></div>
      <div className="relative w-full max-w-4xl bg-background-50 h-full overflow-y-auto shadow-lg">
        <div className="sticky top-0 z-10 bg-background-50 border-b border-background-200 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-xs font-bold text-white">{learner.name.split(' ').map(n => n[0]).join('')}</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground-900">{learner.name}</h3>
              <p className="text-xs text-foreground-500">{learner.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-background-100 flex items-center justify-center cursor-pointer transition-colors">
            <i className="ri-close-line text-foreground-600"></i>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-background-50 rounded-2xl border border-background-200/70 p-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(learner.overallRisk)}`}>{learner.overallRisk} Risk</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(learner.reviewStatus)}`}>
                  <i className={learner.reviewStatus === 'Reviewed' ? 'ri-check-double-line' : 'ri-time-line'}></i>{learner.reviewStatus}
                </span>
                {learner.flagged && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
                    <i className="ri-flag-line"></i>Flagged
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={STATUS_OPTIONS.includes(learner.ticketStatus as typeof STATUS_OPTIONS[number]) ? learner.ticketStatus : 'Completed'}
                    onChange={(e) => onStatusChange(learner.id, e.target.value)}
                    className={`appearance-none pl-3 pr-7 py-1 rounded-lg text-xs font-medium cursor-pointer border focus:outline-none focus:ring-2 focus:ring-primary-200 ${getBadgeColor(learner.ticketStatus)}`}
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none opacity-70"></i>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-5">
              <div><span className="text-foreground-500">Profile</span><p className="font-medium text-foreground-800 mt-0.5">{learner.profileStatus}</p></div>
              <div><span className="text-foreground-500">Completion</span><p className="font-medium text-foreground-800 mt-0.5">{learner.assessmentCompletion}% ({learner.completedAssessments}/{learner.totalAssessments})</p></div>
              <div><span className="text-foreground-500">Last Updated</span><p className="font-medium text-foreground-800 mt-0.5">{learner.lastUpdated}</p></div>
              <div><span className="text-foreground-500">Reviewed By</span><p className="font-medium text-foreground-800 mt-0.5">{learner.reviewedBy || '-'}</p></div>
            </div>

            <div className="mt-4 pt-4 border-t border-background-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-foreground-500">Recommended Career</span>
                <p className="font-semibold text-primary-700 mt-1">{learner.recommendedCareer}</p>
              </div>
              <div>
                <span className="text-foreground-500">Top Strengths</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {learner.topStrengths.length ? learner.topStrengths.map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-secondary-50 text-secondary-700">{s}</span>
                  )) : <span className="text-foreground-400">—</span>}
                </div>
              </div>
              <div>
                <span className="text-foreground-500">Weakest Areas</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {learner.weakestAreas.length ? learner.weakestAreas.map((a) => (
                    <span key={a} className="px-2 py-0.5 rounded-full bg-red-50 text-red-600">{a}</span>
                  )) : <span className="text-foreground-400">—</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 w-fit">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${activeTab === 'overview' ? 'bg-background-50 text-foreground-900' : 'text-foreground-500 hover:text-foreground-700'}`}
            >
              Assessment Overview
            </button>
            <button
              onClick={() => setActiveTab('career')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${activeTab === 'career' ? 'bg-background-50 text-foreground-900' : 'text-foreground-500 hover:text-foreground-700'}`}
            >
              Career Path
            </button>
          </div>

          {activeTab === 'overview' ? (
            <div className="grid grid-cols-1 gap-3">
              {assessmentSections.map(([key, title]) => {
                const section = (data[key] as Record<string, any>)[learner.id];
                if (!section) return null;

                return (
                  <div key={key} className="bg-background-50 rounded-lg border border-background-200/70 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h5 className="text-sm font-semibold text-foreground-900">{title}</h5>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewDataFor({ title, subScores: section.subScores ?? {} })}
                          className="px-2 py-0.5 rounded-md text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-bar-chart-2-line mr-1" />View Data
                        </button>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(section.rating)}`}>{section.rating}</span>
                      </div>
                    </div>
                    <ScoreBar score={section.overallScore} />
                    <p className="text-xs text-foreground-600 mt-3">{section.interpretation}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {(section.strongAreas ?? []).map((area: string) => (
                        <span key={area} className="px-2 py-0.5 rounded-full bg-secondary-50 text-secondary-700 text-xs">{area}</span>
                      ))}
                      {(section.weakAreas ?? []).map((area: string) => (
                        <span key={area} className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs">{area}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.length === 0 ? (
                <div className="bg-background-50 rounded-lg border border-background-200/70 p-6 text-center">
                  <i className="ri-compass-3-line text-3xl text-foreground-300 mb-2 block"></i>
                  <p className="text-sm text-foreground-500">No career recommendations available yet.</p>
                </div>
              ) : recommendations.map((career, index) => (
                <div key={`${career.title}-${index}`} className="bg-background-50 rounded-lg border border-background-200/70 p-4">
                  <h5 className="text-sm font-semibold text-foreground-900">{career.title}</h5>
                  <p className="text-xs text-foreground-500 mt-1">{career.description}</p>
                  <div className="bg-background-100 rounded-md p-3 my-3">
                    <p className="text-xs text-foreground-700 font-medium mb-0.5">Match Reason</p>
                    <p className="text-xs text-foreground-600">{career.matchReason}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(career.relatedStrengths ?? []).map((area: string) => (
                      <span key={area} className="px-2 py-0.5 rounded-full bg-secondary-50 text-secondary-700 text-xs">{area}</span>
                    ))}
                    {(career.areasToImprove ?? []).map((area: string) => (
                      <span key={area} className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs">{area}</span>
                    ))}
                  </div>
                </div>
              ))}

              {skillsToDevelop.length > 0 && (
                <div className="bg-background-50 rounded-lg border border-background-200/70 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <i className="ri-tools-line text-primary-600 text-sm" />
                    <h5 className="text-sm font-semibold text-foreground-900">Skills to Develop</h5>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {skillsToDevelop.map((skill) => (
                      <span key={skill} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-100">
                        <i className="ri-seedling-line text-[10px]" />{skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-background-50 rounded-lg border border-background-200/70 p-4">
            <h4 className="text-xs font-semibold text-foreground-900 mb-3 uppercase tracking-wider">Admin Actions</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onMarkReviewed(learner.id)}
                title={learner.reviewStatus === 'Reviewed' ? 'Undo review' : 'Mark as reviewed'}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${learner.reviewStatus === 'Reviewed' ? 'bg-secondary-50 text-secondary-700 hover:bg-secondary-100' : 'bg-primary-700 text-white hover:bg-primary-800'}`}
              >
                <i className={`${learner.reviewStatus === 'Reviewed' ? 'ri-arrow-go-back-line' : 'ri-check-line'} mr-1`}></i>
                {learner.reviewStatus === 'Reviewed' ? 'Undo Review' : 'Mark as Reviewed'}
              </button>
              <button onClick={() => onExport(learner.id)} className="px-3 py-1.5 text-xs font-medium bg-background-100 text-foreground-600 rounded-md hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-download-line mr-1"></i>Export PDF
              </button>
              <button onClick={openHistory} className="px-3 py-1.5 text-xs font-medium bg-background-100 text-foreground-600 rounded-md hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-history-line mr-1"></i>History
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
