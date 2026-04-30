import React, { useEffect, useMemo, useState } from "react";
import {
  Menu,
  AlertTriangle,
  ClipboardList,
  Search,
  UserRoundX,
  Users,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Eye,
  Plus,
  Ticket,
  X,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
  Upload,
  FileText,
  Image as ImageIcon,
  UserCheck,
  MessageCircle,
  Phone,
  HelpCircle,
  Calendar,
  Paperclip,
  Shield,
  AlertOctagon,
  ExternalLink,
  ClipboardCheck,
  XCircle,
  RotateCcw,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getCoachWellbeing, getCoachOptions, createSupportTicket, getSupportTickets, updateSupportTicket, createTicketNote, uploadEvidenceFile, createTicketEvidence, getTicketNotes, getTicketEvidence } from "@/services/coachWellbeing";
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
  incident_date: string;
  incident_time: string;
  created_by: string;
};

type TicketStatus =
  | "open" | "new" | "under review" | "assigned" | "awaiting information"
  | "action in progress" | "follow-up scheduled" | "support plan active"
  | "escalated" | "external referral made" | "outcome recorded"
  | "closed" | "reopened";

type ActionModalType =
  | "case_note" | "contact_learner" | "contact_coach" | "schedule_followup"
  | "add_evidence" | "change_risk" | "support_plan" | "escalate"
  | "external_referral" | "record_outcome" | "close_case" | null;

type ActionItem = {
  id: string;
  label: string;
  newStatus?: string;
  requiresModal?: boolean;
  danger?: boolean;
  success?: boolean;
};

type ActionGroup = {
  label: string;
  items: ActionItem[];
};

type SupportTicketRow = {
  id: number;
  ticketCode: string;
  learnerName: string;
  learnerEmail: string;
  type: string;
  risk: "red" | "amber" | "green";
  source: string;
  createdAt: string | null;
  status: TicketStatus | string;
  daysOpen: number;
  subject: string;
  details: string;
  urgency: string;
  preferredContact: string;
  notes?: TicketNoteRow[];
  evidence?: TicketEvidenceRow[];
  createdBy?: string;
};

type SupportTicketsResponse = {
  summary: {
    total: number;
    open: number;
    redRisk: number;
    escalated: number;
    closed: number;
  };
  tickets: SupportTicketRow[];
};

type TicketNoteRow = {
  id: number | string;
  note: string;
  created_by: string;
  created_at: string | null;
};

type TicketEvidenceRow = {
  id: number | string;
  description: string;
  file_url: string;
  file_name: string;
  created_by: string;
  created_at: string | null;
};

function makeInitialTicketForm(): SupportTicketFormState {
  const now = new Date();
  return {
    ticket_type: "wellbeing",
    subject: "",
    details: "",
    urgency: "medium",
    preferred_contact: "email",
    incident_date: now.toISOString().slice(0, 10),
    incident_time: now.toTimeString().slice(0, 5),
    created_by: localStorage.getItem("username") || localStorage.getItem("email") || "",
  };
}

