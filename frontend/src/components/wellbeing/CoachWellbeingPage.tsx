import React, { useEffect, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import {
  AlertTriangle,
  ClipboardList,
  Search,
  UserRoundX,
  Users,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getCoachWellbeing, getCoachOptions, createSupportTicket, } from "@/services/coachWellbeing";
import type {
  CoachLearnerRow,
  CoachWellbeingResponse,
  PriorityLevel,
  RiskLevel,
  CoachFollowUpItem,
  CoachSuggestedActionItem,
} from "@/types/coachWellbeing";

type CoachOption = {
  value: string;
  label: string;
};

type TicketableLearnerRow = CoachLearnerRow & {
  hasOpenTicket?: boolean;
  openTicketCount?: number;
};

type SupportTicketFormState = {
  ticket_type: "wellbeing" | "safeguarding";
  subject: string;
  details: string;
  urgency: "low" | "medium" | "high" | "urgent";
  preferred_contact: "email" | "phone";
};

const initialTicketForm: SupportTicketFormState = {
  ticket_type: "wellbeing",
  subject: "",
  details: "",
  urgency: "medium",
  preferred_contact: "email",
};

const emptyDashboard: CoachWellbeingResponse = {
  summary: {
    caseload: 0,
    atRisk: 0,
    nonResponders: 0,
    openTickets: 0,
  },
  learners: [],
  trends: [],
  followUps: [],
  suggestedActions: [],
};

function riskBadgeClass(risk: RiskLevel) {
  if (risk === "green") return "bg-emerald-500 text-white";
  if (risk === "amber") return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
}

function priorityBadgeClass(priority: PriorityLevel) {
  if (priority === "urgent") {
    return "inline-flex h-7 shrink-0 items-center rounded-lg bg-[#FDE7E7] px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#D92D20]";
  }

  if (priority === "high") {
    return "inline-flex h-7 shrink-0 items-center rounded-lg bg-[#FFF3D6] px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#C88100]";
  }

  if (priority === "medium") {
    return "inline-flex h-7 shrink-0 items-center rounded-lg bg-[#E8F4FF] px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#1D70B8]";
  }

  return "inline-flex h-7 shrink-0 items-center rounded-lg bg-[#EEF2F7] px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#667085]";
}

function formatPriority(priority?: string) {
  return (priority || "low").toLowerCase() as PriorityLevel;
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#E7E2F3] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#7B6D9B] sm:text-sm">
            {title}
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#241453]">{value}</div>
        </div>

        <div className="rounded-xl bg-[#F5F1FC] p-3 text-[#644D93]">{icon}</div>
      </div>
    </div>
  );
}

