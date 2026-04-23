import { fetchWithAuth } from "./fetchWithAuth";

export async function getCoachWellbeing(coachEmail?: string) {
  const query = coachEmail ? `?coach_email=${encodeURIComponent(coachEmail)}` : "";
  return await fetchWithAuth(`/coach-wellbeing-dashboard/${query}`);
}

export async function getCoachOptions() {
  return await fetchWithAuth("/coach-options/");
}

export type CreateSupportTicketPayload = {
  wellbeing_record_id: number | string;
  ticket_type: "wellbeing" | "safeguarding";
  subject: string;
  details?: string;
  urgency?: "low" | "medium" | "high" | "urgent";
  preferred_contact?: "email" | "phone";
};

export async function createSupportTicket(payload: CreateSupportTicketPayload) {
  return await fetchWithAuth("/support-tickets/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}