import { fetchWithAuth } from "./fetchWithAuth";

export async function getCoachWellbeing(coachEmail?: string) {
  const query = coachEmail ? `?coach_email=${encodeURIComponent(coachEmail)}` : "";
  return await fetchWithAuth(`/coach-wellbeing-dashboard/${query}`);
}

export async function getCoachOptions() {
  return await fetchWithAuth("/coach-options/");
}