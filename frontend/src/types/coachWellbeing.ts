export type RiskLevel = "green" | "amber" | "red";
export type PriorityLevel = "low" | "medium" | "high" | "urgent";

export type CoachLearnerRow = {
  studentId: string | number;
  studentName: string;
  studentEmail: string;
  lastSurveyDate: string | null;
  wellbeingScore: number | null;
  engagementScore: number | null;
  providerSupportScore: number | null;
  totalScore?: number | null;
  safeguardingScore?: number | null;
  trend?: "up" | "down" | "stable" | null;
  trendDelta?: number | null;
  riskLevel: RiskLevel;
  recommendedAction: string;
  hasOpenTicket?: boolean;
  nonResponder?: boolean;
  followUpReason?: string;
  safeguardingFlag?: boolean;
  programme?: string;
  coachName?: string;
  coachEmail?: string;
  hasWellbeingData?: boolean;
  countedInSummary?: boolean;
  flaggedDomains?: Array<
    | string
    | {
        domain?: string;
        status?: string;
        score?: number;
        max?: number;
      }
  >;
  triggerCount?: number;
  triggeredQuestions?: Array<{
    text: string;
    score?: number | null;
    answer?: number | null;
    riskScore?: number | null;
    level?: string;
    note?: string;
  }>;
  surveyResponses?: Array<{
    questionCode?: string;
    questionText?: string;
    categoryName?: string;
    constructType?: string;
    answer?: number | string | null;
    concernLevel?: string;
  }>;
  apprenticeDashboard?: Record<string, unknown>;
};

export type CoachTrendPoint = {
  month: string;
  total: number;
  red: number;
  amber: number;
  green: number;
};

export type CoachFollowUpItem = {
  id: string;
  priority: PriorityLevel;
  title: string;
  learnerName: string;
  dueDate: string;
  reason?: string;
};

export type SuggestedActionEntry = {
  id: string;
  title: string;
  description: string;
  priority: PriorityLevel;
  actionType?: string;
  recommendedOwner?: string;
  timeline?: string;
  category?: string;
};

export type CoachSuggestedActionItem = {
  id: string;
  urgency: string;
  priority: PriorityLevel;
  learnerName?: string;
  learnerEmail?: string;
  actions: SuggestedActionEntry[];
};

export type CoachWellbeingResponse = {
  summary: {
    caseload: number;
    atRisk: number;
    greenRisk: number;
    nonResponders: number;
    openTickets: number;
    surveyResponded?: number;
    avgWellbeing?: number | null;
  };
  learners: CoachLearnerRow[];
  trends: CoachTrendPoint[];
  followUps: CoachFollowUpItem[];
  suggestedActions: CoachSuggestedActionItem[];
};