function LearnerTable({
  rows,
  onOpenTicket,
}: {
  rows: TicketableLearnerRow[];
  onOpenTicket: (row: TicketableLearnerRow) => void;
}) {
  return (
    <div className="h-full overflow-hidden">
      <div className="custom-scroll h-full overflow-auto">
        <table className="w-full min-w-[940px] text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-[#ECE7F7] text-left text-[#7B6D9B]">
              <th className="pb-3 font-medium">Learner</th>
              <th className="pb-3 font-medium">Last Survey</th>
              <th className="pb-3 font-medium">Wellbeing</th>
              <th className="pb-3 font-medium">Engagement</th>
              <th className="pb-3 font-medium">Provider</th>
              <th className="pb-3 font-medium">Risk</th>
              <th className="pb-3 font-medium">Action</th>
              <th className="pb-3 font-medium">Follow up</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => {
              const hasOpenTicket = Boolean(row.hasOpenTicket);
              const openTicketCount = Number(row.openTicketCount || 0);

              return (
                <tr
                  key={`${row.studentId ?? row.studentName ?? "learner"}-${index}`}
                  className="border-b border-[#F1EDF8] last:border-0"
                >
                  <td className="py-4">
                    <div className="font-medium text-[#241453]">{row.studentName || "-"}</div>
                    <div className="text-xs text-slate-500">{row.studentEmail || ""}</div>
                  </td>

                  <td className="py-4 text-slate-600">{row.lastSurveyDate || "No survey"}</td>
                  <td className="py-4 text-[#241453]">{row.wellbeingScore ?? "-"}</td>
                  <td className="py-4 text-[#241453]">{row.engagementScore ?? "-"}</td>
                  <td className="py-4 text-[#241453]">{row.providerSupportScore ?? "-"}</td>

                  <td className="py-4">
                    <span
                      className={`inline-flex rounded-md px-3 py-1 text-xs font-medium capitalize ${riskBadgeClass(
                        row.riskLevel
                      )}`}
                    >
                      {row.riskLevel}
                    </span>
                  </td>

                  <td className="py-4 text-slate-600">{row.recommendedAction || "-"}</td>

                  <td className="py-4">
                    <button
                      type="button"
                      onClick={() => onOpenTicket(row)}
                      className={`inline-flex min-w-[130px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition ${hasOpenTicket
                        ? "border border-[#D9CFF3] bg-[#F5F1FC] text-[#6248BE] hover:bg-[#EEE7FB]"
                        : "bg-[#241453] text-white hover:bg-[#362063]"
                        }`}
                    >
                      {openTicketCount > 0 ? `Open ticket (${openTicketCount})` : "Open ticket"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoachSelect({
  value,
  options,
  placeholder = "Select coach",
  onChange,
}: {
  value: string;
  options: CoachOption[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const selected = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full sm:w-[300px]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-[#DED5F3] bg-white px-4 text-left text-sm font-medium text-[#241453] shadow-sm transition hover:border-[#CFC2EE] focus:outline-none focus:ring-2 focus:ring-[#E7DFFD]"
      >
        <span className={selected ? "truncate text-[#241453]" : "truncate text-[#8E82AE]"}>
          {selected?.label || placeholder}
        </span>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#7B6D9B] transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[#E6DDF8] bg-white shadow-[0_12px_30px_rgba(36,20,83,0.12)]">
            <div className="border-b border-[#F0EAFB] px-4 py-3">
              <p className="text-sm font-semibold text-[#241453]">Select coach</p>
            </div>

            <div className="custom-scroll max-h-[320px] overflow-y-auto py-2">
              {options.length === 0 ? (
                <div className="px-4 py-3 text-sm text-[#8E82AE]">No coaches found</div>
              ) : (
                options.map((item) => {
                  const active = item.value === value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        onChange(item.value);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${active
                        ? "bg-[#F4F0FC] text-[#241453]"
                        : "text-[#3D2A73] hover:bg-[#FAF8FE]"
                        }`}
                    >
                      <span className="truncate">{item.label}</span>
                      {active ? <span className="text-[#7A5FD0]">✓</span> : null}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#F0EAFB] px-4 py-2.5">
              <span className="text-xs text-[#8E82AE]">{options.length} results</span>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-[#7A5FD0] hover:text-[#6248BE]"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OpenTicketModal({
  open,
  learner,
  form,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  learner: TicketableLearnerRow | null;
  form: SupportTicketFormState;
  saving: boolean;
  error: string;
  onClose: () => void;
  onChange: <K extends keyof SupportTicketFormState>(
    key: K,
    value: SupportTicketFormState[K]
  ) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  if (!open || !learner) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-[#241453]">Open support ticket</h3>
            <p className="mt-1 text-sm text-[#7B6D9B]">
              Demo form for now, data will still be saved in support_tickets.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[#E7E2F3] px-4 py-2 text-sm text-[#241453]"
          >
            Close
          </button>
        </div>

        <div className="mb-5 rounded-2xl bg-[#F8F6FC] p-4">
          <div className="text-sm font-medium text-[#241453]">{learner.studentName || "-"}</div>
          <div className="mt-1 text-sm text-slate-500">{learner.studentEmail || "-"}</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Ticket type</label>
              <select
                value={form.ticket_type}
                onChange={(e) =>
                  onChange("ticket_type", e.target.value as "wellbeing" | "safeguarding")
                }
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              >
                <option value="wellbeing">Wellbeing</option>
                <option value="safeguarding">Safeguarding</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Urgency</label>
              <select
                value={form.urgency}
                onChange={(e) =>
                  onChange("urgency", e.target.value as "low" | "medium" | "high" | "urgent")
                }
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Subject</label>
            <input
              value={form.subject}
              onChange={(e) => onChange("subject", e.target.value)}
              placeholder="Enter ticket subject"
              className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Details</label>
            <textarea
              value={form.details}
              onChange={(e) => onChange("details", e.target.value)}
              placeholder="Demo notes for now..."
              rows={5}
              className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">
              Preferred contact
            </label>
            <select
              value={form.preferred_contact}
              onChange={(e) => onChange("preferred_contact", e.target.value as "email" | "phone")}
              className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
            >
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-[#DED5F3] px-5 py-2.5 text-sm font-medium text-[#241453]"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#241453] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#362063] disabled:opacity-60"
            >
              {saving ? "Saving..." : "Create ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type CoachWellbeingPageProps = {
  setMobileOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  isDesktop?: boolean;
};

export default function CoachWellbeingPage({ setMobileOpen, isDesktop }: CoachWellbeingPageProps) {
  const role = (localStorage.getItem("role") || "").toLowerCase();

  const [data, setData] = useState<CoachWellbeingResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(role === "qa");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coachOptions, setCoachOptions] = useState<CoachOption[]>([]);
  const [selectedCoachEmail, setSelectedCoachEmail] = useState("");

  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [selectedLearner, setSelectedLearner] = useState<TicketableLearnerRow | null>(null);
  const [ticketForm, setTicketForm] = useState<SupportTicketFormState>(initialTicketForm);

  useEffect(() => {
    const token = localStorage.getItem("access") || localStorage.getItem("token");
    if (role !== "qa" || !token) {
      setOptionsLoading(false);
      return;
    }

    let mounted = true;

    async function loadCoachOptions() {
      try {
        setOptionsLoading(true);

        const res = await getCoachOptions();
        if (!mounted) return;

        const normalized: CoachOption[] = (res || []).map((item: any) => ({
          value: String(item.value ?? item.coach_email ?? "").trim().toLowerCase(),
          label: String(item.label ?? item.coach_name ?? item.coach_email ?? "Coach").trim(),
        }));

        const deduped = Array.from(
          new Map(
            normalized
              .filter((item) => item.value)
              .map((item) => [item.value, item])
          ).values()
        );

        setCoachOptions(deduped);

        setSelectedCoachEmail((prev) => {
          if (prev) return prev;
          return deduped[0]?.value || "";
        });
      } catch (err) {
        console.error("Failed to load coach options", err);
        if (mounted) {
          setCoachOptions([]);
        }
      } finally {
        if (mounted) {
          setOptionsLoading(false);
        }
      }
    }

    loadCoachOptions();

    return () => {
      mounted = false;
    };
  }, [role]);

  function resetTicketModal() {
    setTicketModalOpen(false);
    setSelectedLearner(null);
    setTicketError("");
    setTicketForm(initialTicketForm);
  }

  function handleOpenTicket(row: TicketableLearnerRow) {
    setSelectedLearner(row);
    setTicketError("");

    setTicketForm({
      ticket_type: row.riskLevel === "red" ? "safeguarding" : "wellbeing",
      subject: row.recommendedAction || `Support follow up for ${row.studentName || "learner"}`,
      details: row.followUpReason || "",
      urgency: row.riskLevel === "red" ? "high" : "medium",
      preferred_contact: "email",
    });

    setTicketModalOpen(true);
  }

  function handleTicketFieldChange<K extends keyof SupportTicketFormState>(
    key: K,
    value: SupportTicketFormState[K]
  ) {
    setTicketForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleCreateTicket(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedLearner?.studentId) {
      setTicketError("Learner id not found");
      return;
    }

    if (!ticketForm.subject.trim()) {
      setTicketError("Subject is required");
      return;
    }

    try {
      setTicketSaving(true);
      setTicketError("");

      await createSupportTicket({
        wellbeing_record_id: selectedLearner.studentId,
        ticket_type: ticketForm.ticket_type,
        subject: ticketForm.subject.trim(),
        details: ticketForm.details.trim(),
        urgency: ticketForm.urgency,
        preferred_contact: ticketForm.preferred_contact,
      });

      const refreshed =
        role === "qa"
          ? await getCoachWellbeing(selectedCoachEmail)
          : await getCoachWellbeing();

      setData(refreshed || emptyDashboard);
      resetTicketModal();
    } catch (err: any) {
      console.error("create support ticket error", err);
      setTicketError(err?.message || "Failed to create support ticket");
    } finally {
      setTicketSaving(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      if (role === "qa") {
        if (optionsLoading) return;
        if (!selectedCoachEmail) return;
      }

      try {
        setLoading(true);
        setError("");

        const res =
          role === "qa"
            ? await getCoachWellbeing(selectedCoachEmail)
            : await getCoachWellbeing();

        if (!mounted) return;

        setData(res || emptyDashboard);
      } catch (err: any) {
        if (!mounted) return;
        console.error("coach wellbeing load error", err);
        setError(err?.message || "Failed to load wellbeing dashboard");
        setData(emptyDashboard);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, [role, selectedCoachEmail, optionsLoading]);

  const filteredLearners = useMemo<TicketableLearnerRow[]>(() => {
    const learners = (data?.learners || []) as TicketableLearnerRow[];
    const q = search.trim().toLowerCase();

    if (!q) return learners;

    return learners.filter((item) => {
      const studentName = String(item.studentName || "").toLowerCase();
      const studentEmail = String(item.studentEmail || "").toLowerCase();
      const recommendedAction = String(item.recommendedAction || "").toLowerCase();
      const programme = String((item as any).programme || "").toLowerCase();
      const followUpReason = String(item.followUpReason || "").toLowerCase();

      return (
        studentName.includes(q) ||
        studentEmail.includes(q) ||
        recommendedAction.includes(q) ||
        programme.includes(q) ||
        followUpReason.includes(q)
      );
    });
  }, [data, search]);

  const normalizedFollowUps = useMemo<CoachFollowUpItem[]>(() => {
    const items = (data?.followUps || []).map((item: any, index: number) => ({
      id: item.id ?? `${item.learnerName ?? "followup"}-${index}`,
      priority: formatPriority(item.priority),
      title: item.title || "Follow-up required",
      learnerName: item.learnerName || "Unknown learner",
      dueDate: item.dueDate || "-",
      reason: item.reason || "",
    }));

    return uniqueBy(items, (item) => `${item.id}-${item.title}-${item.learnerName}`);
  }, [data]);

  const normalizedActions = useMemo<CoachSuggestedActionItem[]>(() => {
    const items = (data?.suggestedActions || []).map((item: any, index: number) => ({
      id: item.id ?? `${item.title ?? "action"}-${index}`,
      priority: formatPriority(item.priority),
      title: item.title || "Suggested action",
      description: item.description || "",
      learnerName: item.learnerName || "",
      timeline: item.timeline || "",
      category: item.category || "",
    }));

    return uniqueBy(items, (item) => `${item.id}-${item.title}-${item.learnerName}`);
  }, [data]);

  const filteredFollowUps = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalizedFollowUps;

    return normalizedFollowUps.filter((item) => {
      return (
        String(item.title || "").toLowerCase().includes(q) ||
        String(item.learnerName || "").toLowerCase().includes(q) ||
        String(item.reason || "").toLowerCase().includes(q) ||
        String(item.dueDate || "").toLowerCase().includes(q)
      );
    });
  }, [normalizedFollowUps, search]);

  const filteredSuggestedActions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalizedActions;

    return normalizedActions.filter((item) => {
      return (
        String(item.title || "").toLowerCase().includes(q) ||
        String(item.description || "").toLowerCase().includes(q) ||
        String(item.learnerName || "").toLowerCase().includes(q) ||
        String(item.timeline || "").toLowerCase().includes(q) ||
        String(item.category || "").toLowerCase().includes(q)
      );
    });
  }, [normalizedActions, search]);

  const chartData = useMemo(() => {
    return (data?.trends || []).map((item: any) => ({
      month: item.month || "-",
      wellbeing: Number(item.wellbeing ?? 0),
      engagement: Number(item.engagement ?? 0),
      providerSupport: Number(item.providerSupport ?? 0),
    }));
  }, [data]);

  if (loading && !data) {
    return (
      <div id="report-area" className="p-6">
        <div className="rounded-2xl bg-white p-8 shadow-sm">Loading...</div>
      </div>
    );
  }

  if (loading && data) {
    return (
      <div id="report-area" className="min-h-screen bg-[#F8F6FC] p-4 sm:p-6">
        <div className="rounded-2xl bg-white p-8 shadow-sm">Loading...</div>
      </div>
    );
  }

  if (error && !data?.learners?.length && !data?.followUps?.length && !data?.suggestedActions?.length) {
    return (
      <div id="report-area" className="p-6">
        <div className="rounded-2xl bg-white p-8 shadow-sm text-red-600">{error}</div>
      </div>
    );
  }

  const isPageBootstrapping =
    loading ||
    data === null ||
    (role === "qa" && (optionsLoading || !selectedCoachEmail));

  if (isPageBootstrapping) {
    return (
      <div className="min-h-screen bg-[#F8F6FC] p-4 sm:p-6">
        <div className="flex min-h-[70vh] items-center justify-center rounded-3xl bg-white shadow-sm">
          <div className="text-sm font-medium text-[#7B6D9B]">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="report-area"
      className="min-h-screen bg-[#F8F6FC] p-3 sm:p-6"
      style={{ fontFamily: "Roboto, sans-serif" }}
    >
      <div className="mb-6 rounded-[28px] bg-white p-4 shadow-sm sm:p-6">
        {!isDesktop && typeof setMobileOpen === "function" ? (
          <div className="mb-4 flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#DED5F3] bg-[#FBFAFE] text-[#241453] shadow-sm transition hover:bg-white"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold leading-tight text-[#241453] sm:text-xl">
              Wellbeing Dashboard
            </h1>

            <p className="mt-2 text-sm leading-6 text-[#7B6D9B] sm:text-base">
              Monitor your caseload, wellbeing patterns, and support needs.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center 2xl:w-auto">
            {role === "qa" ? (
              <CoachSelect
                value={selectedCoachEmail}
                options={coachOptions}
                placeholder="Select coach"
                onChange={setSelectedCoachEmail}
              />
            ) : null}

            <div className="flex h-12 w-full items-center gap-2 rounded-2xl border border-[#E7E2F3] bg-[#FBFAFE] px-4 lg:min-w-[320px] lg:max-w-[460px]">
              <Search className="h-4 w-4 shrink-0 text-[#8E82AA]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search learners, programme, action..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Caseload"
          value={data?.summary?.caseload ?? 0}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="At Risk"
          value={data?.summary?.atRisk ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          title="Non-Responders"
          value={data?.summary?.nonResponders ?? 0}
          icon={<UserRoundX className="h-4 w-4" />}
        />
        <StatCard
          title="Open Tickets"
          value={data?.summary?.openTickets ?? 0}
          icon={<ClipboardList className="h-4 w-4" />}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6 xl:col-span-2 xl:h-[560px] xl:overflow-hidden">
          <div className="flex h-full flex-col">
            <h2 className="mb-5 shrink-0 text-md font-semibold text-[#241453]">
              Caseload Risk Overview
            </h2>

            <div className="min-h-0 flex-1 overflow-hidden">
              <LearnerTable rows={filteredLearners} onOpenTicket={handleOpenTicket} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6 xl:h-[560px]">
          <div className="flex h-full flex-col">
            <h2 className="mb-5 shrink-0 text-md font-semibold text-[#241453]">
              Caseload Trends
            </h2>

            <p className="mb-4 text-sm text-[#7B6D9B]">
              Overall monthly trend for all matched learners.
            </p>

            <div className="h-[300px] min-h-0 flex-1 sm:h-[360px] xl:h-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis domain={[0, 10]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="wellbeing" stroke="#10B981" strokeWidth={2} />
                  <Line type="monotone" dataKey="engagement" stroke="#3B82F6" strokeWidth={2} />
                  <Line
                    type="monotone"
                    dataKey="providerSupport"
                    stroke="#F59E0B"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6 xl:h-[420px]">
          <div className="flex h-full flex-col">
            <h2 className="mb-5 shrink-0 text-md font-semibold text-[#241453]">
              Learners Needing Follow-up
            </h2>

            <div className="custom-scroll min-h-0 flex-1 overflow-y-auto pr-2">
              <div className="space-y-4">
                {filteredFollowUps.length === 0 ? (
                  <div className="rounded-2xl border border-[#ECE7F7] p-4 text-sm text-slate-500">
                    No follow-ups yet
                  </div>
                ) : (
                  filteredFollowUps.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-[#ECE7F7] bg-[#FCFBFE] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-start gap-2">
                            <span className={priorityBadgeClass(item.priority)}>
                              {item.priority}
                            </span>

                            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-6 text-[#241453] sm:text-base">
                              {item.title}
                            </h3>
                          </div>

                          <p className="text-sm text-[#7B6D9B]">
                            {item.learnerName}, Due: {item.dueDate}
                          </p>

                          {item.reason ? (
                            <p className="mt-1 text-sm leading-6 text-slate-500">
                              {item.reason}
                            </p>
                          ) : null}
                        </div>

                        <button className="self-end text-[#7B6D9B] sm:self-auto">
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6 xl:h-[420px]">
          <div className="flex h-full flex-col">
            <h2 className="mb-5 shrink-0 text-md font-semibold text-[#241453]">
              Suggested Coach Actions
            </h2>

            <div className="custom-scroll min-h-0 flex-1 overflow-y-auto pr-2">
              <div className="space-y-4">
                {filteredSuggestedActions.length === 0 ? (
                  <div className="rounded-2xl border border-[#ECE7F7] p-4 text-sm text-slate-500">
                    No suggested actions yet
                  </div>
                ) : (
                  filteredSuggestedActions.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-[#ECE7F7] bg-[#FCFBFE] p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-start gap-2">
                            <span className={priorityBadgeClass(item.priority)}>
                              {item.priority}
                            </span>

                            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-6 text-[#241453] sm:text-base">
                              {item.title}
                            </h3>
                          </div>

                          <p className="text-sm leading-6 text-slate-500">
                            {item.description}
                          </p>

                          <p className="mt-2 text-sm text-[#7B6D9B]">
                            {item.learnerName ? `${item.learnerName}, ` : ""}
                            {item.timeline || ""}
                          </p>
                        </div>

                        <button className="h-11 shrink-0 self-start rounded-xl border border-[#D9CFF3] px-4 text-sm font-medium text-[#241453] transition hover:bg-[#F8F5FF]">
                          Convert to action
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-600 shadow-sm">
          {error}
        </div>
      ) : null}

      <OpenTicketModal
        open={ticketModalOpen}
        learner={selectedLearner}
        form={ticketForm}
        saving={ticketSaving}
        error={ticketError}
        onClose={() => {
          if (!ticketSaving) resetTicketModal();
        }}
        onChange={handleTicketFieldChange}
        onSubmit={handleCreateTicket}
      />
    </div>
  );
}