// Resolves relative /media/... URLs to absolute using the backend origin
const API_ORIGIN = ((import.meta as any).env?.VITE_API_ORIGIN || "").toString().trim();
function resolveMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_ORIGIN}${url}`;
}

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

function TrendBadge({ trend, delta }: { trend?: string | null; delta?: number | null }) {
  if (!trend) {
    return (
      <span className="text-xs text-slate-300" title="First survey — no previous data">—</span>
    );
  }
  if (trend === "stable") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
        <Minus className="h-3 w-3" />
        Stable
      </span>
    );
  }
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
        <TrendingUp className="h-3 w-3" />
        {delta != null ? `+${delta.toFixed(1)}` : "Improving"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
      <TrendingDown className="h-3 w-3" />
      {delta != null ? delta.toFixed(1) : "Declining"}
    </span>
  );
}

function SafeguardingCell({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-slate-300">—</span>;

  const val = Number(score);
  let dotClass: string;
  let label: string;
  let tipColor: string;
  let arrowColor: string;

  if (val >= 7) {
    dotClass = "bg-emerald-400";
    label = "Safe";
    tipColor = "#065f46";
    arrowColor = "#065f46";
  } else if (val >= 4) {
    dotClass = "bg-amber-400";
    label = "Moderate risk";
    tipColor = "#92400e";
    arrowColor = "#92400e";
  } else {
    dotClass = "bg-red-500";
    label = "High risk";
    tipColor = "#991b1b";
    arrowColor = "#991b1b";
  }

  return (
    <div className="group relative inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
      <span className="tabular-nums text-[#241453]">{val.toFixed(2)}</span>

      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 group-hover:block">
        <div
          className="whitespace-nowrap rounded-lg px-3 py-2 text-xs text-white shadow-lg"
          style={{ backgroundColor: tipColor }}
        >
          <p className="font-semibold">{label}</p>
          <p className="mt-0.5 opacity-80">Higher score = safer · Lower = higher risk</p>
          <div
            className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: arrowColor }}
          />
        </div>
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
    <div className="overflow-hidden rounded-2xl border border-[#EEE8F8]">
      <div className="custom-scroll overflow-auto" style={{ maxHeight: "520px" }}>
        <table className="w-full min-w-[1280px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#EEE8F8] bg-[#FAFAFF] text-left text-xs font-semibold uppercase tracking-wide text-[#8E82AA]">
              <th className="px-4 py-3 first:pl-5">Learner</th>
              <th className="px-4 py-3 whitespace-nowrap">Last Survey</th>
              <th className="px-4 py-3 whitespace-nowrap">Total Score</th>
              <th className="px-4 py-3 whitespace-nowrap">Safeguarding</th>
              <th className="px-4 py-3">Wellbeing</th>
              <th className="px-4 py-3">Engagement</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Trend</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3 last:pr-5">Follow up</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3EFF9]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-10 text-center text-sm text-slate-400">
                  No learners found
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const hasOpenTicket = Boolean(row.hasOpenTicket);
                const openTicketCount = Number(row.openTicketCount || 0);
                const noData = !row.hasWellbeingData;

                return (
                  <tr
                    key={`${row.studentId ?? row.studentName ?? "learner"}-${index}`}
                    className={`transition-colors hover:bg-[#FAFAFF] ${noData ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3 first:pl-5">
                      <div className="font-medium text-[#241453]">{row.studentName || "-"}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{row.studentEmail || ""}</div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-500">
                      {row.lastSurveyDate || <span className="text-slate-400 italic">No survey</span>}
                    </td>

                    <td className="px-4 py-3 tabular-nums font-semibold text-[#241453]">
                      {row.totalScore != null ? Number(row.totalScore).toFixed(2) : <span className="text-slate-300">—</span>}
                    </td>

                    <td className="px-4 py-3">
                      <SafeguardingCell score={row.safeguardingScore} />
                    </td>

                    <td className="px-4 py-3 tabular-nums text-[#241453]">
                      {row.wellbeingScore != null ? row.wellbeingScore : <span className="text-slate-300">—</span>}
                    </td>

                    <td className="px-4 py-3 tabular-nums text-[#241453]">
                      {row.engagementScore != null ? row.engagementScore : <span className="text-slate-300">—</span>}
                    </td>

                    <td className="px-4 py-3 tabular-nums text-[#241453]">
                      {row.providerSupportScore != null ? row.providerSupportScore : <span className="text-slate-300">—</span>}
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${riskBadgeClass(row.riskLevel)}`}>
                        {row.riskLevel}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <TrendBadge trend={row.trend} delta={row.trendDelta} />
                    </td>

                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="line-clamp-2 text-slate-600">{row.recommendedAction || "—"}</span>
                    </td>

                    <td className="px-4 py-3 last:pr-5">
                      <button
                        type="button"
                        onClick={() => onOpenTicket(row)}
                        className={`inline-flex h-9 items-center justify-center rounded-xl px-4 text-xs font-semibold transition whitespace-nowrap ${
                          hasOpenTicket
                            ? "border border-[#D9CFF3] bg-[#F5F1FC] text-[#6248BE] hover:bg-[#EEE7FB]"
                            : "bg-[#241453] text-white hover:bg-[#362063]"
                        }`}
                      >
                        {openTicketCount > 0 ? `Open ticket (${openTicketCount})` : "Open ticket"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
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

// helper for badges
function ticketRiskBadgeClass(risk?: string) {
  const value = String(risk || "").toLowerCase();

  if (value === "red") {
    return "bg-[#EF4444] text-white";
  }

  if (value === "amber") {
    return "bg-[#F59E0B] text-white";
  }

  return "bg-[#22C55E] text-white";
}

function ticketStatusBadgeClass(status?: string) {
  const value = String(status || "").toLowerCase();

  if (value === "closed") {
    return "border border-[#D8DEE8] bg-[#EEF2F7] text-[#64748B]";
  }

  if (value === "escalated") {
    return "border border-[#F3B3B3] bg-[#FEE2E2] text-[#DC2626]";
  }

  if (value === "under review") {
    return "border border-[#F2D29B] bg-[#FEF3C7] text-[#D97706]";
  }

  if (value === "action in progress") {
    return "border border-[#B7E1DE] bg-[#DDF4F1] text-[#0F766E]";
  }

  if (value === "assigned") {
    return "border border-[#B7E1DE] bg-[#DDF4F1] text-[#0F766E]";
  }

  if (value === "new") {
    return "border border-[#B8D4FE] bg-[#DBEAFE] text-[#2563EB]";
  }

  if (value === "awaiting information") {
    return "border border-[#FDD9A5] bg-[#FFF7ED] text-[#C2410C]";
  }

  if (value === "follow-up scheduled") {
    return "border border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1]";
  }

  if (value === "support plan active") {
    return "border border-[#99F6E4] bg-[#F0FDF4] text-[#047857]";
  }

  if (value === "external referral made") {
    return "border border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]";
  }

  if (value === "outcome recorded") {
    return "border border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]";
  }

  if (value === "reopened") {
    return "border border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA]";
  }

  return "border border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]";
}

function formatTicketDate(value?: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("en-CA");
  } catch {
    return value;
  }
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  start_review:      Eye,
  assign_owner:      UserCheck,
  case_note:         FileText,
  contact_learner:   MessageCircle,
  contact_coach:     Phone,
  request_info:      HelpCircle,
  schedule_followup: Calendar,
  add_evidence:      Paperclip,
  change_risk:       AlertTriangle,
  support_plan:      Shield,
  escalate:          AlertOctagon,
  external_referral: ExternalLink,
  record_outcome:    ClipboardCheck,
  close_case:        XCircle,
  reopen_case:       RotateCcw,
};

const ACTION_GROUPS: ActionGroup[] = [
  {
    label: "Review",
    items: [
      { id: "start_review", label: "Start Review", newStatus: "under review" },
      { id: "assign_owner", label: "Assign Owner", newStatus: "assigned" },
    ],
  },
  {
    label: "Contact",
    items: [
      { id: "case_note", label: "Add Case Note", requiresModal: true },
      { id: "contact_learner", label: "Contact Learner", requiresModal: true, newStatus: "action in progress" },
      { id: "contact_coach", label: "Contact Coach / Tutor", requiresModal: true, newStatus: "action in progress" },
      { id: "request_info", label: "Request More Information", newStatus: "awaiting information" },
    ],
  },
  {
    label: "Case Record",
    items: [
      { id: "schedule_followup", label: "Schedule Follow-up", requiresModal: true, newStatus: "follow-up scheduled" },
      { id: "add_evidence", label: "Add Evidence", requiresModal: true },
      { id: "change_risk", label: "Change Risk Level", requiresModal: true },
    ],
  },
  {
    label: "Safeguarding Actions",
    items: [
      { id: "support_plan", label: "Create Support / Safety Plan", requiresModal: true, newStatus: "support plan active" },
      { id: "escalate", label: "Escalate Case", requiresModal: true, newStatus: "escalated", danger: true },
      { id: "external_referral", label: "Record External Referral", requiresModal: true, newStatus: "external referral made" },
    ],
  },
  {
    label: "Closure",
    items: [
      { id: "record_outcome", label: "Record Outcome", requiresModal: true, newStatus: "outcome recorded" },
      { id: "close_case", label: "Close Case", requiresModal: true, newStatus: "closed", danger: true },
      { id: "reopen_case", label: "Reopen Case", newStatus: "open", success: true },
    ],
  },
];

type TicketFilters = {
  status: string[];
  type: string[];
  risk: string[];
};

const emptyFilters: TicketFilters = { status: [], type: [], risk: [] };

function TicketActionsDropdown({
  ticket,
  onChange,
  updating,
}: {
  ticket: SupportTicketRow;
  onChange: (ticketId: number, newStatus: string) => void;
  updating: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, right: 0, maxH: 440 });
  const [activeModal, setActiveModal] = React.useState<ActionModalType>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const currentStatus = String(ticket.status || "").toLowerCase();

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const maxH = Math.min(440, Math.max(120, spaceBelow > spaceAbove ? spaceBelow - 48 : spaceAbove - 48));
      const top = spaceBelow >= 200 || spaceBelow >= spaceAbove
        ? rect.bottom + 4
        : Math.max(8, rect.top - 48 - maxH - 4);
      setPos({ top, right: window.innerWidth - rect.right, maxH });
    }
    setOpen((prev) => !prev);
  }

  function handleAction(item: ActionItem) {
    setOpen(false);
    if (item.requiresModal) {
      setActiveModal(item.id as ActionModalType);
    } else if (item.newStatus) {
      onChange(ticket.id, item.newStatus);
    }
  }

  const filteredGroups = ACTION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.id === "reopen_case") return currentStatus === "closed";
      if (item.id === "close_case") return currentStatus !== "closed";
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        disabled={updating}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E7E2F3] px-3 text-sm text-[#241453] hover:bg-[#F8F5FF] disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" />
        Actions
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[100] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[110] w-72 overflow-hidden rounded-2xl border border-[#E6DDF8] bg-white shadow-[0_12px_32px_rgba(36,20,83,0.18)]"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-[#F0EAFB] bg-[#FAF8FF] px-4 py-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#644D93]/10">
                <MoreHorizontal className="h-3.5 w-3.5 text-[#644D93]" />
              </div>
              <p className="text-xs font-semibold text-[#3D2A73]">Case Actions</p>
            </div>

            <div className="custom-scroll overflow-y-auto py-1.5" style={{ maxHeight: pos.maxH }}>
              {filteredGroups.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <div className="mx-3 my-1.5 border-t border-[#F0EAFB]" />}

                  {/* Group label */}
                  <div className="px-4 pb-1 pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#B8AACC]">
                      {group.label}
                    </p>
                  </div>

                  {/* Items */}
                  {group.items.map((item) => {
                    const Icon = ACTION_ICONS[item.id];
                    const isDanger  = item.danger;
                    const isSuccess = item.success;
                    const iconCls = isDanger
                      ? "text-red-500 bg-red-50"
                      : isSuccess
                      ? "text-emerald-600 bg-emerald-50"
                      : "text-[#644D93] bg-[#F4F0FC]";
                    const labelCls = isDanger
                      ? "text-red-600"
                      : isSuccess
                      ? "text-emerald-700"
                      : "text-[#241453]";
                    const hoverCls = isDanger
                      ? "hover:bg-red-50"
                      : isSuccess
                      ? "hover:bg-emerald-50"
                      : "hover:bg-[#F4F0FC]";
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAction(item)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${hoverCls}`}
                      >
                        {Icon && (
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconCls}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <span className={`text-sm font-medium ${labelCls}`}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeModal !== null && (
        <ActionModal
          type={activeModal}
          ticket={ticket}
          onClose={() => setActiveModal(null)}
          onConfirm={(newStatus) => {
            if (newStatus) onChange(ticket.id, newStatus);
            setActiveModal(null);
          }}
        />
      )}
    </>
  );
}

