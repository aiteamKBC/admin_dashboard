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
  incident_date?: string;
  incident_time?: string;
  created_by?: string;
};

export async function createSupportTicket(payload: CreateSupportTicketPayload) {
  return await fetchWithAuth("/support-tickets/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSupportTickets(coachEmail?: string) {
  const query = coachEmail ? `?coach_email=${encodeURIComponent(coachEmail)}` : "";
  return await fetchWithAuth(`/support-tickets/list/${query}`);
}

export async function updateSupportTicket(ticketId: number, payload: { status: string }) {
  return await fetchWithAuth(`/support-tickets/${ticketId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getTicketNotes(ticketId: number) {
  return await fetchWithAuth(`/support-tickets/${ticketId}/notes/`);
}

export async function createTicketNote(ticketId: number, note: string) {
  return await fetchWithAuth(`/support-tickets/${ticketId}/notes/`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function getTicketEvidence(ticketId: number) {
  return await fetchWithAuth(`/support-tickets/${ticketId}/evidence/`);
}

export async function uploadEvidenceFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  return await fetchWithAuth("/evidence/upload/", { method: "POST", body: form });
}

export async function createTicketEvidence(
  ticketId: number,
  payload: { description: string; file_url?: string; file_name?: string }
) {
  return await fetchWithAuth(`/support-tickets/${ticketId}/evidence/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}