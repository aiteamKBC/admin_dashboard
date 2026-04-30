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

export type CoachSuggestedActionItem = {
  id: string;
  priority: PriorityLevel;
  title: string;
  description: string;
  learnerName?: string;
  timeline?: string;
  category?: string;
};

export type CoachWellbeingResponse = {
  summary: {
    caseload: number;
    atRisk: number;
    nonResponders: number;
    openTickets: number;
  };
  learners: CoachLearnerRow[];
  trends: CoachTrendPoint[];
  followUps: CoachFollowUpItem[];
  suggestedActions: CoachSuggestedActionItem[];
};