function ActionModal({
  type,
  ticket,
  onClose,
  onConfirm,
}: {
  type: ActionModalType;
  ticket: SupportTicketRow;
  onClose: () => void;
  onConfirm: (newStatus?: string) => void;
}) {
  const [note, setNote] = React.useState("");
  const [contactMethod, setContactMethod] = React.useState("email");
  const [followupDate, setFollowupDate] = React.useState("");
  const [followupReason, setFollowupReason] = React.useState("");
  const [riskLevel, setRiskLevel] = React.useState("amber");
  const [planDetails, setPlanDetails] = React.useState("");
  const [escalateReason, setEscalateReason] = React.useState("");
  const [escalateTo, setEscalateTo] = React.useState("Safeguarding Lead");
  const [referralOrg, setReferralOrg] = React.useState("");
  const [referralType, setReferralType] = React.useState("NHS / Mental Health");
  const [outcomeDesc, setOutcomeDesc] = React.useState("");
  const [resolutionType, setResolutionType] = React.useState("Resolved");
  const [closeChecks, setCloseChecks] = React.useState<boolean[]>([false, false, false]);
  const [evidenceFile, setEvidenceFile] = React.useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");

  if (!type) return null;

  const titles: Record<Exclude<ActionModalType, null>, string> = {
    case_note: "Add Case Note",
    contact_learner: "Contact Learner",
    contact_coach: "Contact Coach / Tutor",
    schedule_followup: "Schedule Follow-up",
    add_evidence: "Add Evidence",
    change_risk: "Change Risk Level",
    support_plan: "Create Support / Safety Plan",
    escalate: "Escalate Case",
    external_referral: "Record External Referral",
    record_outcome: "Record Outcome",
    close_case: "Close Case",
  };

  const statusChanges: Partial<Record<Exclude<ActionModalType, null>, string>> = {
    contact_learner: "action in progress",
    contact_coach: "action in progress",
    schedule_followup: "follow-up scheduled",
    support_plan: "support plan active",
    escalate: "escalated",
    external_referral: "external referral made",
    record_outcome: "outcome recorded",
    close_case: "closed",
  };

  function canSubmit(): boolean {
    if (type === "close_case") return closeChecks.every(Boolean);
    if (type === "escalate") return escalateReason.trim().length > 0;
    if (type === "record_outcome") return outcomeDesc.trim().length > 0;
    if (type === "external_referral") return referralOrg.trim().length > 0;
    if (type === "schedule_followup") return followupDate.trim().length > 0;
    return true;
  }

  async function handleSubmit() {
    try {
      setSaving(true);
      setSaveError("");

      if (type === "case_note") {
        if (note.trim()) await createTicketNote(ticket.id, note.trim());
        onConfirm(undefined);
        return;
      }

      if (type === "add_evidence") {
        let fileUrl = "";
        let fileName = "";
        if (evidenceFile) {
          const uploaded = await uploadEvidenceFile(evidenceFile);
          fileUrl = resolveMediaUrl(uploaded?.absolute_url || uploaded?.url || "");
          fileName = evidenceFile.name;
        }
        await createTicketEvidence(ticket.id, {
          description: note.trim(),
          file_url: fileUrl,
          file_name: fileName,
        });
        onConfirm(undefined);
        return;
      }

      onConfirm(statusChanges[type as Exclude<ActionModalType, null>]);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function renderContent() {
    switch (type) {
      case "case_note":
        return (
          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="Enter case note..."
              className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
            />
          </div>
        );

      case "contact_learner":
      case "contact_coach":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Contact Method</label>
              <select
                value={contactMethod}
                onChange={(e) => setContactMethod(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="in-person">In-person</option>
                <option value="video">Video Call</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Summary</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Summary of contact..."
                className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
              />
            </div>
          </div>
        );

      case "schedule_followup":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Follow-up Date *</label>
              <input
                type="date"
                value={followupDate}
                onChange={(e) => setFollowupDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Purpose / Reason</label>
              <textarea
                value={followupReason}
                onChange={(e) => setFollowupReason(e.target.value)}
                rows={3}
                placeholder="Reason for follow-up..."
                className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
              />
            </div>
          </div>
        );

      case "add_evidence":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Description</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Brief description of evidence..."
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Image (optional)</label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#DED5F3] p-5 transition hover:bg-[#FAFAFF]">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setEvidenceFile(file);
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) =>
                        setEvidencePreview((ev.target?.result as string) || null);
                      reader.readAsDataURL(file);
                    } else {
                      setEvidencePreview(null);
                    }
                  }}
                />
                {evidencePreview ? (
                  <img
                    src={evidencePreview}
                    alt="Preview"
                    className="max-h-40 rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <Upload className="h-7 w-7 text-[#8E82AA]" />
                    <span className="text-sm text-[#7B6D9B]">Click to upload an image</span>
                    <span className="text-xs text-[#B8AACC]">PNG, JPG, GIF</span>
                  </>
                )}
              </label>
              {evidenceFile && (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-[#DED5F3] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ImageIcon className="h-4 w-4 shrink-0 text-[#8E82AA]" />
                    <span className="truncate text-sm text-[#241453]">{evidenceFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEvidenceFile(null); setEvidencePreview(null); }}
                    className="ml-2 shrink-0 text-[#8E82AA] hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case "change_risk":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">New Risk Level</label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              >
                <option value="green">Green — Safe</option>
                <option value="amber">Amber — Moderate Risk</option>
                <option value="red">Red — High Risk</option>
                <option value="critical">Critical — Immediate Action Required</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Reason</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Reason for risk level change..."
                className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
              />
            </div>
          </div>
        );

      case "support_plan":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Plan Summary</label>
              <textarea
                value={planDetails}
                onChange={(e) => setPlanDetails(e.target.value)}
                rows={4}
                placeholder="Describe the support/safety plan..."
                className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Key Actions</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="List key actions in the plan..."
                className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
              />
            </div>
          </div>
        );

      case "escalate":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Escalating To</label>
              <select
                value={escalateTo}
                onChange={(e) => setEscalateTo(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              >
                <option>Safeguarding Lead</option>
                <option>Senior Management</option>
                <option>External Agency</option>
                <option>Local Authority</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">
                Reason for Escalation *
              </label>
              <textarea
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                rows={4}
                placeholder="Provide a clear reason for escalation..."
                className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
              />
            </div>
          </div>
        );

      case "external_referral":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Organisation *</label>
              <input
                value={referralOrg}
                onChange={(e) => setReferralOrg(e.target.value)}
                placeholder="e.g. NHS, Social Services..."
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Referral Type</label>
              <select
                value={referralType}
                onChange={(e) => setReferralType(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              >
                <option>NHS / Mental Health</option>
                <option>Social Services</option>
                <option>Police</option>
                <option>Housing Support</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Notes</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Additional notes..."
                className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
              />
            </div>
          </div>
        );

      case "record_outcome":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Resolution Type</label>
              <select
                value={resolutionType}
                onChange={(e) => setResolutionType(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              >
                <option>Resolved</option>
                <option>Ongoing Monitoring</option>
                <option>Referred to External Agency</option>
                <option>No Action Required</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">
                Outcome Description *
              </label>
              <textarea
                value={outcomeDesc}
                onChange={(e) => setOutcomeDesc(e.target.value)}
                rows={4}
                placeholder="Describe the outcome..."
                className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
              />
            </div>
          </div>
        );

      case "close_case": {
        const checks = [
          "All required actions have been completed",
          "Appropriate support is in place for the learner",
          "Learner has been informed of the outcome",
        ];
        return (
          <div className="space-y-3">
            <p className="text-sm text-[#7B6D9B]">
              Please confirm the following before closing this case:
            </p>
            {checks.map((checkLabel, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#EEE8F8] p-3 hover:bg-[#FAFAFF]"
              >
                <input
                  type="checkbox"
                  checked={closeChecks[i]}
                  onChange={(e) => {
                    const next = [...closeChecks];
                    next[i] = e.target.checked;
                    setCloseChecks(next);
                  }}
                  className="mt-0.5 h-4 w-4 accent-[#241453]"
                />
                <span className="text-sm text-[#241453]">{checkLabel}</span>
              </label>
            ))}
          </div>
        );
      }

      default:
        return null;
    }
  }

  const isDanger = type === "close_case" || type === "escalate";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div
        className="custom-scroll w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
        style={{ maxHeight: "90vh" }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[#241453]">{titles[type]}</h3>
            <p className="mt-0.5 text-sm text-[#7B6D9B]">
              {ticket.learnerName} · {ticket.ticketCode}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#E7E2F3] p-2 text-[#241453] hover:bg-[#F8F5FF]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-6">{renderContent()}</div>

        {saveError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {saveError}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[#DED5F3] px-5 py-2.5 text-sm font-medium text-[#241453] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit() || saving}
            onClick={handleSubmit}
            className={`rounded-xl px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-60 ${
              isDanger ? "bg-red-600 hover:bg-red-700" : "bg-[#241453] hover:bg-[#362063]"
            }`}
          >
            {saving ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketNotesPopover({ notes }: { notes: TicketNoteRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, right: 0, maxH: 288 });
  const btnRef = React.useRef<HTMLButtonElement>(null);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const maxH = Math.min(288, Math.max(100, spaceBelow > spaceAbove ? spaceBelow - 44 : spaceAbove - 44));
      const top = spaceBelow >= 180 || spaceBelow >= spaceAbove
        ? rect.bottom + 6
        : Math.max(8, rect.top - 44 - maxH - 6);
      setPos({ top, right: window.innerWidth - rect.right, maxH });
    }
    setOpen((prev) => !prev);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1 rounded-lg bg-[#F4F0FC] px-2.5 py-1 text-xs font-semibold text-[#6248BE] transition hover:bg-[#EDE7FB]"
      >
        <FileText className="h-3 w-3" />
        {notes.length}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[100] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[110] w-80 overflow-hidden rounded-2xl border border-[#E6DDF8] bg-white shadow-[0_8px_24px_rgba(36,20,83,0.14)]"
          >
            <div className="flex items-center justify-between border-b border-[#F0EAFB] px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">
                Case Notes
              </p>
              <span className="text-[10px] text-[#B8AACC]">
                {notes.length} note{notes.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="custom-scroll space-y-2 overflow-y-auto p-3" style={{ maxHeight: pos.maxH }}>
              {notes.map((n, i) => (
                <div
                  key={n.id ?? i}
                  className="rounded-xl border border-[#EEE8F8] p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-medium text-[#8E82AA]">
                      {n.created_by || "Coach"}
                    </span>
                    <span className="shrink-0 text-[10px] text-[#B8AACC]">
                      {n.created_at ? formatTicketDate(n.created_at) : ""}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#241453]">
                    {n.note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function TicketEvidencePopover({ evidence }: { evidence: TicketEvidenceRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, right: 0, maxH: 288 });
  const btnRef = React.useRef<HTMLButtonElement>(null);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const maxH = Math.min(288, Math.max(100, spaceBelow > spaceAbove ? spaceBelow - 44 : spaceAbove - 44));
      const top = spaceBelow >= 180 || spaceBelow >= spaceAbove
        ? rect.bottom + 6
        : Math.max(8, rect.top - 44 - maxH - 6);
      setPos({ top, right: window.innerWidth - rect.right, maxH });
    }
    setOpen((prev) => !prev);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1 rounded-lg bg-[#F0FDF4] px-2.5 py-1 text-xs font-semibold text-[#047857] transition hover:bg-[#DCFCE7]"
      >
        <ImageIcon className="h-3 w-3" />
        {evidence.length}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[100] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[110] w-80 overflow-hidden rounded-2xl border border-[#E6DDF8] bg-white shadow-[0_8px_24px_rgba(36,20,83,0.14)]"
          >
            <div className="flex items-center justify-between border-b border-[#F0EAFB] px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">
                Evidence
              </p>
              <span className="text-[10px] text-[#B8AACC]">
                {evidence.length} item{evidence.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="custom-scroll space-y-3 overflow-y-auto p-3" style={{ maxHeight: pos.maxH }}>
              {evidence.map((ev, i) => (
                <div
                  key={ev.id ?? i}
                  className="overflow-hidden rounded-xl border border-[#EEE8F8]"
                >
                  {ev.file_url && (
                    <a
                      href={resolveMediaUrl(ev.file_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <img
                        src={resolveMediaUrl(ev.file_url)}
                        alt={ev.description || ev.file_name || "Evidence"}
                        className="max-h-44 w-full object-cover transition hover:opacity-90"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </a>
                  )}
                  <div className="p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium text-[#8E82AA]">
                        {ev.created_by || "Coach"}
                      </span>
                      <span className="shrink-0 text-[10px] text-[#B8AACC]">
                        {ev.created_at ? formatTicketDate(ev.created_at) : ""}
                      </span>
                    </div>
                    {ev.description && (
                      <p className="text-sm text-[#241453]">{ev.description}</p>
                    )}
                    {ev.file_url && (
                      <a
                        href={resolveMediaUrl(ev.file_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#6248BE] hover:underline"
                      >
                        <ImageIcon className="h-3 w-3" />
                        {ev.file_name || "Open image"}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function FiltersPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: TicketFilters;
  onChange: (f: TicketFilters) => void;
  onReset: () => void;
}) {
  function toggle(key: keyof TicketFilters, value: string) {
    const current = filters[key];
    onChange({
      ...filters,
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  }

  const activeCount = filters.status.length + filters.type.length + filters.risk.length;

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-[#E6DDF8] bg-white p-4 shadow-[0_12px_30px_rgba(36,20,83,0.12)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#241453]">Filters</span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-[#7A5FD0] hover:text-[#6248BE]"
          >
            Reset all ({activeCount})
          </button>
        )}
      </div>

      <div className="mb-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Status</div>
        <div className="flex flex-wrap gap-1.5">
          {["open", "new", "under review", "assigned", "awaiting information", "action in progress", "follow-up scheduled", "support plan active", "escalated", "external referral made", "outcome recorded", "closed", "reopened"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggle("status", s)}
              className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${
                filters.status.includes(s)
                  ? "bg-[#241453] text-white"
                  : "border border-[#E7E2F3] text-[#241453] hover:bg-[#F8F5FF]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Type</div>
        <div className="flex gap-1.5">
          {["wellbeing", "safeguarding"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggle("type", t)}
              className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${
                filters.type.includes(t)
                  ? "bg-[#241453] text-white"
                  : "border border-[#E7E2F3] text-[#241453] hover:bg-[#F8F5FF]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Risk</div>
        <div className="flex gap-1.5">
          {(["red", "amber", "green"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggle("risk", r)}
              className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${
                filters.risk.includes(r)
                  ? ticketRiskBadgeClass(r)
                  : "border border-[#E7E2F3] text-[#241453] hover:bg-[#F8F5FF]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreateTicketModal({
  open,
  learners,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  learners: CoachLearnerRow[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (learnerId: string | number, form: SupportTicketFormState) => void;
}) {
  const [selectedId, setSelectedId] = React.useState("");
  const [learnerSearch, setLearnerSearch] = React.useState("");
  const [form, setForm] = React.useState<SupportTicketFormState>(makeInitialTicketForm());

  React.useEffect(() => {
    if (!open) {
      setSelectedId("");
      setLearnerSearch("");
      setForm(makeInitialTicketForm());
    }
  }, [open]);

  if (!open) return null;

  const visibleLearners = learners.filter((l) => {
    const q = learnerSearch.toLowerCase();
    return (
      !q ||
      String(l.studentName || "").toLowerCase().includes(q) ||
      String(l.studentEmail || "").toLowerCase().includes(q)
    );
  });

  function handleField<K extends keyof SupportTicketFormState>(key: K, val: SupportTicketFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="custom-scroll w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" style={{ maxHeight: "90vh" }}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold text-[#241453]">Create Support Ticket</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[#E7E2F3] p-2 text-[#241453] hover:bg-[#F8F5FF]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-[#241453]">Select Learner</label>
          <input
            value={learnerSearch}
            onChange={(e) => setLearnerSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="mb-2 h-10 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
          />
          <div className="max-h-44 overflow-y-auto rounded-xl border border-[#DED5F3]">
            {visibleLearners.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400">No learners found</div>
            ) : (
              visibleLearners.map((l) => (
                <button
                  key={l.studentId}
                  type="button"
                  onClick={() => setSelectedId(String(l.studentId))}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                    String(l.studentId) === selectedId
                      ? "bg-[#F4F0FC] text-[#241453]"
                      : "text-[#3D2A73] hover:bg-[#FAF8FE]"
                  }`}
                >
                  <div>
                    <div className="font-medium">{l.studentName || "-"}</div>
                    <div className="text-xs text-slate-400">{l.studentEmail || ""}</div>
                  </div>
                  {String(l.studentId) === selectedId && <span className="text-[#7A5FD0]">✓</span>}
                </button>
              ))
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (selectedId) onSubmit(selectedId, form);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Ticket type</label>
              <select
                value={form.ticket_type}
                onChange={(e) => handleField("ticket_type", e.target.value as any)}
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
                onChange={(e) => handleField("urgency", e.target.value as any)}
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
              onChange={(e) => handleField("subject", e.target.value)}
              placeholder="Enter ticket subject"
              className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Details</label>
            <textarea
              value={form.details}
              onChange={(e) => handleField("details", e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Preferred contact</label>
            <select
              value={form.preferred_contact}
              onChange={(e) => handleField("preferred_contact", e.target.value as any)}
              className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
            >
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Date</label>
              <input
                type="date"
                value={form.incident_date}
                onChange={(e) => handleField("incident_date", e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Time</label>
              <input
                type="time"
                value={form.incident_time}
                onChange={(e) => handleField("incident_time", e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Created by</label>
            <input
              value={form.created_by}
              onChange={(e) => handleField("created_by", e.target.value)}
              placeholder="Name or email of the person creating this ticket"
              className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

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
              disabled={saving || !selectedId}
              className="rounded-xl bg-[#241453] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#362063] disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function exportTicketsToCSV(tickets: SupportTicketRow[]) {
  const headers = ["Ticket", "Learner", "Email", "Type", "Risk", "Urgency", "Source", "Created", "Created By", "Status", "Days Open", "Subject", "Details"];
  const rows = tickets.map((t) => [
    t.ticketCode,
    t.learnerName,
    t.learnerEmail,
    t.type,
    t.risk,
    t.urgency,
    t.source,
    formatTicketDate(t.createdAt),
    t.createdBy || "",
    t.status,
    t.daysOpen,
    `"${(t.subject || "").replace(/"/g, '""')}"`,
    `"${(t.details || "").replace(/"/g, '""')}"`,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tickets-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TicketDetailPanel({
  ticket,
  onClose,
  onStatusChange,
  statusUpdating,
}: {
  ticket: SupportTicketRow | null;
  onClose: () => void;
  onStatusChange: (ticketId: number, newStatus: string) => void;
  statusUpdating: number | null;
}) {
  const [notes, setNotes] = React.useState<TicketNoteRow[]>([]);
  const [evidence, setEvidence] = React.useState<TicketEvidenceRow[]>([]);
  const [notesLoading, setNotesLoading] = React.useState(false);

  React.useEffect(() => {
    if (!ticket) { setNotes([]); setEvidence([]); return; }
    const ticketId = ticket.id;
    let mounted = true;

    async function load() {
      setNotesLoading(true);
      setNotes([]);
      setEvidence([]);
      try {
        const [n, e] = await Promise.all([
          getTicketNotes(ticketId),
          getTicketEvidence(ticketId),
        ]);
        if (!mounted) return;
        setNotes(Array.isArray(n) ? n : []);
        setEvidence(Array.isArray(e) ? e : []);
      } catch {
        // silently ignore load errors
      } finally {
        if (mounted) setNotesLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [ticket?.id]);

  if (!ticket) return null;

  const isUpdating = statusUpdating === ticket.id;
  const isClosed = String(ticket.status || "").toLowerCase() === "closed";

  const statusActions = [
    { value: "under review", label: "Under Review" },
    { value: "action in progress", label: "Action in Progress" },
    { value: "assigned", label: "Assigned" },
    { value: "escalated", label: "Escalate" },
  ].filter((s) => s.value !== String(ticket.status || "").toLowerCase());

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[85] cursor-default bg-black/30"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 z-[90] flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ECE7F7] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-[#241453]">{ticket.ticketCode}</span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${ticketStatusBadgeClass(ticket.status)}`}
            >
              {ticket.status || "open"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#E7E2F3] p-2 text-[#241453] hover:bg-[#F8F5FF]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="custom-scroll flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            {/* Learner */}
            <div className="rounded-2xl bg-[#F8F6FC] p-4">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                Learner
              </div>
              <div className="font-medium text-[#241453]">{ticket.learnerName || "-"}</div>
              <div className="mt-0.5 text-sm text-slate-500">{ticket.learnerEmail || "-"}</div>
            </div>

            {/* Ticket info grid */}
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                Ticket Details
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Type</div>
                  <div className="mt-1 text-sm font-medium capitalize text-[#241453]">
                    {ticket.type || "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Urgency</div>
                  <div className="mt-1 text-sm font-medium capitalize text-[#241453]">
                    {ticket.urgency || "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Risk</div>
                  <div className="mt-1">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${ticketRiskBadgeClass(ticket.risk)}`}
                    >
                      {ticket.risk}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Preferred Contact</div>
                  <div className="mt-1 text-sm font-medium capitalize text-[#241453]">
                    {ticket.preferredContact || "-"}
                  </div>
                </div>
              </div>
            </div>

            {/* Subject */}
            <div className="rounded-xl border border-[#ECE7F7] p-4">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                Subject
              </div>
              <div className="text-sm text-[#241453]">{ticket.subject || "-"}</div>
            </div>

            {/* Details */}
            <div className="rounded-xl border border-[#ECE7F7] p-4">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                Details / Notes
              </div>
              <div className="whitespace-pre-wrap text-sm text-[#241453]">
                {ticket.details || "-"}
              </div>
            </div>

            {/* Case info */}
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                Case Info
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Source</div>
                  <div className="mt-1 text-sm font-medium text-[#241453]">
                    {ticket.source || "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Created</div>
                  <div className="mt-1 text-sm font-medium text-[#241453]">
                    {formatTicketDate(ticket.createdAt)}
                  </div>
                </div>
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Created By</div>
                  <div className="mt-1 text-sm font-medium text-[#241453]">
                    {ticket.createdBy || "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Days Open</div>
                  <div className="mt-1 text-sm font-medium text-[#241453]">
                    {ticket.daysOpen ?? 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Status quick-change buttons */}
            {!isClosed && statusActions.length > 0 && (
              <div>
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                  Change Status
                </div>
                <div className="flex flex-wrap gap-2">
                  {statusActions.map((action) => (
                    <button
                      key={action.value}
                      type="button"
                      disabled={isUpdating}
                      onClick={() => onStatusChange(ticket.id, action.value)}
                      className="rounded-xl border border-[#DED5F3] px-4 py-2 text-sm font-medium text-[#241453] transition hover:bg-[#F8F5FF] disabled:opacity-50"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Case Notes */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                  Case Notes
                </div>
                {notes.length > 0 && (
                  <span className="text-[10px] text-[#B8AACC]">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
                )}
              </div>
              {notesLoading ? (
                <p className="text-xs text-slate-400">Loading...</p>
              ) : notes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#EEE8F8] px-4 py-3 text-xs text-slate-400">
                  No case notes yet. Use Actions → Add Case Note.
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-xl border border-[#EEE8F8] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3 w-3 text-[#8E82AA]" />
                          <span className="text-[10px] text-[#8E82AA]">{n.created_by || "Coach"}</span>
                        </div>
                        <span className="text-[10px] text-[#B8AACC]">
                          {n.created_at ? formatTicketDate(n.created_at) : ""}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-[#241453]">{n.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Evidence */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                  Evidence
                </div>
                {evidence.length > 0 && (
                  <span className="text-[10px] text-[#B8AACC]">{evidence.length} item{evidence.length !== 1 ? "s" : ""}</span>
                )}
              </div>
              {notesLoading ? (
                <p className="text-xs text-slate-400">Loading...</p>
              ) : evidence.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#EEE8F8] px-4 py-3 text-xs text-slate-400">
                  No evidence yet. Use Actions → Add Evidence.
                </div>
              ) : (
                <div className="space-y-2">
                  {evidence.map((ev) => (
                    <div key={ev.id} className="rounded-xl border border-[#EEE8F8] p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] text-[#8E82AA]">{ev.created_by || "Coach"}</span>
                        <span className="text-[10px] text-[#B8AACC]">
                          {ev.created_at ? formatTicketDate(ev.created_at) : ""}
                        </span>
                      </div>
                      {ev.description && (
                        <p className="text-sm text-[#241453]">{ev.description}</p>
                      )}
                      {ev.file_url && (
                        <a
                          href={resolveMediaUrl(ev.file_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#6248BE] hover:underline"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          {ev.file_name || "View image"}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer — Close / Reopen */}
        <div className="shrink-0 border-t border-[#ECE7F7] p-5">
          {isClosed ? (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onStatusChange(ticket.id, "open")}
              className="w-full rounded-2xl border border-[#DED5F3] py-3 text-sm font-medium text-[#241453] transition hover:bg-[#F8F5FF] disabled:opacity-50"
            >
              {isUpdating ? "Updating..." : "Reopen Case"}
            </button>
          ) : (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onStatusChange(ticket.id, "closed")}
              className="w-full rounded-2xl bg-[#241453] py-3 text-sm font-medium text-white transition hover:bg-[#362063] disabled:opacity-60"
            >
              {isUpdating ? "Closing..." : "Close Case"}
            </button>
          )}
        </div>
      </div>
    </>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Date</label>
              <input
                type="date"
                value={form.incident_date}
                onChange={(e) => onChange("incident_date", e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Time</label>
              <input
                type="time"
                value={form.incident_time}
                onChange={(e) => onChange("incident_time", e.target.value)}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Created by</label>
            <input
              value={form.created_by}
              onChange={(e) => onChange("created_by", e.target.value)}
              placeholder="Name or email of the person creating this ticket"
              className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
            />
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

// tickets componant
function TicketsManagementView({
  loading,
  search,
  onSearchChange,
  ticketsData,
  onView,
  onStatusChange,
  statusUpdating,
  onCreateTicket,
  filters,
  onFiltersChange,
  onExport,
}: {
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  ticketsData: SupportTicketsResponse | null;
  onView: (ticket: SupportTicketRow) => void;
  onStatusChange: (ticketId: number, newStatus: string) => void;
  statusUpdating: number | null;
  onCreateTicket: () => void;
  filters: TicketFilters;
  onFiltersChange: (f: TicketFilters) => void;
  onExport: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const tickets = ticketsData?.tickets || [];
  const activeFilterCount = filters.status.length + filters.type.length + filters.risk.length;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold text-[#241453]">Ticket Management</h2>
            <p className="mt-1 text-sm text-[#7B6D9B]">
              Manage all safeguarding and wellbeing cases
            </p>
          </div>

          <button
            type="button"
            onClick={onCreateTicket}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#22A699] px-5 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create Ticket
          </button>
        </div>

        <div className="rounded-3xl border border-[#E9E3F5] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex h-12 w-full items-center gap-2 rounded-2xl bg-[#F5F7FB] px-4 lg:max-w-[680px]">
              <Search className="h-4 w-4 shrink-0 text-[#8E82AA]" />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tickets..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm transition ${
                    activeFilterCount > 0
                      ? "border-[#241453] bg-[#241453] text-white"
                      : "border-[#E7E2F3] text-[#241453] hover:bg-[#F8F5FF]"
                  }`}
                >
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#241453]">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {filtersOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setFiltersOpen(false)}
                    />
                    <div className="relative z-50">
                      <FiltersPanel
                        filters={filters}
                        onChange={onFiltersChange}
                        onReset={() => onFiltersChange(emptyFilters)}
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={onExport}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E7E2F3] px-4 text-sm text-[#241453] hover:bg-[#F8F5FF]"
              >
                Export
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Total" value={ticketsData?.summary?.total ?? 0} icon={<Ticket className="h-4 w-4" />} />
          <StatCard title="Open" value={ticketsData?.summary?.open ?? 0} icon={<ClipboardList className="h-4 w-4" />} />
          <StatCard title="Red Risk" value={ticketsData?.summary?.redRisk ?? 0} icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard title="Escalated" value={ticketsData?.summary?.escalated ?? 0} icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard title="Closed" value={ticketsData?.summary?.closed ?? 0} icon={<ClipboardList className="h-4 w-4" />} />
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-[#E9E3F5]">
          <div className="custom-scroll overflow-auto">
            <table className="w-full min-w-[1250px] text-sm">
              <thead className="bg-[#FCFBFE]">
                <tr className="border-b border-[#EEE8F8] text-left text-[#7B6D9B]">
                  <th className="px-5 py-4 font-medium">Ticket</th>
                  <th className="px-5 py-4 font-medium">Learner</th>
                  <th className="px-5 py-4 font-medium">Type</th>
                  <th className="px-5 py-4 font-medium">Risk</th>
                  <th className="px-5 py-4 font-medium">Source</th>
                  <th className="px-5 py-4 font-medium">Created</th>
                  <th className="px-5 py-4 font-medium">Created By</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Days</th>
                  <th className="px-5 py-4 font-medium">Notes</th>
                  <th className="px-5 py-4 font-medium">Evidence</th>
                  <th className="px-5 py-4 font-medium">Actions</th>
                  <th className="px-5 py-4 font-medium">View</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={13} className="px-5 py-8 text-center text-slate-500">
                      Loading tickets...
                    </td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-5 py-8 text-center text-slate-500">
                      No tickets found
                    </td>
                  </tr>
                ) : (
                  tickets.map((item) => (
                    <tr key={item.id} className="border-b border-[#F1EDF8] last:border-0">
                      <td className="px-5 py-4 font-semibold text-[#0F9B8E]">{item.ticketCode}</td>

                      <td className="px-5 py-4">
                        <div className="font-medium text-[#241453]">{item.learnerName || "-"}</div>
                        <div className="text-xs text-slate-500">{item.learnerEmail || ""}</div>
                      </td>

                      <td className="px-5 py-4 text-[#241453]">{item.type || "-"}</td>

                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-md px-3 py-1 text-xs font-medium capitalize ${ticketRiskBadgeClass(item.risk)}`}>
                          {item.risk}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-slate-600">{item.source || "-"}</td>
                      <td className="px-5 py-4 text-slate-600">{formatTicketDate(item.createdAt)}</td>
                      <td className="px-5 py-4 text-slate-600">{item.createdBy || "-"}</td>

                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${ticketStatusBadgeClass(item.status)}`}>
                          {item.status || "-"}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-[#241453]">{item.daysOpen ?? 0}</td>

                      <td className="px-5 py-4">
                        {(item.notes?.length ?? 0) > 0 ? (
                          <TicketNotesPopover notes={item.notes!} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {(item.evidence?.length ?? 0) > 0 ? (
                          <TicketEvidencePopover evidence={item.evidence!} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <TicketActionsDropdown
                          ticket={item}
                          onChange={onStatusChange}
                          updating={statusUpdating === item.id}
                        />
                      </td>

                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => onView(item)}
                          className="inline-flex items-center gap-2 text-sm font-medium text-[#241453] hover:text-[#6248BE]"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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
  const [ticketForm, setTicketForm] = useState<SupportTicketFormState>(makeInitialTicketForm());

  // tickets management state
  const [activeView, setActiveView] = useState<"dashboard" | "tickets">("dashboard");
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsData, setTicketsData] = useState<SupportTicketsResponse | null>(null);
  const [ticketsSearch, setTicketsSearch] = useState("");
  const [viewTicket, setViewTicket] = useState<SupportTicketRow | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<number | null>(null);
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [createTicketSaving, setCreateTicketSaving] = useState(false);
  const [createTicketError, setCreateTicketError] = useState("");
  const [ticketFilters, setTicketFilters] = useState<TicketFilters>(emptyFilters);

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

  // ticket management handlers
  useEffect(() => {
    let mounted = true;

    async function loadTickets() {
      if (activeView !== "tickets") return;

      if (role === "qa") {
        if (optionsLoading) return;
        if (!selectedCoachEmail) return;
      }

      try {
        setTicketsLoading(true);

        const res =
          role === "qa"
            ? await getSupportTickets(selectedCoachEmail)
            : await getSupportTickets();

        if (!mounted) return;

        setTicketsData(res || { summary: { total: 0, open: 0, redRisk: 0, escalated: 0, closed: 0 }, tickets: [] });
      } catch (err) {
        if (!mounted) return;
        console.error("support tickets load error", err);
        setTicketsData({ summary: { total: 0, open: 0, redRisk: 0, escalated: 0, closed: 0 }, tickets: [] });
      } finally {
        if (mounted) setTicketsLoading(false);
      }
    }

    loadTickets();

    return () => {
      mounted = false;
    };
  }, [activeView, role, selectedCoachEmail, optionsLoading]);

  async function handleCreateTicketFromManagement(learnerId: string | number, form: SupportTicketFormState) {
    try {
      setCreateTicketSaving(true);
      setCreateTicketError("");

      await createSupportTicket({
        wellbeing_record_id: learnerId,
        ticket_type: form.ticket_type,
        subject: form.subject.trim(),
        details: form.details.trim(),
        urgency: form.urgency,
        preferred_contact: form.preferred_contact,
        incident_date: form.incident_date,
        incident_time: form.incident_time,
        created_by: form.created_by.trim(),
      });

      const refreshed =
        role === "qa"
          ? await getSupportTickets(selectedCoachEmail)
          : await getSupportTickets();

      setTicketsData(
        refreshed || { summary: { total: 0, open: 0, redRisk: 0, escalated: 0, closed: 0 }, tickets: [] }
      );
      setCreateTicketOpen(false);
    } catch (err: any) {
      setCreateTicketError(err?.message || "Failed to create ticket");
    } finally {
      setCreateTicketSaving(false);
    }
  }

  function handleExport() {
    const tickets = filteredTicketsData?.tickets || [];
    if (tickets.length === 0) return;
    exportTicketsToCSV(tickets);
  }

  function recalculateSummary(tickets: SupportTicketRow[]) {
    return {
      total: tickets.length,
      open: tickets.filter((t) => String(t.status).toLowerCase() === "open").length,
      redRisk: tickets.filter((t) => String(t.risk).toLowerCase() === "red").length,
      escalated: tickets.filter((t) => String(t.status).toLowerCase() === "escalated").length,
      closed: tickets.filter((t) => String(t.status).toLowerCase() === "closed").length,
    };
  }

  async function handleStatusChange(ticketId: number, newStatus: string) {
    try {
      setStatusUpdating(ticketId);
      await updateSupportTicket(ticketId, { status: newStatus });

      setTicketsData((prev) => {
        if (!prev) return prev;
        const updated = prev.tickets.map((t) =>
          t.id === ticketId ? { ...t, status: newStatus as TicketStatus } : t
        );
        return { ...prev, tickets: updated, summary: recalculateSummary(updated) };
      });

      setViewTicket((prev) =>
        prev?.id === ticketId ? { ...prev, status: newStatus as TicketStatus } : prev
      );
    } catch (err) {
      console.error("Failed to update ticket status", err);
    } finally {
      setStatusUpdating(null);
    }
  }

  function resetTicketModal() {
    setTicketModalOpen(false);
    setSelectedLearner(null);
    setTicketError("");
    setTicketForm(makeInitialTicketForm());
  }

  function handleOpenTicket(row: TicketableLearnerRow) {
    setSelectedLearner(row);
    setTicketError("");

    const now = new Date();
    setTicketForm({
      ticket_type: row.riskLevel === "red" ? "safeguarding" : "wellbeing",
      subject: row.recommendedAction || `Support follow up for ${row.studentName || "learner"}`,
      details: row.followUpReason || "",
      urgency: row.riskLevel === "red" ? "high" : "medium",
      preferred_contact: "email",
      incident_date: now.toISOString().slice(0, 10),
      incident_time: now.toTimeString().slice(0, 5),
      created_by: localStorage.getItem("username") || localStorage.getItem("email") || "",
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
        incident_date: ticketForm.incident_date,
        incident_time: ticketForm.incident_time,
        created_by: ticketForm.created_by.trim(),
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

  const filteredTicketsData = useMemo<SupportTicketsResponse>(() => {
    const raw = ticketsData || {
      summary: { total: 0, open: 0, redRisk: 0, escalated: 0, closed: 0 },
      tickets: [],
    };

    const q = ticketsSearch.trim().toLowerCase();

    let tickets = raw.tickets.filter((item) => {
      if (q) {
        const matchesSearch =
          String(item.ticketCode || "").toLowerCase().includes(q) ||
          String(item.learnerName || "").toLowerCase().includes(q) ||
          String(item.learnerEmail || "").toLowerCase().includes(q) ||
          String(item.type || "").toLowerCase().includes(q) ||
          String(item.status || "").toLowerCase().includes(q) ||
          String(item.subject || "").toLowerCase().includes(q) ||
          String(item.details || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      if (ticketFilters.status.length > 0 && !ticketFilters.status.includes(String(item.status || "").toLowerCase())) return false;
      if (ticketFilters.type.length > 0 && !ticketFilters.type.includes(String(item.type || "").toLowerCase())) return false;
      if (ticketFilters.risk.length > 0 && !ticketFilters.risk.includes(String(item.risk || "").toLowerCase())) return false;

      return true;
    });

    return {
      summary: {
        total: tickets.length,
        open: tickets.filter((t) => String(t.status).toLowerCase() === "open").length,
        redRisk: tickets.filter((t) => String(t.risk).toLowerCase() === "red").length,
        escalated: tickets.filter((t) => String(t.status).toLowerCase() === "escalated").length,
        closed: tickets.filter((t) => String(t.status).toLowerCase() === "closed").length,
      },
      tickets,
    };
  }, [ticketsData, ticketsSearch, ticketFilters]);

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
      total: Number(item.total ?? 0),
      red: Number(item.red ?? 0),
      amber: Number(item.amber ?? 0),
      green: Number(item.green ?? 0),
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
        <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {!isDesktop && typeof setMobileOpen === "function" ? (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="xl:hidden shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#DED5F3] bg-[#FBFAFE] text-[#241453] shadow-sm transition hover:bg-white"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            ) : null}

            <div className="min-w-0">
              <h1 className="text-[24px] font-semibold leading-tight text-[#241453] sm:text-xl">
                Safeguarding & Wellbeing Dashboard
              </h1>

              <p className="mt-1 text-sm leading-6 text-[#7B6D9B]">
                Monitor your caseload, wellbeing patterns, and support needs.
              </p>
            </div>
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

            <button
              type="button"
              onClick={() => setActiveView((prev) => (prev === "dashboard" ? "tickets" : "dashboard"))}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-medium shadow-sm transition ${activeView === "tickets"
                ? "bg-[#241453] text-white hover:bg-[#362063]"
                : "border border-[#DED5F3] bg-white text-[#241453] hover:border-[#CFC2EE]"
                }`}
            >
              {activeView === "tickets" ? (
                <>
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </>
              ) : (
                <>
                  <Ticket className="h-4 w-4" />
                  View Tickets
                </>
              )}
            </button>

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

      {activeView === "dashboard" ? (
        <>
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

          <div className="mb-6 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-md font-semibold text-[#241453]">Caseload Risk Overview <span className="text-sm font-normal text-"> ( High score = safe )</span></h2>
              <span className="text-xs text-[#8E82AA]">{filteredLearners.length} learner{filteredLearners.length !== 1 ? "s" : ""}</span>
            </div>
            <LearnerTable rows={filteredLearners} onOpenTicket={handleOpenTicket} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6 xl:h-[420px]">
              <div className="flex h-full flex-col">
                <h2 className="mb-5 shrink-0 text-md font-semibold text-[#241453]">
                  Caseload Trends
                </h2>

                <p className="mb-4 text-sm text-[#7B6D9B]">
                  Number of learners surveyed per month, by risk level.
                </p>

                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      maxBarSize={56}
                      barCategoryGap="35%"
                      margin={{ top: 16, right: 32, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEE8F8" />

                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: "#8E82AA" }}
                        axisLine={{ stroke: "#DDD8F0" }}
                        tickLine={false}
                        label={{
                          value: "Month →",
                          position: "insideRight",
                          dx: 28,
                          dy: -2,
                          fontSize: 11,
                          fill: "#8E82AA",
                        }}
                      />

                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: "#8E82AA" }}
                        axisLine={false}
                        tickLine={false}
                        width={32}
                        label={{
                          value: "Students",
                          angle: 0,
                          position: "insideTopLeft",
                          dx: -32,
                          dy: -14,
                          fontSize: 11,
                          fill: "#8E82AA",
                        }}
                      />

                      <Tooltip
                        cursor={{ fill: "#F5F1FD", radius: 6 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
                          return (
                            <div style={{
                              background: "#fff",
                              border: "1px solid #EEE8F8",
                              borderRadius: 12,
                              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                              padding: "10px 14px",
                              fontSize: 12,
                              minWidth: 160,
                            }}>
                              <p style={{ fontWeight: 600, color: "#241453", marginBottom: 6 }}>{label}</p>
                              {payload.map((p) => (
                                <p key={p.name} style={{ color: p.color as string, marginBottom: 2 }}>
                                  {p.name}: <strong>{p.value ?? 0}</strong> learner{Number(p.value ?? 0) !== 1 ? "s" : ""}
                                </p>
                              ))}
                              <div style={{ borderTop: "1px solid #EEE8F8", marginTop: 6, paddingTop: 6, color: "#241453", fontWeight: 600 }}>
                                Total: {total} learner{total !== 1 ? "s" : ""}
                              </div>
                            </div>
                          );
                        }}
                      />

                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, paddingTop: 10, color: "#7B6D9B" }}
                      />

                      <Bar dataKey="red"   name="At Risk"  stackId="a" fill="#EF4444" radius={[0, 0, 3, 3]} />
                      <Bar dataKey="amber" name="Moderate" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="green" name="Safe"     stackId="a" fill="#10B981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

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
        </>
      ) : (
        <TicketsManagementView
          loading={ticketsLoading}
          search={ticketsSearch}
          onSearchChange={setTicketsSearch}
          ticketsData={filteredTicketsData}
          onView={setViewTicket}
          onStatusChange={handleStatusChange}
          statusUpdating={statusUpdating}
          onCreateTicket={() => setCreateTicketOpen(true)}
          filters={ticketFilters}
          onFiltersChange={setTicketFilters}
          onExport={handleExport}
        />
      )}

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-600 shadow-sm">
          {error}
        </div>
      ) : null}

      <TicketDetailPanel
        ticket={viewTicket}
        onClose={() => setViewTicket(null)}
        onStatusChange={handleStatusChange}
        statusUpdating={statusUpdating}
      />

      <CreateTicketModal
        open={createTicketOpen}
        learners={data?.learners || []}
        saving={createTicketSaving}
        error={createTicketError}
        onClose={() => {
          if (!createTicketSaving) {
            setCreateTicketOpen(false);
            setCreateTicketError("");
          }
        }}
        onSubmit={handleCreateTicketFromManagement}
      />

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