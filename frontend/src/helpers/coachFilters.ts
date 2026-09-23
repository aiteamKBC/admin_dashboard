const hiddenCoachNames = new Set([
  "default owner",
  "demo admin",
  "enrolment team",
  "test coach",
  "test curriculum",
  "qa learner launch coach",
]);

export function isHiddenCoachOption(name: unknown): boolean {
  return hiddenCoachNames.has(String(name ?? "").trim().toLowerCase().replace(/\s+/g, " "));
}
