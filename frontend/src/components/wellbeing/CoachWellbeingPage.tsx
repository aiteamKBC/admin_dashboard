import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

import { getCoachWellbeing, getCoachOptions, createSupportTicket, getSupportTickets, updateSupportTicket, deleteTicket, createTicketNote, uploadEvidenceFile, createTicketEvidence, getTicketNotes, getTicketEvidence, createBookingAppointment, getBookingServices, getBookingAvailability, getBookingStaff } from "@/services/coachWellbeing";
import type { UpdateSupportTicketPayload } from "@/services/coachWellbeing";
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
  days_to_close: number | "";
  creator_role: string;
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
  daysToClose?: number | null;
  closedAt?: string | null;
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
    avgCloseDays: number | null;
    avgCloseDelta: number | null;
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
  // learner-side fields
  uploaded_by?: string;
  url?: string;
  original_name?: string;
  mime_type?: string;
};

function isLearnerEvidence(ev: TicketEvidenceRow) { return ev.uploaded_by === "learner"; }
function evFileUrl(ev: TicketEvidenceRow) { return resolveMediaUrl(ev.file_url || ev.url || ""); }
function evFileName(ev: TicketEvidenceRow) { return ev.file_name || ev.original_name || ""; }
function evIsImage(ev: TicketEvidenceRow) {
  const mime = ev.mime_type || "";
  const name = evFileName(ev).toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
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

// Resolves relative /media/... URLs to absolute using the media base URL
const MEDIA_BASE = (
  (import.meta as any).env?.VITE_MEDIA_URL ||
  (import.meta as any).env?.VITE_API_ORIGIN ||
  ""
).toString().trim();
function resolveMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${MEDIA_BASE}${url}`;
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
  delta,
  unit,
  valueColor,
  iconBg,
  iconColor,
  trendLabel,
  trendPositiveIsGood = true,
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
}) {
  const trendColor = delta == null
    ? "text-slate-400"
    : trendPositiveIsGood
      ? delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-400"
      : delta > 0 ? "text-red-500" : delta < 0 ? "text-emerald-600" : "text-slate-400";

  return (
    <div className="rounded-2xl border border-[#E7E2F3] bg-white p-5 shadow-sm">
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

type TriggeredQuestion = { text: string; score?: number | null; level?: string; note?: string };

function scoreBadgeClass(score?: number | null) {
  if (score == null) return "bg-slate-100 text-slate-500";
  if (score >= 7) return "bg-red-100 text-red-700";
  if (score >= 4) return "bg-amber-100 text-amber-700";
  return "bg-green-100 text-green-700";
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
              className="fixed z-[91] w-96 max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-[#E9E3F5] bg-white shadow-xl"
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
                <ol className="space-y-2">
                  {questions.map((q, i) => (
                    <li key={i} className="rounded-xl border border-[#F1EDF8] bg-[#FFF8F8] px-3 py-2.5">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FDE7E7] text-[10px] font-bold text-[#D92D20]">
                          {i + 1}
                        </span>
                        <span className="text-sm leading-snug text-[#241453]">{q.text}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                        {q.score != null && (
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${scoreBadgeClass(q.score)}`}>
                            Score: {q.score}
                          </span>
                        )}
                        {q.level && (
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${q.level === "high" ? "bg-red-50 text-red-600" :
                              q.level === "medium" ? "bg-amber-50 text-amber-600" :
                                "bg-green-50 text-green-600"
                            }`}>
                            {q.level} Risk
                          </span>
                        )}
                        {q.note && <span className="text-[11px] italic text-slate-400">{q.note}</span>}
                      </div>
                    </li>
                  ))}
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
  return /^https?:\/\//i.test(s.trim());
}

// Keys whose values should be rendered as a prominent bold title line
const TITLE_KEYS = new Set(["title", "name", "heading", "label"]);

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
          const label = k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
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
  if (!learner) return null;
  const data = (learner as any).apprenticeDashboard as Record<string, unknown> | undefined;
  const hasData = data && Object.keys(data).length > 0;

  // Group top-level keys into sections
  const entries = hasData ? Object.entries(data!) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#EEE8F8] bg-[#FAFAFF] px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#7B6D9B]">Learner Safeguarding Report</div>
            <div className="mt-0.5 text-base font-bold text-[#241453]">{learner.studentName}</div>
            <div className="text-xs text-slate-500">{learner.studentEmail}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportApprenticeToPDF(learner)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6CCF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#644D93] shadow-sm hover:bg-[#F5F1FC]"
            >
              <FilePdf className="h-3.5 w-3.5" />
              Export PDF
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-[#F5F1FC] hover:text-[#241453]">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="grid grid-cols-3 gap-px border-b border-[#EEE8F8] bg-[#EEE8F8]">
          {[
            { label: "Risk", value: learner.riskLevel, badge: true },
            { label: "Total Score", value: learner.totalScore != null ? String(learner.totalScore) : "—" },
            { label: "Triggers", value: learner.triggerCount != null ? String(learner.triggerCount) : "0" },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7B6D9B]">{s.label}</div>
              {s.badge ? (
                <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${riskBadgeClass(learner.riskLevel)}`}>
                  {learner.riskLevel}
                </span>
              ) : (
                <div className="mt-1 text-lg font-bold text-[#241453]">{s.value}</div>
              )}
            </div>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <FileText className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">No report data available for this learner yet.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {entries.map(([key, value]) => (
                <div key={key} className="rounded-xl border border-[#EEE8F8] bg-[#FAFAFF] p-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#644D93]">
                    {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}
                  </div>
                  <div className="text-sm">{renderReportValue(value)}</div>
                </div>
              ))}
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
  onOpenTicket,
}: {
  rows: TicketableLearnerRow[];
  onOpenTicket: (row: TicketableLearnerRow) => void;
}) {
  const [reportLearner, setReportLearner] = React.useState<TicketableLearnerRow | null>(null);
  const [referralLearner, setReferralLearner] = React.useState<TicketableLearnerRow | null>(null);
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
              <th className="px-4 py-3 whitespace-nowrap">Triggered</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3 whitespace-nowrap">Reports</th>
              <th className="px-4 py-3 whitespace-nowrap">Referral</th>
              <th className="px-4 py-3 last:pr-5">Follow up</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3EFF9]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-5 py-10 text-center text-sm text-slate-400">
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
                      <button
                        type="button"
                        onClick={() => onOpenTicket(row)}
                        className={`inline-flex h-9 items-center justify-center rounded-xl px-4 text-xs font-semibold transition whitespace-nowrap ${hasOpenTicket
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
  start_review: Eye,
  assign_owner: UserCheck,
  case_note: FileText,
  contact_learner: MessageCircle,
  contact_coach: Phone,
  request_info: HelpCircle,
  schedule_followup: Calendar,
  add_evidence: Paperclip,
  change_risk: AlertTriangle,
  support_plan: Shield,
  escalate: AlertOctagon,
  external_referral: ExternalLink,
  record_outcome: ClipboardCheck,
  close_case: XCircle,
  reopen_case: RotateCcw,
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
  onTicketUpdated,
  onNotesChanged,
  onEvidenceChanged,
}: {
  ticket: SupportTicketRow;
  onChange: (ticketId: number, newStatus: string) => void;
  updating: boolean;
  onTicketUpdated?: (ticketId: number, changes: { risk?: string }) => void;
  onNotesChanged?: (ticketId: number) => void;
  onEvidenceChanged?: (ticketId: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0, maxH: 320 });
  const [activeModal, setActiveModal] = React.useState<ActionModalType>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const currentStatus = String(ticket.status || "").toLowerCase();

  const MENU_W = 288; // w-72

  const calcPos = React.useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const HEADER_H = 44;

    let top: number;
    let maxH: number;
    if (spaceBelow >= spaceAbove || spaceBelow >= 180) {
      maxH = Math.min(420, Math.max(120, spaceBelow - 8));
      top = rect.bottom + 4;
    } else {
      maxH = Math.min(420, Math.max(120, spaceAbove - HEADER_H - 8));
      top = Math.max(8, rect.top - HEADER_H - maxH - 4);
    }

    // align right edge with button, clamp inside viewport
    let left = rect.right - MENU_W;
    if (left < 8) left = 8;
    if (left + MENU_W > window.innerWidth - 8) left = window.innerWidth - MENU_W - 8;

    setPos({ top, left, maxH });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    // recalculate on any scroll or resize so the menu follows the button
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open, calcPos]);

  function handleToggle() {
    if (!open) calcPos();
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
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_W }}
            className="z-[110] overflow-hidden rounded-2xl border border-[#E6DDF8] bg-white shadow-[0_12px_32px_rgba(36,20,83,0.18)]"
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
                    const isDanger = item.danger;
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
          onConfirm={(newStatus, extra) => {
            if (newStatus) onChange(ticket.id, newStatus);
            if (extra?.risk) onTicketUpdated?.(ticket.id, { risk: extra.risk });
            if (extra?.notesChanged) onNotesChanged?.(ticket.id);
            if (extra?.evidenceChanged) onEvidenceChanged?.(ticket.id);
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
  onConfirm: (newStatus?: string, extra?: { risk?: string; notesChanged?: boolean; evidenceChanged?: boolean }) => void;
}) {
  const [note, setNote] = React.useState("");
  const [contactMethod, setContactMethod] = React.useState("email");
  const [followupDate, setFollowupDate] = React.useState("");
  const [followupTime, setFollowupTime] = React.useState("");
  const [followupDuration, setFollowupDuration] = React.useState(60);
  const [followupReason, setFollowupReason] = React.useState("");
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const [bookingJoinUrl, setBookingJoinUrl] = React.useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = React.useState<"idle" | "booked" | "error">("idle");
  const [bookingError, setBookingError] = React.useState("");
  const [bookingServices, setBookingServices] = React.useState<{ id: string; displayName: string }[]>([]);
  const [selectedServiceId, setSelectedServiceId] = React.useState("");
  const [availableSlots, setAvailableSlots] = React.useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [bookingStaff, setBookingStaff] = React.useState<{ id: string; displayName: string }[]>([]);
  const [selectedStaffId, setSelectedStaffId] = React.useState("");
  const [staffLoading, setStaffLoading] = React.useState(false);
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

  // Auto-select the Safeguarding service when modal opens
  React.useEffect(() => {
    if (type === "schedule_followup" && !selectedServiceId) {
      setSelectedServiceId("7730f8e4-c0e4-4ba6-ba5e-8da5dbea5b5f");
    }
  }, [type]);

  // Fetch staff members when service is selected
  React.useEffect(() => {
    if (type !== "schedule_followup" || !selectedServiceId) return;
    setBookingStaff([]);
    setSelectedStaffId("");
    setStaffLoading(true);
    getBookingStaff(selectedServiceId)
      .then((staff) => {
        setBookingStaff(staff);
        if (staff.length === 1) setSelectedStaffId(staff[0]?.id ?? "");
      })
      .catch(() => setBookingStaff([]))
      .finally(() => setStaffLoading(false));
  }, [selectedServiceId, type]);

  // Fetch available slots when service + date both set
  React.useEffect(() => {
    if (type !== "schedule_followup" || !selectedServiceId || !followupDate) return;
    setSlotsLoading(true);
    setAvailableSlots([]);
    setFollowupTime("");
    getBookingAvailability(selectedServiceId, followupDate)
      .then((data) => {
        setAvailableSlots(data.slots || []);
        if (data.duration) setFollowupDuration(data.duration);
      })
      .catch(() => { setAvailableSlots([]); })
      .finally(() => setSlotsLoading(false));
  }, [selectedServiceId, followupDate]);

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
        onConfirm(undefined, { notesChanged: true });
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
        onConfirm(undefined, { evidenceChanged: true });
        return;
      }

      if (type === "schedule_followup") {
        const timeTag = followupTime ? ` at ${followupTime}` : "";

        // Try to create the booking via API
        let reservationConfirmed = false;
        let bookingAttempted = false;
        if (followupDate && followupTime && selectedServiceId) {
          bookingAttempted = true;
          try {
            const result = await createBookingAppointment({
              date: followupDate,
              time: followupTime,
              service_id: selectedServiceId,
              staff_member_id: selectedStaffId || undefined,
              customer_name: ticket.learnerName || "",
              customer_email: ticket.learnerEmail || "",
              notes: followupReason.trim() || undefined,
            });
            // reservationConfirmed=true means Graph created it directly
            // reservationConfirmed=false (202) means pending via webhook fallback
            reservationConfirmed = result?.reservationConfirmed === true;
          } catch {
            // Hard failure — open booking page as last resort
          }
        }

        const noteText = `📅 Follow-up scheduled for ${followupDate}${timeTag}${followupReason.trim() ? ` — ${followupReason.trim()}` : ""}`;
        await createTicketNote(ticket.id, noteText);

        // Open booking page only if booking failed completely (no confirmation AND no webhook)
        if (bookingAttempted && !reservationConfirmed) {
          window.open("https://outlook.office.com/bookings/s/StudentSupport1@kentbusinesscollege.com", "_blank");
        }

        onConfirm("follow-up scheduled", { notesChanged: true });
        return;
      }

      if (type === "change_risk") {
        const urgencyMap: Record<string, string> = {
          red: "high", amber: "medium", green: "low", critical: "urgent",
        };
        const newUrgency = urgencyMap[riskLevel] || "medium";
        await updateSupportTicket(ticket.id, { urgency: newUrgency });
        const noteText = `🔴 Risk level changed to ${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}${note.trim() ? ` — ${note.trim()}` : ""}`;
        await createTicketNote(ticket.id, noteText);
        onConfirm(undefined, { risk: riskLevel, notesChanged: true });
        return;
      }

      if (type === "contact_learner" || type === "contact_coach") {
        const label = type === "contact_learner" ? "Learner" : "Coach";
        const noteText = `📞 Contacted ${label} via ${contactMethod}${note.trim() ? ` — ${note.trim()}` : ""}`;
        await createTicketNote(ticket.id, noteText);
        onConfirm(statusChanges[type], { notesChanged: true });
        return;
      }

      if (type === "support_plan") {
        const noteText = `📋 Support Plan: ${planDetails.trim()}${note.trim() ? `\nKey Actions: ${note.trim()}` : ""}`;
        await createTicketNote(ticket.id, noteText);
        onConfirm("support plan active", { notesChanged: true });
        return;
      }

      if (type === "escalate") {
        const noteText = `⚠️ Escalated to ${escalateTo} — ${escalateReason.trim()}`;
        await createTicketNote(ticket.id, noteText);
        onConfirm("escalated", { notesChanged: true });
        return;
      }

      if (type === "external_referral") {
        const noteText = `🔗 External Referral: ${referralOrg.trim()} (${referralType})${note.trim() ? ` — ${note.trim()}` : ""}`;
        await createTicketNote(ticket.id, noteText);
        onConfirm("external referral made", { notesChanged: true });
        return;
      }

      if (type === "record_outcome") {
        const noteText = `✅ Outcome: ${resolutionType} — ${outcomeDesc.trim()}`;
        await createTicketNote(ticket.id, noteText);
        onConfirm("outcome recorded", { notesChanged: true });
        return;
      }

      if (type === "close_case") {
        await createTicketNote(ticket.id, "🔒 Case closed. All checklist items confirmed.");
        onConfirm("closed", { notesChanged: true });
        return;
      }

      onConfirm(statusChanges[type as unknown as Exclude<ActionModalType, null>]);
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
            {/* Booking service (fixed) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-[#241453]">Booking Service</label>
              <div className="h-11 flex items-center rounded-xl border border-[#DED5F3] bg-[#FAFAFF] px-3 text-sm text-[#644d93] font-medium">
                Safeguarding — Student Support Calendar
              </div>
            </div>

            {/* Learner email (read-only) */}
            {ticket.learnerEmail && (
              <div>
                <label className="mb-1 block text-sm font-medium text-[#241453]">Learner Email</label>
                <div className="h-11 flex items-center rounded-xl border border-[#DED5F3] bg-[#FAFAFF] px-3 text-sm text-[#555]">
                  {ticket.learnerEmail}
                </div>
              </div>
            )}

            {/* Staff member dropdown */}
            {(staffLoading || bookingStaff.length > 0) && (
              <div>
                <label className="mb-1 block text-sm font-medium text-[#241453]">Assign Staff Member</label>
                {staffLoading ? (
                  <div className="h-11 flex items-center gap-2 rounded-xl border border-[#DED5F3] bg-[#FAFAFF] px-3 text-sm text-[#9D8EC7]">
                    <svg className="h-4 w-4 animate-spin shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Loading staff…
                  </div>
                ) : (
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none bg-white"
                  >
                    <option value="">— Any available staff —</option>
                    {bookingStaff.map((s) => (
                      <option key={s.id} value={s.id}>{s.displayName}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Date picker */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Follow-up Date *</label>
              <input type="date" value={followupDate} onChange={(e) => { setFollowupDate(e.target.value); setFollowupTime(""); }}
                className="h-11 w-full rounded-xl border border-[#DED5F3] px-3 text-sm outline-none" />
            </div>

            {/* Available time slots */}
            {selectedServiceId && followupDate && (
              <div>
                <label className="mb-2 block text-sm font-medium text-[#241453]">
                  Available Times <span className="font-normal text-[#9D8EC7] text-xs">(UK time{followupDuration > 0 ? ` · ${followupDuration} min` : ""})</span>
                </label>
                {slotsLoading ? (
                  <div className="rounded-xl border border-[#DED5F3] px-3 py-3 text-sm text-[#9D8EC7]">Loading available slots…</div>
                ) : availableSlots.length === 0 ? (
                  <div className="rounded-xl border border-[#EEE8F8] bg-[#FAFAFF] px-3 py-3 text-sm text-[#9D8EC7]">No available slots for this date. Try another day.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableSlots.map((slot) => (
                      <button key={slot} type="button" onClick={() => setFollowupTime(slot)}
                        className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${followupTime === slot ? "border-[#644d93] bg-[#644d93] text-white" : "border-[#DED5F3] text-[#241453] hover:bg-[#F9F5FF]"}`}>
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[#241453]">Purpose / Reason</label>
              <textarea value={followupReason} onChange={(e) => setFollowupReason(e.target.value)} rows={3}
                placeholder="Reason for follow-up..."
                className="w-full rounded-xl border border-[#DED5F3] px-3 py-3 text-sm outline-none" />
            </div>

            {/* Info */}
            {followupDate && followupTime ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#C5B8E8] bg-[#F0EAFF] px-4 py-3 text-sm text-[#644d93]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Confirming will save a case note and open the <strong>Student Support Booking Page</strong> to complete the appointment.</span>
              </div>
            ) : (
              <div className="rounded-xl border border-[#EEE8F8] bg-[#FAFAFF] px-4 py-3 text-sm text-[#9D8EC7]">
                Select a date to see available time slots.
              </div>
            )}
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
              <label className="mb-2 block text-sm font-medium text-[#241453]">Attachment (optional)</label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#DED5F3] p-5 transition hover:bg-[#FAFAFF]">
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setEvidenceFile(file);
                    if (file && file.type.startsWith("image/")) {
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
                    <span className="text-sm text-[#7B6D9B]">Click to upload a file</span>
                    <span className="text-xs text-[#B8AACC]">Image, PDF, Word, Excel, PowerPoint</span>
                  </>
                )}
              </label>
              {evidenceFile && (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-[#DED5F3] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {evidenceFile.type.startsWith("image/") ? (
                      <ImageIcon className="h-4 w-4 shrink-0 text-[#8E82AA]" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-[#8E82AA]" />
                    )}
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
            className={`rounded-xl px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-60 ${isDanger ? "bg-red-600 hover:bg-red-700" : "bg-[#241453] hover:bg-[#362063]"
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
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

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
        {notes.length}
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
              <span className="text-[10px] text-[#B8AACC]">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
            </div>
            <div ref={listRef} className="custom-scroll space-y-2 overflow-y-auto p-3">
              {notes.map((n, i) => (
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

function TicketEvidencePopover({ evidence }: { evidence: TicketEvidenceRow[] }) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

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
        {evidence.length}
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
              <span className="text-[10px] text-[#B8AACC]">{evidence.length} item{evidence.length !== 1 ? "s" : ""}</span>
            </div>
            <div ref={listRef} className="custom-scroll space-y-3 overflow-y-auto p-3">
              {evidence.map((ev, i) => (
                <div key={ev.id ?? i} className="overflow-hidden rounded-xl border border-[#EEE8F8]">
                  {ev.file_url && (
                    <a href={resolveMediaUrl(ev.file_url)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      <img
                        src={resolveMediaUrl(ev.file_url)}
                        alt={ev.description || ev.file_name || "Evidence"}
                        className="max-h-44 w-full object-cover transition hover:opacity-90"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </a>
                  )}
                  <div className="p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium text-[#8E82AA]">{ev.created_by || "Coach"}</span>
                      <span className="shrink-0 text-[10px] text-[#B8AACC]">{ev.created_at ? formatTicketDate(ev.created_at) : ""}</span>
                    </div>
                    {ev.description && <p className="text-sm text-[#241453]">{ev.description}</p>}
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
        </>,
        document.body
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
    red: "High risk – immediate action required.",
    amber: "Moderate risk – monitoring and support recommended.",
    green: "Low risk – continue current support.",
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
  const scoreVal = learner.totalScore != null ? `${learner.totalScore} / 10` : "-";
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
  doc.text("Indicates moderate risk.", scoreX + 7, statsY + 24);

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

  React.useEffect(() => {
    if (!ticket) { setNotes([]); setEvidence([]); return; }
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
                            <a
                              href={resolveMediaUrl(ev.file_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#6248BE] hover:underline"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              {ev.file_name || "View file"}
                            </a>
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
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={fileUrl}
                                alt={fileName || "Learner evidence"}
                                className="max-h-44 w-full object-cover transition hover:opacity-90"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            </a>
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
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#EEF4FF] px-2.5 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-[#DBEAFE] transition"
                                >
                                  <ImageIcon className="h-3 w-3" />
                                  View
                                </a>
                                <a
                                  href={fileUrl}
                                  download={fileName || true}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#F0FDF4] px-2.5 py-1.5 text-xs font-medium text-[#047857] hover:bg-[#DCFCE7] transition"
                                >
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11" />
                                  </svg>
                                  Download
                                </a>
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
  onExportExcel,
  onExportPDF,
  onExportAllExcel,
  onExportAllPDF,
  onEdit,
  onTicketUpdated,
  onNotesChanged,
  onEvidenceChanged,
  role,
  onDelete,
  deleteConfirmId,
  deleting,
  onDeleteConfirm,
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
  onExportExcel: () => void;
  onExportPDF: () => void;
  onExportAllExcel: () => void;
  onExportAllPDF: () => void;
  onEdit: (ticket: SupportTicketRow) => void;
  onTicketUpdated: (ticketId: number, changes: { risk?: string }) => void;
  onNotesChanged: (ticketId: number) => void;
  onEvidenceChanged: (ticketId: number) => void;
  role?: string;
  onDelete: (id: number) => void;
  deleteConfirmId: number | null;
  deleting: boolean;
  onDeleteConfirm: (id: number) => void;
}) {
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const canView = (role || "").toLowerCase() === "qa";
  const isQA = canView;
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
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E7E2F3] px-4 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                >
                  <FileDown className="h-4 w-4" />
                  Export
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
                        Selected Coach
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
                        All Tickets — Excel
                      </button>
                      <button
                        type="button"
                        onClick={() => { setExportOpen(false); onExportAllPDF(); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                      >
                        <FilePdf className="h-4 w-4 text-red-500" />
                        All Tickets — PDF
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard title="Total" value={ticketsData?.summary?.total ?? 0} icon={<Ticket className="h-4 w-4" />} />
          <StatCard title="Open" value={ticketsData?.summary?.open ?? 0} icon={<ClipboardList className="h-4 w-4" />} />
          <StatCard title="Red Risk" value={ticketsData?.summary?.redRisk ?? 0} icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard title="Escalated" value={ticketsData?.summary?.escalated ?? 0} icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard title="Closed" value={ticketsData?.summary?.closed ?? 0} icon={<ClipboardList className="h-4 w-4" />} />
          <StatCard
            title="Avg Close Time"
            value={ticketsData?.summary?.avgCloseDays ?? "—"}
            unit={ticketsData?.summary?.avgCloseDays != null ? "days" : undefined}
            delta={ticketsData?.summary?.avgCloseDelta ?? null}
            icon={<ClipboardList className="h-4 w-4" />}
          />
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-[#E9E3F5]">
          <div className="custom-scroll overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <table className="w-full min-w-[1250px] text-sm">
              <thead className="sticky top-0 z-10 bg-[#FCFBFE]">
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
                  <th className="px-5 py-4 font-medium">Edit</th>
                  {isQA && <th className="px-5 py-4 font-medium">Delete</th>}
                  {canView && <th className="px-5 py-4 font-medium">View</th>}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={(canView ? 1 : 0) + (isQA ? 1 : 0) + 13} className="px-5 py-8 text-center text-slate-500">
                      Loading tickets...
                    </td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={(canView ? 1 : 0) + (isQA ? 1 : 0) + 13} className="px-5 py-8 text-center text-slate-500">
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

                      <td className="px-5 py-4 text-slate-600">{item.createdBy === "learner" ? "Dashboard" : item.source || "-"}</td>
                      <td className="px-5 py-4 text-slate-600">{formatTicketDate(item.createdAt)}</td>
                      <td className="px-5 py-4 text-slate-600">{item.createdBy || "-"}</td>

                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${ticketStatusBadgeClass(item.status)}`}>
                          {item.status || "-"}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-[#241453]">{item.daysToClose ?? item.daysOpen ?? 0}</td>

                      <td className="px-5 py-4">
                        {(item.notes?.length ?? 0) > 0 ? (
                          <TicketNotesPopover notes={item.notes!} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {(() => {
                          const coachEv = (item.evidence ?? []).filter(e => !isLearnerEvidence(e));
                          return coachEv.length > 0 ? (
                            <TicketEvidencePopover evidence={coachEv} />
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
                          {deleteConfirmId === item.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onDeleteConfirm(item.id)}
                                disabled={deleting}
                                className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                              >
                                {deleting ? "..." : "Yes"}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDelete(0)}
                                disabled={deleting}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onDelete(item.id)}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        setTicketsLoadError("");

        const res =
          role === "qa"
            ? await getSupportTickets(selectedCoachEmail)
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
        days_to_close: form.days_to_close !== "" ? Number(form.days_to_close) : undefined,
        creator_role: form.creator_role.replace(/\u200B/g, "").trim() || undefined,
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

  const selectedCoachLabel = coachOptions.find((o) => o.value === selectedCoachEmail)?.label || selectedCoachEmail || undefined;

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
    const CLOSED = new Set(["closed", "outcome recorded"]);
    const closedVals = tickets
      .filter((t) => CLOSED.has(String(t.status).toLowerCase()))
      .map((t) => t.daysToClose ?? t.daysOpen ?? 0);
    const avgCloseDays =
      closedVals.length > 0
        ? Math.round((closedVals.reduce((a, b) => a + b, 0) / closedVals.length) * 10) / 10
        : null;
    return {
      total: tickets.length,
      open: tickets.filter((t) => String(t.status).toLowerCase() === "open").length,
      redRisk: tickets.filter((t) => String(t.risk).toLowerCase() === "red").length,
      escalated: tickets.filter((t) => String(t.status).toLowerCase() === "escalated").length,
      closed: closedVals.length,
      avgCloseDays,
      avgCloseDelta: prev?.summary.avgCloseDelta ?? null,
    };
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

  async function handleDeleteTicket(ticketId: number) {
    try {
      setDeleting(true);
      await deleteTicket(ticketId);
      setTicketsData((prev) => {
        if (!prev) return prev;
        const updated = prev.tickets.filter((t) => t.id !== ticketId);
        return { ...prev, tickets: updated, summary: recalculateSummary(updated, prev) };
      });
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Failed to delete ticket", err);
    } finally {
      setDeleting(false);
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
          t.id === ticketId ? { ...t, notes: Array.isArray(updatedNotes) ? updatedNotes : t.notes } : t
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
          t.id === ticketId ? { ...t, evidence: Array.isArray(updatedEvidence) ? updatedEvidence : t.evidence } : t
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

  function handleOpenTicket(row: TicketableLearnerRow) {
    setSelectedLearner(row);
    setTicketError("");

    const now = new Date();
    const triggered = row.triggeredQuestions || [];
    const triggeredSection = triggered.length > 0
      ? `\n\nTriggered questions (${triggered.length}):\n${triggered.map((q, i) => `${i + 1}. ${q.text}${q.score != null ? ` (Score: ${q.score})` : ""}${q.level ? ` [${q.level}]` : ""}`).join("\n")}`
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

  const surveyResponsePct = useMemo(() => {
    const caseload = data?.summary?.caseload ?? 0;
    const nonResponders = data?.summary?.nonResponders ?? 0;
    if (!caseload) return 0;
    return Math.round(((caseload - nonResponders) / caseload) * 100);
  }, [data]);

  const avgWellbeing = useMemo(() => {
    const learners = data?.learners ?? [];
    const scores = learners
      .map((l) => l.wellbeingScore)
      .filter((s): s is number => s != null && s > 0);
    if (!scores.length) return null;
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  }, [data]);

  const filteredTicketsData = useMemo<SupportTicketsResponse>(() => {
    const raw = ticketsData || {
      summary: { total: 0, open: 0, redRisk: 0, escalated: 0, closed: 0, avgCloseDays: null, avgCloseDelta: null },
      tickets: [],
    };

    const q = ticketsSearch.trim().toLowerCase();

    const tickets = raw.tickets.filter((item) => {
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
        avgCloseDays: raw.summary.avgCloseDays ?? null,
        avgCloseDelta: raw.summary.avgCloseDelta ?? null,
      },
      tickets,
    };
  }, [ticketsData, ticketsSearch, ticketFilters]);

  const HIGH_PRIORITY = new Set(["high", "urgent", "critical"]);

  const normalizedFollowUps = useMemo<CoachFollowUpItem[]>(() => {
    const items = (data?.followUps || []).map((item: any, index: number) => ({
      id: item.id ?? `${item.learnerName ?? "followup"}-${index}`,
      priority: formatPriority(item.priority),
      title: item.title || "Follow-up required",
      learnerName: item.learnerName || "Unknown learner",
      dueDate: item.dueDate || "-",
      reason: item.reason || "",
    }));

    const deduped = uniqueBy(items, (item) => `${item.id}-${item.title}-${item.learnerName}`);
    if (role === "qa") return deduped;
    return deduped.filter((item) => !HIGH_PRIORITY.has(item.priority));
  }, [data, role]);

  const normalizedActions = useMemo<CoachSuggestedActionItem[]>(() => {
    const items = (data?.suggestedActions || []).map((item: any) => ({
      id: item.id ?? String(Math.random()),
      urgency: item.urgency || item.priority || "medium",
      priority: formatPriority(item.priority || item.urgency),
      learnerName: item.learnerName || "",
      learnerEmail: item.learnerEmail || "",
      actions: Array.isArray(item.actions)
        ? item.actions.map((a: any) => ({
            id: a.id || "",
            title: a.title || "Action",
            description: a.description || "",
            priority: formatPriority(a.priority),
            actionType: a.actionType || "",
            recommendedOwner: a.recommendedOwner || "",
            timeline: a.timeline || "",
            category: a.category || "",
          }))
        : [],
    }));
    const deduped = uniqueBy(items, (item) => `${item.id}-${item.learnerName}`);
    if (role === "qa") return deduped;
    return deduped.filter((item) => !HIGH_PRIORITY.has(item.urgency) && !HIGH_PRIORITY.has(item.priority));
  }, [data, role]);

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
      if (String(item.learnerName || "").toLowerCase().includes(q)) return true;
      if (String(item.urgency || "").toLowerCase().includes(q)) return true;
      return item.actions.some(
        (a) =>
          String(a.title || "").toLowerCase().includes(q) ||
          String(a.description || "").toLowerCase().includes(q) ||
          String(a.recommendedOwner || "").toLowerCase().includes(q)
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

            {role === "qa" && (
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
            )}

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
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Active Learners"
              value={data?.summary?.caseload ?? 0}
              icon={<Users className="h-4 w-4" />}
              valueColor="text-[#0F9B8E]"
              iconBg="bg-[#E6F7F6]"
              iconColor="text-[#0F9B8E]"
            />
            <StatCard
              title="Survey Response"
              value={`${surveyResponsePct}%`}
              icon={<ClipboardCheck className="h-4 w-4" />}
              valueColor="text-[#0F9B8E]"
              iconBg="bg-[#E6F7F6]"
              iconColor="text-[#0F9B8E]"
            />
            <StatCard
              title="Open Tickets"
              value={data?.summary?.openTickets ?? 0}
              icon={<ClipboardList className="h-4 w-4" />}
              valueColor="text-amber-500"
              iconBg="bg-amber-50"
              iconColor="text-amber-500"
            />
            <StatCard
              title="Red Risk Cases"
              value={data?.summary?.atRisk ?? 0}
              icon={<AlertTriangle className="h-4 w-4" />}
              valueColor="text-red-500"
              iconBg="bg-red-50"
              iconColor="text-red-500"
            />
            <StatCard
              title="Avg Wellbeing"
              value={avgWellbeing ?? "—"}
              icon={<Heart className="h-4 w-4" />}
              valueColor="text-[#0F9B8E]"
              iconBg="bg-[#E6F7F6]"
              iconColor="text-[#0F9B8E]"
            />
            <StatCard
              title="Non-Responders"
              value={data?.summary?.nonResponders ?? 0}
              icon={<UserRoundX className="h-4 w-4" />}
              valueColor="text-red-500"
              iconBg="bg-red-50"
              iconColor="text-red-500"
            />
          </div>

          <div className="mb-6 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-md font-semibold text-[#241453]">Caseload Risk Overview <span className="text-sm font-normal text-[#7B6D9B]"> ( High score = safe )</span></h2>
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
                          {/* Learner header */}
                          <div className="mb-3 flex items-center gap-2">
                            <span className={priorityBadgeClass(item.priority)}>
                              {item.urgency || item.priority}
                            </span>
                            <span className="text-sm font-semibold text-[#241453]">
                              {item.learnerName || "Learner"}
                            </span>
                          </div>

                          {/* Actions list */}
                          <div className="space-y-2">
                            {item.actions.map((action) => (
                              <div
                                key={action.id}
                                className="rounded-xl border border-[#EEE8F8] bg-white p-3"
                              >
                                <div className="flex items-start gap-2">
                                  <span className={`${priorityBadgeClass(action.priority)} shrink-0 mt-0.5`}>
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
            onDelete={(id) => setDeleteConfirmId(id === 0 ? null : id)}
            deleteConfirmId={deleteConfirmId}
            deleting={deleting}
            onDeleteConfirm={handleDeleteTicket}
          />
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