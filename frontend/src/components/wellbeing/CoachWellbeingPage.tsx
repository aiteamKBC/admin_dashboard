import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
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
  Pencil,
  Trash2,
  FileDown,
  FileSpreadsheet,
  FileText as FilePdf,
  Heart,
  BookOpen,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import kbcLogoSrc from "@/assets/logo-icon.png";

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

import { getCoachWellbeing, getCoachOptions, createSupportTicket, getSupportTickets, updateSupportTicket, deleteTicket, archiveTicket, restoreTicket, getArchivedTickets, createTicketNote, uploadEvidenceFile, createTicketEvidence, getTicketNotes, getTicketEvidence, getTicketSurveyResponses, createBookingAppointment, getBookingServices, getBookingAvailability, getBookingStaff } from "@/services/coachWellbeing";
import OnboardingTicketsView from "@/components/wellbeing/OnboardingTicketsView";
import type { UpdateSupportTicketPayload } from "@/services/coachWellbeing";
import type {
  CoachLearnerRow,
  CoachWellbeingResponse,
  PriorityLevel,
  RiskLevel,
  CoachFollowUpItem,
  CoachSuggestedActionItem,
} from "@/types/coachWellbeing";
import type { TicketStatus, ActionModalType, ActionItem, ActionGroup, TicketNoteRow, TicketEvidenceRow, SupportTicketRow, SurveyResponseRow } from "@/components/wellbeing/TicketActions";
import { resolveMediaUrl, ACTION_ICONS, ACTION_GROUPS, TicketActionsDropdown, ActionModal } from "@/components/wellbeing/TicketActions";

type CoachOption = {
  value: string;
  label: string;
};

type TicketableLearnerRow = CoachLearnerRow & {
  hasOpenTicket?: boolean;
  openTicketCount?: number;
  closedTicketCount?: number;
  totalTicketCount?: number;
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
  days_to_close: number | "";
  creator_role: string;
};


type SupportTicketsResponse = {
  summary: {
    total: number;
    open: number;
    redRisk: number;
    escalated: number;
    closed: number;
    avgCloseDays: number | null;
    avgCloseDelta: number | null;
  };
  tickets: SupportTicketRow[];
};

function calculateTicketSummaryFromRows(
  tickets: SupportTicketRow[],
  avgCloseDelta: number | null = null,
): SupportTicketsResponse["summary"] {
  const closedVals = tickets
    .filter((ticket) => CLOSED_TICKET_STATUSES.has(String(ticket.status).toLowerCase()))
    .map((ticket) => Number(ticket.daysToClose ?? ticket.daysOpen ?? 0))
    .filter((days) => Number.isFinite(days) && days >= 0);

  const avgCloseDays = closedVals.length > 0
    ? Math.round((closedVals.reduce((total, days) => total + days, 0) / closedVals.length) * 10) / 10
    : null;

  return {
    total: tickets.length,
    open: tickets.filter((ticket) => isActiveTicketStatus(ticket.status)).length,
    redRisk: tickets.filter((ticket) => String(ticket.risk).toLowerCase() === "red").length,
    escalated: tickets.filter((ticket) => String(ticket.status).toLowerCase() === "escalated").length,
    closed: closedVals.length,
    avgCloseDays,
    avgCloseDelta,
  };
}


const CLOSED_TICKET_STATUSES = new Set(["closed", "outcome recorded"]);

function isActiveTicketStatus(status: string | undefined | null) {
  return !CLOSED_TICKET_STATUSES.has(String(status || "").trim().toLowerCase());
}

function ticketMatchesTextSearch(ticket: SupportTicketRow, query: string) {
  if (!query) return true;
  return (
    String(ticket.ticketCode || "").toLowerCase().includes(query) ||
    String(ticket.learnerName || "").toLowerCase().includes(query) ||
    String(ticket.learnerEmail || "").toLowerCase().includes(query) ||
    String(ticket.type || "").toLowerCase().includes(query) ||
    String(ticket.status || "").toLowerCase().includes(query) ||
    String(ticket.subject || "").toLowerCase().includes(query) ||
    String(ticket.details || "").toLowerCase().includes(query)
  );
}

function ticketMatchesLearner(ticket: SupportTicketRow, learner: TicketableLearnerRow) {
  const ticketEmail = String(ticket.learnerEmail || "").trim().toLowerCase();
  const learnerEmail = String(learner.studentEmail || "").trim().toLowerCase();
  if (ticketEmail && learnerEmail && ticketEmail === learnerEmail) return true;

  const ticketName = String(ticket.learnerName || "").trim().toLowerCase();
  const learnerName = String(learner.studentName || "").trim().toLowerCase();
  return Boolean(ticketName && learnerName && ticketName === learnerName);
}

function learnerMatchesTextSearch(learner: TicketableLearnerRow, query: string) {
  if (!query) return true;
  return (
    String(learner.studentName || "").toLowerCase().includes(query) ||
    String(learner.studentEmail || "").toLowerCase().includes(query) ||
    String(learner.programme || "").toLowerCase().includes(query) ||
    String(learner.coachName || "").toLowerCase().includes(query) ||
    String(learner.coachEmail || "").toLowerCase().includes(query) ||
    String(learner.riskLevel || "").toLowerCase().includes(query) ||
    String(learner.recommendedAction || "").toLowerCase().includes(query)
  );
}

function normaliseCoachIdentity(value: string | null | undefined) {
  const localPart = String(value || "").split("@")[0] || "";
  return localPart
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function storedUserCoachScope() {
  const explicitEmail = String(localStorage.getItem("email") || "").trim().toLowerCase();
  const username = String(localStorage.getItem("username") || "").trim().toLowerCase();
  const email = explicitEmail.includes("@") ? explicitEmail : username.includes("@") ? username : "";
  const keys = Array.from(new Set([
    normaliseCoachIdentity(email),
    normaliseCoachIdentity(username),
    normaliseCoachIdentity(explicitEmail),
  ].filter(Boolean)));

  return { email, keys };
}

function learnerMatchesCoachScope(
  learner: TicketableLearnerRow,
  scope: { email: string; keys: string[] },
) {
  const learnerCoachEmail = String(learner.coachEmail || "").trim().toLowerCase();
  if (scope.email && learnerCoachEmail === scope.email) return true;

  const learnerKeys = [
    normaliseCoachIdentity(learner.coachEmail),
    normaliseCoachIdentity(learner.coachName),
  ].filter(Boolean);

  return scope.keys.some((key) => learnerKeys.includes(key));
}

function hasLearnerWellbeingData(row: TicketableLearnerRow) {
  return Boolean(
    row.lastSurveyDate ||
    row.totalScore != null ||
    row.wellbeingScore != null ||
    row.engagementScore != null ||
    row.providerSupportScore != null ||
    row.safeguardingScore != null ||
    (row.triggerCount ?? 0) > 0 ||
    (row.triggeredQuestions?.length ?? 0) > 0
  );
}


function isLearnerEvidence(ev: TicketEvidenceRow) { return ev.uploaded_by === "learner"; }
function evFileUrl(ev: TicketEvidenceRow) { return ev.data_url || resolveMediaUrl(ev.file_url || ev.url || ""); }
function evFileName(ev: TicketEvidenceRow) { return ev.file_name || ev.original_name || ""; }
function fileLooksLikeImage(url: string, name = "", mime = "") {
  const value = `${name} ${url}`.toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|\?)/.test(value);
}
function fileLooksLikePdf(url: string, name = "", mime = "") {
  const value = `${name} ${url}`.toLowerCase();
  return mime === "application/pdf" || /\.pdf(?:$|\?)/.test(value);
}
function evIsImage(ev: TicketEvidenceRow) {
  return fileLooksLikeImage(evFileUrl(ev), evFileName(ev), ev.mime_type || "");
}

