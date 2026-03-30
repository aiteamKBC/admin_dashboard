import type { CompletedSessionsMap } from "./helpers/meetings";

export type CancelledSessionsPayload = {
  sessions?: Array<{
    serviceName?: string;
    customerName?: string;
    cancelledAt?: string; // ISO datetime
    date?: string;        // optional if backend provides it
  }>;
};

export type CoachAnalytics = {
  id: number;
  case_owner: string;
  owner_phone: string;

  total_evidence: number;
  evidence_submitted: number;
  evidence_accepted: number;
  evidence_referred: number;

  completed_sessions: CompletedSessionsMap | null;
  completed_sessions_hours: number | null;
   cancelled_sessions: CancelledSessionsPayload | null;
  upcomming_sessions?: {
    meetings?: {
      date?: string;
      timeFrom?: string;
      timeTo?: string;
      coachName?: string;
      meetingId?: string;
      serviceName?: string;
      customerName?: string;
    }[];
  };

  nearest_appointement: string | null;
  last_sub_date: string | null;
  elapsed_days: number;

  with_student: string[];
  staff_id: string;

  avg_aptem?: number | null;
  avg_lms?: number | null;
  avg_overall?: number | null;
  rating?: string | null;
};

type CoachesAnalyticsResponse = {
  success: boolean;
  count: number;
  rows: CoachAnalytics[];
};

const API_BASE_URL = "/api";
const API_KEY =
  "1d1296c572361241a2935363bac9aee3e6054252a24b9de076485d2c58829b21";

export async function fetchAllCoachesAnalytics(): Promise<CoachAnalytics[]> {
  const response = await fetch(`${API_BASE_URL}/coaches/all`, {
    headers: {
      "x-api-key": API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data: CoachesAnalyticsResponse = await response.json();
  return data.rows;
}
