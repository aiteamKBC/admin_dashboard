import { useEffect, useMemo, useState } from 'react';
import type { LearnerDataset } from '../useLearnerData';

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

export default function TicketDetailDrawer({ learnerId, isOpen, onClose, data, onMarkReviewed, onExport, onStatusChange }: TicketDetailDrawerProps) {
  const learner = data.learners.find(l => l.id === learnerId);
  const [activeTab, setActiveTab] = useState<'overview' | 'career'>('overview');
  const recommendations = useMemo(
    () => learner ? ((data.careerRecommendations as Record<string, any[]>)[learner.id] ?? []) : [],
    [data.careerRecommendations, learner],
  );

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !learner) return null;

  return (
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
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(section.rating)}`}>{section.rating}</span>
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
              <button className="px-3 py-1.5 text-xs font-medium bg-background-100 text-foreground-600 rounded-md hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-send-plane-line mr-1"></i>Send Summary
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