function EvidencePreviewModal({
  url,
  name,
  description,
  createdBy,
  createdAt,
  mimeType = "",
  onClose,
}: {
  url: string;
  name?: string;
  description?: string;
  createdBy?: string;
  createdAt?: string | null;
  mimeType?: string;
  onClose: () => void;
}) {
  const isImage = fileLooksLikeImage(url, name, mimeType);
  const isPdf = fileLooksLikePdf(url, name, mimeType);
  const displayName = name || "Evidence file";

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4">
      <button type="button" className="fixed inset-0 cursor-default" onClick={onClose} aria-label="Close evidence preview" />
      <div className="relative z-[151] flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#ECE7F7] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[#241453]">{displayName}</h3>
            {description && <p className="mt-1 text-sm text-[#7B6D9B]">{description}</p>}
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#9D8EC7]">
              {createdBy && <span>{createdBy}</span>}
              {createdAt && <span>{formatTicketDate(createdAt)}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={url}
              download={displayName}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#241453] px-3 text-xs font-semibold text-white hover:bg-[#362063]"
            >
              <FileDown className="h-3.5 w-3.5" />
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E7E2F3] text-[#7B6D9B] hover:bg-[#F8F5FF]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="custom-scroll flex-1 overflow-auto bg-[#F8F6FC] p-4">
          {isImage ? (
            <img src={url} alt={displayName} className="mx-auto max-h-[70vh] max-w-full rounded-2xl bg-white object-contain shadow-sm" />
          ) : isPdf ? (
            <iframe title={displayName} src={url} className="h-[70vh] w-full rounded-2xl border border-[#E7E2F3] bg-white" />
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-[#E7E2F3] bg-white p-8 text-center">
              <FileText className="mb-3 h-10 w-10 text-[#8E82AA]" />
              <p className="text-sm font-semibold text-[#241453]">Preview is not available for this file type.</p>
              <p className="mt-1 text-xs text-[#7B6D9B]">Use Download to open it on your device.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

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
    days_to_close: "",
    creator_role: "",
  };
}


const emptyDashboard: CoachWellbeingResponse = {
  summary: {
    caseload: 0,
    atRisk: 0,
    greenRisk: 0,
    nonResponders: 0,
    openTickets: 0,
    surveyResponded: 0,
    avgWellbeing: null,
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

type RiskQuickValue = "all" | RiskLevel;

const RISK_QUICK_FILTERS: Array<{
  value: RiskQuickValue;
  label: string;
  activeClass: string;
}> = [
  { value: "all", label: "All", activeClass: "border-[#241453] bg-[#241453] text-white" },
  { value: "red", label: "Red", activeClass: "border-red-500 bg-red-500 text-white" },
  { value: "amber", label: "Amber", activeClass: "border-amber-500 bg-amber-500 text-white" },
  { value: "green", label: "Green", activeClass: "border-emerald-500 bg-emerald-500 text-white" },
];

function RiskQuickFilter({
  value,
  onChange,
  allLabel = "All",
  counts,
}: {
  value?: RiskQuickValue;
  onChange: (value: RiskQuickValue) => void;
  allLabel?: string;
  counts?: Partial<Record<RiskQuickValue, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {RISK_QUICK_FILTERS.map((item) => {
        const isActive = value === item.value;
        const label = item.value === "all" ? allLabel : item.label;
        const count = counts?.[item.value];
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${
              isActive
                ? item.activeClass
                : "border-[#E7E2F3] bg-white text-[#241453] hover:bg-[#F8F5FF]"
            }`}
          >
            <span>{label}</span>
            {count != null && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                isActive ? "bg-white/20 text-current" : "bg-[#F4F0FC] text-[#644D93]"
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
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

function StatCard({
  title,
  value,
  icon,
  delta,
  unit,
  valueColor,
  iconBg,
  iconColor,
  trendLabel,
  trendPositiveIsGood = true,
  source,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  delta?: number | null;
  unit?: string;
  valueColor?: string;
  iconBg?: string;
  iconColor?: string;
  trendLabel?: string;
  trendPositiveIsGood?: boolean;
  source?: string;
}) {
  const trendColor = delta == null
    ? "text-slate-400"
    : trendPositiveIsGood
      ? delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-400"
      : delta > 0 ? "text-red-500" : delta < 0 ? "text-emerald-600" : "text-slate-400";

  return (
    <div className="rounded-2xl border border-[#E7E2F3] bg-white p-5 shadow-sm" title={source}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#7B6D9B]">
            {title}
          </div>
          <div className={`mt-2 text-3xl font-semibold ${valueColor ?? "text-[#241453]"}`}>
            {value}{unit ? <span className="ml-1 text-base font-normal text-[#7B6D9B]">{unit}</span> : null}
          </div>
          {delta != null && (
            <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}
              <span>{delta > 0 ? "+" : ""}{delta} {trendLabel ?? "vs last month"}</span>
            </div>
          )}
        </div>

        <div className={`rounded-xl p-3 ${iconBg ?? "bg-[#F5F1FC]"} ${iconColor ?? "text-[#644D93]"}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function LoadingBadge({ label = "Loading data..." }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#DCCFF6] bg-white px-3 py-1.5 text-xs font-semibold text-[#5A3EA6] shadow-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8B6BC8] opacity-40" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#8B6BC8]" />
      </span>
      {label}
    </div>
  );
}

function ModernPageLoader({ title = "Loading page", subtitle = "Preparing the latest wellbeing data." }: { title?: string; subtitle?: string }) {
  return (
    <div className="mb-5 overflow-hidden rounded-3xl border border-[#E7E2F3] bg-white shadow-sm">
      <div className="h-1.5 w-full overflow-hidden bg-[#F2ECFB]">
        <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-r-full bg-[#8B6BC8]" />
      </div>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#241453]">{title}</p>
          <p className="mt-0.5 text-xs text-[#7B6D9B]">{subtitle}</p>
        </div>
        <LoadingBadge label="Loading..." />
      </div>
    </div>
  );
}

function InlineLoadingNotice({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[#E7E2F3] bg-[#FBFAFE] px-4 py-3">
      <LoadingBadge label={label} />
      <span className="text-xs text-[#8E82AA]">Keeping the current data visible while refreshing.</span>
    </div>
  );
}

function TrendBadge({ trend, delta }: { trend?: string | null; delta?: number | null }) {
  if (!trend) {
    return (
      <span
        className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-400"
        title="Needs at least two wellbeing surveys to calculate trend"
      >
        New
      </span>
    );
  }
  if (trend === "stable") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500"
        title="Overall risk score is broadly unchanged"
      >
        <Minus className="h-3 w-3" />
        Stable
      </span>
    );
  }
  if (trend === "up") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600"
        title="Overall risk score has increased"
      >
        <TrendingUp className="h-3 w-3" />
        {delta != null ? `+${delta.toFixed(1)}` : "Increased"}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
      title="Overall risk score has decreased"
    >
      <TrendingDown className="h-3 w-3" />
      {delta != null ? delta.toFixed(1) : "Reduced"}
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
    dotClass = "bg-red-500";
    label = "High concern";
    tipColor = "#991b1b";
    arrowColor = "#991b1b";
  } else if (val === 6) {
    dotClass = "bg-amber-400";
    label = "Follow-up";
    tipColor = "#92400e";
    arrowColor = "#92400e";
  } else {
    dotClass = "bg-emerald-400";
    label = "Low concern";
    tipColor = "#065f46";
    arrowColor = "#065f46";
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
          <p className="mt-0.5 opacity-80">Higher risk score = more concern</p>
          <div
            className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: arrowColor }}
          />
        </div>
      </div>
    </div>
  );
}

type TriggeredQuestion = {
  text: string;
  score?: number | null;
  answer?: number | null;
  riskScore?: number | null;
  level?: string;
  note?: string;
};

function scoreBadgeClass(score?: number | null) {
  if (score == null) return "bg-slate-100 text-slate-500";
  if (score >= 8) return "bg-red-100 text-red-700";
  if (score >= 6) return "bg-amber-100 text-amber-700";
  return "bg-green-100 text-green-700";
}

function wellbeingRiskTextColor(score?: number | null) {
  if (score == null) return "text-[#241453]";
  if (score >= 8) return "text-red-500";
  if (score >= 6) return "text-amber-500";
  return "text-[#0F9B8E]";
}

function wellbeingScoreDescription(score?: number | null) {
  if (score == null) return "No wellbeing score is available for this learner.";
  if (score >= 8) return "High concern range based on the current survey data.";
  if (score >= 6) return "Follow-up range based on the current survey data.";
  return "Low concern range based on the current survey data.";
}

function TriggeredQuestionsPopover({ questions, count }: { questions: TriggeredQuestion[]; count: number }) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // useLayoutEffect fires before paint — panel is measured and positioned
  // in the same frame it's inserted, so it never flickers at (0,0).
  // createPortal renders into document.body, bypassing any CSS transform on
  // ancestor table elements that would break position:fixed.
  React.useLayoutEffect(() => {
    if (!open || !btnRef.current || !panelRef.current) return;
    const btn = btnRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = btn.left;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;

    let top = btn.bottom + 6;
    if (top + ph > vh - 8) top = btn.top - ph - 6;
    if (top < 8) top = 8;

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = "visible";
  }, [open]);

  if (questions.length === 0) return <span className="text-slate-300">—</span>;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#FDE7E7] px-2.5 py-1 text-xs font-semibold text-[#D92D20] hover:bg-[#F9C9C9]"
      >
        <AlertTriangle className="h-3 w-3" />
        {count} {count === 1 ? "trigger" : "triggers"}
      </button>

      {open &&
        createPortal(
          <>
            {/* backdrop — closes popover on outside click */}
            <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />

            {/* panel — invisible until useLayoutEffect positions it */}
            <div
              ref={panelRef}
              className="fixed z-[91] w-[520px] max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-[#E9E3F5] bg-white shadow-xl"
              style={{ top: 0, left: 0, visibility: "hidden" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#F1EDF8] px-4 py-3">
                <div>
                  <span className="text-sm font-semibold text-[#241453]">Triggered Questions</span>
                  <span className="ml-2 rounded-full bg-[#FDE7E7] px-2 py-0.5 text-[10px] font-bold text-[#D92D20]">
                    {questions.length}
                  </span>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* scrollable list — fixed 380px max, scrollbar appears when content overflows */}
              <div className="custom-scroll overflow-y-auto p-3" style={{ maxHeight: "380px" }}>
                <ol className="space-y-3">
                  {questions.map((q, i) => {
                    const parsed = parseWellbeingTriggerLine(q.text);
                    const parsedRisk = numericRiskValue(parsed?.risk);
                    const answer = q.answer ?? q.score ?? parsed?.answer ?? null;
                    const reason = triggerReasonLabel(q.note || parsed?.reason, q.level || parsed?.level);
                    const riskScore = q.riskScore ?? parsedRisk ?? computedTriggerRiskScore({
                      answer,
                      reason,
                      level: q.level || parsed?.level,
                    });
                    const concernLabel = concernLabelFromScore(riskScore, q.level || parsed?.level);
                    const visuals = concernVisuals(concernLabel);
                    const questionText = parsed?.text || q.text;
                    return (
                      <li key={i} className={`overflow-hidden rounded-2xl border ${visuals.card}`}>
                        <div className="flex items-start gap-3 p-3.5">
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-black ${visuals.icon}`}>
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${visuals.badge}`}>
                                {concernLabel}
                              </span>
                              {riskScore != null && (
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#241453] ring-1 ring-white">
                                  Risk score {riskScore}/10
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-5 text-[#241453]">
                              {questionText}
                            </p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <div className="rounded-xl bg-white/85 px-3 py-2 ring-1 ring-white">
                                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Answer</div>
                                <div className="mt-1 text-lg font-black text-[#241453]">{answer ?? "-"}</div>
                              </div>
                              <div className="rounded-xl bg-white/85 px-3 py-2 ring-1 ring-white">
                                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Risk</div>
                                <div className="mt-1 text-lg font-black text-[#241453]">{riskScore ?? "-"}</div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                  <div className={`h-full rounded-full ${visuals.bar}`} style={{ width: `${scoreWidth(riskScore)}%` }} />
                                </div>
                              </div>
                              <div className="rounded-xl bg-white/85 px-3 py-2 ring-1 ring-white">
                                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Reason</div>
                                <div className="mt-1 text-[11px] font-semibold leading-4 text-slate-700">{reason}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

// ── Apprentice Report Modal ───────────────────────────────────────────────────
function isUrl(s: string) {
  return /^(https?:\/\/|mailto:)/i.test(s.trim());
}

// Keys whose values should be rendered as a prominent bold title line
const TITLE_KEYS = new Set(["title", "name", "heading", "label"]);

function reportLabel(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
}

function asReportRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asReportRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(asReportRecord(item)))
    : [];
}

function asReportStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function reportString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function reportLevelClass(value?: string | null) {
  const v = String(value || "").toLowerCase();
  if (v.includes("high") || v.includes("red") || v.includes("concern")) return "bg-red-50 text-red-700 ring-red-100";
  if (v.includes("follow") || v.includes("medium") || v.includes("amber") || v.includes("observation")) return "bg-amber-50 text-amber-700 ring-amber-100";
  if (v.includes("today")) return "bg-red-50 text-red-700 ring-red-100";
  if (v.includes("week")) return "bg-amber-50 text-amber-700 ring-amber-100";
  if (v.includes("support")) return "bg-[#F4F0FC] text-[#644D93] ring-[#E7E2F3]";
  return "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

function questionLookupKey(value?: string | null) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function triggerReasonLabel(note?: string | null, level?: string | null) {
  const raw = String(note || "").trim();
  const lowered = raw.toLowerCase();
  if (lowered.includes("low answer on a positive question")) return "Low answer on a positive question";
  if (lowered.includes("high answer on a risk question")) return "High answer on a risk question";
  if (raw) return raw;
  return String(level || "").toLowerCase() === "low"
    ? "Low answer on a positive question"
    : "High answer on a risk question";
}

function concernLabelFromScore(score?: number | null, fallback?: string | null) {
  if (score != null && Number.isFinite(Number(score))) {
    const n = Number(score);
    if (n >= 8) return "High concern";
    if (n >= 6) return "Follow-up";
    return "Low concern";
  }
  const v = String(fallback || "").toLowerCase();
  if (v.includes("high") || v.includes("red")) return "High concern";
  if (v.includes("follow") || v.includes("medium") || v.includes("amber")) return "Follow-up";
  if (v.includes("low") || v.includes("green")) return "Low concern";
  return "Not scored";
}

function concernVisuals(label: string) {
  const v = label.toLowerCase();
  if (v.includes("high")) {
    return {
      badge: "bg-red-50 text-red-700 ring-red-100",
      card: "border-red-100 bg-red-50/35",
      bar: "bg-red-500",
      icon: "bg-red-100 text-red-700",
    };
  }
  if (v.includes("follow")) {
    return {
      badge: "bg-amber-50 text-amber-700 ring-amber-100",
      card: "border-amber-100 bg-amber-50/35",
      bar: "bg-amber-500",
      icon: "bg-amber-100 text-amber-700",
    };
  }
  return {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    card: "border-emerald-100 bg-emerald-50/35",
    bar: "bg-emerald-500",
    icon: "bg-emerald-100 text-emerald-700",
  };
}

function scoreWidth(score?: number | null) {
  if (score == null || !Number.isFinite(Number(score))) return 0;
  return Math.max(0, Math.min(100, Number(score) * 10));
}

function scoreRiskPercentValue(score?: number | string | null) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const numeric = Number(score);
  const percent = numeric <= 10 ? numeric * 10 : numeric;
  return Math.max(0, Math.min(100, percent));
}

function triggerRiskPercentValue(triggerCount?: number | string | null) {
  if (triggerCount == null || !Number.isFinite(Number(triggerCount))) return null;
  const count = Number(triggerCount);
  if (count <= 0) return 0;
  // One trigger is already a follow-up case; five or more is high-risk.
  return Math.max(0, Math.min(100, 60 + ((Math.min(count, 5) - 1) / 4) * 40));
}

function actualRiskPercentValue(input: {
  totalScore?: number | string | null;
  safeguardingScore?: number | string | null;
  triggerCount?: number | string | null;
  triggerScores?: Array<number | string | null | undefined>;
}) {
  const values = [
    scoreRiskPercentValue(input.totalScore),
    scoreRiskPercentValue(input.safeguardingScore),
    triggerRiskPercentValue(input.triggerCount),
    ...(input.triggerScores || []).map((score) => scoreRiskPercentValue(score ?? null)),
  ].filter((value): value is number => value != null && Number.isFinite(value));

  return values.length ? Math.max(...values) : null;
}

function percentRiskText(percent?: number | null) {
  if (percent == null) return "-";
  const rounded = Math.round(percent * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function actualRiskPercentText(input: {
  totalScore?: number | string | null;
  safeguardingScore?: number | string | null;
  triggerCount?: number | string | null;
  triggerScores?: Array<number | string | null | undefined>;
}) {
  return percentRiskText(actualRiskPercentValue(input));
}

function ReportSection({
  title,
  eyebrow,
  right,
  children,
}: {
  title: string;
  eyebrow?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#E7E2F3] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1EDF8] px-5 py-4">
        <div>
          {eyebrow && <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8B7AAF]">{eyebrow}</div>}
          <h3 className="text-sm font-bold text-[#241453]">{title}</h3>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function renderReportValue(value: unknown, depth = 0, parentKey = ""): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-slate-300">—</span>;
  if (typeof value === "boolean") return <span className={value ? "text-emerald-600 font-medium" : "text-slate-500"}>{value ? "Yes" : "No"}</span>;
  if (typeof value === "number") return <span className="font-semibold text-[#241453]">{value}</span>;
  if (typeof value === "string") {
    if (!value.trim()) return <span className="text-slate-300">—</span>;
    // URL → clickable link with underline + colour change on hover/visited
    if (isUrl(value)) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-[#5B3FD9] underline decoration-[#C4B5F4] underline-offset-2 hover:text-[#3B22A8] hover:decoration-[#8B6BC8] visited:text-[#7B5EA7]"
        >
          {value}
        </a>
      );
    }
    // Value for a "title"-like key → bold, slightly larger, dark purple
    if (TITLE_KEYS.has(parentKey.toLowerCase())) {
      return <span className="font-semibold text-[#241453]">{value}</span>;
    }
    return <span className="text-slate-700">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-300">—</span>;
    if (value.every((item) => asReportRecord(item))) {
      return (
        <div className="grid gap-3">
          {asReportRecords(value).map((item, i) => (
            <div key={i} className="rounded-xl border border-[#E7E2F3] bg-white p-3">
              {renderReportValue(item, depth + 1)}
            </div>
          ))}
        </div>
      );
    }
    return (
      <ul className="mt-1 space-y-1">
        {value.map((item, i) => (
          <li key={i} className="flex gap-2 text-slate-700">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8B6BC8]" />
            <span>{renderReportValue(item, depth + 1)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    const HIDE_KEYS = new Set(["code", "cta_text", "cta", "call_to_action"]);
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([k, v]) => !HIDE_KEYS.has(k) && v !== null && v !== undefined && v !== ""
    );
    if (entries.length === 0) return <span className="text-slate-300">—</span>;
    return (
      <div className={depth > 0 ? "mt-1 pl-3 border-l-2 border-[#E7E2F3] space-y-1.5" : "space-y-2"}>
        {entries.map(([k, v]) => {
          const isTitleKey = TITLE_KEYS.has(k.toLowerCase());
          const label = reportLabel(k);
          return (
            <div key={k}>
              <span className={
                isTitleKey
                  ? "text-[11px] font-bold uppercase tracking-wide text-[#4B2EA8]"
                  : "text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]"
              }>
                {label}
              </span>
              <div className="mt-0.5">{renderReportValue(v, depth + 1, k)}</div>
            </div>
          );
        })}
      </div>
    );
  }
  return <span className="text-slate-700">{String(value)}</span>;
}

function ApprenticeReportModal({
  learner,
  onClose,
}: {
  learner: TicketableLearnerRow | null;
  onClose: () => void;
}) {
  const [questionTab, setQuestionTab] = useState<"flags" | "answers">("flags");

  useEffect(() => {
    setQuestionTab((learner?.triggeredQuestions?.length ?? 0) > 0 ? "flags" : "answers");
  }, [learner?.studentId, learner?.triggeredQuestions?.length]);

  if (!learner) return null;
  const data = asReportRecord((learner as any).apprenticeDashboard) ?? {};
  const dashboardSummary = reportString(data.dashboard_summary);
  const whatMatters = asReportRecords(data.what_matters_now);
  const recommendations = asReportRecords(data.personalised_recommendations);
  const resources = asReportRecords(data.resources_self_help);
  const summaryCards = asReportRecord(data.ai_wellbeing_summary);
  const surveyResponses = learner.surveyResponses || [];
  const triggeredQuestions = learner.triggeredQuestions || [];
  const handledKeys = new Set([
    "overall_wellbeing",
    "workplace_experience",
    "support_from_kbc",
    "what_matters_now",
    "personalised_recommendations",
    "resources_self_help",
    "ai_wellbeing_summary",
    "dashboard_summary",
  ]);
  const additionalEntries = Object.entries(data).filter(([key]) => !handledKeys.has(key));
  const hasReportData = Object.keys(data).length > 0 || surveyResponses.length > 0 || triggeredQuestions.length > 0;

  const wellbeingSections = [
    { key: "overall_wellbeing", title: "Overall wellbeing" },
    { key: "workplace_experience", title: "Workplace experience" },
    { key: "support_from_kbc", title: "Support from KBC" },
  ].map((section) => {
    const sectionData = asReportRecord(data[section.key]);
    return {
      ...section,
      insights: asReportStrings(sectionData?.ai_insights),
      actions: asReportStrings(sectionData?.recommended_actions),
    };
  }).filter((section) => section.insights.length > 0 || section.actions.length > 0);

  const statusItems = ["status_1", "status_2", "status_3"]
    .map((key) => asReportRecord(summaryCards?.[key]))
    .filter((item): item is Record<string, unknown> => Boolean(item));

  const responseByQuestion = new Map(
    surveyResponses
      .filter((item) => item.questionText || item.questionCode)
      .map((item) => [questionLookupKey(item.questionText || item.questionCode), item])
  );
  const responseForTrigger = (item: TriggeredQuestion) => responseByQuestion.get(questionLookupKey(item.text));
  const flaggedHighCount = triggeredQuestions.filter((item) => {
    const matched = responseForTrigger(item);
    return concernLabelFromScore(item.riskScore, matched?.concernLevel || item.level).toLowerCase().includes("high");
  }).length;
  const flaggedFollowUpCount = triggeredQuestions.filter((item) => {
    const matched = responseForTrigger(item);
    return concernLabelFromScore(item.riskScore, matched?.concernLevel || item.level).toLowerCase().includes("follow");
  }).length;
  const answerConcernCounts = surveyResponses.reduce(
    (acc, item) => {
      const label = concernLabelFromScore(null, item.concernLevel).toLowerCase();
      if (label.includes("high")) acc.high += 1;
      else if (label.includes("follow")) acc.followUp += 1;
      else acc.low += 1;
      return acc;
    },
    { high: 0, followUp: 0, low: 0 }
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#120926]/45 p-3 sm:p-5">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative z-10 mx-auto flex h-[calc(100vh-24px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl sm:h-[calc(100vh-40px)]">
        {/* Header */}
        <div className="border-b border-[#EEE8F8] bg-[#FAFAFF] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#7B6D9B]">Learner wellbeing report</div>
              <div className="mt-1 truncate text-xl font-bold text-[#241453]">{learner.studentName}</div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{learner.studentEmail}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportApprenticeToPDF(learner)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#D6CCF0] bg-white px-3 text-xs font-semibold text-[#644D93] shadow-sm hover:bg-[#F5F1FC]"
              >
                <FilePdf className="h-3.5 w-3.5" />
                Export PDF
              </button>
              <button type="button" onClick={onClose} className="rounded-xl border border-[#E7E2F3] bg-white p-2 text-slate-500 hover:bg-[#F5F1FC] hover:text-[#241453]">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Risk", value: learner.riskLevel, badge: true },
              {
                label: "Total score",
                value: actualRiskPercentText({
                  totalScore: learner.totalScore,
                  safeguardingScore: learner.safeguardingScore,
                  triggerCount: learner.triggerCount ?? triggeredQuestions.length,
                  triggerScores: triggeredQuestions.map((item) => item.riskScore ?? item.score ?? item.answer),
                }),
              },
              { label: "Wellbeing", value: learner.wellbeingScore != null ? learner.wellbeingScore : "-" },
              { label: "Safeguarding", value: learner.safeguardingScore != null ? learner.safeguardingScore : "-" },
              { label: "Triggers", value: learner.triggerCount ?? triggeredQuestions.length },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-[#E7E2F3] bg-white px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">{s.label}</div>
                {s.badge ? (
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${riskBadgeClass(learner.riskLevel)}`}>
                    {learner.riskLevel}
                  </span>
                ) : (
                  <div className={`mt-1 text-lg font-bold ${typeof s.value === "number" ? wellbeingRiskTextColor(Number(s.value)) : "text-[#241453]"}`}>
                    {s.value}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body - scrollable */}
        <div className="custom-scroll flex-1 overflow-y-auto bg-[#FBFAFF] px-4 py-5 sm:px-6">
          {!hasReportData ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <FileText className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">No report data available for this learner yet.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <ReportSection title="Learner details" eyebrow="Context">
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Programme", learner.programme || "-"],
                    ["Coach", learner.coachName || "-"],
                    ["Coach email", learner.coachEmail || "-"],
                    ["Last survey", learner.lastSurveyDate || "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-[#FAFAFF] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">{label}</div>
                      <div className="mt-1 break-words font-semibold text-[#241453]">{value}</div>
                    </div>
                  ))}
                </div>
              </ReportSection>

              {dashboardSummary && (
                <ReportSection title="Dashboard summary" eyebrow="AI summary">
                  <p className="max-w-4xl text-sm leading-6 text-slate-700">{dashboardSummary}</p>
                </ReportSection>
              )}

              {statusItems.length > 0 && (
                <ReportSection title="Wellbeing summary cards" eyebrow="Status">
                  <div className="grid gap-3 md:grid-cols-3">
                    {statusItems.map((item, index) => (
                      <div key={index} className="rounded-2xl border border-[#E7E2F3] bg-[#FAFAFF] p-4">
                        <div className="text-xs font-bold text-[#644D93]">{reportString(item.label) || `Status ${index + 1}`}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{reportString(item.text) || "-"}</p>
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}

              {wellbeingSections.length > 0 && (
                <div className="grid gap-5 xl:grid-cols-3">
                  {wellbeingSections.map((section) => (
                    <ReportSection key={section.key} title={section.title} eyebrow="Insights">
                      <div className="space-y-4">
                        {section.insights.length > 0 && (
                          <div>
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">AI insights</div>
                            <ul className="space-y-2">
                              {section.insights.map((item, i) => (
                                <li key={i} className="rounded-xl bg-[#FAFAFF] px-3 py-2 text-sm leading-5 text-slate-700">{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {section.actions.length > 0 && (
                          <div>
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Recommended actions</div>
                            <ul className="space-y-2">
                              {section.actions.map((item, i) => (
                                <li key={i} className="flex gap-2 text-sm leading-5 text-slate-700">
                                  <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0F9B8E]" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </ReportSection>
                  ))}
                </div>
              )}

              {whatMatters.length > 0 && (
                <ReportSection title="What matters now" eyebrow="Priorities" right={<span className="rounded-full bg-[#F4F0FC] px-2.5 py-1 text-xs font-bold text-[#644D93]">{whatMatters.length} items</span>}>
                  <div className="grid gap-3 md:grid-cols-2">
                    {whatMatters.map((item, i) => {
                      const type = reportString(item.type) || "item";
                      return (
                        <div key={i} className="rounded-2xl border border-[#E7E2F3] bg-[#FAFAFF] p-4">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${type === "positive" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-red-50 text-red-700 ring-red-100"}`}>
                            {type}
                          </span>
                          <p className="mt-3 text-sm leading-6 text-slate-700">{reportString(item.text) || renderReportValue(item)}</p>
                        </div>
                      );
                    })}
                  </div>
                </ReportSection>
              )}

              {recommendations.length > 0 && (
                <ReportSection title="Personalised recommendations" eyebrow="Actions" right={<span className="rounded-full bg-[#F4F0FC] px-2.5 py-1 text-xs font-bold text-[#644D93]">{recommendations.length} recommendations</span>}>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {recommendations.map((item, i) => {
                      const tag = reportString(item.tag);
                      return (
                        <div key={i} className="rounded-2xl border border-[#E7E2F3] bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="text-sm font-bold text-[#241453]">{reportString(item.title) || "Recommendation"}</h4>
                            {tag && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${reportLevelClass(tag)}`}>{tag}</span>}
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-700">{reportString(item.reason) || "-"}</p>
                        </div>
                      );
                    })}
                  </div>
                </ReportSection>
              )}

              {resources.length > 0 && (
                <ReportSection title="Resources" eyebrow="Self help">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {resources.map((item, i) => {
                      const bullets = asReportStrings(item.bullet_points);
                      const sourceUrl = reportString(item.source_url);
                      return (
                        <div key={i} className="rounded-2xl border border-[#E7E2F3] bg-white p-4">
                          <h4 className="text-sm font-bold text-[#241453]">{reportString(item.title) || "Resource"}</h4>
                          {bullets.length > 0 && (
                            <ul className="mt-3 space-y-2">
                              {bullets.map((bullet, j) => (
                                <li key={j} className="flex gap-2 text-xs leading-5 text-slate-700">
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8B6BC8]" />
                                  <span>{bullet}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {sourceUrl && isUrl(sourceUrl) && (
                            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#5B3FD9] hover:underline">
                              {reportString(item.source_title) || "Open source"}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ReportSection>
              )}

              {(triggeredQuestions.length > 0 || surveyResponses.length > 0) && (
                <ReportSection
                  title="Question evidence"
                  eyebrow="Survey review"
                  right={
                    <div className="flex rounded-2xl border border-[#E7E2F3] bg-[#F8F5FF] p-1">
                      {[
                        { id: "flags" as const, label: "Risk flags", count: triggeredQuestions.length, disabled: triggeredQuestions.length === 0 },
                        { id: "answers" as const, label: "All answers", count: surveyResponses.length, disabled: surveyResponses.length === 0 },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          disabled={tab.disabled}
                          onClick={() => setQuestionTab(tab.id)}
                          className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition ${
                            questionTab === tab.id
                              ? "bg-[#241453] text-white shadow-sm"
                              : "text-[#644D93] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span className={questionTab === tab.id ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]" : "rounded-full bg-white px-1.5 py-0.5 text-[10px]"}>
                            {tab.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  }
                >
                  <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: "Risk flags", value: triggeredQuestions.length, tone: "red" },
                      { label: "High concern", value: flaggedHighCount, tone: "red" },
                      { label: "Follow-up", value: flaggedFollowUpCount || answerConcernCounts.followUp, tone: "amber" },
                      { label: "All answers", value: surveyResponses.length, tone: "purple" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-2xl border px-4 py-3 ${
                          item.tone === "red"
                            ? "border-red-100 bg-red-50/40"
                            : item.tone === "amber"
                              ? "border-amber-100 bg-amber-50/40"
                              : "border-[#E7E2F3] bg-[#FAFAFF]"
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">{item.label}</div>
                        <div className={`mt-1 text-2xl font-black ${
                          item.tone === "red" ? "text-red-600" : item.tone === "amber" ? "text-amber-600" : "text-[#241453]"
                        }`}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {questionTab === "flags" ? (
                    triggeredQuestions.length === 0 ? (
                      <div className="rounded-2xl border border-[#E7E2F3] bg-[#FAFAFF] px-4 py-6 text-sm text-slate-500">
                        No active risk flags are available for this learner.
                      </div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {triggeredQuestions.map((item, i) => {
                          const matched = responseForTrigger(item);
                          const answer = item.answer ?? item.score ?? matched?.answer;
                          const reason = triggerReasonLabel(item.note, item.level);
                          const riskScore = item.riskScore ?? computedTriggerRiskScore({
                            answer,
                            reason,
                            level: item.level,
                          });
                          const concernLabel = concernLabelFromScore(riskScore, matched?.concernLevel || item.level);
                          const visuals = concernVisuals(concernLabel);
                          return (
                            <div key={`${item.text}-${i}`} className={`rounded-2xl border p-4 ${visuals.card}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                  <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${visuals.icon}`}>
                                    <AlertTriangle className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${visuals.badge}`}>{concernLabel}</span>
                                      {matched?.categoryName && (
                                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#644D93] ring-1 ring-[#E7E2F3]">
                                          {matched.categoryName}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-3 text-sm font-bold leading-6 text-[#241453]">{item.text}</p>
                                    {matched?.constructType && <p className="mt-1 text-xs text-slate-500">{matched.constructType}</p>}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-white">
                                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Learner answer</div>
                                  <div className="mt-1 text-lg font-black text-[#241453]">{answer ?? "-"}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-white">
                                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Concern score</div>
                                  <div className="mt-1 flex items-end gap-2">
                                    <span className="text-lg font-black text-[#241453]">{riskScore ?? "-"}</span>
                                    {riskScore != null && <span className="pb-0.5 text-xs text-slate-400">/ 10</span>}
                                  </div>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                    <div className={`h-full rounded-full ${visuals.bar}`} style={{ width: `${scoreWidth(riskScore)}%` }} />
                                  </div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-white">
                                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Why flagged</div>
                                  <div className="mt-1 text-xs font-semibold leading-5 text-slate-700">{reason}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : surveyResponses.length === 0 ? (
                    <div className="rounded-2xl border border-[#E7E2F3] bg-[#FAFAFF] px-4 py-6 text-sm text-slate-500">
                      No survey answers are available for this learner.
                    </div>
                  ) : (
                    <div className="custom-scroll max-h-[520px] overflow-auto rounded-2xl border border-[#E7E2F3] bg-white">
                      <table className="min-w-full divide-y divide-[#F1EDF8] text-left text-sm">
                        <thead className="sticky top-0 bg-[#FAFAFF] text-[10px] font-bold uppercase tracking-[0.12em] text-[#7B6D9B]">
                          <tr>
                            <th className="w-[44%] px-4 py-3">Question</th>
                            <th className="px-4 py-3">Area</th>
                            <th className="px-4 py-3">Answer</th>
                            <th className="px-4 py-3">Concern level</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F1EDF8]">
                          {surveyResponses.map((item, i) => {
                            const concernLabel = concernLabelFromScore(null, item.concernLevel);
                            const visuals = concernVisuals(concernLabel);
                            return (
                              <tr key={`${item.questionCode || "q"}-${i}`} className="align-top hover:bg-[#FAFAFF]">
                                <td className="px-4 py-3">
                                  <div className="font-semibold leading-5 text-[#241453]">{item.questionText || item.questionCode || "-"}</div>
                                  {item.questionCode && <div className="mt-1 text-[11px] text-slate-400">{item.questionCode}</div>}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="max-w-[240px] text-slate-600">{item.categoryName || "-"}</div>
                                  {item.constructType && <div className="mt-1 text-xs text-slate-400">{item.constructType}</div>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex min-w-10 justify-center rounded-xl bg-[#F4F0FC] px-3 py-1.5 text-sm font-black text-[#241453]">
                                    {item.answer ?? "-"}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${visuals.badge}`}>
                                    {concernLabel}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </ReportSection>
              )}

              {additionalEntries.length > 0 && (
                <ReportSection title="Additional report data" eyebrow="Other fields">
                  <div className="grid gap-3 lg:grid-cols-2">
                    {additionalEntries.map(([key, value]) => (
                      <div key={key} className="rounded-2xl border border-[#EEE8F8] bg-[#FAFAFF] p-4">
                        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#644D93]">{reportLabel(key)}</div>
                        <div className="text-sm">{renderReportValue(value)}</div>
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const RISK_INDICATOR_OPTIONS = [
  "Physical harm", "Sexual harm", "Emotional / Mental health", "Radicalisation / Extremism",
  "Neglect", "Domestic abuse", "Modern slavery / exploitation",
  "Forced marriage / honour-based violence", "Online safety", "Financial harm",
  "Self-harm", "Bullying / Harassment", "Other (please specify)",
];

function ReferralFormModal({
  learner, onClose, onSubmitted,
}: { learner: TicketableLearnerRow; onClose: () => void; onSubmitted: () => void }) {
  const storedName = localStorage.getItem("username") || localStorage.getItem("full_name") || "";
  const storedRole = localStorage.getItem("role") || "Coach";
  const storedEmail = localStorage.getItem("email") || "";

  const [refName, setRefName] = React.useState(storedName);
  const [refRole, setRefRole] = React.useState(storedRole);
  const [refDept, setRefDept] = React.useState("Apprenticeships");
  const [refContact, setRefContact] = React.useState(storedEmail);
  const [concernDesc, setConcernDesc] = React.useState("");
  const [incidentDate, setIncidentDate] = React.useState("");
  const [incidentTime, setIncidentTime] = React.useState("");
  const [incidentLocation, setIncidentLocation] = React.useState("");
  const [thosePresent, setThosePresent] = React.useState("");
  const [riskChecks, setRiskChecks] = React.useState<boolean[]>(new Array(RISK_INDICATOR_OPTIONS.length).fill(false));
  const [otherRisk, setOtherRisk] = React.useState("");
  const [actionTaken, setActionTaken] = React.useState("");
  const [dslName, setDslName] = React.useState("");
  const [referralDateTime, setReferralDateTime] = React.useState("");
  const [consentGiven, setConsentGiven] = React.useState<"yes" | "no" | "">("");
  const [consentNote, setConsentNote] = React.useState("");
  const [dslRiskLevel, setDslRiskLevel] = React.useState("");
  const [dslActionTaken, setDslActionTaken] = React.useState("");
  const [dslOutcome, setDslOutcome] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const refNum = React.useMemo(() => `SR-${Date.now().toString().slice(-5)}`, []);

  async function handleSubmit() {
    if (!concernDesc.trim()) { setSaveError("Please describe the nature of concern (Part 3)."); return; }
    setSaving(true); setSaveError("");
    try {
      const selectedRisks = RISK_INDICATOR_OPTIONS.filter((_, i) => riskChecks[i]);
      const riskLines = selectedRisks.map(r => r === "Other (please specify)" && otherRisk.trim() ? `• Other: ${otherRisk}` : `• ${r}`).join("\n");
      const urgency = selectedRisks.some(r => ["Physical harm","Sexual harm","Radicalisation / Extremism","Self-harm"].includes(r)) ? "urgent" : selectedRisks.length > 0 ? "high" : "medium";
      const details = [
        `SAFEGUARDING REFERRAL — ${refNum}`,
        "",
        "PART 1 — REFERRER DETAILS",
        `Name: ${refName}  |  Role: ${refRole}  |  Dept: ${refDept}  |  Contact: ${refContact}`,
        "",
        "PART 2 — LEARNER DETAILS",
        `Name: ${learner.studentName}  |  Programme: ${learner.programme || "-"}  |  ID: ${learner.studentId || "-"}  |  Coach: ${(learner as any).coachName || "-"}`,
        "",
        "PART 3 — NATURE OF CONCERN",
        concernDesc,
        `Date: ${incidentDate || "-"}  |  Time: ${incidentTime || "-"}  |  Location: ${incidentLocation || "-"}  |  Those Present: ${thosePresent || "-"}`,
        "",
        "PART 4 — RISK INDICATORS",
        riskLines || "None selected",
        "",
        "PART 5 — ACTION TAKEN SO FAR",
        actionTaken || "-",
        "",
        "PART 6 — REFERRAL TO DSL",
        `DSL Name: ${dslName || "-"}  |  Date & Time: ${referralDateTime || "-"}`,
        "",
        "PART 7 — CONSENT",
        `Learner consent: ${consentGiven || "Not specified"}${consentGiven === "no" && consentNote ? `\nNote: ${consentNote}` : ""}`,
        "",
        "PART 8 — FOR DSL USE ONLY",
        `Risk Level: ${dslRiskLevel || "-"}  |  Action Taken: ${dslActionTaken || "-"}  |  Outcome: ${dslOutcome || "-"}`,
        `Unique Reference Number: ${refNum}`,
      ].join("\n");

      await createSupportTicket({
        wellbeing_record_id: Number(learner.studentId),
        ticket_type: "safeguarding",
        subject: `Safeguarding Referral ${refNum}`,
        details,
        urgency,
        preferred_contact: "email",
        incident_date: incidentDate || undefined,
        incident_time: incidentTime || undefined,
        created_by: storedName,
        creator_role: storedRole,
      } as any);
      onSubmitted();
    } catch (err: any) {
      setSaveError(err?.message || "Failed to submit referral.");
    } finally { setSaving(false); }
  }

  const inputCls = "h-9 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none focus:border-[#644d93]";
  const labelCls = "mb-1 block text-xs font-medium text-[#7B6D9B]";
  const sectionTitleCls = "mb-3 text-sm font-bold text-[#b27715]";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div className="custom-scroll flex w-full max-w-2xl flex-col overflow-y-auto rounded-3xl bg-white shadow-2xl" style={{ maxHeight: "92vh" }}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-3xl border-b border-[#EEE8F8] bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-[#F0EAFD] px-2 py-0.5 text-xs font-bold text-[#644d93]">{refNum}</span>
              <h3 className="text-base font-bold text-[#241453]">Safeguarding Referral Form</h3>
            </div>
            <p className="mt-0.5 text-sm text-[#7B6D9B]">{learner.studentName} · {learner.studentEmail}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-[#E7E2F3] p-2 text-[#241453] hover:bg-[#F8F5FF]"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="space-y-6 px-6 py-5">
          {/* Part 1 */}
          <section>
            <p className={sectionTitleCls}>Part 1 — <span className="text-[#241453]">Details of Referrer</span></p>
            <div className="grid grid-cols-2 gap-3">
              {([["Name", refName, setRefName], ["Role", refRole, setRefRole], ["Department", refDept, setRefDept], ["Contact Details", refContact, setRefContact]] as [string, string, React.Dispatch<React.SetStateAction<string>>][]).map(([lbl, val, set]) => (
                <div key={lbl}><label className={labelCls}>{lbl}</label><input value={val} onChange={e => set(e.target.value)} className={inputCls} /></div>
              ))}
            </div>
          </section>

          {/* Part 2 */}
          <section>
            <p className={sectionTitleCls}>Part 2 — <span className="text-[#241453]">Details of Learner</span></p>
            <div className="grid grid-cols-2 gap-3">
              {[["Full Name", learner.studentName], ["Programme", learner.programme || "-"], ["Learner ID", String(learner.studentId || "-")], ["Skills Coach", (learner as any).coachName || "-"]].map(([lbl, val]) => (
                <div key={lbl}><label className={labelCls}>{lbl}</label><div className="flex h-9 items-center rounded-xl border border-[#DED5F3] bg-[#FAFAFF] px-3 text-sm text-[#241453]">{val}</div></div>
              ))}
            </div>
          </section>

          {/* Part 3 */}
          <section>
            <p className={sectionTitleCls}>Part 3 — <span className="text-[#241453]">Nature of Concern</span> <span className="text-red-500">*</span></p>
            <textarea value={concernDesc} onChange={e => setConcernDesc(e.target.value)} rows={4} placeholder="Describe the safeguarding concern in detail..." className="mb-3 w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none focus:border-[#644d93]" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><label className={labelCls}>Date</label><input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Time</label><input type="time" value={incidentTime} onChange={e => setIncidentTime(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Location</label><input value={incidentLocation} onChange={e => setIncidentLocation(e.target.value)} placeholder="e.g. Workplace" className={inputCls} /></div>
              <div><label className={labelCls}>Those Present</label><input value={thosePresent} onChange={e => setThosePresent(e.target.value)} placeholder="Names" className={inputCls} /></div>
            </div>
          </section>

          {/* Part 4 */}
          <section>
            <p className={sectionTitleCls}>Part 4 — <span className="text-[#241453]">Risk Indicators</span></p>
            <div className="grid grid-cols-2 gap-2">
              {RISK_INDICATOR_OPTIONS.map((opt, i) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#EEE8F8] px-3 py-2 text-sm text-[#241453] hover:bg-[#F9F5FF]">
                  <input type="checkbox" checked={riskChecks[i]} onChange={e => { const n = [...riskChecks]; n[i] = e.target.checked; setRiskChecks(n); }} className="accent-[#644d93]" />
                  {opt}
                </label>
              ))}
            </div>
            {riskChecks[RISK_INDICATOR_OPTIONS.length - 1] && (
              <input value={otherRisk} onChange={e => setOtherRisk(e.target.value)} placeholder="Please specify other risk..." className={`mt-2 ${inputCls}`} />
            )}
          </section>

          {/* Part 5 */}
          <section>
            <p className={sectionTitleCls}>Part 5 — <span className="text-[#241453]">Action Taken So Far</span></p>
            <textarea value={actionTaken} onChange={e => setActionTaken(e.target.value)} rows={3} placeholder="Describe any actions already taken..." className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none focus:border-[#644d93]" />
          </section>

          {/* Part 6 */}
          <section>
            <p className={sectionTitleCls}>Part 6 — <span className="text-[#241453]">Referral to DSL</span></p>
            <p className="mb-3 text-xs text-[#7B6D9B]">I am making a referral to the Designated Safeguarding Lead (DSL).</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Name of DSL</label><input value={dslName} onChange={e => setDslName(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Date and Time of Referral</label><input type="datetime-local" value={referralDateTime} onChange={e => setReferralDateTime(e.target.value)} className={inputCls} /></div>
            </div>
          </section>

          {/* Part 7 */}
          <section>
            <p className={sectionTitleCls}>Part 7 — <span className="text-[#241453]">Consent</span></p>
            <p className="mb-3 text-xs text-[#7B6D9B]">Has the learner given consent for the referral to be shared?</p>
            <div className="mb-3 flex gap-3">
              {(["yes", "no"] as const).map(v => (
                <button key={v} type="button" onClick={() => setConsentGiven(v)} className={`flex-1 rounded-xl border py-2 text-sm font-medium capitalize transition ${consentGiven === v ? "border-[#644d93] bg-[#644d93] text-white" : "border-[#DED5F3] text-[#241453] hover:bg-[#F9F5FF]"}`}>{v}</button>
              ))}
            </div>
            {consentGiven === "no" && (
              <textarea value={consentNote} onChange={e => setConsentNote(e.target.value)} rows={2} placeholder="Note why you are proceeding without consent (safeguarding override)..." className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none focus:border-[#644d93]" />
            )}
          </section>

          {/* Part 8 */}
          <section>
            <p className={sectionTitleCls}>Part 8 — <span className="text-[#241453]">For DSL Use Only</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Risk Level</label>
                <select value={dslRiskLevel} onChange={e => setDslRiskLevel(e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Unique Reference Number</label>
                <div className="flex h-9 items-center rounded-xl border border-[#DED5F3] bg-[#FAFAFF] px-3 text-sm font-semibold text-[#644d93]">{refNum}</div>
              </div>
              <div>
                <label className={labelCls}>Action Taken</label>
                <input value={dslActionTaken} onChange={e => setDslActionTaken(e.target.value)} placeholder="Action taken by DSL..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Outcome</label>
                <input value={dslOutcome} onChange={e => setDslOutcome(e.target.value)} placeholder="Outcome of referral..." className={inputCls} />
              </div>
            </div>
          </section>

          <div className="rounded-xl border border-[#DED5F3] bg-[#F9F5FF] px-4 py-3 text-xs text-[#7B6D9B]">
            <span className="font-semibold text-[#241453]">Note:</span> The referrer must not investigate or share details beyond the DSL. Safeguarding referrals cannot be kept confidential if the DSL deems it necessary to refer to an external agency.
          </div>
          {saveError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{saveError}</div>}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end gap-3 rounded-b-3xl border-t border-[#EEE8F8] bg-white px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#DED5F3] px-5 py-2 text-sm font-medium text-[#241453] hover:bg-[#F8F5FF]">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={saving} className="rounded-xl bg-[#241453] px-6 py-2 text-sm font-semibold text-white hover:bg-[#362063] disabled:opacity-60">
            {saving ? "Submitting..." : "Submit Referral"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LearnerTable({
  rows,
  onCreateFollowUp,
  onViewTickets,
}: {
  rows: TicketableLearnerRow[];
  onCreateFollowUp: (row: TicketableLearnerRow) => void;
  onViewTickets: (row: TicketableLearnerRow) => void;
}) {
  const [reportLearner, setReportLearner] = React.useState<TicketableLearnerRow | null>(null);
  const [referralLearner, setReferralLearner] = React.useState<TicketableLearnerRow | null>(null);
  type LearnerSortKey = "learner" | "lastSurvey" | "totalScore" | "safeguarding" | "wellbeing" | "engagement" | "provider" | "risk" | "triggered" | "action" | "reports";
  const [sortConfig, setSortConfig] = React.useState<{ key: LearnerSortKey; direction: SortDirection }>({
    key: "lastSurvey",
    direction: "desc",
  });
  function setSort(key: LearnerSortKey) {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }
  const sortedRows = React.useMemo(() => {
    const valueFor = (row: TicketableLearnerRow, key: LearnerSortKey) => {
      if (key === "learner") return sortText(row.studentName || row.studentEmail);
      if (key === "lastSurvey") return learnerSurveySortValue(row);
      if (key === "totalScore") return sortNumber(row.totalScore);
      if (key === "safeguarding") return sortNumber(row.safeguardingScore);
      if (key === "wellbeing") return sortNumber(row.wellbeingScore);
      if (key === "engagement") return sortNumber(row.engagementScore);
      if (key === "provider") return sortNumber(row.providerSupportScore);
      if (key === "risk") return sortText(row.riskLevel);
      if (key === "triggered") return sortNumber(row.triggerCount ?? row.triggeredQuestions?.length ?? 0);
      if (key === "action") return sortText(row.recommendedAction);
      return sortNumber(row.totalTicketCount ?? row.openTicketCount ?? 0);
    };
    return [...rows].sort((a, b) => compareValues(valueFor(a, sortConfig.key), valueFor(b, sortConfig.key), sortConfig.direction));
  }, [rows, sortConfig]);
  const learnerHeader = (key: LearnerSortKey, label: string) => (
    <SortHeaderButton label={label} active={sortConfig.key === key} direction={sortConfig.direction} onClick={() => setSort(key)} />
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[#EEE8F8]">
      <div className="custom-scroll overflow-auto" style={{ maxHeight: "520px" }}>
        <table className="w-full min-w-[1280px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#EEE8F8] bg-[#FAFAFF] text-left text-xs font-semibold uppercase tracking-wide text-[#8E82AA]">
              <th className="px-4 py-3 first:pl-5">{learnerHeader("learner", "Learner")}</th>
              <th className="px-4 py-3 whitespace-nowrap">{learnerHeader("lastSurvey", "Last Survey")}</th>
              <th className="px-4 py-3 whitespace-nowrap">{learnerHeader("totalScore", "Total Score")}</th>
              <th className="px-4 py-3 whitespace-nowrap">{learnerHeader("safeguarding", "Safeguarding")}</th>
              <th className="px-4 py-3">{learnerHeader("wellbeing", "Wellbeing")}</th>
              <th className="px-4 py-3">{learnerHeader("engagement", "Engagement")}</th>
              <th className="px-4 py-3">{learnerHeader("provider", "Provider")}</th>
              <th className="px-4 py-3">{learnerHeader("risk", "Risk")}</th>
              <th className="px-4 py-3">Trend</th>
              <th className="px-4 py-3 whitespace-nowrap">{learnerHeader("triggered", "Triggered")}</th>
              <th className="px-4 py-3">{learnerHeader("action", "Action")}</th>
              <th className="px-4 py-3 whitespace-nowrap">{learnerHeader("reports", "Reports")}</th>
              <th className="px-4 py-3 whitespace-nowrap">Referral</th>
              <th className="px-4 py-3 last:pr-5">Follow up</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3EFF9]">
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-5 py-10 text-center text-sm text-slate-400">
                  No learners found
                </td>
              </tr>
            ) : (
              sortedRows.map((row, index) => {
                const openTicketCount = Number(row.openTicketCount || 0);
                const closedTicketCount = Number(row.closedTicketCount || 0);
                const totalTicketCount = Number(row.totalTicketCount ?? (openTicketCount + closedTicketCount));
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
                      {learnerSurveyDisplay(row)}
                    </td>

                    <td className="px-4 py-3 tabular-nums font-semibold text-[#241453]">
                      {hasLearnerWellbeingData(row) ? actualRiskPercentText({
                        totalScore: row.totalScore,
                        safeguardingScore: row.safeguardingScore,
                        triggerCount: row.triggerCount ?? row.triggeredQuestions?.length,
                        triggerScores: (row.triggeredQuestions || []).map((item) => item.riskScore ?? item.score ?? item.answer),
                      }) : <span className="text-slate-300">—</span>}
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

                    <td className="px-4 py-3">
                      <TriggeredQuestionsPopover
                        questions={row.triggeredQuestions || []}
                        count={row.triggerCount ?? (row.triggeredQuestions?.length ?? 0)}
                      />
                    </td>

                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="line-clamp-2 text-slate-600">{row.recommendedAction || "—"}</span>
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setReportLearner(row)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D9CFF3] bg-[#F5F1FC] px-3 text-xs font-semibold text-[#6248BE] hover:bg-[#EEE7FB]"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setReferralLearner(row)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#F3D9B1] bg-[#FEF9EE] px-3 text-xs font-semibold text-[#b27715] hover:bg-[#FEF0D0]"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Referral
                      </button>
                    </td>

                    <td className="px-4 py-3 last:pr-5">
                      {totalTicketCount > 0 ? (
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {openTicketCount > 0 && (
                            <span className="inline-flex h-8 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700">
                              {openTicketCount} open
                            </span>
                          )}
                          {closedTicketCount > 0 && (
                            <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-600">
                              {closedTicketCount} closed
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onViewTickets(row)}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-[#D9CFF3] bg-[#F5F1FC] px-3 text-xs font-semibold text-[#6248BE] transition hover:bg-[#EEE7FB]"
                          >
                            View tickets
                          </button>
                          <button
                            type="button"
                            onClick={() => onCreateFollowUp(row)}
                            title="Create new follow-up ticket"
                            aria-label={`Create new follow-up ticket for ${row.studentName || "learner"}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D9CFF3] bg-white text-[#6248BE] transition hover:bg-[#F5F1FC]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onCreateFollowUp(row)}
                          className="inline-flex h-9 items-center justify-center rounded-xl bg-[#241453] px-4 text-xs font-semibold text-white transition hover:bg-[#362063] whitespace-nowrap"
                        >
                          Create follow-up
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {reportLearner && (
        <ApprenticeReportModal
          learner={reportLearner}
          onClose={() => setReportLearner(null)}
        />
      )}
      {referralLearner && (
        <ReferralFormModal
          learner={referralLearner}
          onClose={() => setReferralLearner(null)}
          onSubmitted={() => setReferralLearner(null)}
        />
      )}
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
  const selected = options.find((opt) => opt.value === value);

  return (
    <label className="relative block w-full sm:w-[300px]">
      <span className="sr-only">{placeholder}</span>
      <select
        value={selected?.value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full appearance-none rounded-2xl border border-[#DED5F3] bg-white px-4 pr-10 text-sm font-medium text-[#241453] shadow-sm transition hover:border-[#CFC2EE] focus:outline-none focus:ring-2 focus:ring-[#E7DFFD]"
      >
        {!selected && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B6D9B]"
      />
    </label>
  );
}

// helper for badges
function ticketRiskBadgeClass(risk?: string) {
  const value = String(risk || "").toLowerCase();

  if (value === "critical") {
    return "bg-[#4C1D95] text-white ring-2 ring-[#7C3AED]/40";
  }

  if (value === "red") {
    return "bg-[#EF4444] text-white";
  }

  if (value === "amber") {
    return "bg-[#F59E0B] text-white";
  }

  return "bg-[#22C55E] text-white";
}

function ticketStatusLabel(status?: string) {
  if (String(status || "").toLowerCase() === "outcome recorded") return "outcome recorded / closed";
  return status || "";
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

type ParsedWellbeingTrigger = {
  text: string;
  answer?: string;
  risk?: string;
  reason?: string;
  level?: string;
};

type ParsedWellbeingDetails = {
  isAutoGenerated: boolean;
  summary: Record<string, string>;
  triggers: ParsedWellbeingTrigger[];
  notes: string[];
  hiddenLegacyCount: number;
};

const LEGACY_TRIGGER_KEYS = new Set([
  "anxiety_high",
  "low_mood",
  "sleep_problems",
  "loneliness",
  "considering_leaving",
  "medium",
  "pattern",
]);

function stripTicketBullet(line: string) {
  return line.replace(/^[\s•*-]+/, "").trim();
}

function parseWellbeingTriggerLine(rawLine: string): ParsedWellbeingTrigger | null {
  const line = stripTicketBullet(rawLine);
  if (!line || LEGACY_TRIGGER_KEYS.has(line)) return null;

  const levelMatch = line.match(/\[([^\]]+)\]\s*$/);
  const level = levelMatch?.[1]?.trim().toLowerCase();
  const withoutLevel = line.replace(/\s*\[[^\]]+\]\s*$/, "").trim();

  const detailMatch = withoutLevel.match(/\(([^)]*answer\s*:[^)]*)\)\s*$/i);
  if (detailMatch) {
    const details = detailMatch[1] || "";
    const text = withoutLevel.slice(0, detailMatch.index).trim();
    const answerMatch = details.match(/answer\s*:\s*(.+?)(?=\s*(?:->|,|$))/i);
    const riskMatch = details.match(/risk\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    const reasonMatch = details.match(/risk\s*:\s*[0-9]+(?:\.[0-9]+)?\s*-\s*(.+)$/i)
      || details.match(/answer\s*:\s*.+?\s*-\s*(.+)$/i);

    return {
      text: text || withoutLevel,
      answer: answerMatch?.[1]?.trim(),
      risk: riskMatch?.[1]?.trim(),
      reason: reasonMatch?.[1]?.trim(),
      level,
    };
  }

  const answerRiskMatch = withoutLevel.match(
    /^(.*?)\s*\(Answer:\s*([^,\)->]+?)\s*(?:(?:->|,)\s*Risk:\s*([^-\)]+?))?\s*(?:-\s*([^)]+?))?\)$/i,
  );
  if (answerRiskMatch) {
    return {
      text: answerRiskMatch[1]?.trim() || "",
      answer: answerRiskMatch[2]?.trim(),
      risk: answerRiskMatch[3]?.trim(),
      reason: answerRiskMatch[4]?.trim(),
      level,
    };
  }

  const inlineAnswer = withoutLevel.match(/answer\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  const inlineRisk = withoutLevel.match(/risk\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (inlineAnswer || inlineRisk) {
    const inlineReason = withoutLevel.match(/risk\s*:\s*[0-9]+(?:\.[0-9]+)?\s*-\s*(.+)$/i);
    return {
      text: withoutLevel.replace(/\(?\s*answer\s*:.*$/i, "").trim() || withoutLevel,
      answer: inlineAnswer?.[1]?.trim(),
      risk: inlineRisk?.[1]?.trim(),
      reason: inlineReason?.[1]?.replace(/\)?\s*$/, "").trim(),
      level,
    };
  }

  const oldScoreMatch = withoutLevel.match(/^(.*?)\s*\(score:\s*([^)]+)\)$/i);
  if (oldScoreMatch) {
    return {
      text: oldScoreMatch[1]?.trim() || "",
      answer: oldScoreMatch[2]?.trim(),
      level,
    };
  }

  return { text: withoutLevel, level };
}

function parseWellbeingTicketDetails(details?: string | null): ParsedWellbeingDetails {
  const lines = String(details || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const isAutoGenerated = lines.some((line) =>
    line.toLowerCase().startsWith("auto-generated ticket from wellbeing survey"),
  );
  const summary: Record<string, string> = {};
  const triggers: ParsedWellbeingTrigger[] = [];
  const notes: string[] = [];
  let inTriggers = false;
  let hiddenLegacyCount = 0;

  if (!isAutoGenerated) {
    return { isAutoGenerated: false, summary, triggers, notes: lines, hiddenLegacyCount };
  }

  for (const line of lines) {
    const cleanLine = stripTicketBullet(line);
    const lower = cleanLine.toLowerCase();

    if (lower.startsWith("auto-generated ticket from wellbeing survey")) continue;

    if (lower === "triggered questions:") {
      inTriggers = true;
      continue;
    }

    if (!inTriggers) {
      const metaMatch = cleanLine.match(/^([^:]+):\s*(.*)$/);
      if (metaMatch?.[1]) {
        summary[metaMatch[1].trim()] = metaMatch[2]?.trim() || "-";
      } else {
        notes.push(cleanLine);
      }
      continue;
    }

    if (LEGACY_TRIGGER_KEYS.has(cleanLine)) {
      hiddenLegacyCount += 1;
      continue;
    }

    const trigger = parseWellbeingTriggerLine(cleanLine);
    if (trigger?.text) {
      triggers.push(trigger);
    }
  }

  return { isAutoGenerated, summary, triggers, notes, hiddenLegacyCount };
}

function numericRiskValue(value?: string | number | null) {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function computedTriggerRiskScore(trigger: {
  risk?: string | number | null;
  answer?: string | number | null;
  reason?: string | null;
  level?: string | null;
}) {
  const risk = numericRiskValue(trigger.risk);
  if (risk != null) return risk;

  const answer = numericRiskValue(trigger.answer);
  if (answer == null) return null;

  const reason = triggerReasonLabel(trigger.reason, trigger.level).toLowerCase();
  return reason.includes("low answer on a positive question") ? 11 - answer : answer;
}

function triggerToneClass(trigger: ParsedWellbeingTrigger) {
  const risk = computedTriggerRiskScore(trigger);
  if (risk != null && risk >= 8) {
    return {
      border: "border-red-200",
      bg: "bg-red-50",
      accent: "bg-red-500",
      text: "text-red-700",
    };
  }
  if (risk != null && risk >= 6) {
    return {
      border: "border-amber-200",
      bg: "bg-amber-50",
      accent: "bg-amber-400",
      text: "text-amber-700",
    };
  }
  return {
    border: "border-[#E7E2F3]",
    bg: "bg-white",
    accent: "bg-[#8B6BC8]",
    text: "text-[#644D93]",
  };
}

function parsedTriggerConcernLabel(trigger: ParsedWellbeingTrigger) {
  const risk = computedTriggerRiskScore(trigger);
  if (risk != null) return concernLabelFromScore(risk);
  return "Flagged";
}

function parsedTriggerConcernClass(trigger: ParsedWellbeingTrigger) {
  const label = parsedTriggerConcernLabel(trigger);
  if (label === "Flagged") return "bg-[#F4F0FC] text-[#644D93] ring-[#E7E2F3]";
  return reportLevelClass(label);
}

function WellbeingTicketDetailsView({ details }: { details?: string | null }) {
  const parsed = React.useMemo(() => parseWellbeingTicketDetails(details), [details]);

  if (!parsed.isAutoGenerated) {
    return (
      <div className="whitespace-pre-wrap text-sm leading-6 text-[#241453]">
        {details || "-"}
      </div>
    );
  }

  const summaryItems = [
    { label: "Risk Level", value: parsed.summary["Risk Level"] },
    {
      label: "Total Score",
      value: parsed.summary["Total Score"] ? actualRiskPercentText({
        totalScore: parsed.summary["Total Score"],
        triggerCount: parsed.summary["Trigger Count"] || parsed.triggers.length,
        triggerScores: parsed.triggers.map((trigger) => trigger.risk || trigger.answer),
      }) : "",
    },
    { label: "Trigger Count", value: parsed.summary["Trigger Count"] },
    { label: "Programme", value: parsed.summary["Programme"] },
    { label: "Coach", value: parsed.summary["Coach"] },
  ].filter((item) => item.value);

  const riskValue = String(parsed.summary["Risk Level"] || "").toLowerCase();
  const riskClass = riskValue === "high"
    ? "bg-red-500 text-white"
    : riskValue === "medium"
      ? "bg-amber-500 text-white"
      : "bg-emerald-500 text-white";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E7E2F3] bg-[#FBFAFE] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F0EAFD] text-[#644D93]">
              <Shield className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#241453]">
                Wellbeing survey ticket
              </div>
              <div className="text-xs text-[#7B6D9B]">
                Generated from the learner wellbeing response.
              </div>
            </div>
          </div>
          {parsed.summary["Risk Level"] && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClass}`}>
              {parsed.summary["Risk Level"]}
            </span>
          )}
        </div>

        {summaryItems.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {summaryItems.map((item) => (
              <div key={item.label} className="rounded-lg border border-[#EEE8F8] bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">
                  {item.label}
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-[#241453]" title={item.value}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#241453]">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Triggered questions
          </div>
          <span className="rounded-full bg-[#FDE7E7] px-2.5 py-1 text-xs font-semibold text-red-700">
            {parsed.triggers.length}
          </span>
        </div>

        {parsed.triggers.length === 0 ? (
          <div className="rounded-lg border border-[#E7E2F3] bg-white px-3 py-3 text-sm text-slate-500">
            No active triggered questions are available for this ticket.
          </div>
        ) : (
          <div className="space-y-2">
            {parsed.triggers.map((trigger, index) => {
              const tone = triggerToneClass(trigger);
              const concernLabel = parsedTriggerConcernLabel(trigger);
              const visuals = concernVisuals(concernLabel);
              const reason = triggerReasonLabel(trigger.reason, trigger.level);
              const riskScore = computedTriggerRiskScore({ ...trigger, reason });
              return (
                <div
                  key={`${trigger.text}-${index}`}
                  className={`overflow-hidden rounded-2xl border ${tone.border} ${tone.bg}`}
                >
                  <div className="flex gap-3 p-4">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${visuals.icon}`}>
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${parsedTriggerConcernClass(trigger)}`}>
                          {concernLabel}
                        </span>
                        {riskScore != null && (
                          <span className={`rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold ring-1 ring-current/20 ${tone.text}`}>
                            Risk score {riskScore}/10
                          </span>
                        )}
                      </div>
                      <div className="mt-3 text-sm font-bold leading-5 text-[#241453]">
                        {trigger.text}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-xl bg-white/85 px-3 py-2 ring-1 ring-white">
                          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Learner answer</div>
                          <div className="mt-1 text-lg font-black text-[#241453]">{trigger.answer || "-"}</div>
                        </div>
                        <div className="rounded-xl bg-white/85 px-3 py-2 ring-1 ring-white">
                          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Risk score</div>
                          <div className="mt-1 text-lg font-black text-[#241453]">{riskScore != null ? riskScore : "Not supplied"}</div>
                          {riskScore != null && (
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full rounded-full ${visuals.bar}`} style={{ width: `${scoreWidth(riskScore)}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="rounded-xl bg-white/85 px-3 py-2 ring-1 ring-white">
                          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8B7AAF]">Why flagged</div>
                          <div className="mt-1 text-[11px] font-semibold leading-4 text-slate-700">{reason}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {parsed.hiddenLegacyCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {parsed.hiddenLegacyCount} legacy trigger key{parsed.hiddenLegacyCount === 1 ? "" : "s"} hidden from display.
        </div>
      )}

      {parsed.notes.length > 0 && (
        <div className="rounded-lg border border-[#E7E2F3] bg-white px-3 py-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">
            Notes
          </div>
          <div className="space-y-1 text-sm text-[#241453]">
            {parsed.notes.map((note, index) => (
              <p key={`${note}-${index}`}>{note}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


type TicketStatusGroup = "all" | "open" | "closed";
type TicketEvidenceFilter = "all" | "with" | "missing";

type TicketFilters = {
  statusGroup: TicketStatusGroup;
  status: string[];
  type: string[];
  risk: string[];
  evidence: TicketEvidenceFilter;
};

const DEFAULT_TICKET_STATUS_GROUP: TicketStatusGroup = "open";
const emptyFilters: TicketFilters = { statusGroup: DEFAULT_TICKET_STATUS_GROUP, status: [], type: [], risk: [], evidence: "all" };

function ticketHasEvidence(ticket: SupportTicketRow): boolean {
  return (ticket.evidenceCount ?? ticket.evidence?.length ?? 0) > 0 || (ticket.notesCount ?? ticket.notes?.length ?? 0) > 0;
}

type SortDirection = "asc" | "desc";

function sortText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function sortNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : -Infinity;
}

function sortDate(value: unknown): number {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function learnerSurveySortValue(row: TicketableLearnerRow): number {
  if (row.lastSurveyDate) return 2_000_000_000_000 + sortDate(row.lastSurveyDate);
  if (hasLearnerWellbeingData(row)) return 1_000_000_000_000;
  return 0;
}

function learnerSurveyDisplay(row: TicketableLearnerRow) {
  if (row.lastSurveyDate) return row.lastSurveyDate;
  if (hasLearnerWellbeingData(row)) return <span className="font-medium text-emerald-600">Completed</span>;
  return <span className="text-slate-400 italic">No survey</span>;
}

function compareValues(a: string | number, b: string | number, direction: SortDirection) {
  const result = typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

function SortHeaderButton({
  label,
  active,
  direction,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-left transition hover:bg-[#F0EBF9] hover:text-[#241453] ${className}`}
    >
      <span>{label}</span>
      <span className={`text-[10px] ${active ? "text-[#241453]" : "text-[#B8AACC]"}`}>
        {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}


function TicketNotesPopover({ ticketId, count, initialNotes = [] }: { ticketId: number; count: number; initialNotes?: TicketNoteRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState<TicketNoteRow[]>(initialNotes);
  const [loading, setLoading] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open || notes.length > 0 || count === 0) return;
    let mounted = true;
    setLoading(true);
    getTicketNotes(ticketId)
      .then((rows) => { if (mounted) setNotes(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (mounted) setNotes([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [open, notes.length, count, ticketId]);

  React.useLayoutEffect(() => {
    if (!open || !btnRef.current || !panelRef.current) return;
    const btn = btnRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    const pw = panel.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: align with button, clamp to viewport
    let left = btn.left;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;

    const HEADER_H = 46;
    const spaceBelow = vh - btn.bottom - 12;
    const spaceAbove = btn.top - 12;

    let top: number;
    let listMaxH: number;

    if (spaceBelow >= spaceAbove || spaceBelow >= 160) {
      // Show below — list fills available space downward
      top = btn.bottom + 6;
      listMaxH = Math.max(80, spaceBelow - HEADER_H);
    } else {
      // Show above — constrain list to available space upward
      listMaxH = Math.max(80, spaceAbove - HEADER_H - 6);
      top = btn.top - HEADER_H - listMaxH - 6;
      if (top < 8) { top = 8; listMaxH = btn.top - HEADER_H - 14; }
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    if (listRef.current) listRef.current.style.maxHeight = `${Math.min(listMaxH, 360)}px`;
    panel.style.visibility = "visible";
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-[#F4F0FC] px-2.5 py-1 text-xs font-semibold text-[#6248BE] transition hover:bg-[#EDE7FB]"
      >
        <FileText className="h-3 w-3" />
        {count}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed z-[110] w-80 max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-[#E6DDF8] bg-white shadow-[0_8px_24px_rgba(36,20,83,0.14)]"
            style={{ top: 0, left: 0, visibility: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#F0EAFB] px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Case Notes</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#B8AACC]">{count} note{count !== 1 ? "s" : ""}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#8E82AA] hover:bg-[#F4F0FC] hover:text-[#241453]"
                  aria-label="Close notes"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div ref={listRef} className="custom-scroll space-y-2 overflow-y-auto p-3">
              {loading ? (
                <div className="py-6 text-center text-xs text-[#8E82AA]">Loading notes...</div>
              ) : notes.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">No notes found</div>
              ) : notes.map((n, i) => (
                <div key={n.id ?? i} className="rounded-xl border border-[#EEE8F8] p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-medium text-[#8E82AA]">{n.created_by || "Coach"}</span>
                    <span className="shrink-0 text-[10px] text-[#B8AACC]">{n.created_at ? formatTicketDate(n.created_at) : ""}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#241453]">{n.note}</p>
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

function TicketEvidencePopover({ ticketId, count, initialEvidence = [] }: { ticketId: number; count: number; initialEvidence?: TicketEvidenceRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [evidence, setEvidence] = React.useState<TicketEvidenceRow[]>(initialEvidence);
  const [loading, setLoading] = React.useState(false);
  const [previewEvidence, setPreviewEvidence] = React.useState<TicketEvidenceRow | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open || evidence.length > 0 || count === 0) return;
    let mounted = true;
    setLoading(true);
    getTicketEvidence(ticketId)
      .then((rows) => { if (mounted) setEvidence(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (mounted) setEvidence([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [open, evidence.length, count, ticketId]);

  React.useLayoutEffect(() => {
    if (!open || !btnRef.current || !panelRef.current) return;
    const btn = btnRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    const pw = panel.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = btn.left;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;

    const HEADER_H = 46;
    const spaceBelow = vh - btn.bottom - 12;
    const spaceAbove = btn.top - 12;

    let top: number;
    let listMaxH: number;

    if (spaceBelow >= spaceAbove || spaceBelow >= 160) {
      top = btn.bottom + 6;
      listMaxH = Math.max(80, spaceBelow - HEADER_H);
    } else {
      listMaxH = Math.max(80, spaceAbove - HEADER_H - 6);
      top = btn.top - HEADER_H - listMaxH - 6;
      if (top < 8) { top = 8; listMaxH = btn.top - HEADER_H - 14; }
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    if (listRef.current) listRef.current.style.maxHeight = `${Math.min(listMaxH, 360)}px`;
    panel.style.visibility = "visible";
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-[#F0FDF4] px-2.5 py-1 text-xs font-semibold text-[#047857] transition hover:bg-[#DCFCE7]"
      >
        <ImageIcon className="h-3 w-3" />
        {count}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed z-[110] w-80 max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-[#E6DDF8] bg-white shadow-[0_8px_24px_rgba(36,20,83,0.14)]"
            style={{ top: 0, left: 0, visibility: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#F0EAFB] px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Evidence</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#B8AACC]">{count} item{count !== 1 ? "s" : ""}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#8E82AA] hover:bg-[#F4F0FC] hover:text-[#241453]"
                  aria-label="Close evidence"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div ref={listRef} className="custom-scroll space-y-3 overflow-y-auto p-3">
              {loading ? (
                <div className="py-6 text-center text-xs text-[#8E82AA]">Loading evidence...</div>
              ) : evidence.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">No evidence found</div>
              ) : evidence.map((ev, i) => {
                const fileUrl = evFileUrl(ev);
                const fileName = evFileName(ev) || ev.file_name || "Evidence file";
                const isImage = evIsImage(ev);
                return (
                  <div key={ev.id ?? i} className="overflow-hidden rounded-xl border border-[#EEE8F8]">
                    {fileUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewEvidence(ev)}
                        className="block w-full bg-[#F8F6FC] text-left transition hover:opacity-90"
                      >
                        {isImage ? (
                          <img
                            src={fileUrl}
                            alt={ev.description || fileName}
                            className="max-h-44 w-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <span className="flex h-28 items-center justify-center gap-2 text-xs font-semibold text-[#6248BE]">
                            <Paperclip className="h-4 w-4" />
                            {fileName}
                          </span>
                        )}
                      </button>
                    )}
                    <div className="p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] font-medium text-[#8E82AA]">{ev.created_by || "Coach"}</span>
                        <span className="shrink-0 text-[10px] text-[#B8AACC]">{ev.created_at ? formatTicketDate(ev.created_at) : ""}</span>
                      </div>
                      {ev.description && <p className="text-sm text-[#241453]">{ev.description}</p>}
                      {fileUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewEvidence(ev)}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#6248BE] hover:underline"
                        >
                          <ImageIcon className="h-3 w-3" />
                          Preview
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}

      {previewEvidence && (
        <EvidencePreviewModal
          url={evFileUrl(previewEvidence)}
          name={evFileName(previewEvidence)}
          description={previewEvidence.description}
          createdBy={previewEvidence.created_by}
          createdAt={previewEvidence.created_at}
          mimeType={previewEvidence.mime_type}
          onClose={() => setPreviewEvidence(null)}
        />
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
  function toggle(key: "status" | "type" | "risk", value: string) {
    const current = filters[key];
    onChange({
      ...filters,
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  }

  const activeCount =
    (filters.statusGroup !== DEFAULT_TICKET_STATUS_GROUP ? 1 : 0) +
    filters.status.length +
    filters.type.length +
    filters.risk.length +
    (filters.evidence !== "all" ? 1 : 0);

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
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Workflow Status</div>
        <div className="flex flex-wrap gap-1.5">
          {["open", "new", "under review", "assigned", "awaiting information", "action in progress", "follow-up scheduled", "support plan active", "escalated", "external referral made", "outcome recorded", "closed", "reopened"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggle("status", s)}
              className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${filters.status.includes(s)
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
              className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${filters.type.includes(t)
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
              className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${filters.risk.includes(r)
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
  const [subjectTouched, setSubjectTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setSelectedId("");
      setLearnerSearch("");
      setForm(makeInitialTicketForm());
      setSubjectTouched(false);
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
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${String(l.studentId) === selectedId
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
            if (!form.subject.trim()) {
              setSubjectTouched(true);
              const el = document.getElementById("ctm-subject");
              el?.focus();
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              return;
            }
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
            <label className="mb-2 block text-sm font-medium text-[#241453]">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              id="ctm-subject"
              value={form.subject}
              onChange={(e) => {
                handleField("subject", e.target.value);
                if (subjectTouched) setSubjectTouched(false);
              }}
              placeholder="Enter ticket subject"
              className={`h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-[#644D93] ${subjectTouched && !form.subject.trim() ? "border-red-400 bg-red-50" : "border-[#DED5F3]"
                }`}
            />
            {subjectTouched && !form.subject.trim() && (
              <p className="mt-1 text-xs text-red-500">Subject is required</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Details</label>
            <textarea
              value={form.details}
              onChange={(e) => handleField("details", e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none focus:border-[#644D93]"
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

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Role</label>
            {(() => {
              const presets = ["Learner", "Safeguarding Lead", "Wellbeing Manager"];
              const isOther = form.creator_role !== "" && !presets.includes(form.creator_role);
              const selectVal = presets.includes(form.creator_role) ? form.creator_role : isOther ? "__other__" : "";
              const selectedLearnerObj = learners.find((l) => String(l.studentId) === selectedId);
              return (
                <>
                  <select
                    value={selectVal}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "__other__") {
                        handleField("creator_role", "\u200B");
                      } else {
                        handleField("creator_role", val);
                        if (val === "Learner" && selectedLearnerObj) {
                          handleField("created_by", selectedLearnerObj.studentName || selectedLearnerObj.studentEmail || "");
                        }
                      }
                    }}
                    className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
                  >
                    <option value="">Select role...</option>
                    <option value="Learner">Learner</option>
                    <option value="Safeguarding Lead">Safeguarding Lead</option>
                    <option value="Wellbeing Manager">Wellbeing Manager</option>
                    <option value="__other__">Other</option>
                  </select>
                  {isOther && (
                    <input
                      value={form.creator_role.replace(/\u200B/g, "")}
                      onChange={(e) => handleField("creator_role", e.target.value || "\u200B")}
                      placeholder="Enter your role..."
                      className="mt-2 h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none focus:border-[#644D93]"
                      autoFocus
                    />
                  )}
                </>
              );
            })()}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">
              Time taken to close the case (days)
            </label>
            <input
              type="number"
              min={0}
              value={form.days_to_close}
              onChange={(e) => handleField("days_to_close", e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="e.g. 5"
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

function exportTicketsToExcel(tickets: SupportTicketRow[], coachLabel?: string) {
  const rows = tickets.map((t) => ({
    "Ticket": t.ticketCode,
    "Learner": t.learnerName,
    "Email": t.learnerEmail,
    "Type": t.type,
    "Risk": t.risk,
    "Urgency": t.urgency,

    "Created": formatTicketDate(t.createdAt),
    "Closed": t.closedAt ? formatTicketDate(t.closedAt) : "-",
    "Created By": t.createdBy || "-",
    "Source": t.source || "-",
    "Status": t.status,
    "Days Open": t.daysToClose ?? t.daysOpen ?? 0,
    "Subject": t.subject || "",
    "Details": t.details || "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 10 }, { wch: 22 }, { wch: 32 }, { wch: 14 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
    { wch: 18 }, { wch: 10 }, { wch: 30 }, { wch: 50 },
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = coachLabel ? coachLabel.substring(0, 31) : "Tickets";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const prefix = coachLabel ? `tickets-${coachLabel.toLowerCase().replace(/\s+/g, "-")}` : "tickets-all";
  XLSX.writeFile(wb, `${prefix}-${new Date().toISOString().split("T")[0]}.xlsx`);
}

// jsPDF only supports Latin characters — strip emoji/surrogate pairs before rendering
function pdfText(text: string | null | undefined, fallback = "-"): string {
  if (!text) return fallback;
  return text
    .replace(/[\uD800-\uDFFF]/g, "")   // surrogate pairs (emoji, symbols)
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "") // keep printable ASCII + extended Latin only
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function flattenValueForPdf(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return pdfText(value) || "-";

  if (Array.isArray(value)) {
    if (value.length === 0) return "-";

    const isObj = (x: unknown): x is Record<string, unknown> =>
      typeof x === "object" && x !== null && !Array.isArray(x);

    // Array of {text, type?} items (e.g. "What Matters Now") → group by type
    if (value.every((i) => isObj(i) && "text" in i && !("title" in i))) {
      const byType: Record<string, string[]> = {};
      const noType: string[] = [];
      for (const item of value as Record<string, unknown>[]) {
        const text = pdfText(String(item.text ?? ""));
        if (!text || text === "-") continue;
        const type = item.type ? String(item.type).toLowerCase() : "";
        if (type) (byType[type] = byType[type] || []).push(text);
        else noType.push(text);
      }
      const parts: string[] = [];
      for (const [type, texts] of Object.entries(byType)) {
        const label = type.charAt(0).toUpperCase() + type.slice(1) + "s";
        parts.push(`${label}:\n${texts.map((t) => `   \xB7  ${t}`).join("\n")}`);
      }
      if (noType.length > 0) parts.push(noType.map((t) => `\xB7  ${t}`).join("\n"));
      return parts.join("\n\n") || "-";
    }

    // Array of recommendation/resource objects with "title" field
    // → group by "tag" if present, show title + reason + url
    if (value.every((i) => isObj(i) && ("title" in i || "reason" in i))) {
      const byTag: Record<string, string[]> = {};
      const noTag: string[] = [];
      for (const item of value as Record<string, unknown>[]) {
        const title = item.title ? pdfText(String(item.title)) : null;
        const reason = item.reason ? pdfText(String(item.reason)) : null;
        const urlRaw = item.source_url ?? item.sourceUrl ?? item.url;
        const url = urlRaw && /^https?:\/\//i.test(String(urlRaw)) ? pdfText(String(urlRaw)) : null;
        if (!title && !reason) continue;
        const lines: string[] = [];
        if (title) lines.push(title);
        if (reason) lines.push(`   ${reason}`);
        if (url) lines.push(`   ${url}`);
        const block = lines.join("\n");
        const tag = item.tag ? String(item.tag).toUpperCase() : "";
        if (tag) (byTag[tag] = byTag[tag] || []).push(block);
        else noTag.push(block);
      }
      const parts: string[] = [];
      for (const [tag, items] of Object.entries(byTag)) {
        parts.push(`[${tag}]\n${items.join("\n\n")}`);
      }
      if (noTag.length > 0) parts.push(noTag.join("\n\n"));
      return parts.join("\n\n") || "-";
    }

    // Plain array
    return value.map((item) => `\xB7  ${flattenValueForPdf(item)}`).join("\n");
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([k, v]) => k !== "code" && v !== null && v !== undefined && v !== ""
    );
    if (entries.length === 0) return "-";

    // Object with a "text" key → use text as main content regardless of other fields
    if ("text" in (value as object)) {
      const obj = value as Record<string, unknown>;
      const text = pdfText(String(obj.text ?? ""));
      const qualifier = obj.label
        ? pdfText(String(obj.label))
        : obj.type
          ? pdfText(String(obj.type))
          : null;
      if (text && text !== "-") return qualifier ? `${text}  (${qualifier})` : text;
    }

    return entries
      .map(([k, v]) => {
        const label = k
          .replace(/([A-Z])/g, " $1")
          .replace(/_/g, " ")
          .trim()
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
        const content = flattenValueForPdf(v);
        return content.includes("\n") ? `${label}:\n${content}` : `${label}: ${content}`;
      })
      .join("\n\n");
  }

  return pdfText(String(value));
}

// Builds styled single-column rows for recommendation / resource arrays:
// [{tag, title, reason?, source_url?}]
// Tag → bold purple, Title → bold dark, Reason → grey, URL → blue italic + underline
function buildRecommendationRows(
  arr: Record<string, unknown>[]
): Array<Array<{ content: string; styles: object }>> {
  const rows: Array<Array<{ content: string; styles: object }>> = [];
  let lastTag = "";
  let isFirst = true;

  for (const item of arr) {
    const tag = item.tag ? String(item.tag).toUpperCase() : "";
    const title = item.title ? pdfText(String(item.title)) : null;
    const sourceTitle = (item.source_title ?? item.sourceTitle) ? pdfText(String(item.source_title ?? item.sourceTitle)) : null;

    // Accept any common field name for the description/reason text
    const rawDesc = item.reason ?? item.description ?? item.details ?? item.body ?? item.content ?? item.notes ?? item.summary;
    const reason = rawDesc ? pdfText(String(rawDesc)) : null;

    // bullet_points can be an array of strings or a string
    const rawBullets = item.bullet_points ?? item.bulletPoints ?? item.bullets ?? item.points;
    const bulletArr: string[] = Array.isArray(rawBullets)
      ? rawBullets.map((b) => pdfText(String(b))).filter((b) => b && b !== "-")
      : rawBullets
        ? pdfText(String(rawBullets)).split("\n").map((l) => l.trim()).filter(Boolean)
        : [];

    const urlRaw = item.source_url ?? item.sourceUrl ?? item.url ?? item.link ?? item.href;
    const url = urlRaw && /^https?:\/\//i.test(String(urlRaw)) ? String(urlRaw) : null;
    if (!title && !reason && bulletArr.length === 0) continue;

    const indent = tag ? 16 : 10;

    // Emit tag header only when it changes
    if (tag && tag !== lastTag) {
      rows.push([{
        content: `[ ${tag} ]`,
        styles: {
          fontStyle: "bold",
          textColor: [76, 51, 204],
          fontSize: 8.5,
          fillColor: [255, 255, 255],
          cellPadding: { top: isFirst ? 6 : 10, bottom: 2, left: 10, right: 8 },
        },
      }]);
      lastTag = tag;
      isFirst = false;
    }

    // Title
    if (title) {
      rows.push([{
        content: title,
        styles: {
          fontStyle: "bold",
          textColor: [36, 20, 83],
          fontSize: 9,
          fillColor: [255, 255, 255],
          cellPadding: { top: isFirst ? 6 : 8, bottom: 1, left: indent, right: 8 },
        },
      }]);
      isFirst = false;
    }

    // Source URL
    if (url) {
      rows.push([{
        content: url,
        styles: {
          fontStyle: "italic",
          textColor: [50, 80, 200],
          fontSize: 7.5,
          fillColor: [255, 255, 255],
          cellPadding: { top: 1, bottom: 1, left: indent + 2, right: 8 },
        },
      }]);
    }

    // Source title (subtitle)
    if (sourceTitle) {
      rows.push([{
        content: sourceTitle,
        styles: {
          fontStyle: "normal",
          textColor: [110, 95, 150],
          fontSize: 7.5,
          fillColor: [255, 255, 255],
          cellPadding: { top: 1, bottom: 2, left: indent + 2, right: 8 },
        },
      }]);
    }

    // Plain reason/description text
    if (reason) {
      const bulletLines = reason
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (l.startsWith("\xB7") ? l : `\xB7  ${l}`))
        .join("\n");
      rows.push([{
        content: bulletLines,
        styles: {
          fontStyle: "normal",
          textColor: [60, 50, 90],
          fontSize: 8,
          fillColor: [250, 248, 255],
          cellPadding: { top: 2, bottom: 2, left: indent + 4, right: 8 },
        },
      }]);
    }

    // bullet_points array — one row per item
    if (bulletArr.length > 0) {
      const bulletContent = bulletArr.map((b) => `\xB7  ${b}`).join("\n");
      rows.push([{
        content: bulletContent,
        styles: {
          fontStyle: "normal",
          textColor: [60, 50, 90],
          fontSize: 8,
          fillColor: [250, 248, 255],
          cellPadding: { top: 2, bottom: 6, left: indent + 4, right: 8 },
        },
      }]);
    }
  }

  return rows;
}

// Returns [label, value] rows for a section value.
// Object sections produce one row per key; everything else produces one unlabelled row.
function buildSectionRows(value: unknown): Array<[string, string]> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const SKIP = new Set(["code", "cta_text", "cta", "call_to_action"]);
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([k, v]) => !SKIP.has(k) && v !== null && v !== undefined && v !== ""
    );
    // If object is just {text, type} treat as simple text block
    if (entries.every(([k]) => k === "text" || k === "type")) {
      const found = entries.find(([k]) => k === "text");
      return [["", found ? flattenValueForPdf(found[1]) : "-"]];
    }
    return entries.map(([k, v]) => {
      const label = k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim().toUpperCase();
      return [label, flattenValueForPdf(v)] as [string, string];
    });
  }
  return [["", flattenValueForPdf(value)]];
}

// Converts any image URL (including webp) to a PNG base64 data URL for jsPDF
async function loadLogoDataUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = kbcLogoSrc;
  });
}

async function exportApprenticeToPDF(learner: TicketableLearnerRow) {
  const logoDataUrl = await loadLogoDataUrl();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const mx = 14;
  const contentW = pageW - mx * 2;
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const C = {
    purple: [100, 77, 147] as [number, number, number],
    purpleDeep: [50, 32, 100] as [number, number, number],
    purpleLight: [168, 140, 217] as [number, number, number],
    purpleBg: [240, 234, 253] as [number, number, number],
    cardBg: [247, 244, 255] as [number, number, number],
    border: [218, 208, 240] as [number, number, number],
    dark: [28, 16, 60] as [number, number, number],
    grey: [118, 108, 142] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    textBody: [55, 45, 82] as [number, number, number],
  };

  // ── Header: logo (left) + shield indicator + title ─────────────
  const lgW = 16;
  const lgH = lgW / 1.52;   // ≈ 10.5 mm
  const lgX = mx;
  const lgY = 4.5;
  const lgPad = 1.5;
  // Light purple background behind logo
  doc.setFillColor(...C.purpleBg);
  doc.roundedRect(lgX - lgPad, lgY - lgPad, lgW + lgPad * 2, lgH + lgPad * 2, 2, 2, "F");
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", lgX, lgY, lgW, lgH);
  }

  // Title — vertically centered with logo
  const hdrTextY = lgY + lgH / 2 + 1.5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.purple);
  doc.text("LEARNER SAFEGUARDING REPORT", lgX + lgW + lgPad * 2 + 4, hdrTextY);

  // Separator
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(mx, 20, pageW - mx, 20);

  // ── Student name (no avatar) ──────────────────────────────────
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.dark);
  doc.text(pdfText(learner.studentName, "Unknown Learner"), mx, 31);

  // Email row with small indicator
  doc.setFillColor(...C.purpleLight);
  doc.roundedRect(mx, 34.5, 3.5, 2.5, 0.5, 0.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.grey);
  doc.text(pdfText(learner.studentEmail, ""), mx + 5.5, 36.5);

  // Date row with small indicator
  doc.setFillColor(...C.purpleLight);
  doc.roundedRect(mx, 39.5, 3.5, 2.5, 0.5, 0.5, "F");
  doc.setFontSize(8);
  doc.setTextColor(...C.grey);
  doc.text(`Generated: ${today}`, mx + 5.5, 41.5);

  // Separator
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(mx, 45, pageW - mx, 45);

  // ── Stat cards ────────────────────────────────────────────────
  const statsY = 48;
  const cardH = 30;
  const cardGap = 5;
  const cardW = (contentW - cardGap) / 2;

  const riskTextColors: Record<string, [number, number, number]> = {
    red: [185, 28, 28],
    amber: [161, 98, 7],
    green: [21, 128, 61],
  };
  const riskBgColors: Record<string, [number, number, number]> = {
    red: [254, 242, 242],
    amber: [255, 251, 235],
    green: [240, 253, 244],
  };
  const riskDescriptions: Record<string, string> = {
    red: "High risk - prompt follow-up required.",
    amber: "Medium risk - monitoring and support recommended.",
    green: "Low risk - continue current support.",
  };
  const riskKey = (learner.riskLevel || "").toLowerCase();
  const riskTxtColor = riskTextColors[riskKey] ?? C.purple;
  const riskBg = riskBgColors[riskKey] ?? C.purpleBg;
  const riskDesc = riskDescriptions[riskKey] ?? "";

  // Risk card
  doc.setFillColor(...riskBg);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(mx, statsY, cardW, cardH, 3, 3, "FD");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.grey);
  doc.text("RISK LEVEL", mx + 7, statsY + 8);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...riskTxtColor);
  doc.text(pdfText(learner.riskLevel, "-").toUpperCase(), mx + 7, statsY + 18);
  if (riskDesc) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.grey);
    const descLines = doc.splitTextToSize(riskDesc, cardW - 10) as string[];
    doc.text(descLines, mx + 7, statsY + 24);
  }

  // Score card
  const scoreX = mx + cardW + cardGap;
  const scoreVal = actualRiskPercentText({
    totalScore: learner.totalScore,
    safeguardingScore: learner.safeguardingScore,
    triggerCount: learner.triggerCount ?? learner.triggeredQuestions?.length,
    triggerScores: (learner.triggeredQuestions || []).map((item) => item.riskScore ?? item.score ?? item.answer),
  });
  doc.setFillColor(...C.purpleBg);
  doc.setDrawColor(...C.border);
  doc.roundedRect(scoreX, statsY, cardW, cardH, 3, 3, "FD");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.grey);
  doc.text("TOTAL SCORE", scoreX + 7, statsY + 8);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.purple);
  doc.text(scoreVal, scoreX + 7, statsY + 18);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.grey);
  const scoreDescLines = doc.splitTextToSize(
    pdfText(wellbeingScoreDescription(learner.totalScore)),
    cardW - 10,
  ) as string[];
  doc.text(scoreDescLines, scoreX + 7, statsY + 24);

  // ── Sections ──────────────────────────────────────────────────
  const data = (learner as any).apprenticeDashboard as Record<string, unknown> | undefined;
  let curY = statsY + cardH + 6;

  // Light card bg + dark purple bold text for section headers
  const secHdrStyle = {
    fillColor: C.cardBg as [number, number, number],
    textColor: C.purpleDeep as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: 9,
    cellPadding: { top: 5, bottom: 5, left: 8, right: 6 },
  };

  const isRecArr = (v: unknown): v is Record<string, unknown>[] =>
    Array.isArray(v) &&
    v.length > 0 &&
    typeof v[0] === "object" &&
    v[0] !== null &&
    ("title" in (v[0] as object) || "reason" in (v[0] as object)) &&
    !("text" in (v[0] as object));

  const isTextTypeArr = (v: unknown): v is Array<{ text: string; type: string }> =>
    Array.isArray(v) &&
    v.length > 0 &&
    typeof v[0] === "object" &&
    v[0] !== null &&
    "text" in (v[0] as object) &&
    "type" in (v[0] as object);

  const isTwoColObj = (v: unknown): boolean => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
    const keys = Object.keys(v as object).map(k => k.toLowerCase());
    return (
      keys.some(k => k.includes("insight") || k.includes("ai")) &&
      keys.some(k => k.includes("action") || k.includes("recommend"))
    );
  };

  // 3mm purple accent bar on left of every cell in column 0
  const drawAccent = (hookData: any) => {
    if (hookData.column.index !== 0) return;
    doc.setFillColor(...C.purpleLight);
    doc.rect(hookData.cell.x, hookData.cell.y, 3, hookData.cell.height, "F");
  };

  const addLinkDeco = (hookData: any, colIdx: number) => {
    if (hookData.row.index === 0 || hookData.column.index !== colIdx) return;
    const raw = String(hookData.cell.raw ?? "");
    if (!/^https?:\/\//i.test(raw)) return;
    const lp = Number((hookData.cell.styles?.cellPadding as any)?.left ?? 4);
    const x = hookData.cell.x + lp;
    const y = hookData.cell.y + Number((hookData.cell.styles?.cellPadding as any)?.top ?? 4) + 2.5;
    const tw = Math.min(doc.getTextWidth(raw), hookData.cell.width - lp * 2);
    doc.setDrawColor(60, 80, 200);
    doc.setLineWidth(0.3);
    doc.line(x, y + 0.6, x + tw, y + 0.6);
    doc.link(x, hookData.cell.y + 1, tw, hookData.cell.height - 2, { url: raw });
  };

  if (data) {
    for (const [key, sectionValue] of Object.entries(data)) {
      const title = key
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .trim()
        .toUpperCase();

      // ── Recommendation / resource arrays ──────────────────────
      if (isRecArr(sectionValue)) {
        const recRows = buildRecommendationRows(sectionValue);
        if (recRows.length === 0) continue;

        autoTable(doc, {
          startY: curY,
          body: [
            [{ content: title, styles: secHdrStyle }],
            ...recRows,
          ],
          theme: "plain",
          styles: { overflow: "linebreak", valign: "top", fillColor: C.cardBg as [number, number, number] },
          columnStyles: { 0: { cellWidth: contentW } },
          margin: { left: mx, right: mx },
          tableLineColor: C.border,
          tableLineWidth: 0.3,
          didDrawCell: (hookData: any) => {
            drawAccent(hookData);
            addLinkDeco(hookData, 0);
          },
        });

        curY = (doc as any).lastAutoTable.finalY + 5;
        continue;
      }

      // ── {text, type}[] → CONCERNS / POSITIVES ─────────────────
      if (isTextTypeArr(sectionValue)) {
        const lefts = sectionValue.filter(i => (i.type || "").toLowerCase() !== "positive").map(i => pdfText(i.text));
        const rights = sectionValue.filter(i => (i.type || "").toLowerCase() === "positive").map(i => pdfText(i.text));
        const maxRows = Math.max(lefts.length, rights.length, 1);
        const colW = (contentW - 2) / 2;

        const twoColBody: object[][] = [
          [{ content: title, colSpan: 2, styles: secHdrStyle }],
          [
            { content: "CONCERNS", styles: { fontStyle: "bold" as const, fontSize: 7.5, textColor: [160, 40, 40] as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 8, right: 4 } } },
            { content: "POSITIVES", styles: { fontStyle: "bold" as const, fontSize: 7.5, textColor: [30, 110, 60] as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 5, right: 5 } } },
          ],
        ];
        for (let i = 0; i < maxRows; i++) {
          twoColBody.push([
            { content: lefts[i] ? `\xB7  ${lefts[i]}` : "", styles: { fontSize: 8, textColor: C.textBody as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 2.5, bottom: 2.5, left: 8, right: 4 } } },
            { content: rights[i] ? `\xB7  ${rights[i]}` : "", styles: { fontSize: 8, textColor: C.textBody as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 2.5, bottom: 2.5, left: 5, right: 5 } } },
          ]);
        }

        autoTable(doc, {
          startY: curY,
          body: twoColBody,
          theme: "plain",
          styles: { overflow: "linebreak", valign: "top" },
          columnStyles: { 0: { cellWidth: colW }, 1: { cellWidth: colW } },
          margin: { left: mx, right: mx },
          tableLineColor: C.border,
          tableLineWidth: 0.3,
          didDrawCell: (hookData: any) => { drawAccent(hookData); },
        });

        curY = (doc as any).lastAutoTable.finalY + 5;
        continue;
      }

      // ── Two-column object (AI Insights | Recommended Actions) ──
      if (isTwoColObj(sectionValue)) {
        const entries = Object.entries(sectionValue as Record<string, unknown>);
        const leftE = entries.find(([k]) => k.toLowerCase().includes("insight") || k.toLowerCase().includes("ai")) ?? entries[0]!;
        const rightE = entries.find(([k]) => k.toLowerCase().includes("action") || k.toLowerCase().includes("recommend")) ?? entries[entries.length - 1]!;
        const toArr = (v: unknown) => (Array.isArray(v) ? v.map(x => pdfText(String(x))) : [pdfText(String(v))]);
        const leftItems = toArr(leftE[1]);
        const rightItems = toArr(rightE[1]);
        const maxRows = Math.max(leftItems.length, rightItems.length, 1);
        const colW = (contentW - 2) / 2;
        const lTitle = leftE[0].replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim().toUpperCase();
        const rTitle = rightE[0].replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim().toUpperCase();

        const twoColBody: object[][] = [
          [{ content: title, colSpan: 2, styles: secHdrStyle }],
          [
            { content: lTitle, styles: { fontStyle: "bold" as const, fontSize: 7.5, textColor: C.purple as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 8, right: 4 } } },
            { content: rTitle, styles: { fontStyle: "bold" as const, fontSize: 7.5, textColor: C.purple as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 5, right: 5 } } },
          ],
        ];
        for (let i = 0; i < maxRows; i++) {
          twoColBody.push([
            { content: leftItems[i] ? `\xB7  ${leftItems[i]}` : "", styles: { fontSize: 8, textColor: C.textBody as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 2.5, bottom: 2.5, left: 8, right: 4 } } },
            { content: rightItems[i] ? `\xB7  ${rightItems[i]}` : "", styles: { fontSize: 8, textColor: C.textBody as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 2.5, bottom: 2.5, left: 5, right: 5 } } },
          ]);
        }

        autoTable(doc, {
          startY: curY,
          body: twoColBody,
          theme: "plain",
          styles: { overflow: "linebreak", valign: "top" },
          columnStyles: { 0: { cellWidth: colW }, 1: { cellWidth: colW } },
          margin: { left: mx, right: mx },
          tableLineColor: C.border,
          tableLineWidth: 0.3,
          didDrawCell: (hookData: any) => { drawAccent(hookData); },
        });

        curY = (doc as any).lastAutoTable.finalY + 5;
        continue;
      }

      // ── Key-value / plain text sections ───────────────────────
      const rows = buildSectionRows(sectionValue);
      const hasLabels = rows.some(([lbl]) => lbl !== "");
      if (rows.every(([, val]) => !val || val === "-")) continue;

      const labelColW = 42;
      const valueColW = contentW - labelColW;
      const isUrl = (v: string) => /^https?:\/\//i.test(v);

      const bodyRows: object[][] = [
        [{ content: title, colSpan: hasLabels ? 2 : 1, styles: secHdrStyle }],
        ...rows.map(([lbl, val]) =>
          hasLabels
            ? [
              { content: lbl, styles: { textColor: C.purple as [number, number, number], fontStyle: "bold" as const, fontSize: 7.5, fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 4, left: 8, right: 4 } } },
              { content: isUrl(val) ? `>> ${val}` : val, styles: { textColor: isUrl(val) ? [40, 70, 185] as [number, number, number] : C.textBody as [number, number, number], fontStyle: isUrl(val) ? "italic" as const : "normal" as const, fontSize: 8, fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 4, left: 4, right: 7 } } },
            ]
            : [
              { content: val, styles: { textColor: C.textBody as [number, number, number], fontSize: 8, fontStyle: "italic" as const, fillColor: C.cardBg as [number, number, number], cellPadding: { top: 5, bottom: 6, left: 8, right: 7 } } },
            ]
        ),
      ];

      autoTable(doc, {
        startY: curY,
        body: bodyRows,
        theme: "plain",
        styles: { overflow: "linebreak", valign: "top" },
        columnStyles: hasLabels
          ? { 0: { cellWidth: labelColW }, 1: { cellWidth: valueColW } }
          : { 0: { cellWidth: contentW } },
        margin: { left: mx, right: mx },
        tableLineColor: C.border,
        tableLineWidth: 0.3,
        didDrawCell: (hookData: any) => {
          drawAccent(hookData);
          addLinkDeco(hookData, hasLabels ? 1 : 0);
        },
      });

      curY = (doc as any).lastAutoTable.finalY + 5;
    }
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...C.grey);
    doc.text("No report data available for this learner.", pageW / 2, curY + 12, { align: "center" });
  }

  if (learner.triggeredQuestions?.length) {
    autoTable(doc, {
      startY: curY,
      body: [
        [{ content: "TRIGGERED QUESTIONS", colSpan: 3, styles: secHdrStyle }],
        [
          { content: "QUESTION", styles: { fontStyle: "bold" as const, fontSize: 7, textColor: C.purple as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 8, right: 4 } } },
          { content: "ANSWER", styles: { fontStyle: "bold" as const, fontSize: 7, textColor: C.purple as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 4, right: 4 } } },
          { content: "CONCERN", styles: { fontStyle: "bold" as const, fontSize: 7, textColor: C.purple as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 4, right: 7 } } },
        ],
        ...learner.triggeredQuestions.map((item) => {
          const parsed = parseWellbeingTriggerLine(item.text);
          const parsedRisk = numericRiskValue(parsed?.risk);
          const answer = item.answer ?? item.score ?? parsed?.answer ?? null;
          const reason = triggerReasonLabel(item.note || parsed?.reason, item.level || parsed?.level);
          const riskScore = item.riskScore ?? parsedRisk ?? computedTriggerRiskScore({
            answer,
            reason,
            level: item.level || parsed?.level,
          });
          const concernLabel = concernLabelFromScore(riskScore, item.level || parsed?.level);
          const questionText = parsed?.text || item.text;
          const concernText = riskScore != null
            ? `${concernLabel} (${riskScore}/10). ${reason}`
            : `${concernLabel}. ${reason}`;

          return [
            {
              content: pdfText(questionText),
              styles: { fontSize: 8, textColor: C.textBody as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 4, left: 8, right: 4 } },
            },
            {
              content: answer != null ? String(answer) : "-",
              styles: { fontSize: 8, fontStyle: "bold" as const, textColor: C.purpleDeep as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
            },
            {
              content: pdfText(concernText),
              styles: { fontSize: 8, textColor: C.textBody as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 4, left: 4, right: 7 } },
            },
          ];
        }),
      ],
      theme: "plain",
      styles: { overflow: "linebreak", valign: "top" },
      columnStyles: {
        0: { cellWidth: contentW - 54 },
        1: { cellWidth: 18 },
        2: { cellWidth: 36 },
      },
      margin: { left: mx, right: mx },
      tableLineColor: C.border,
      tableLineWidth: 0.3,
      didDrawCell: (hookData: any) => { drawAccent(hookData); },
    });

    curY = (doc as any).lastAutoTable.finalY + 5;
  }

  if (learner.surveyResponses?.length) {
    autoTable(doc, {
      startY: curY,
      body: [
        [{ content: "SURVEY ANSWERS", colSpan: 4, styles: secHdrStyle }],
        [
          { content: "QUESTION", styles: { fontStyle: "bold" as const, fontSize: 7, textColor: C.purple as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 8, right: 4 } } },
          { content: "CATEGORY", styles: { fontStyle: "bold" as const, fontSize: 7, textColor: C.purple as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 4, right: 4 } } },
          { content: "ANSWER", styles: { fontStyle: "bold" as const, fontSize: 7, textColor: C.purple as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 4, right: 4 } } },
          { content: "CONCERN", styles: { fontStyle: "bold" as const, fontSize: 7, textColor: C.purple as [number, number, number], fillColor: C.cardBg as [number, number, number], cellPadding: { top: 4, bottom: 3, left: 4, right: 7 } } },
        ],
        ...learner.surveyResponses.map((item) => [
          {
            content: pdfText(item.questionText || item.questionCode || "-"),
            styles: { fontSize: 7.5, textColor: C.textBody as [number, number, number], fillColor: [255, 255, 255] as [number, number, number], cellPadding: { top: 3, bottom: 3, left: 8, right: 4 } },
          },
          {
            content: pdfText(item.categoryName || item.constructType || "-"),
            styles: { fontSize: 7.5, textColor: C.textBody as [number, number, number], fillColor: [255, 255, 255] as [number, number, number], cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
          },
          {
            content: item.answer != null ? String(item.answer) : "-",
            styles: { fontSize: 7.5, fontStyle: "bold" as const, textColor: C.purpleDeep as [number, number, number], fillColor: [255, 255, 255] as [number, number, number], cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
          },
          {
            content: pdfText(item.concernLevel || "-"),
            styles: { fontSize: 7.5, textColor: C.textBody as [number, number, number], fillColor: [255, 255, 255] as [number, number, number], cellPadding: { top: 3, bottom: 3, left: 4, right: 7 } },
          },
        ]),
      ],
      theme: "plain",
      styles: { overflow: "linebreak", valign: "top" },
      columnStyles: {
        0: { cellWidth: contentW * 0.44 },
        1: { cellWidth: contentW * 0.30 },
        2: { cellWidth: contentW * 0.11 },
        3: { cellWidth: contentW * 0.15 },
      },
      margin: { left: mx, right: mx },
      tableLineColor: C.border,
      tableLineWidth: 0.3,
      didDrawCell: (hookData: any) => { drawAccent(hookData); },
    });

    curY = (doc as any).lastAutoTable.finalY + 5;
  }

  // ── Dark-purple footer on every page ──────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const ph = doc.internal.pageSize.getHeight();
    const footH = 16;
    const footY = ph - footH;

    // Dark purple background
    doc.setFillColor(...C.purpleDeep);
    doc.rect(0, footY, pageW, footH, "F");

    // Lock-style square indicator
    doc.setFillColor(...C.purpleLight);
    doc.roundedRect(mx, footY + 5, 6, 6, 1, 1, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.purpleDeep);
    doc.text("P", mx + 1.8, footY + 9.5);

    // CONFIDENTIAL & PRIVATE
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text("CONFIDENTIAL & PRIVATE", mx + 8.5, footY + 8.5);

    // Disclaimer — split to fit left of KBC label
    doc.setFontSize(6.3);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(185, 168, 218);
    const disclaimer = "This report is only intended for the learner and authorised KBC staff only. Please handle this information with care and in accordance with UK data protection and safeguarding regulations.";
    const disclaimerLines = doc.splitTextToSize(disclaimer, contentW - 55) as string[];
    doc.text(disclaimerLines, mx + 8.5, footY + 12.5);

    // KBC name + website (right-aligned)
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text("Kent Business College", pageW - mx, footY + 8.5, { align: "right" });
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(185, 168, 218);
    doc.text("www.kentbusinesscollege.com", pageW - mx, footY + 13, { align: "right" });
  }

  const safeName = pdfText(learner.studentName, "learner").replace(/\s+/g, "-").toLowerCase();
  doc.save(`learner-safeguarding-report-${safeName}.pdf`);
}

async function exportTicketsToPDF(tickets: SupportTicketRow[], summary?: SupportTicketsResponse["summary"] | null, coachLabel?: string) {
  const logoDataUrl = await loadLogoDataUrl();

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();   // 297mm
  const pageH = doc.internal.pageSize.getHeight();  // 210mm
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  // ── Header bar ──────────────────────────────────────────────────────────────
  const headerH = coachLabel ? 24 : 18;
  doc.setFillColor(36, 20, 83);   // --color-15: #241453
  doc.roundedRect(10, 8, pageW - 20, headerH, 3, 3, "F");

  // KBC Logo — left side, no white badge, sits directly on purple header
  const tLogoH = 14;
  const tLogoW = Math.round(tLogoH * 1.5 * 10) / 10;

  const logoX = 14;
  const logoY = 8 + (headerH - tLogoH) / 2;

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", logoX, logoY, tLogoW, tLogoH);
  }

  const textStartX = logoX + tLogoW + 5;
  const headerMidY = 8 + headerH / 2 + 1.5;  // vertical center baseline for single-line text
  const titleY = coachLabel ? 8 + headerH * 0.38 : headerMidY;

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Safeguarding Tickets Report", textStartX, titleY);

  // Coach name — subtitle below title
  if (coachLabel) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(168, 140, 217);  // --color-11: #a88cd9
    doc.text(`Coach: ${pdfText(coachLabel)}`, textStartX, 8 + headerH * 0.72);
  }

  // Date — vertically centered on the right
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(168, 140, 217);  // --color-11: #a88cd9
  doc.text(`Generated: ${today}`, pageW - 14, headerMidY, { align: "right" });

  // ── Summary cards ───────────────────────────────────────────────────────────
  const cardsY = 8 + headerH + 2;   // 2mm gap after header
  const cardsH = 16;
  if (summary) {
    const cards = [
      { label: "Total", value: String(summary.total) },
      { label: "Open", value: String(summary.open) },
      { label: "Closed", value: String(summary.closed) },
      { label: "Red Risk", value: String(summary.redRisk) },
      { label: "Escalated", value: String(summary.escalated) },
      { label: "Avg Close", value: summary.avgCloseDays != null ? `${summary.avgCloseDays} days` : "-" },
    ];
    const cardW = (pageW - 20) / cards.length;
    cards.forEach((card, i) => {
      const x = 10 + i * cardW;
      doc.setFillColor(248, 245, 255);
      doc.roundedRect(x + 1, cardsY, cardW - 2, cardsH, 2, 2, "F");
      doc.setTextColor(123, 109, 155);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(card.label.toUpperCase(), x + cardW / 2, cardsY + 7, { align: "center" });
      doc.setTextColor(36, 20, 83);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(card.value, x + cardW / 2, cardsY + 13, { align: "center" });
    });
  }

  // ── Table ────────────────────────────────────────────────────────────────────
  // Landscape A4 usable width = 297 - 20 (margins) = 277mm
  // Columns: Ticket(16) Learner(44) Type(20) Risk(16) Status(26)
  //          Created(20) Closed(20) Days(14) Urgency(20) Subject(36) Notes(45) = 277
  const RISK_COLORS: Record<string, [number, number, number]> = {
    red: [255, 235, 235],
    amber: [255, 248, 230],
    green: [235, 255, 240],
  };

  autoTable(doc, {
    startY: summary ? cardsY + cardsH + 2 : 8 + headerH + 2,
    margin: { left: 10, right: 10 },
    tableWidth: pageW - 20,
    head: [[
      "Ticket", "Learner", "Type", "Risk", "Status",
      "Created", "Closed", "Days", "Urgency", "Subject", "Case Notes",
    ]],
    body: tickets.map((t) => {
      // Strip emoji/non-Latin but preserve \n for line breaks in the cell
      const cleanNote = (text: string) =>
        text
          .replace(/[\uD800-\uDFFF]/g, "")               // surrogate pairs (emoji)
          .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "")       // keep ASCII + Latin + newlines
          .replace(/[^\S\n]+/g, " ")                       // collapse spaces but not newlines
          .replace(/\n{3,}/g, "\n\n")                      // max 2 consecutive newlines
          .trim();

      // Fix auto-generated text that runs words together (e.g. "MediumTotal", "6.57Trigger")
      const fixSpacing = (text: string) =>
        cleanNote(
          text
            .replace(/([a-z\d])([A-Z])/g, "$1 $2")  // "MediumTotal" → "Medium Total"
            .replace(/\.([A-Z])/g, ".\n$1")           // "survey.Risk" → "survey.\nRisk"
            .replace(/:\s*/g, ": ")                    // normalise colons
        );

      const notesList = (t.notes || []).slice(0, 2);
      const rawNotes = notesList.length > 0
        ? fixSpacing(notesList.map((n) => n.note).join(" / ").substring(0, 300))
        : fixSpacing((t.details || "-").substring(0, 300));

      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      // Break email at @ so it wraps cleanly instead of mid-word
      const emailDisplay = pdfText(t.learnerEmail).replace("@", "@\n");
      return [
        pdfText(t.ticketCode),
        `${pdfText(t.learnerName)}\n${emailDisplay}`,
        pdfText(cap(t.type || "-")),
        pdfText(cap(t.risk || "-")),
        pdfText(cap(t.status || "-")),
        pdfText(formatTicketDate(t.createdAt)),
        pdfText(t.closedAt ? formatTicketDate(t.closedAt) : "-"),
        String(t.daysToClose ?? t.daysOpen ?? 0),
        pdfText(cap(t.urgency || "-")),
        pdfText(t.subject),
        rawNotes,
      ];
    }),
    styles: {
      fontSize: 8,
      cellPadding: { top: 4, right: 4, bottom: 5, left: 4 },
      overflow: "linebreak",
      lineColor: [200, 185, 230],
      lineWidth: 0.25,
      textColor: [36, 20, 83],
      valign: "middle",
      minCellHeight: 10,
    },
    headStyles: {
      fillColor: [36, 20, 83],   // --color-15: #241453
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
    },
    alternateRowStyles: { fillColor: [252, 251, 254] },
    columnStyles: {
      0: { cellWidth: 16, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 44 },
      2: { cellWidth: 24, halign: "center" },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 26, halign: "center" },
      5: { cellWidth: 20, halign: "center" },
      6: { cellWidth: 20, halign: "center" },
      7: { cellWidth: 14, halign: "center" },
      8: { cellWidth: 20, halign: "center" },
      9: { cellWidth: 28 },
      10: { cellWidth: 49 },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 3) {
        const risk = (tickets[data.row.index]?.risk || "").toLowerCase();
        const col = RISK_COLORS[risk];
        if (col) data.cell.styles.fillColor = col;
      }
    },
    didDrawPage(data) {
      const pCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      const footerCoach = coachLabel ? `  •  ${pdfText(coachLabel)}` : "";
      doc.text(
        `Page ${data.pageNumber} of ${pCount}  •  Safeguarding Tickets Report${footerCoach}  •  ${today}`,
        pageW / 2,
        pageH - 5,
        { align: "center" }
      );
    },
  });

  const fileCoach = coachLabel ? `-${coachLabel.toLowerCase().replace(/\s+/g, "-")}` : "-all";
  doc.save(`safeguarding-tickets${fileCoach}-${new Date().toISOString().split("T")[0]}.pdf`);
}

type ArchivedTicketItem = {
  id: number;
  ticketCode: string;
  learnerName: string;
  learnerEmail: string;
  type: string;
  urgency: string;
  status: string;
  subject: string;
  createdAt: string | null;
  createdBy: string;
};

function ArchivedTicketsPanel({
  coachEmail,
  onClose,
  onRestored,
}: {
  coachEmail?: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [tickets, setTickets] = React.useState<ArchivedTicketItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [restoringId, setRestoringId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<number | null>(null);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    getArchivedTickets(coachEmail)
      .then((data: any) => {
        if (mounted) setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
      })
      .catch(() => { if (mounted) setError("Failed to load archived tickets."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [coachEmail]);

  async function handleRestore(id: number) {
    setRestoringId(id);
    try {
      await restoreTicket(id);
      setTickets((prev) => prev.filter((t) => t.id !== id));
      onRestored();
    } catch { /* ignore */ } finally { setRestoringId(null); }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteTicket(id);
      setTickets((prev) => prev.filter((t) => t.id !== id));
    } catch { /* ignore */ } finally { setDeletingId(null); setDeleteConfirmId(null); }
  }

  return createPortal(
    <>
      <button type="button" className="fixed inset-0 z-[85] cursor-default bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-[90] flex h-full w-full max-w-[640px] flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#ECE7F7] px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-[#241453]">
              <Archive className="h-4 w-4 text-[#7B6D9B]" />
              Archived Tickets
            </div>
            <div className="mt-0.5 text-xs text-[#7B6D9B]">{tickets.length} ticket{tickets.length !== 1 ? "s" : ""} archived</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-[#E7E2F3] p-2 text-[#241453] hover:bg-[#F8F5FF]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="custom-scroll flex-1 overflow-y-auto p-6">
          {loading && <div className="py-12 text-center text-sm text-[#7B6D9B]">Loading archived tickets...</div>}
          {!loading && error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
          {!loading && !error && tickets.length === 0 && (
            <div className="rounded-xl border border-[#ECE7F7] bg-[#F8F6FC] p-8 text-center text-sm text-[#7B6D9B]">
              No archived tickets.
            </div>
          )}
          {!loading && !error && tickets.length > 0 && (
            <div className="space-y-3">
              {tickets.map((t) => (
                <div key={t.id} className="rounded-2xl border border-[#ECE7F7] bg-white p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#7B6D9B]">{t.ticketCode}</span>
                        <span className="rounded-full bg-[#F5F3FF] px-2 py-0.5 text-[10px] font-medium capitalize text-[#6D28D9]">{t.type}</span>
                      </div>
                      <div className="mt-0.5 truncate text-sm font-medium text-[#241453]">{t.subject || "—"}</div>
                      <div className="mt-0.5 text-xs text-[#7B6D9B]">{t.learnerName} · {t.learnerEmail}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${ticketStatusBadgeClass(t.status)}`}>
                      {ticketStatusLabel(t.status)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      disabled={restoringId === t.id}
                      onClick={() => handleRestore(t.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9CFF3] bg-white px-3 py-1.5 text-xs font-medium text-[#6248BE] transition hover:bg-[#F5F1FC] disabled:opacity-60"
                    >
                      <ArchiveRestore className="h-3 w-3" />
                      {restoringId === t.id ? "Restoring..." : "Restore"}
                    </button>

                    {deleteConfirmId === t.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={deletingId === t.id}
                          onClick={() => handleDelete(t.id)}
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                        >
                          {deletingId === t.id ? "Deleting..." : "Confirm Delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

function concernBadgeClass(level?: string) {
  if (level === "High") return "bg-red-100 text-red-700";
  if (level === "Follow-up") return "bg-amber-100 text-amber-700";
  if (level === "Low") return "bg-green-100 text-green-700";
  return "bg-slate-100 text-slate-500";
}

function AllAnswersModal({
  ticketId,
  learnerName,
  onClose,
}: {
  ticketId: number;
  learnerName: string;
  onClose: () => void;
}) {
  const [responses, setResponses] = React.useState<SurveyResponseRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    getTicketSurveyResponses(ticketId)
      .then((data: any) => {
        if (!mounted) return;
        setResponses(Array.isArray(data?.responses) ? data.responses : []);
      })
      .catch(() => {
        if (mounted) setError("Failed to load survey responses.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [ticketId]);

  const grouped = React.useMemo(() => {
    const map: Record<string, SurveyResponseRow[]> = {};
    for (const r of responses) {
      const cat = r.categoryName || "General";
      if (!map[cat]) map[cat] = [];
      map[cat].push(r);
    }
    return map;
  }, [responses]);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[100] cursor-default bg-black/40"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div className="custom-scroll flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#ECE7F7] px-6 py-4">
            <div>
              <div className="text-base font-semibold text-[#241453]">All Survey Answers</div>
              <div className="mt-0.5 text-xs text-[#7B6D9B]">{learnerName} — raw answers (not normalised)</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#E7E2F3] p-2 text-[#241453] hover:bg-[#F8F5FF]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="custom-scroll flex-1 overflow-y-auto p-6">
            {loading && (
              <div className="flex items-center justify-center py-12 text-sm text-[#7B6D9B]">
                Loading answers...
              </div>
            )}
            {!loading && error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
            )}
            {!loading && !error && responses.length === 0 && (
              <div className="rounded-xl border border-[#ECE7F7] bg-[#F8F6FC] p-6 text-center text-sm text-[#7B6D9B]">
                No survey data available for this learner.
              </div>
            )}
            {!loading && !error && responses.length > 0 && (
              <div className="space-y-6">
                {Object.entries(grouped).map(([category, items]) => (
                  <div key={category}>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                      {category}
                    </div>
                    <div className="space-y-2">
                      {items.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-start justify-between gap-3 rounded-xl border border-[#ECE7F7] bg-white px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-[#241453]">{r.questionText || r.questionCode || "—"}</div>
                            {r.questionCode && r.questionText && (
                              <div className="mt-0.5 text-[10px] text-[#B8AACC]">{r.questionCode}</div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="min-w-[2rem] rounded-lg bg-[#F0EAFD] px-2 py-1 text-center text-sm font-semibold text-[#241453]">
                              {r.answer ?? "—"}
                            </span>
                            {r.concernLevel && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${concernBadgeClass(r.concernLevel)}`}>
                                {r.concernLevel}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-[#ECE7F7] px-6 py-3 text-right">
            <span className="text-xs text-[#B8AACC]">{responses.length} question{responses.length !== 1 ? "s" : ""} total</span>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function TicketDetailPanel({
  ticket,
  onClose,
  onStatusChange,
  statusUpdating,
  refreshKey,
}: {
  ticket: SupportTicketRow | null;
  onClose: () => void;
  onStatusChange: (ticketId: number, newStatus: string) => void;
  statusUpdating: number | null;
  refreshKey?: number;
}) {
  const [notes, setNotes] = React.useState<TicketNoteRow[]>([]);
  const [evidence, setEvidence] = React.useState<TicketEvidenceRow[]>([]);
  const [notesLoading, setNotesLoading] = React.useState(false);
  const [showAllAnswers, setShowAllAnswers] = React.useState(false);
  const [previewEvidence, setPreviewEvidence] = React.useState<TicketEvidenceRow | null>(null);

  React.useEffect(() => {
    if (!ticket) { setNotes([]); setEvidence([]); setPreviewEvidence(null); return; }
    const ticketId = ticket.id;
    let mounted = true;

    async function load() {
      setNotesLoading(true);
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
  }, [ticket?.id, refreshKey]);

  if (!ticket) return null;

  const isUpdating = statusUpdating === ticket.id;
  const isClosed = !isActiveTicketStatus(ticket.status);

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

      <div className="fixed right-0 top-0 z-[90] flex h-full w-full max-w-[680px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ECE7F7] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-[#241453]">{ticket.ticketCode}</span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${ticketStatusBadgeClass(ticket.status)}`}
            >
              {ticketStatusLabel(ticket.status) || "open"}
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                  Details / Notes
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllAnswers(true)}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-[#b27715] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#362063]"
                >
                  <BookOpen className="h-3 w-3" />
                  All Answers
                </button>
              </div>
              <WellbeingTicketDetailsView details={ticket.details} />
            </div>

            {showAllAnswers && (
              <AllAnswersModal
                ticketId={ticket.id}
                learnerName={ticket.learnerName || "Learner"}
                onClose={() => setShowAllAnswers(false)}
              />
            )}

            {/* Case info */}
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                Case Info
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">

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
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Source</div>
                  <div className="mt-1 text-sm font-medium text-[#241453]">
                    {ticket.createdBy === "learner" ? "Dashboard" : ticket.source || "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Days Open</div>
                  <div className="mt-1 text-sm font-medium text-[#241453]">
                    {ticket.daysToClose ?? ticket.daysOpen ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-[#ECE7F7] p-3">
                  <div className="text-[10px] font-medium text-[#7B6D9B]">Closed</div>
                  <div className="mt-1 text-sm font-medium text-[#241453]">
                    {ticket.closedAt ? formatTicketDate(ticket.closedAt) : "-"}
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

            {/* Evidence — coach-uploaded */}
            {(() => {
              const coachEvidence = evidence.filter(ev => !isLearnerEvidence(ev));
              return (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">Evidence</div>
                    {coachEvidence.length > 0 && (
                      <span className="text-[10px] text-[#B8AACC]">{coachEvidence.length} item{coachEvidence.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {notesLoading ? (
                    <p className="text-xs text-slate-400">Loading...</p>
                  ) : coachEvidence.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#EEE8F8] px-4 py-3 text-xs text-slate-400">
                      No evidence yet. Use Actions → Add Evidence.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {coachEvidence.map((ev) => (
                        <div key={ev.id} className="rounded-xl border border-[#EEE8F8] p-3">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-[10px] text-[#8E82AA]">{ev.created_by || "Coach"}</span>
                            <span className="text-[10px] text-[#B8AACC]">{ev.created_at ? formatTicketDate(ev.created_at) : ""}</span>
                          </div>
                          {ev.description && <p className="text-sm text-[#241453]">{ev.description}</p>}
                          {ev.file_url && (
                            <button
                              type="button"
                              onClick={() => setPreviewEvidence(ev)}
                              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#6248BE] hover:underline"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              Preview
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Evidence from Learner Side */}
            {(() => {
              const learnerEvidence = evidence.filter(isLearnerEvidence);
              if (notesLoading || learnerEvidence.length === 0) return null;
              return (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                      Evidence from Learner Side
                    </div>
                    <span className="text-[10px] text-[#B8AACC]">{learnerEvidence.length} item{learnerEvidence.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-2">
                    {learnerEvidence.map((ev, i) => {
                      const fileUrl = evFileUrl(ev);
                      const fileName = evFileName(ev);
                      const isImg = evIsImage(ev);
                      return (
                        <div key={ev.id ?? i} className="overflow-hidden rounded-xl border border-[#E8F4FF] bg-[#F5FAFF]">
                          {isImg && fileUrl && (
                            <button type="button" onClick={() => setPreviewEvidence(ev)} className="block w-full text-left">
                              <img
                                src={fileUrl}
                                alt={fileName || "Learner evidence"}
                                className="max-h-44 w-full object-cover transition hover:opacity-90"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            </button>
                          )}
                          <div className="p-3">
                            <div className="mb-2 flex items-center gap-1.5">
                              <span className="rounded-full bg-[#E0EDFF] px-2 py-0.5 text-[10px] font-medium text-[#2563EB]">Learner</span>
                              {ev.created_at && (
                                <span className="text-[10px] text-[#B8AACC]">{formatTicketDate(ev.created_at)}</span>
                              )}
                            </div>
                            {fileName && (
                              <p className="mb-2 truncate text-xs text-[#241453]">{fileName}</p>
                            )}
                            {fileUrl && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPreviewEvidence(ev)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#EEF4FF] px-2.5 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-[#DBEAFE] transition"
                                >
                                  <ImageIcon className="h-3 w-3" />
                                  Preview
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
      {previewEvidence && (
        <EvidencePreviewModal
          url={evFileUrl(previewEvidence)}
          name={evFileName(previewEvidence)}
          description={previewEvidence.description}
          createdBy={previewEvidence.created_by}
          createdAt={previewEvidence.created_at}
          mimeType={previewEvidence.mime_type}
          onClose={() => setPreviewEvidence(null)}
        />
      )}
    </>
  );
}

function EditTicketModal({
  ticket,
  onClose,
  onSaved,
}: {
  ticket: SupportTicketRow | null;
  onClose: () => void;
  onSaved: (ticketId: number, changes: UpdateSupportTicketPayload) => void;
}) {
  const [form, setForm] = React.useState<UpdateSupportTicketPayload>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (ticket) {
      setForm({
        subject: ticket.subject || "",
        details: ticket.details || "",
        urgency: ticket.urgency || "medium",
        ticket_type: (ticket.type || "wellbeing").toLowerCase(),
        preferred_contact: ticket.preferredContact || "email",
      });
      setError("");
    }
  }, [ticket?.id]);

  if (!ticket) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject?.trim()) { setError("Subject is required"); return; }
    try {
      setSaving(true);
      setError("");
      await updateSupportTicket(ticket!.id, form);
      onSaved(ticket!.id, form);
    } catch (err: any) {
      setError(err?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="custom-scroll w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" style={{ maxHeight: "90vh" }}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-[#241453]">Edit Ticket</h3>
            <p className="mt-1 text-sm text-[#7B6D9B]">{ticket.ticketCode} · {ticket.learnerName}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-xl border border-[#E7E2F3] p-2 text-[#241453] hover:bg-[#F8F5FF]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Ticket type</label>
              <select value={form.ticket_type || "wellbeing"}
                onChange={(e) => setForm((p) => ({ ...p, ticket_type: e.target.value }))}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none">
                <option value="wellbeing">Wellbeing</option>
                <option value="safeguarding">Safeguarding</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Urgency</label>
              <select value={form.urgency || "medium"}
                onChange={(e) => setForm((p) => ({ ...p, urgency: e.target.value }))}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Subject <span className="text-red-500">*</span></label>
            <input value={form.subject || ""}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Ticket subject"
              className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none focus:border-[#644D93]" />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Details</label>
            <textarea value={form.details || ""}
              onChange={(e) => setForm((p) => ({ ...p, details: e.target.value }))}
              rows={4}
              className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none focus:border-[#644D93]" />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Preferred contact</label>
            <select value={form.preferred_contact || "email"}
              onChange={(e) => setForm((p) => ({ ...p, preferred_contact: e.target.value }))}
              className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none">
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-xl border border-[#DED5F3] px-5 py-2.5 text-sm font-medium text-[#241453]">Cancel</button>
            <button type="submit" disabled={saving}
              className="rounded-xl bg-[#241453] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#362063] disabled:opacity-60">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
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
            <label className="mb-2 block text-sm font-medium text-[#241453]">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              value={form.subject}
              onChange={(e) => onChange("subject", e.target.value)}
              placeholder="Enter ticket subject"
              className={`h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-[#644D93] ${error && !form.subject.trim() ? "border-red-400 bg-red-50" : "border-[#DED5F3]"
                }`}
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

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">Role</label>
            {(() => {
              const presets = ["Learner", "Safeguarding Lead", "Wellbeing Manager"];
              const isOther = form.creator_role !== "" && !presets.includes(form.creator_role);
              const selectVal = presets.includes(form.creator_role) ? form.creator_role : isOther ? "__other__" : "";
              return (
                <>
                  <select
                    value={selectVal}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "__other__") {
                        onChange("creator_role", "\u200B");
                      } else {
                        onChange("creator_role", val);
                        if (val === "Learner" && learner) {
                          onChange("created_by", learner.studentName || learner.studentEmail || "");
                        }
                      }
                    }}
                    className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none"
                  >
                    <option value="">Select role...</option>
                    <option value="Learner">Learner</option>
                    <option value="Safeguarding Lead">Safeguarding Lead</option>
                    <option value="Wellbeing Manager">Wellbeing Manager</option>
                    <option value="__other__">Other</option>
                  </select>
                  {isOther && (
                    <input
                      value={form.creator_role.replace(/\u200B/g, "")}
                      onChange={(e) => onChange("creator_role", e.target.value || "\u200B")}
                      placeholder="Enter your role..."
                      className="mt-2 h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none focus:border-[#644D93]"
                      autoFocus
                    />
                  )}
                </>
              );
            })()}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#241453]">
              Time taken to close the case (days)
            </label>
            <input
              type="number"
              min={0}
              value={form.days_to_close}
              onChange={(e) => onChange("days_to_close", e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="e.g. 5"
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

const OWNER_OPTIONS = ["Tina Wright", "Yousef Sultan", "Alex Pennington", "Nada Ibrahim"];

const OWNER_COLORS: Record<string, { avatar: string; pill: string; text: string }> = {
  "Tina Wright":     { avatar: "#b27715", pill: "#F9F4EC", text: "#80560F" },
  "Yousef Sultan":   { avatar: "#644d93", pill: "#f9f5ff", text: "#442F73" },
  "Alex Pennington": { avatar: "#9875A3", pill: "#FCF3FF", text: "#644d93" },
  "Nada Ibrahim":    { avatar: "#241453", pill: "#EEE8F8", text: "#241453" },
};

const DEFAULT_OWNER_COLOR = { avatar: "#aaaaaa", pill: "#F1F1F1", text: "#666666" };

function getOwnerColor(name: string) {
  return OWNER_COLORS[name] ?? DEFAULT_OWNER_COLOR;
}

function ownerInitials(name: string) {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function AssignedOwnerCell({ ticket }: { ticket: SupportTicketRow }) {
  const [open, setOpen] = React.useState(false);
  const [current, setCurrent] = React.useState(ticket.assignedOwner || "");
  const [otherText, setOtherText] = React.useState(
    ticket.assignedOwner && !OWNER_OPTIONS.includes(ticket.assignedOwner) ? ticket.assignedOwner : ""
  );
  const [showOther, setShowOther] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setCurrent(ticket.assignedOwner || "");
    setOtherText(ticket.assignedOwner && !OWNER_OPTIONS.includes(ticket.assignedOwner) ? ticket.assignedOwner : "");
  }, [ticket.assignedOwner]);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setShowOther(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function save(value: string) {
    setSaving(true);
    try {
      await updateSupportTicket(ticket.id, { assigned_owner: value });
      setCurrent(value);
    } catch (_) { /* silent */ }
    finally { setSaving(false); }
    setOpen(false); setShowOther(false);
  }

  async function handleOtherSave() {
    const trimmed = otherText.trim();
    if (trimmed) await save(trimmed);
  }

  const isAssigned = !!current;

  return (
    <div ref={ref} className="relative" style={{ minWidth: 150 }}>
      {(() => {
        const c = getOwnerColor(current);
        return (
          <button
            type="button"
            onClick={() => { setOpen((v) => !v); setShowOther(false); }}
            disabled={saving}
            style={isAssigned ? { backgroundColor: c.pill, color: c.text } : undefined}
            className={`inline-flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
              isAssigned
                ? "hover:brightness-95"
                : "border border-dashed border-[#C4B8E0] text-[#9B8EC4] hover:border-[#644D93] hover:text-[#241453]"
            }`}
          >
            {isAssigned ? (
              <>
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ backgroundColor: c.avatar }}
                >
                  {ownerInitials(current)}
                </span>
                <span className="truncate">{current}</span>
                <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
              </>
            ) : (
              <>
                <Plus className="h-3 w-3" />
                <span>Assign</span>
              </>
            )}
          </button>
        );
      })()}

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-2xl border border-[#E7E2F3] bg-white py-1 shadow-lg">
          {OWNER_OPTIONS.map((name) => {
            const c = getOwnerColor(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => save(name)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-[#F8F5FF] ${current === name ? "font-semibold" : "text-slate-700"}`}
                style={current === name ? { color: c.text } : undefined}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ backgroundColor: c.avatar }}
                >
                  {ownerInitials(name)}
                </span>
                {name}
                {current === name && <span className="ml-auto">✓</span>}
              </button>
            );
          })}
          <div className="my-1 border-t border-[#F1EDF8]" />
          {!showOther ? (
            <button
              type="button"
              onClick={() => setShowOther(true)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:bg-[#F8F5FF]"
            >
              <Plus className="h-3 w-3" /> Other...
            </button>
          ) : (
            <div className="px-3 py-2 flex gap-1">
              <input
                autoFocus
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleOtherSave(); if (e.key === "Escape") setShowOther(false); }}
                placeholder="Name..."
                className="flex-1 rounded-lg border border-[#DED5F3] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#644D93]"
              />
              <button
                type="button"
                onClick={handleOtherSave}
                className="rounded-lg bg-[#241453] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#362063]"
              >
                ✓
              </button>
            </div>
          )}
          {isAssigned && (
            <>
              <div className="my-1 border-t border-[#F1EDF8]" />
              <button
                type="button"
                onClick={() => save("")}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:bg-[#FFF5F5] hover:text-red-400"
              >
                <X className="h-3 w-3" /> Remove assignment
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// tickets componant
function TicketsManagementView({
  loading,
  search,
  onSearchChange,
  ticketsData,
  riskCounts,
  evidenceCounts,
  statusCounts,
  onView,
  onStatusChange,
  statusUpdating,
  onCreateTicket,
  filters,
  onFiltersChange,
  onExportExcel,
  onExportPDF,
  onExportAllExcel,
  onExportAllPDF,
  onEdit,
  onTicketUpdated,
  onNotesChanged,
  onEvidenceChanged,
  role,
  onArchive,
  archiveConfirmId,
  archiving,
  onArchiveConfirm,
  onArchivedOpen,
}: {
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  ticketsData: SupportTicketsResponse | null;
  riskCounts: Partial<Record<RiskQuickValue, number>>;
  evidenceCounts: Record<TicketEvidenceFilter, number>;
  statusCounts: Record<TicketStatusGroup, number>;
  onView: (ticket: SupportTicketRow) => void;
  onStatusChange: (ticketId: number, newStatus: string) => void;
  statusUpdating: number | null;
  onCreateTicket: () => void;
  filters: TicketFilters;
  onFiltersChange: (f: TicketFilters) => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
  onExportAllExcel: () => void;
  onExportAllPDF: () => void;
  onEdit: (ticket: SupportTicketRow) => void;
  onTicketUpdated: (ticketId: number, changes: { risk?: string }) => void;
  onNotesChanged: (ticketId: number) => void;
  onEvidenceChanged: (ticketId: number) => void;
  role?: string;
  onArchive: (id: number) => void;
  archiveConfirmId: number | null;
  archiving: boolean;
  onArchiveConfirm: (id: number) => void;
  onArchivedOpen: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const canView = (role || "").toLowerCase() === "qa";
  const isQA = canView;
  const tickets = ticketsData?.tickets || [];
  const hasTickets = tickets.length > 0;
  type TicketSortKey = "ticket" | "learner" | "type" | "risk" | "source" | "created" | "createdBy" | "status" | "owner" | "days" | "notes" | "evidence";
  const [sortConfig, setSortConfig] = React.useState<{ key: TicketSortKey; direction: SortDirection }>({
    key: "created",
    direction: "desc",
  });
  function setSort(key: TicketSortKey) {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }
  const sortedTickets = React.useMemo(() => {
    const valueFor = (ticket: SupportTicketRow, key: TicketSortKey) => {
      if (key === "ticket") return sortText(ticket.ticketCode || `TKT-${ticket.id}`);
      if (key === "learner") return sortText(ticket.learnerName || ticket.learnerEmail);
      if (key === "type") return sortText(ticket.type);
      if (key === "risk") return sortText(ticket.risk);
      if (key === "source") return sortText(ticket.createdBy === "learner" ? "Dashboard" : ticket.source);
      if (key === "created") return sortDate(ticket.createdAt);
      if (key === "createdBy") return sortText(ticket.createdBy);
      if (key === "status") return sortText(ticketStatusLabel(ticket.status) || ticket.status);
      if (key === "owner") return sortText(ticket.assignedOwner);
      if (key === "days") return sortNumber(ticket.daysToClose ?? ticket.daysOpen ?? 0);
      if (key === "notes") return sortNumber(ticket.notesCount ?? ticket.notes?.length ?? 0);
      return sortNumber(ticket.evidenceCount ?? ticket.evidence?.length ?? 0);
    };
    return [...tickets].sort((a, b) => compareValues(valueFor(a, sortConfig.key), valueFor(b, sortConfig.key), sortConfig.direction));
  }, [tickets, sortConfig]);
  const ticketHeader = (key: TicketSortKey, label: string) => (
    <SortHeaderButton label={label} active={sortConfig.key === key} direction={sortConfig.direction} onClick={() => setSort(key)} />
  );
  const isInitialTicketLoad = loading && !hasTickets;
  const activeFilterCount =
    (filters.statusGroup !== DEFAULT_TICKET_STATUS_GROUP ? 1 : 0) +
    filters.status.length +
    filters.type.length +
    filters.risk.length +
    (filters.evidence !== "all" ? 1 : 0);
  const selectedRiskFilter = filters.risk[0] ?? "";
  const ticketQuickRiskValue = filters.risk.length === 0
    ? "all"
    : filters.risk.length === 1 && ["red", "amber", "green"].includes(selectedRiskFilter)
      ? selectedRiskFilter as RiskLevel
      : undefined;
  const summary = ticketsData?.summary;
  const currentStatusLabel =
    filters.statusGroup === "closed"
      ? "Closed Tickets"
      : filters.statusGroup === "open"
        ? "Open Tickets"
        : "Total Tickets";
  const statusStatSource =
    filters.statusGroup === "closed"
      ? "Closed or outcome recorded tickets currently shown."
      : filters.statusGroup === "open"
        ? "Active tickets currently shown."
        : "Count of tickets currently shown after search and filters.";
  const statCards = [
    {
      title: currentStatusLabel,
      value: isInitialTicketLoad ? "…" : summary?.total ?? 0,
      icon: filters.statusGroup === "closed" ? <ClipboardCheck className="h-4 w-4" /> : <Ticket className="h-4 w-4" />,
      source: statusStatSource,
    },
    ...(filters.statusGroup === "all" ? [
      {
        title: "Open Tickets",
        value: isInitialTicketLoad ? "…" : summary?.open ?? 0,
        icon: <ClipboardList className="h-4 w-4" />,
        source: "Shown tickets whose status is not closed or outcome recorded.",
      },
      {
        title: "Closed Tickets",
        value: isInitialTicketLoad ? "…" : summary?.closed ?? 0,
        icon: <ClipboardCheck className="h-4 w-4" />,
        source: "Shown tickets with closed or outcome recorded status.",
      },
    ] : []),
    {
      title: "Red Risk",
      value: isInitialTicketLoad ? "…" : riskCounts.red ?? 0,
      icon: <AlertTriangle className="h-4 w-4" />,
      valueColor: "text-red-500",
      iconBg: "bg-red-50",
      iconColor: "text-red-500",
      source: "Shown tickets where risk is red.",
    },
    {
      title: "Amber Risk",
      value: isInitialTicketLoad ? "…" : riskCounts.amber ?? 0,
      icon: <AlertTriangle className="h-4 w-4" />,
      valueColor: "text-amber-500",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
      source: "Shown tickets where risk is amber.",
    },
    {
      title: "Green Risk",
      value: isInitialTicketLoad ? "…" : riskCounts.green ?? 0,
      icon: <Shield className="h-4 w-4" />,
      valueColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      source: "Shown tickets where risk is green.",
    },
    ...(filters.statusGroup === "closed" || filters.statusGroup === "all" ? [
      {
        title: "Avg Close Time",
        value: isInitialTicketLoad ? "…" : summary?.avgCloseDays ?? "—",
        unit: !loading && summary?.avgCloseDays != null ? "days" : undefined,
        delta: summary?.avgCloseDelta ?? null,
        icon: <ClipboardCheck className="h-4 w-4" />,
        trendPositiveIsGood: false,
        source: "Average days to close for closed tickets currently shown.",
      },
    ] : []),
    ...(filters.statusGroup === "open" || filters.statusGroup === "all" ? [
      {
        title: "Escalated",
        value: isInitialTicketLoad ? "…" : summary?.escalated ?? 0,
        icon: <AlertTriangle className="h-4 w-4" />,
        valueColor: "text-amber-500",
        iconBg: "bg-amber-50",
        iconColor: "text-amber-500",
        source: "Shown tickets with escalated status.",
      },
    ] : []),
  ];

  function setTicketQuickRisk(value: RiskQuickValue) {
    onSearchChange("");
    onFiltersChange({
      ...filters,
      risk: value === "all" ? [] : [value],
    });
  }

  function setEvidenceFilter(value: TicketEvidenceFilter) {
    onSearchChange("");
    onFiltersChange({
      ...filters,
      evidence: value,
    });
  }

  if (isInitialTicketLoad) {
    return <TicketPageContentSkeleton title="Safeguarding Tickets" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold text-[#241453]">Safeguarding Tickets</h2>
            <p className="mt-1 text-sm text-[#7B6D9B]">
              {isQA ? "Manage safeguarding and wellbeing cases" : "Manage your learner wellbeing cases"}
            </p>
          </div>

          <button
            type="button"
            onClick={onCreateTicket}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#B27715] px-5 text-sm font-medium text-white transition hover:opacity-90"
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
              {isQA && (
                <button
                  type="button"
                  onClick={onArchivedOpen}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E7E2F3] px-4 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                >
                  <Archive className="h-4 w-4" />
                  Archived
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm transition ${activeFilterCount > 0
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
                    <div className="z-50">
                      <FiltersPanel
                        filters={filters}
                        onChange={onFiltersChange}
                        onReset={() => onFiltersChange(emptyFilters)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  disabled={loading || !hasTickets}
                  title={!hasTickets ? "No tickets available to export" : "Export current ticket data"}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E7E2F3] px-4 text-sm text-[#241453] hover:bg-[#F8F5FF] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileDown className="h-4 w-4" />
                  {loading ? "Loading..." : "Export"}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                {exportOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setExportOpen(false)}
                    />
                    <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-[#E7E2F3] bg-white py-1 shadow-lg">
                      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                        Current View
                      </div>
                      <button
                        type="button"
                        onClick={() => { setExportOpen(false); onExportExcel(); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        Excel (.xlsx)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setExportOpen(false); onExportPDF(); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                      >
                        <FilePdf className="h-4 w-4 text-red-500" />
                        PDF Report
                      </button>
                      {isQA && (
                        <>
                          <div className="my-1 border-t border-[#EEE8F8]" />
                          <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">
                            All Coaches
                          </div>
                          <button
                            type="button"
                            onClick={() => { setExportOpen(false); onExportAllExcel(); }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                          >
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                            All Tickets - Excel
                          </button>
                          <button
                            type="button"
                            onClick={() => { setExportOpen(false); onExportAllPDF(); }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                          >
                            <FilePdf className="h-4 w-4 text-red-500" />
                            All Tickets - PDF
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-[#EEE8F8] pt-4">
            <div className="grid gap-3">
              <div className="grid gap-3 lg:grid-cols-3">
                {(["all", "open", "closed"] as const).map((group) => {
                  const isActive = filters.statusGroup === group;
                  const Icon = group === "all" ? Ticket : group === "open" ? ClipboardList : ClipboardCheck;
                  return (
                    <button
                      key={group}
                      type="button"
                      onClick={() => onFiltersChange({ ...filters, statusGroup: group })}
                      className={`flex min-h-[74px] items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? group === "all"
                            ? "border-[#BFAFEA] bg-[#F8F5FF] text-[#241453] shadow-sm"
                            : group === "open"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm"
                              : "border-slate-300 bg-slate-100 text-slate-800 shadow-sm"
                          : "border-[#E7E2F3] bg-white text-[#241453] hover:bg-[#F8F5FF]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isActive
                            ? group === "all" ? "bg-white text-[#6248BE]" : group === "open" ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600"
                            : "bg-[#F4F0FC] text-[#644D93]"
                        }`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {group === "all" ? "All Tickets" : group === "open" ? "Open Tickets" : "Closed Tickets"}
                          </span>
                          <span className="mt-0.5 block text-xs text-[#7B6D9B]">
                            {group === "all" ? "Every case" : group === "open" ? "Active cases" : "Resolved cases"}
                          </span>
                        </span>
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isActive
                          ? group === "all" ? "bg-white text-[#6248BE]" : group === "open" ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600"
                          : "bg-[#F4F0FC] text-[#644D93]"
                      }`}>
                        {statusCounts[group]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-[#E9E3F5] bg-[#FCFBFE] p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#7B6D9B]">
                    {filters.statusGroup === "all" ? "All ticket RAG" : filters.statusGroup === "open" ? "Open ticket RAG" : "Closed ticket RAG"}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#644D93]">
                    {tickets.length} shown
                  </span>
                </div>
                <RiskQuickFilter
                  value={ticketQuickRiskValue}
                  onChange={setTicketQuickRisk}
                  allLabel="All tickets"
                  counts={riskCounts}
                />
                <div className="mt-3 border-t border-[#EEE8F8] pt-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7B6D9B]">Notes / Evidence</div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["with", "Has notes/evidence"],
                      ["missing", "Missing notes/evidence"],
                    ] as const).map(([value, label]) => {
                      const isActive = filters.evidence === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setEvidenceFilter(isActive ? "all" : value)}
                          className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${
                            isActive
                              ? "border-[#241453] bg-[#241453] text-white"
                              : "border-[#E7E2F3] bg-white text-[#241453] hover:bg-[#F8F5FF]"
                          }`}
                        >
                          <span>{label}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                            isActive ? "bg-white/20 text-current" : "bg-[#F4F0FC] text-[#644D93]"
                          }`}>
                            {evidenceCounts[value]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {loading && hasTickets ? (
          <div className="mt-4">
            <InlineLoadingNotice label="Refreshing tickets..." />
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <StatCard
              key={card.title}
              title={card.title}
              value={card.value}
              unit={card.unit}
              delta={card.delta}
              icon={card.icon}
              valueColor={card.valueColor}
              iconBg={card.iconBg}
              iconColor={card.iconColor}
              trendPositiveIsGood={card.trendPositiveIsGood}
              source={card.source}
            />
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-[#E9E3F5]">
          <div className="custom-scroll overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <table className="w-full min-w-[1420px] text-sm">
              <thead className="sticky top-0 z-10 bg-[#FCFBFE]">
                <tr className="border-b border-[#EEE8F8] text-left text-[#7B6D9B]">
                  <th className="px-5 py-4 font-medium">{ticketHeader("ticket", "Ticket")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("learner", "Learner")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("type", "Type")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("risk", "Risk")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("source", "Source")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("created", "Created")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("createdBy", "Created By")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("status", "Status")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("owner", "Assigned Owner")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("days", "Days")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("notes", "Notes")}</th>
                  <th className="px-5 py-4 font-medium">{ticketHeader("evidence", "Evidence")}</th>
                  <th className="px-5 py-4 font-medium">Actions</th>
                  <th className="px-5 py-4 font-medium">Edit</th>
                  {isQA && <th className="px-5 py-4 font-medium">Delete</th>}
                  {canView && <th className="px-5 py-4 font-medium">View</th>}
                </tr>
              </thead>

             <tbody>
                {isInitialTicketLoad ? (
                  <tr>
                    <td colSpan={(canView ? 1 : 0) + (isQA ? 1 : 0) + 14} className="px-5 py-8 text-center text-slate-500">
                      Loading tickets...
                    </td>
                  </tr>
                ) : sortedTickets.length === 0 ? (
                  <tr>
                    <td colSpan={(canView ? 1 : 0) + (isQA ? 1 : 0) + 14} className="px-5 py-8 text-center text-slate-500">
                      No tickets found
                    </td>
                  </tr>
                ) : (
                  sortedTickets.map((item) => (
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

                      <td className="px-5 py-4 text-slate-600">{item.createdBy === "learner" ? "Dashboard" : item.source || "-"}</td>
                      <td className="px-5 py-4 text-slate-600">{formatTicketDate(item.createdAt)}</td>
                      <td className="px-5 py-4 text-slate-600">{item.createdBy || "-"}</td>

                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${ticketStatusBadgeClass(item.status)}`}>
                          {ticketStatusLabel(item.status) || "-"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <AssignedOwnerCell ticket={item} />
                      </td>

                      <td className="px-5 py-4 text-[#241453]">{item.daysToClose ?? item.daysOpen ?? 0}</td>

                      <td className="px-5 py-4">
                        {(item.notesCount ?? item.notes?.length ?? 0) > 0 ? (
                          <TicketNotesPopover ticketId={item.id} count={item.notesCount ?? item.notes?.length ?? 0} initialNotes={item.notes} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {(() => {
                          const evidenceCount = item.evidenceCount ?? item.evidence?.length ?? 0;
                          return evidenceCount > 0 ? (
                            <TicketEvidencePopover ticketId={item.id} count={evidenceCount} initialEvidence={item.evidence} />
                          ) : (
                            <span className="text-slate-300">—</span>
                          );
                        })()}
                      </td>

                      <td className="px-5 py-4">
                        <TicketActionsDropdown
                          ticket={item}
                          onChange={onStatusChange}
                          updating={statusUpdating === item.id}
                          onTicketUpdated={onTicketUpdated}
                          onNotesChanged={onNotesChanged}
                          onEvidenceChanged={onEvidenceChanged}
                        />
                      </td>

                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="inline-flex items-center gap-2 text-sm font-medium text-[#7B6D9B] hover:text-[#241453]"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                      </td>

                      {isQA && (
                        <td className="px-5 py-4">
                          {archiveConfirmId === item.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onArchiveConfirm(item.id)}
                                disabled={archiving}
                                className="rounded-lg bg-[#241453] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#362063] disabled:opacity-60"
                              >
                                {archiving ? "..." : "Yes"}
                              </button>
                              <button
                                type="button"
                                onClick={() => onArchive(0)}
                                disabled={archiving}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onArchive(item.id)}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7B6D9B] hover:text-[#241453]"
                            >
                              <Archive className="h-4 w-4" />
                              Archive
                            </button>
                          )}
                        </td>
                      )}

                      {canView && (
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
                      )}
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

type WellbeingActiveView = "dashboard" | "tickets" | "onboarding";

const WELLBEING_VIEW_LABELS: Record<WellbeingActiveView, string> = {
  dashboard: "Dashboard",
  tickets: "Safeguarding Tickets",
  onboarding: "Onboarding Tickets",
};

function wellbeingPathForView(view: WellbeingActiveView) {
  if (view === "tickets") return "/coach-wellbeing?view=tickets";
  if (view === "onboarding") return "/coach-wellbeing?view=onboarding";
  return "/coach-wellbeing";
}

function wellbeingViewFromPath(pathname: string, search = "", hash = ""): WellbeingActiveView {
  const params = new URLSearchParams(search);
  const queryView = String(params.get("view") || params.get("wb_view") || "").toLowerCase();
  if (queryView === "tickets" || queryView === "safeguarding-tickets") return "tickets";
  if (queryView === "onboarding" || queryView === "onboarding-tickets") return "onboarding";

  const hashView = hash.replace(/^#/, "").toLowerCase();
  if (hashView === "tickets" || hashView === "safeguarding-tickets") return "tickets";
  if (hashView === "onboarding" || hashView === "onboarding-tickets") return "onboarding";

  const cleanPath = pathname.replace(/\/+$/, "").toLowerCase();
  if (cleanPath.endsWith("/tickets") || cleanPath.endsWith("/safeguarding-tickets")) return "tickets";
  if (cleanPath.endsWith("/onboarding") || cleanPath.endsWith("/onboarding-tickets")) return "onboarding";
  return "dashboard";
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[#EDE8F8] ${className}`} />;
}

function DashboardContentSkeleton() {
  return (
    <>
      <ModernPageLoader
        title="Loading dashboard"
        subtitle="Collecting learners, survey risk, and ticket counts."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="rounded-2xl border border-[#E7E2F3] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <SkeletonBlock className="h-3 w-28" />
                <SkeletonBlock className="h-8 w-16" />
                {item < 2 ? <SkeletonBlock className="h-3 w-24 bg-[#F3EFFC]" /> : null}
              </div>
              <SkeletonBlock className="h-10 w-10 bg-[#F3EFFC]" />
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-3 w-32 bg-[#F3EFFC]" />
          </div>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-9 w-24 bg-[#F3EFFC]" />)}
          </div>
        </div>
        <TableRowsSkeleton rows={6} columns={7} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[0, 1].map((panel) => (
          <div key={panel} className="rounded-3xl bg-white p-4 shadow-sm sm:p-6 xl:h-[420px]">
            <SkeletonBlock className="mb-5 h-5 w-44" />
            <div className="space-y-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="rounded-2xl border border-[#ECE7F7] bg-[#FCFBFE] p-4">
                  <div className="flex gap-3">
                    <SkeletonBlock className="h-7 w-16 bg-[#F3EFFC]" />
                    <div className="flex-1 space-y-2">
                      <SkeletonBlock className="h-4 w-48" />
                      <SkeletonBlock className="h-3 w-36 bg-[#F3EFFC]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TicketPageContentSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <ModernPageLoader
          title={`Loading ${title}`}
          subtitle="Fetching the latest cases, filters, and table rows."
        />

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold text-[#241453]">{title}</h2>
            <SkeletonBlock className="mt-2 h-3.5 w-64 bg-[#F3EFFC]" />
          </div>
          {title === "Safeguarding Tickets" ? <SkeletonBlock className="h-11 w-36 bg-[#F3EFFC]" /> : null}
        </div>

        <div className="rounded-3xl border border-[#E9E3F5] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SkeletonBlock className="h-12 w-full max-w-[680px] bg-[#F5F7FB]" />
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-28 bg-[#F3EFFC]" />
              <SkeletonBlock className="h-10 w-24 bg-[#F3EFFC]" />
              <SkeletonBlock className="h-10 w-28 bg-[#F3EFFC]" />
            </div>
          </div>
          <div className="mt-4 border-t border-[#EEE8F8] pt-4">
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SkeletonBlock className="h-[74px] bg-emerald-50" />
                <SkeletonBlock className="h-[74px] bg-[#F8F6FC]" />
              </div>
              <div className="rounded-2xl border border-[#E9E3F5] bg-[#FCFBFE] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <SkeletonBlock className="h-3 w-32" />
                  <SkeletonBlock className="h-6 w-20 bg-white" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-9 w-24 bg-white" />)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-6 grid gap-4 ${title === "Safeguarding Tickets" ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}>
          {[0, 1, 2, 3, 4, 5].slice(0, title === "Safeguarding Tickets" ? 6 : 5).map((item) => (
            <div key={item} className="rounded-2xl border border-[#E7E2F3] bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-8 w-8 bg-[#F3EFFC]" />
              </div>
              <SkeletonBlock className="h-8 w-14" />
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-[#E9E3F5]">
          <TableRowsSkeleton rows={7} columns={title === "Safeguarding Tickets" ? 9 : 8} />
        </div>
      </div>
    </div>
  );
}

function DashboardTicketsTable({
  tickets,
  loading,
  onView,
}: {
  tickets: SupportTicketRow[];
  loading: boolean;
  onView: (ticket: SupportTicketRow) => void;
}) {
  type DashboardTicketSortKey = "ticket" | "learner" | "type" | "risk" | "created" | "status" | "owner" | "days";
  const [sortConfig, setSortConfig] = React.useState<{ key: DashboardTicketSortKey; direction: SortDirection }>({
    key: "created",
    direction: "desc",
  });
  function setSort(key: DashboardTicketSortKey) {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }
  const sortedTickets = React.useMemo(() => {
    const valueFor = (ticket: SupportTicketRow, key: DashboardTicketSortKey) => {
      if (key === "ticket") return sortText(ticket.ticketCode || `TKT-${ticket.id}`);
      if (key === "learner") return sortText(ticket.learnerName || ticket.learnerEmail);
      if (key === "type") return sortText(ticket.type);
      if (key === "risk") return sortText(ticket.risk);
      if (key === "created") return sortDate(ticket.createdAt);
      if (key === "status") return sortText(ticketStatusLabel(ticket.status) || ticket.status);
      if (key === "owner") return sortText(ticket.assignedOwner);
      return sortNumber(ticket.daysToClose ?? ticket.daysOpen ?? 0);
    };
    return [...tickets].sort((a, b) => compareValues(valueFor(a, sortConfig.key), valueFor(b, sortConfig.key), sortConfig.direction));
  }, [tickets, sortConfig]);
  const ticketHeader = (key: DashboardTicketSortKey, label: string) => (
    <SortHeaderButton label={label} active={sortConfig.key === key} direction={sortConfig.direction} onClick={() => setSort(key)} />
  );

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#E9E3F5]">
      <div className="custom-scroll overflow-auto" style={{ maxHeight: "430px" }}>
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="sticky top-0 z-10 bg-[#FCFBFE]">
            <tr className="border-b border-[#EEE8F8] text-left text-xs font-semibold uppercase tracking-wide text-[#8E82AA]">
              <th className="px-4 py-3 first:pl-5">{ticketHeader("ticket", "Ticket")}</th>
              <th className="px-4 py-3">{ticketHeader("learner", "Learner")}</th>
              <th className="px-4 py-3">{ticketHeader("type", "Type")}</th>
              <th className="px-4 py-3">{ticketHeader("risk", "Risk")}</th>
              <th className="px-4 py-3">{ticketHeader("created", "Created")}</th>
              <th className="px-4 py-3">{ticketHeader("status", "Status")}</th>
              <th className="px-4 py-3">{ticketHeader("owner", "Owner")}</th>
              <th className="px-4 py-3">{ticketHeader("days", "Days")}</th>
              <th className="px-4 py-3 last:pr-5">View</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EDF8]">
            {loading && tickets.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-500">
                  Loading tickets...
                </td>
              </tr>
            ) : sortedTickets.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-500">
                  No tickets found
                </td>
              </tr>
            ) : (
              sortedTickets.map((ticket) => (
                <tr key={ticket.id} className="transition hover:bg-[#FAFAFF]">
                  <td className="px-4 py-3 first:pl-5 font-semibold text-[#0F9B8E]">
                    {ticket.ticketCode || `TKT-${ticket.id}`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#241453]">{ticket.learnerName || "-"}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{ticket.learnerEmail || ""}</div>
                  </td>
                  <td className="px-4 py-3 capitalize text-[#241453]">{ticket.type || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-3 py-1 text-xs font-medium capitalize ${ticketRiskBadgeClass(ticket.risk)}`}>
                      {ticket.risk || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatTicketDate(ticket.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${ticketStatusBadgeClass(ticket.status)}`}>
                      {ticketStatusLabel(ticket.status) || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#241453]">{ticket.assignedOwner || "-"}</td>
                  <td className="px-4 py-3 tabular-nums text-[#241453]">{ticket.daysToClose ?? ticket.daysOpen ?? 0}</td>
                  <td className="px-4 py-3 last:pr-5">
                    <button
                      type="button"
                      onClick={() => onView(ticket)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D9CFF3] bg-[#F5F1FC] px-3 text-xs font-semibold text-[#6248BE] hover:bg-[#EEE7FB]"
                    >
                      <Eye className="h-3.5 w-3.5" />
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
  );
}

function DashboardTicketOverview({
  statusGroup,
  onStatusGroupChange,
  riskValue,
  onRiskChange,
  statusCounts,
  riskCounts,
  shownCount,
  tickets,
  learners,
  loading,
  onView,
  onCreateFollowUp,
  onViewLearnerTickets,
  onOpenTicketsPage,
}: {
  statusGroup: TicketStatusGroup;
  onStatusGroupChange: (value: TicketStatusGroup) => void;
  riskValue?: RiskQuickValue;
  onRiskChange: (value: RiskQuickValue) => void;
  statusCounts: Record<TicketStatusGroup, number>;
  riskCounts: Partial<Record<RiskQuickValue, number>>;
  shownCount: number;
  tickets: SupportTicketRow[];
  learners: TicketableLearnerRow[];
  loading: boolean;
  onView: (ticket: SupportTicketRow) => void;
  onCreateFollowUp: (row: TicketableLearnerRow) => void;
  onViewLearnerTickets: (row: TicketableLearnerRow) => void;
  onOpenTicketsPage: () => void;
}) {
  const showingLearners = statusGroup === "all";

  return (
    <div className="mb-6 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-md font-semibold text-[#241453]">Ticket Status Overview</h2>
          <p className="mt-1 text-sm text-[#7B6D9B]">Students and safeguarding tickets grouped by status and RAG.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loading && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E7E2F3] bg-[#FBFAFE] px-3 py-1.5 text-xs font-semibold text-[#644D93]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#8B6BC8]" />
              Loading tickets...
            </span>
          )}
          <button
            type="button"
            onClick={onOpenTicketsPage}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D9CFF3] bg-white px-3 text-xs font-semibold text-[#6248BE] hover:bg-[#F5F1FC]"
          >
            Manage tickets
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-[#E9E3F5] p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          {(["all", "open", "closed"] as const).map((group) => {
            const isActive = statusGroup === group;
            const Icon = group === "all" ? Users : group === "open" ? ClipboardList : ClipboardCheck;
            return (
              <button
                key={group}
                type="button"
                onClick={() => onStatusGroupChange(group)}
                className={`flex min-h-[74px] items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? group === "all"
                      ? "border-[#BFAFEA] bg-[#F8F5FF] text-[#241453] shadow-sm"
                      : group === "open"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm"
                        : "border-slate-300 bg-slate-100 text-slate-800 shadow-sm"
                    : "border-[#E7E2F3] bg-white text-[#241453] hover:bg-[#F8F5FF]"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isActive
                      ? group === "all" ? "bg-white text-[#6248BE]" : group === "open" ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600"
                      : "bg-[#F4F0FC] text-[#644D93]"
                  }`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                            {group === "all" ? "All Active Students" : group === "open" ? "Open Tickets" : "Closed Tickets"}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#7B6D9B]">
                      {group === "all" ? "Current caseload" : group === "open" ? "Active ticket cases" : "Resolved ticket cases"}
                    </span>
                  </span>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  isActive
                    ? group === "all" ? "bg-white text-[#6248BE]" : group === "open" ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600"
                    : "bg-[#F4F0FC] text-[#644D93]"
                }`}>
                  {statusCounts[group]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-2xl border border-[#E9E3F5] bg-[#FCFBFE] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#7B6D9B]">
              {showingLearners ? "Student RAG" : statusGroup === "open" ? "Open ticket RAG" : "Closed ticket RAG"}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#644D93]">
              {shownCount} shown
            </span>
          </div>
          <RiskQuickFilter
            value={riskValue}
            onChange={onRiskChange}
            allLabel={showingLearners ? "All learners" : "All tickets"}
            counts={riskCounts}
          />
        </div>

        {showingLearners ? (
          <div className="mt-4">
            <LearnerTable
              rows={learners}
              onCreateFollowUp={onCreateFollowUp}
              onViewTickets={onViewLearnerTickets}
            />
          </div>
        ) : (
          <DashboardTicketsTable
            tickets={tickets}
            loading={loading}
            onView={onView}
          />
        )}
      </div>
    </div>
  );
}

function TableRowsSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="overflow-hidden">
      <div className="grid gap-4 border-b border-[#EEE8F8] bg-[#FCFBFE] px-5 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(90px, 1fr))` }}>
        {[...Array(columns)].map((_, i) => <SkeletonBlock key={i} className="h-3 w-20" />)}
      </div>
      <div className="divide-y divide-[#F1EDF8]">
        {[...Array(rows)].map((_, row) => (
          <div key={row} className="grid gap-4 px-5 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(90px, 1fr))`, opacity: 1 - row * 0.07 }}>
            {[...Array(columns)].map((_, col) => (
              <div key={col} className="space-y-2">
                <SkeletonBlock className="h-3.5 w-full max-w-[120px]" />
                {col < 2 ? <SkeletonBlock className="h-3 w-20 bg-[#F3EFFC]" /> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function WellbeingPageSkeleton({ view }: { view: WellbeingActiveView }) {
  return (
    <div id="report-area" className="min-h-screen bg-[#F8F6FC] p-3 sm:p-6">
      <div className="mb-6 rounded-[28px] bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="space-y-2">
            <h1 className="text-[24px] font-semibold leading-tight text-[#241453] sm:text-xl">
              Safeguarding & Wellbeing Dashboard
            </h1>
            <SkeletonBlock className="h-3.5 w-72 bg-[#F3EFFC]" />
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SkeletonBlock className="h-12 w-full min-w-[260px] bg-[#F3EFFC] lg:w-[300px]" />
            {view !== "dashboard" ? <SkeletonBlock className="h-12 w-44 bg-[#241453]/10" /> : <SkeletonBlock className="h-12 w-52 bg-[#F3EFFC]" />}
          </div>
        </div>
      </div>

      {view === "dashboard" ? <DashboardContentSkeleton /> : null}
      {view === "tickets" ? <TicketPageContentSkeleton title="Safeguarding Tickets" /> : null}
      {view === "onboarding" ? <TicketPageContentSkeleton title="Onboarding Tickets" /> : null}
    </div>
  );
}

export default function CoachWellbeingPage({ setMobileOpen, isDesktop }: CoachWellbeingPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const role = (localStorage.getItem("role") || "").toLowerCase();

  const [data, setData] = useState<CoachWellbeingResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(role === "qa");
  const [search, setSearch] = useState("");
  const [dashboardTicketStatusGroup, setDashboardTicketStatusGroup] = useState<TicketStatusGroup>("all");
  const [dashboardTicketRiskFilter, setDashboardTicketRiskFilter] = useState<RiskQuickValue>("all");
  const [followUpExpanded, setFollowUpExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coachOptions, setCoachOptions] = useState<CoachOption[]>([]);
  const [selectedCoachEmail, setSelectedCoachEmail] = useState<string>(
    () => localStorage.getItem("wb_coach_email") || (role === "qa" ? "__all__" : "")
  );

  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [selectedLearner, setSelectedLearner] = useState<TicketableLearnerRow | null>(null);
  const [ticketForm, setTicketForm] = useState<SupportTicketFormState>(makeInitialTicketForm());

  // tickets management state
  const activeView = useMemo(
    () => wellbeingViewFromPath(location.pathname, location.search, location.hash),
    [location.pathname, location.search, location.hash],
  );
  const [activeViewHistory, setActiveViewHistory] = useState<WellbeingActiveView[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsLoadError, setTicketsLoadError] = useState("");
  const [ticketsData, setTicketsData] = useState<SupportTicketsResponse | null>(null);
  const [ticketsSearch, setTicketsSearch] = useState("");
  const [viewTicket, setViewTicket] = useState<SupportTicketRow | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<number | null>(null);
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [createTicketSaving, setCreateTicketSaving] = useState(false);
  const [createTicketError, setCreateTicketError] = useState("");
  const [ticketFilters, setTicketFilters] = useState<TicketFilters>(emptyFilters);
  const [viewRefreshKey, setViewRefreshKey] = useState(0);
  const [editTicket, setEditTicket] = useState<SupportTicketRow | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<number | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archivedPanelOpen, setArchivedPanelOpen] = useState(false);

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

        const withAll: CoachOption[] = [{ value: "__all__", label: "All Students" }, ...deduped];
        setCoachOptions(withAll);

        setSelectedCoachEmail((prev) => {
          if (prev) return prev;
          return "__all__";
        });
      } catch (err) {
        console.error("Failed to load coach options", err);
        if (mounted) {
          setCoachOptions([]);
          setSelectedCoachEmail((prev) => prev || "__all__");
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

  const previousWellbeingViewIndex = useMemo(() => {
    for (let i = activeViewHistory.length - 1; i >= 0; i -= 1) {
      if (activeViewHistory[i] !== activeView) return i;
    }
    return -1;
  }, [activeViewHistory, activeView]);
  const previousWellbeingView = previousWellbeingViewIndex >= 0 ? activeViewHistory[previousWellbeingViewIndex] : undefined;
  const wellbeingBackTarget = activeView !== "dashboard" ? previousWellbeingView || "dashboard" : undefined;
  const wellbeingBackLabel = wellbeingBackTarget ? `Back to ${WELLBEING_VIEW_LABELS[wellbeingBackTarget]}` : "Back to Dashboard";

  function handleDashboardTicketStatusGroup(value: TicketStatusGroup) {
    setDashboardTicketStatusGroup(value);
    setDashboardTicketRiskFilter("all");
  }

  function handleDashboardTicketRiskFilter(value: RiskQuickValue) {
    setDashboardTicketRiskFilter(value);
  }

  function navigateWellbeingView(nextView: WellbeingActiveView) {
    if (nextView === activeView) return;

    setActiveViewHistory((history) => {
      const nextHistory = [...history, activeView].filter((view, index, array) => {
        return index === 0 || view !== array[index - 1];
      });
      return nextHistory.slice(-8);
    });
    navigate(wellbeingPathForView(nextView));
  }

  function goBackWellbeingView() {
    const targetView = wellbeingBackTarget || "dashboard";

    if (previousWellbeingView && previousWellbeingViewIndex >= 0) {
      navigate(wellbeingPathForView(targetView));
      setActiveViewHistory((history) => history.slice(0, previousWellbeingViewIndex));
      return;
    }

    navigate(wellbeingPathForView(targetView), { replace: true });
    setActiveViewHistory([]);
  }

  function openSafeguardingTicketsView() {
    setTicketsSearch("");
    setTicketFilters(emptyFilters);
    setTicketsLoading(true);
    navigateWellbeingView("tickets");
  }

  function openOnboardingTicketsView() {
    navigateWellbeingView("onboarding");
  }

  useEffect(() => {
    localStorage.removeItem("wb_active_view");
    localStorage.removeItem("wb_active_view_history");

    if (activeView === "dashboard") {
      setActiveViewHistory([]);
      setTicketsSearch("");
      setTicketFilters(emptyFilters);
      setDashboardTicketStatusGroup("all");
      setDashboardTicketRiskFilter("all");
      setViewTicket(null);
    }
  }, [activeView]);

  useEffect(() => { if (selectedCoachEmail) localStorage.setItem("wb_coach_email", selectedCoachEmail); }, [selectedCoachEmail]);

  // ticket management handlers
  useEffect(() => {
    let mounted = true;

    async function loadTickets() {
      if (activeView === "onboarding") return;

      if (role === "qa") {
        if (selectedCoachEmail === "") return;
      }

      try {
        setTicketsLoading(true);
        setTicketsLoadError("");

        const ticketEmailParam = selectedCoachEmail === "__all__" ? undefined : selectedCoachEmail;
        const res =
          role === "qa"
            ? await getSupportTickets(ticketEmailParam)
            : await getSupportTickets();

        if (!mounted) return;

        setTicketsData(res || { summary: { total: 0, open: 0, redRisk: 0, escalated: 0, closed: 0, avgCloseDays: null, avgCloseDelta: null }, tickets: [] });
      } catch (err: any) {
        if (!mounted) return;
        console.error("support tickets load error", err);
        setTicketsLoadError(err?.message || "Failed to load tickets");
        setTicketsData({ summary: { total: 0, open: 0, redRisk: 0, escalated: 0, closed: 0, avgCloseDays: null, avgCloseDelta: null }, tickets: [] });
      } finally {
        if (mounted) setTicketsLoading(false);
      }
    }

    loadTickets();

    return () => {
      mounted = false;
    };
  }, [activeView, role, selectedCoachEmail]);

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
        days_to_close: form.days_to_close !== "" ? Number(form.days_to_close) : undefined,
        creator_role: form.creator_role.replace(/\u200B/g, "").trim() || undefined,
      });

      const refreshEmailParam = selectedCoachEmail === "__all__" ? undefined : selectedCoachEmail;
      const refreshed =
        role === "qa"
          ? await getSupportTickets(refreshEmailParam)
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

  const selectedCoachLabel = selectedCoachEmail === "__all__"
    ? "All Students"
    : coachOptions.find((o) => o.value === selectedCoachEmail)?.label || selectedCoachEmail || undefined;

  function handleExportExcel() {
    const tickets = filteredTicketsData?.tickets || [];
    if (tickets.length === 0) return;
    exportTicketsToExcel(tickets, selectedCoachLabel);
  }

  async function handleExportPDF() {
    const tickets = filteredTicketsData?.tickets || [];
    if (tickets.length === 0) return;
    await exportTicketsToPDF(tickets, filteredTicketsData?.summary, selectedCoachLabel);
  }

  async function handleExportAllExcel() {
    try {
      const res = await getSupportTickets();
      const tickets: SupportTicketRow[] = res?.tickets || [];
      if (tickets.length === 0) return;
      exportTicketsToExcel(tickets);
    } catch (err) {
      console.error("Export all tickets failed", err);
    }
  }

  async function handleExportAllPDF() {
    try {
      const res = await getSupportTickets();
      const tickets: SupportTicketRow[] = res?.tickets || [];
      if (tickets.length === 0) return;
      exportTicketsToPDF(tickets, res?.summary);
    } catch (err) {
      console.error("Export all tickets PDF failed", err);
    }
  }

  function recalculateSummary(tickets: SupportTicketRow[], prev?: SupportTicketsResponse | null) {
    return calculateTicketSummaryFromRows(tickets, prev?.summary.avgCloseDelta ?? null);
  }

  async function handleStatusChange(ticketId: number, newStatus: string) {
    try {
      setStatusUpdating(ticketId);
      await updateSupportTicket(ticketId, { status: newStatus });

      const CLOSED = new Set(["closed", "outcome recorded"]);
      const nowIso = new Date().toISOString();

      setTicketsData((prev) => {
        if (!prev) return prev;
        const updated = prev.tickets.map((t) => {
          if (t.id !== ticketId) return t;
          const patch: Partial<SupportTicketRow> = { status: newStatus as TicketStatus };
          if (CLOSED.has(newStatus.toLowerCase())) {
            patch.closedAt = t.closedAt ?? nowIso;
            if (t.daysToClose == null) {
              const created = t.createdAt ? new Date(t.createdAt) : null;
              if (created) patch.daysOpen = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
            }
          } else {
            patch.closedAt = null;
          }
          return { ...t, ...patch };
        });
        return { ...prev, tickets: updated, summary: recalculateSummary(updated, prev) };
      });

      setViewTicket((prev) => {
        if (!prev || prev.id !== ticketId) return prev;
        const patch: Partial<SupportTicketRow> = { status: newStatus as TicketStatus };
        if (CLOSED.has(newStatus.toLowerCase())) {
          patch.closedAt = prev.closedAt ?? nowIso;
        } else {
          patch.closedAt = null;
        }
        return { ...prev, ...patch };
      });
    } catch (err) {
      console.error("Failed to update ticket status", err);
    } finally {
      setStatusUpdating(null);
    }
  }

  async function handleArchiveTicket(ticketId: number) {
    try {
      setArchiving(true);
      await archiveTicket(ticketId);
      setTicketsData((prev) => {
        if (!prev) return prev;
        const updated = prev.tickets.filter((t) => t.id !== ticketId);
        return { ...prev, tickets: updated, summary: recalculateSummary(updated, prev) };
      });
      setArchiveConfirmId(null);
    } catch (err) {
      console.error("Failed to archive ticket", err);
    } finally {
      setArchiving(false);
    }
  }

  function handleTicketUpdated(ticketId: number, changes: { risk?: string }) {
    setTicketsData((prev) => {
      if (!prev) return prev;
      const updated = prev.tickets.map((t) => {
        if (t.id !== ticketId) return t;
        return { ...t, ...(changes.risk ? { risk: changes.risk as SupportTicketRow["risk"] } : {}) };
      });
      return { ...prev, tickets: updated, summary: recalculateSummary(updated) };
    });
    setViewTicket((prev) => {
      if (!prev || prev.id !== ticketId) return prev;
      return { ...prev, ...(changes.risk ? { risk: changes.risk as SupportTicketRow["risk"] } : {}) };
    });
  }

  async function handleNotesChanged(ticketId: number) {
    if (viewTicket?.id === ticketId) {
      setViewRefreshKey((k) => k + 1);
    }
    try {
      const updatedNotes = await getTicketNotes(ticketId);
      setTicketsData((prev) => {
        if (!prev) return prev;
        const updated = prev.tickets.map((t) =>
          t.id === ticketId ? { ...t, notes: Array.isArray(updatedNotes) ? updatedNotes : t.notes, notesCount: Array.isArray(updatedNotes) ? updatedNotes.length : t.notesCount } : t
        );
        return { ...prev, tickets: updated };
      });
    } catch { }
  }

  async function handleEvidenceChanged(ticketId: number) {
    if (viewTicket?.id === ticketId) {
      setViewRefreshKey((k) => k + 1);
    }
    try {
      const updatedEvidence = await getTicketEvidence(ticketId);
      setTicketsData((prev) => {
        if (!prev) return prev;
        const updated = prev.tickets.map((t) =>
          t.id === ticketId ? { ...t, evidence: Array.isArray(updatedEvidence) ? updatedEvidence : t.evidence, evidenceCount: Array.isArray(updatedEvidence) ? updatedEvidence.length : t.evidenceCount } : t
        );
        return { ...prev, tickets: updated };
      });
    } catch { }
  }

  function handleEditSaved(ticketId: number, changes: UpdateSupportTicketPayload) {
    const riskFromUrgency = (urgency: string): SupportTicketRow["risk"] => {
      if (urgency === "high" || urgency === "urgent") return "red";
      if (urgency === "medium") return "amber";
      return "green";
    };
    setTicketsData((prev) => {
      if (!prev) return prev;
      const updated = prev.tickets.map((t) => {
        if (t.id !== ticketId) return t;
        return {
          ...t,
          ...(changes.subject ? { subject: changes.subject } : {}),
          ...(changes.details !== undefined ? { details: changes.details } : {}),
          ...(changes.urgency ? { urgency: changes.urgency, risk: riskFromUrgency(changes.urgency) } : {}),
          ...(changes.ticket_type ? { type: changes.ticket_type } : {}),
          ...(changes.preferred_contact ? { preferredContact: changes.preferred_contact } : {}),
        };
      });
      return { ...prev, tickets: updated, summary: recalculateSummary(updated) };
    });
    setViewTicket((prev) => {
      if (!prev || prev.id !== ticketId) return prev;
      return {
        ...prev,
        ...(changes.subject ? { subject: changes.subject } : {}),
        ...(changes.details !== undefined ? { details: changes.details } : {}),
        ...(changes.urgency ? { urgency: changes.urgency, risk: riskFromUrgency(changes.urgency) } : {}),
        ...(changes.ticket_type ? { type: changes.ticket_type } : {}),
        ...(changes.preferred_contact ? { preferredContact: changes.preferred_contact } : {}),
      };
    });
    setEditTicket(null);
  }

  function resetTicketModal() {
    setTicketModalOpen(false);
    setSelectedLearner(null);
    setTicketError("");
    setTicketForm(makeInitialTicketForm());
  }

  function handleCreateFollowUp(row: TicketableLearnerRow) {
    setSelectedLearner(row);
    setTicketError("");

    const now = new Date();
    const triggered = row.triggeredQuestions || [];
    const triggeredSection = triggered.length > 0
      ? `\n\nTriggered Questions:\n${triggered.map((q) => {
        const answer = q.answer ?? q.score;
        const riskScore = q.riskScore;
        const reason = q.note || (q.level === "low" ? "low answer on a positive question" : "high answer on a risk question");
        const scoreText = answer != null && riskScore != null && riskScore !== answer
          ? ` (Answer: ${answer} -> Risk: ${riskScore} - ${reason})`
          : answer != null && riskScore != null
            ? ` (Answer: ${answer}, Risk: ${riskScore} - ${reason})`
          : answer != null
            ? ` (Answer: ${answer} - ${reason})`
            : "";
        return `${q.text}${scoreText}${q.level ? ` [${q.level}]` : ""}`;
      }).join("\n")}`
      : "";
    setTicketForm({
      ticket_type: row.riskLevel === "red" ? "safeguarding" : "wellbeing",
      subject: row.recommendedAction || `Support follow up for ${row.studentName || "learner"}`,
      details: (row.followUpReason || "") + triggeredSection,
      urgency: row.riskLevel === "red" ? "high" : "medium",
      preferred_contact: "email",
      incident_date: now.toISOString().slice(0, 10),
      incident_time: now.toTimeString().slice(0, 5),
      created_by: localStorage.getItem("username") || localStorage.getItem("email") || "",
      days_to_close: "",
      creator_role: "",
    });

    setTicketModalOpen(true);
  }

  function handleViewLearnerTickets(row: TicketableLearnerRow) {
    const searchTerm = String(row.studentEmail || row.studentName || row.studentId || "").trim();
    setTicketsSearch(searchTerm);
    setTicketFilters({ ...emptyFilters, statusGroup: "all" });
    navigateWellbeingView("tickets");
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
        days_to_close: ticketForm.days_to_close !== "" ? Number(ticketForm.days_to_close) : undefined,
        creator_role: ticketForm.creator_role.replace(/\u200B/g, "").trim() || undefined,
      });

      const refreshEmailParam2 = selectedCoachEmail === "__all__" ? undefined : selectedCoachEmail;
      const refreshed =
        role === "qa"
          ? await getCoachWellbeing(refreshEmailParam2, true)
          : await getCoachWellbeing(undefined, true);
      const refreshedTickets =
        role === "qa"
          ? await getSupportTickets(refreshEmailParam2)
          : await getSupportTickets();

      setData(refreshed || emptyDashboard);
      if (refreshedTickets?.tickets) {
        setTicketsData(refreshedTickets);
      }
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
      if (activeView !== "dashboard") {
        setLoading(false);
        setData((prev) => prev || emptyDashboard);
        return;
      }

      if (role === "qa") {
        if (selectedCoachEmail === "") return;
      }

      try {
        setLoading(true);
        setError("");

        const dashEmailParam = selectedCoachEmail === "__all__" ? undefined : selectedCoachEmail;
        const res =
          role === "qa"
            ? await getCoachWellbeing(dashEmailParam, true)
            : await getCoachWellbeing(undefined, true);

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
  }, [activeView, role, selectedCoachEmail]);

  const coachScope = useMemo(() => {
    if (role === "coach") return storedUserCoachScope();
    if (role === "qa" && selectedCoachEmail && selectedCoachEmail !== "__all__") {
      const email = selectedCoachEmail.trim().toLowerCase();
      return { email, keys: [normaliseCoachIdentity(email)].filter(Boolean) };
    }
    return { email: "", keys: [] };
  }, [role, selectedCoachEmail]);

  const scopedLearners = useMemo<TicketableLearnerRow[]>(() => {
    const learners = (data?.learners || []) as TicketableLearnerRow[];
    if (!coachScope.email && coachScope.keys.length === 0) return learners;
    return learners.filter((learner) => learnerMatchesCoachScope(learner, coachScope));
  }, [data, coachScope]);

  const dashboardSummary = useMemo(() => {
    const learners = scopedLearners;
    const apiSummary = data?.summary;
    if (apiSummary && learners.length === 0) {
      return {
        caseload: apiSummary.caseload ?? 0,
        openTickets: apiSummary.openTickets ?? 0,
        atRisk: apiSummary.atRisk ?? 0,
        greenRisk: apiSummary.greenRisk ?? 0,
        nonResponders: apiSummary.nonResponders ?? 0,
      };
    }
    return {
      caseload: learners.length,
      openTickets: learners.reduce((sum, row) => sum + Number(row.openTicketCount ?? 0), 0),
      atRisk: learners.filter((row) => String(row.riskLevel || "").toLowerCase() === "red").length,
      greenRisk: learners.filter((row) => String(row.riskLevel || "").toLowerCase() === "green").length,
      nonResponders: learners.filter((row) => !hasLearnerWellbeingData(row)).length,
    };
  }, [scopedLearners, data?.summary]);

  const surveyResponsePct = useMemo(() => {
    const summaryCaseload = Number(data?.summary?.caseload ?? NaN);
    const summaryResponded = Number(data?.summary?.surveyResponded ?? NaN);
    if (Number.isFinite(summaryCaseload) && summaryCaseload > 0 && Number.isFinite(summaryResponded)) {
      return Math.round((summaryResponded / summaryCaseload) * 100);
    }
    const learners = scopedLearners;
    const total = learners.length;
    if (!total) return 0;
    const responded = learners.filter((row) => (row.surveyResponses?.length ?? 0) > 0 || Boolean(row.lastSurveyDate)).length;
    return Math.round((responded / total) * 100);
  }, [scopedLearners, data?.summary]);

  const avgWellbeing = useMemo(() => {
    if (data?.summary?.avgWellbeing != null) return data.summary.avgWellbeing;
    const learners = scopedLearners;
    const scores = learners
      .filter((l) => (l.surveyResponses?.length ?? 0) > 0)
      .map((l) => l.wellbeingScore)
      .filter((s): s is number => s != null && s > 0);
    if (!scores.length) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }, [scopedLearners, data?.summary?.avgWellbeing]);

  const scopedTicketRows = useMemo<SupportTicketRow[]>(() => {
    return ticketsData?.tickets || [];
  }, [ticketsData]);

  const dashboardLearnerSearchRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const searched = q
      ? scopedLearners.filter((learner) => learnerMatchesTextSearch(learner, q))
      : scopedLearners;

    return searched.map((learner) => {
      const matchedTickets = scopedTicketRows.filter((ticket) => ticketMatchesLearner(ticket, learner));
      const openCountFromTickets = matchedTickets.filter((ticket) => isActiveTicketStatus(ticket.status)).length;
      const closedCountFromTickets = matchedTickets.length - openCountFromTickets;
      const fallbackOpenCount = Number(learner.openTicketCount || 0);
      const openTicketCount = matchedTickets.length > 0 ? openCountFromTickets : fallbackOpenCount;
      const closedTicketCount = matchedTickets.length > 0 ? closedCountFromTickets : Number(learner.closedTicketCount || 0);

      return {
        ...learner,
        hasOpenTicket: openTicketCount > 0 || Boolean(learner.hasOpenTicket),
        openTicketCount,
        closedTicketCount,
        totalTicketCount: openTicketCount + closedTicketCount,
      };
    });
  }, [scopedLearners, scopedTicketRows, search]);

  const dashboardTotalTicketStatusCounts = useMemo<Record<TicketStatusGroup, number>>(() => {
    const closed = scopedTicketRows.filter((ticket) => !isActiveTicketStatus(ticket.status)).length;
    return {
      all: scopedLearners.length,
      open: scopedTicketRows.length - closed,
      closed,
    };
  }, [scopedLearners.length, scopedTicketRows]);

  const dashboardTicketSearchRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedTicketRows;
    return scopedTicketRows.filter((ticket) => ticketMatchesTextSearch(ticket, q));
  }, [scopedTicketRows, search]);

  const dashboardTicketStatusCounts = useMemo<Record<TicketStatusGroup, number>>(() => {
    const closed = dashboardTicketSearchRows.filter((ticket) => !isActiveTicketStatus(ticket.status)).length;
    return {
      all: dashboardLearnerSearchRows.length,
      open: dashboardTicketSearchRows.length - closed,
      closed,
    };
  }, [dashboardLearnerSearchRows.length, dashboardTicketSearchRows]);

  const dashboardTicketStatusRows = useMemo(() => {
    if (dashboardTicketStatusGroup === "all") return dashboardTicketSearchRows;
    return dashboardTicketSearchRows.filter((ticket) => {
      const isClosed = !isActiveTicketStatus(ticket.status);
      return dashboardTicketStatusGroup === "closed" ? isClosed : !isClosed;
    });
  }, [dashboardTicketSearchRows, dashboardTicketStatusGroup]);

  const dashboardLearnerRiskCounts = useMemo<Partial<Record<RiskQuickValue, number>>>(() => {
    return {
      all: dashboardLearnerSearchRows.length,
      red: dashboardLearnerSearchRows.filter((learner) => String(learner.riskLevel || "").toLowerCase() === "red").length,
      amber: dashboardLearnerSearchRows.filter((learner) => String(learner.riskLevel || "").toLowerCase() === "amber").length,
      green: dashboardLearnerSearchRows.filter((learner) => String(learner.riskLevel || "").toLowerCase() === "green").length,
    };
  }, [dashboardLearnerSearchRows]);

  const dashboardLearnerRows = useMemo(() => {
    if (dashboardTicketRiskFilter === "all") return dashboardLearnerSearchRows;
    return dashboardLearnerSearchRows.filter((learner) => (
      String(learner.riskLevel || "").toLowerCase() === dashboardTicketRiskFilter
    ));
  }, [dashboardLearnerSearchRows, dashboardTicketRiskFilter]);

  const dashboardTicketRiskCounts = useMemo<Partial<Record<RiskQuickValue, number>>>(() => {
    return {
      all: dashboardTicketStatusRows.length,
      red: dashboardTicketStatusRows.filter((ticket) => String(ticket.risk || "").toLowerCase() === "red").length,
      amber: dashboardTicketStatusRows.filter((ticket) => String(ticket.risk || "").toLowerCase() === "amber").length,
      green: dashboardTicketStatusRows.filter((ticket) => String(ticket.risk || "").toLowerCase() === "green").length,
    };
  }, [dashboardTicketStatusRows]);

  const dashboardOverviewRiskCounts = dashboardTicketStatusGroup === "all"
    ? dashboardLearnerRiskCounts
    : dashboardTicketRiskCounts;

  const dashboardTicketRows = useMemo(() => {
    if (dashboardTicketRiskFilter === "all") return dashboardTicketStatusRows;
    return dashboardTicketStatusRows.filter((ticket) => (
      String(ticket.risk || "").toLowerCase() === dashboardTicketRiskFilter
    ));
  }, [dashboardTicketStatusRows, dashboardTicketRiskFilter]);

  const dashboardTicketShownCount = dashboardTicketStatusGroup === "all"
    ? dashboardLearnerRows.length
    : dashboardTicketRows.length;

  const filteredTicketsData = useMemo<SupportTicketsResponse>(() => {
    const q = ticketsSearch.trim().toLowerCase();

    const baseTickets = scopedTicketRows;

    const tickets = baseTickets.filter((item) => {
      if (!ticketMatchesTextSearch(item, q)) return false;

      const statusValue = String(item.status || "open").toLowerCase();
      const isClosed = CLOSED_TICKET_STATUSES.has(statusValue);
      if (ticketFilters.statusGroup === "closed" && !isClosed) return false;
      if (ticketFilters.statusGroup === "open" && isClosed) return false;
      if (ticketFilters.status.length > 0 && !ticketFilters.status.includes(String(item.status || "").toLowerCase())) return false;
      if (ticketFilters.type.length > 0 && !ticketFilters.type.includes(String(item.type || "").toLowerCase())) return false;
      if (ticketFilters.risk.length > 0 && !ticketFilters.risk.includes(String(item.risk || "").toLowerCase())) return false;
      if (ticketFilters.evidence === "with" && !ticketHasEvidence(item)) return false;
      if (ticketFilters.evidence === "missing" && ticketHasEvidence(item)) return false;

      return true;
    });

    return {
      summary: calculateTicketSummaryFromRows(tickets, null),
      tickets,
    };
  }, [ticketsData, scopedTicketRows, ticketsSearch, ticketFilters]);

  const ticketStatusCounts = useMemo<Record<TicketStatusGroup, number>>(() => {
    const q = ticketsSearch.trim().toLowerCase();
    const countBase = scopedTicketRows.filter((item) => {
      if (!ticketMatchesTextSearch(item, q)) return false;
      if (ticketFilters.status.length > 0 && !ticketFilters.status.includes(String(item.status || "").toLowerCase())) return false;
      if (ticketFilters.type.length > 0 && !ticketFilters.type.includes(String(item.type || "").toLowerCase())) return false;
      if (ticketFilters.evidence === "with" && !ticketHasEvidence(item)) return false;
      if (ticketFilters.evidence === "missing" && ticketHasEvidence(item)) return false;
      return true;
    });
    const closed = countBase.filter((ticket) => CLOSED_TICKET_STATUSES.has(String(ticket.status || "open").toLowerCase())).length;
    return { all: countBase.length, open: countBase.length - closed, closed };
  }, [scopedTicketRows, ticketsSearch, ticketFilters.status, ticketFilters.type, ticketFilters.evidence]);

  const ticketRiskCounts = useMemo<Partial<Record<RiskQuickValue, number>>>(() => {
    const q = ticketsSearch.trim().toLowerCase();
    const countBase = scopedTicketRows.filter((item) => {
      if (!ticketMatchesTextSearch(item, q)) return false;
      const statusValue = String(item.status || "open").toLowerCase();
      const isClosed = CLOSED_TICKET_STATUSES.has(statusValue);
      if (ticketFilters.statusGroup === "closed" && !isClosed) return false;
      if (ticketFilters.statusGroup === "open" && isClosed) return false;
      if (ticketFilters.status.length > 0 && !ticketFilters.status.includes(String(item.status || "").toLowerCase())) return false;
      if (ticketFilters.type.length > 0 && !ticketFilters.type.includes(String(item.type || "").toLowerCase())) return false;
      if (ticketFilters.evidence === "with" && !ticketHasEvidence(item)) return false;
      if (ticketFilters.evidence === "missing" && ticketHasEvidence(item)) return false;
      return true;
    });

    return {
      all: countBase.length,
      red: countBase.filter((ticket) => String(ticket.risk || "").toLowerCase() === "red").length,
      amber: countBase.filter((ticket) => String(ticket.risk || "").toLowerCase() === "amber").length,
      green: countBase.filter((ticket) => String(ticket.risk || "").toLowerCase() === "green").length,
    };
  }, [scopedTicketRows, ticketsSearch, ticketFilters.statusGroup, ticketFilters.status, ticketFilters.type, ticketFilters.evidence]);

  const ticketEvidenceCounts = useMemo<Record<TicketEvidenceFilter, number>>(() => {
    const q = ticketsSearch.trim().toLowerCase();
    const countBase = scopedTicketRows.filter((item) => {
      if (!ticketMatchesTextSearch(item, q)) return false;
      const statusValue = String(item.status || "open").toLowerCase();
      const isClosed = CLOSED_TICKET_STATUSES.has(statusValue);
      if (ticketFilters.statusGroup === "closed" && !isClosed) return false;
      if (ticketFilters.statusGroup === "open" && isClosed) return false;
      if (ticketFilters.status.length > 0 && !ticketFilters.status.includes(statusValue)) return false;
      if (ticketFilters.type.length > 0 && !ticketFilters.type.includes(String(item.type || "").toLowerCase())) return false;
      if (ticketFilters.risk.length > 0 && !ticketFilters.risk.includes(String(item.risk || "").toLowerCase())) return false;
      return true;
    });
    const withEvidence = countBase.filter(ticketHasEvidence).length;
    return {
      all: countBase.length,
      with: withEvidence,
      missing: countBase.length - withEvidence,
    };
  }, [scopedTicketRows, ticketsSearch, ticketFilters.statusGroup, ticketFilters.status, ticketFilters.type, ticketFilters.risk]);

  const workflowLearnerKeys = useMemo(() => {
    const names = new Set<string>();
    const emails = new Set<string>();

    scopedLearners.forEach((learner) => {
      const name = String(learner.studentName || "").trim().toLowerCase();
      const email = String(learner.studentEmail || "").trim().toLowerCase();
      if (name) names.add(name);
      if (email) emails.add(email);
    });

    return { names, emails };
  }, [scopedLearners]);

  const workflowFollowUps = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = data?.followUps || [];
    const scopeIsActive = Boolean((coachScope.email || coachScope.keys.length > 0) && scopedLearners.length > 0);
    const scopedRows = scopeIsActive
      ? rows.filter((item) => workflowLearnerKeys.names.has(String(item.learnerName || "").trim().toLowerCase()))
      : rows;

    if (!q) return scopedRows;
    return scopedRows.filter((item) => (
      String(item.title || "").toLowerCase().includes(q) ||
      String(item.learnerName || "").toLowerCase().includes(q) ||
      String(item.dueDate || "").toLowerCase().includes(q) ||
      String(item.reason || "").toLowerCase().includes(q) ||
      String(item.priority || "").toLowerCase().includes(q)
    ));
  }, [data, search, coachScope, scopedLearners, workflowLearnerKeys]);

  const visibleWorkflowFollowUps = followUpExpanded
    ? workflowFollowUps
    : workflowFollowUps.slice(0, 5);

  const workflowSuggestedActions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = data?.suggestedActions || [];
    const scopeIsActive = Boolean((coachScope.email || coachScope.keys.length > 0) && scopedLearners.length > 0);
    const scopedRows = scopeIsActive
      ? rows.filter((item) => {
        const learnerName = String(item.learnerName || "").trim().toLowerCase();
        const learnerEmail = String(item.learnerEmail || "").trim().toLowerCase();
        return (
          (learnerName && workflowLearnerKeys.names.has(learnerName)) ||
          (learnerEmail && workflowLearnerKeys.emails.has(learnerEmail))
        );
      })
      : rows;

    if (!q) return scopedRows;
    return scopedRows.filter((item) => {
      const actionText = (Array.isArray(item.actions) ? item.actions : [])
        .map((action) => `${action.title || ""} ${action.description || ""} ${action.recommendedOwner || ""}`)
        .join(" ");
      return (
        String(item.learnerName || "").toLowerCase().includes(q) ||
        String(item.learnerEmail || "").toLowerCase().includes(q) ||
        String(item.urgency || "").toLowerCase().includes(q) ||
        String(item.priority || "").toLowerCase().includes(q) ||
        actionText.toLowerCase().includes(q)
      );
    });
  }, [data, search, coachScope, scopedLearners, workflowLearnerKeys]);

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
    return <WellbeingPageSkeleton view={activeView} />;
  }

  if (error && !data?.learners?.length && !data?.followUps?.length && !data?.suggestedActions?.length) {
    return (
      <div id="report-area" className="p-6">
        <div className="rounded-2xl bg-white p-8 shadow-sm text-red-600">{error}</div>
      </div>
    );
  }

  const isPageBootstrapping =
    data === null ||
    (role === "qa" && selectedCoachEmail === "");

  if (isPageBootstrapping) {
    return <WellbeingPageSkeleton view={activeView} />;
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

            {activeView !== "dashboard" && (
              <a
                href={wellbeingPathForView(wellbeingBackTarget || "dashboard")}
                onClick={() => {
                  setActiveViewHistory([]);
                }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#241453] px-5 text-sm font-medium text-white shadow-sm transition hover:bg-[#362063]"
              >
                <ArrowLeft className="h-4 w-4" />
                {wellbeingBackLabel}
              </a>
            )}

            {role === "qa" && activeView === "dashboard" && (
              <>
                <a
                  href={wellbeingPathForView("tickets")}
                  onClick={() => {
                    setTicketsSearch("");
                    setTicketFilters(emptyFilters);
                    setTicketsLoading(true);
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#a88cd9] bg-[#f9f5ff] px-5 text-sm font-medium text-[#442F73] shadow-sm transition hover:bg-[#F3EBFF] hover:border-[#866cb6]"
                >
                  <Ticket className="h-4 w-4" />
                  Safeguarding Tickets
                </a>
                <a
                  href={wellbeingPathForView("onboarding")}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#DDC398] bg-[#F9F4EC] px-5 text-sm font-medium text-[#9D6912] shadow-sm transition hover:bg-[#F3E9DA] hover:border-[#CEA869]"
                >
                  <ClipboardList className="h-4 w-4" />
                  Onboarding Tickets
                </a>
              </>
            )}

            {activeView === "dashboard" && (
              <div className="flex h-12 w-full items-center gap-2 rounded-2xl border border-[#E7E2F3] bg-[#FBFAFE] px-4 lg:min-w-[320px] lg:max-w-[460px]">
                <Search className="h-4 w-4 shrink-0 text-[#8E82AA]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tickets, learners, programme, action..."
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && data ? (
        <div className="sticky top-3 z-30 mb-4 flex justify-end">
          <LoadingBadge label="Refreshing wellbeing data..." />
        </div>
      ) : null}

      {activeView === "onboarding" ? (
        <OnboardingTicketsView
          coachEmail={role === "qa" ? (selectedCoachEmail === "__all__" ? "" : selectedCoachEmail) : coachScope.email}
        />
      ) : activeView === "dashboard" ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Active Learners"
              value={dashboardSummary.caseload}
              icon={<Users className="h-4 w-4" />}
              valueColor="text-[#0F9B8E]"
              iconBg="bg-[#E6F7F6]"
              iconColor="text-[#0F9B8E]"
              source="Calculated from the current learners returned by the wellbeing dashboard API."
            />
            <StatCard
              title="Survey Response"
              value={`${surveyResponsePct}%`}
              icon={<ClipboardCheck className="h-4 w-4" />}
              valueColor="text-[#0F9B8E]"
              iconBg="bg-[#E6F7F6]"
              iconColor="text-[#0F9B8E]"
              source="Learners with wellbeing response data divided by active learners."
            />
            <StatCard
              title="Open Tickets"
              value={ticketsLoading && !ticketsData ? "…" : ticketsData ? dashboardTotalTicketStatusCounts.open : dashboardSummary.openTickets}
              icon={<ClipboardList className="h-4 w-4" />}
              valueColor="text-amber-500"
              iconBg="bg-amber-50"
              iconColor="text-amber-500"
              source="Currently loaded safeguarding tickets whose status is not closed or outcome recorded."
            />
            <StatCard
              title="Red Risk Learners"
              value={dashboardSummary.atRisk}
              icon={<AlertTriangle className="h-4 w-4" />}
              valueColor="text-red-500"
              iconBg="bg-red-50"
              iconColor="text-red-500"
              source="Learners where riskLevel is red."
            />
            <StatCard
              title="Green Risk Learners"
              value={dashboardSummary.greenRisk}
              icon={<Shield className="h-4 w-4" />}
              valueColor="text-[#3D7A55]"
              iconBg="bg-[#F2FAF6]"
              iconColor="text-[#3D7A55]"
              source="Learners where riskLevel is green."
            />
            <StatCard
              title="Avg Wellbeing"
              value={avgWellbeing ?? "—"}
              icon={<Heart className="h-4 w-4" />}
              valueColor={wellbeingRiskTextColor(avgWellbeing)}
              iconBg="bg-[#E6F7F6]"
              iconColor="text-[#0F9B8E]"
              source="Average emotional stress and resilience score across learner rows with a score."
            />
          </div>

          <DashboardTicketOverview
            statusGroup={dashboardTicketStatusGroup}
            onStatusGroupChange={handleDashboardTicketStatusGroup}
            riskValue={dashboardTicketRiskFilter}
            onRiskChange={handleDashboardTicketRiskFilter}
            statusCounts={dashboardTicketStatusCounts}
            riskCounts={dashboardOverviewRiskCounts}
            shownCount={dashboardTicketShownCount}
            tickets={dashboardTicketRows}
            learners={dashboardLearnerRows}
            loading={ticketsLoading}
            onView={setViewTicket}
            onCreateFollowUp={handleCreateFollowUp}
            onViewLearnerTickets={handleViewLearnerTickets}
            onOpenTicketsPage={openSafeguardingTicketsView}
          />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6 xl:h-[420px]">
              <div className="flex h-full flex-col">
                <h2 className="mb-5 shrink-0 text-md font-semibold text-[#241453]">
                  Learners Needing Follow-up
                </h2>

                <div className="custom-scroll min-h-0 flex-1 overflow-y-auto pr-2">
                  <div className="space-y-4">
                    {workflowFollowUps.length === 0 ? (
                      <div className="rounded-2xl border border-[#ECE7F7] p-4 text-sm text-slate-500">
                        No follow-ups yet
                      </div>
                    ) : (
                      visibleWorkflowFollowUps.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-[#ECE7F7] bg-[#FCFBFE] p-4"
                        >
                          <div className="flex items-start gap-3">
                            <span className={priorityBadgeClass(item.priority)}>
                              {item.priority}
                            </span>

                            <div className="min-w-0 flex-1">
                              <h3 className="min-w-0 flex-1 text-sm font-semibold leading-6 text-[#241453] sm:text-base">
                                {item.title}
                              </h3>

                              <p className="text-sm text-[#7B6D9B]">
                                {item.learnerName}, Due: {item.dueDate}
                              </p>

                              {item.reason ? (
                                <p className="mt-1 text-sm leading-6 text-slate-500">
                                  {item.reason}
                                </p>
                              ) : null}
                            </div>

                            <span className="self-end text-[#7B6D9B] sm:self-auto" aria-hidden="true">
                              <ChevronRight className="h-5 w-5" />
                            </span>
                          </div>
                        </div>
                      ))
                    )}

                    {workflowFollowUps.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setFollowUpExpanded((prev) => !prev)}
                        className="w-full rounded-2xl border border-[#D9CFF3] bg-white py-3 text-sm font-semibold text-[#6248BE] hover:bg-[#F5F1FC]"
                      >
                        {followUpExpanded ? "Show top 5" : `View all ${workflowFollowUps.length}`}
                      </button>
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
                    {workflowSuggestedActions.length === 0 ? (
                      <div className="rounded-2xl border border-[#ECE7F7] p-4 text-sm text-slate-500">
                        No suggested actions yet
                      </div>
                    ) : (
                      workflowSuggestedActions.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-[#ECE7F7] bg-[#FCFBFE] p-4"
                        >
                          <div className="mb-3 flex items-center gap-2">
                            <span className={priorityBadgeClass(item.priority)}>
                              {item.urgency || item.priority}
                            </span>
                            <span className="text-sm font-semibold text-[#241453]">
                              {item.learnerName || "Learner"}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {(Array.isArray(item.actions) ? item.actions : []).map((action) => (
                              <div
                                key={action.id}
                                className="rounded-xl border border-[#EEE8F8] bg-white p-3"
                              >
                                <div className="flex items-start gap-2">
                                  <span className={`${priorityBadgeClass(action.priority)} mt-0.5 shrink-0`}>
                                    {action.priority}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-[#241453]">
                                      {action.title}
                                    </p>
                                    {action.description && (
                                      <p className="mt-0.5 text-xs leading-5 text-slate-500">
                                        {action.description}
                                      </p>
                                    )}
                                    {action.recommendedOwner && (
                                      <p className="mt-1 text-[11px] text-[#7B6D9B]">
                                        Owner: {action.recommendedOwner}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-md font-semibold text-[#241453]">Caseload Trends</h2>
                <p className="mt-1 text-sm text-[#7B6D9B]">Number of learners surveyed per month, by risk level.</p>
              </div>
            </div>

            <div className="mt-5 h-[320px]">
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
                      dx: -10,
                      dy: -21,
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

                  <Bar dataKey="red" name="At Risk" stackId="a" fill="#EF4444" radius={[0, 0, 3, 3]} />
                  <Bar dataKey="amber" name="Moderate" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="green" name="Safe" stackId="a" fill="#10B981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <>
          {ticketsLoadError && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
              <span className="font-semibold">Error loading tickets:</span> {ticketsLoadError}
            </div>
          )}
          <TicketsManagementView
            loading={ticketsLoading}
            search={ticketsSearch}
            onSearchChange={setTicketsSearch}
            ticketsData={filteredTicketsData}
            riskCounts={ticketRiskCounts}
            evidenceCounts={ticketEvidenceCounts}
            statusCounts={ticketStatusCounts}
            onView={setViewTicket}
            onStatusChange={handleStatusChange}
            statusUpdating={statusUpdating}
            onCreateTicket={() => setCreateTicketOpen(true)}
            filters={ticketFilters}
            onFiltersChange={setTicketFilters}
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            onExportAllExcel={handleExportAllExcel}
            onExportAllPDF={handleExportAllPDF}
            onEdit={setEditTicket}
            onTicketUpdated={handleTicketUpdated}
            onNotesChanged={handleNotesChanged}
            onEvidenceChanged={handleEvidenceChanged}
            role={role}
            onArchive={(id) => setArchiveConfirmId(id === 0 ? null : id)}
            archiveConfirmId={archiveConfirmId}
            archiving={archiving}
            onArchiveConfirm={handleArchiveTicket}
            onArchivedOpen={() => setArchivedPanelOpen(true)}
          />
          {archivedPanelOpen && (
            <ArchivedTicketsPanel
              coachEmail={selectedCoachEmail && selectedCoachEmail !== "__all__" ? selectedCoachEmail : undefined}
              onClose={() => setArchivedPanelOpen(false)}
              onRestored={() => {
                setArchivedPanelOpen(false);
                getSupportTickets(selectedCoachEmail && selectedCoachEmail !== "__all__" ? selectedCoachEmail : undefined)
                  .then((data: any) => { if (data?.tickets) setTicketsData(data); })
                  .catch(() => {});
              }}
            />
          )}
        </>
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
        refreshKey={viewRefreshKey}
      />

      <EditTicketModal
        ticket={editTicket}
        onClose={() => setEditTicket(null)}
        onSaved={handleEditSaved}
      />

      <CreateTicketModal
        open={createTicketOpen}
        learners={scopedLearners}
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
