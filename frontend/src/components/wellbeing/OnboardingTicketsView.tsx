import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  FileDown,
  ChevronDown,
  Laptop,
  Headphones,
  PenLine,
  Sparkles,
  Mic,
  HeartPulse,
  ChevronRight,
  AlertTriangle,
  FileText,
  Users,
  CheckCircle,
  Clock,
  Shield,
  BookOpen,
  Activity,
  MessageSquare,
  Paperclip,
  ExternalLink,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import kbcLogoSrc from "@/assets/logo-icon.png";
import {
  getOnboardingReports,
  getOnboardingReportDetail,
  getOnboardingReportNotes,
  getOnboardingReportEvidence,
  archiveOnboardingReport,
  restoreOnboardingReport,
} from "@/services/coachWellbeing";
import { OnboardingActionsDropdown, resolveMediaUrl } from "@/components/wellbeing/TicketActions";

// ── Types ──────────────────────────────────────────────────────────────────

export type OnboardingRiskLevel = "High" | "Moderate" | "Low" | "medium" | "low" | "";

export type OnboardingReport = {
  id: string;
  learner_id: number | null;
  learner_name: string;
  learner_email: string;
  academic_email: string;
  programme: string;
  organization_name: string;
  coach_name: string;
  coach_email: string;
  manager_name: string;
  manager_email: string;
  overall_risk_level: string;
  overall_score: number | null;
  overall_max_score: number | null;
  percentage: number | null;
  completed_reports: number | null;
  expected_reports: number | null;
  section_progress?: { label: string; badge: string | null; summary: string | null; done: boolean; data: any }[];
  master_report: any;
  status?: string;
  notes_count?: number;
  evidence_count?: number;
  created_at: string | null;
  updated_at: string | null;
};

type OnboardingFilters = {
  risk: string[];
  status: "all" | "open" | "closed";
  evidence: "all" | "with" | "missing";
};

const DEFAULT_ONBOARDING_STATUS: OnboardingFilters["status"] = "open";
const emptyFilters: OnboardingFilters = { risk: [], status: DEFAULT_ONBOARDING_STATUS, evidence: "all" };

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
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-left transition hover:bg-[#F0EBF9] hover:text-[#241453]"
    >
      <span>{label}</span>
      <span className={`text-[10px] ${active ? "text-[#241453]" : "text-[#B8AACC]"}`}>
        {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normaliseRisk(r: string): string {
  const v = (r || "").trim().toLowerCase();
  if (v === "very high") return "Very High";
  if (v === "high") return "High";
  if (v === "moderate" || v === "medium") return "Moderate";
  if (v === "low") return "Low";
  return r || "—";
}

function riskBadgeClass(level: string): string {
  const v = (level || "").toLowerCase();
  if (v === "very high") return "bg-[#F5E8E8] text-[#8B2020] border border-[#D9AAAA]";
  if (v === "high") return "bg-[#FEF0F0] text-[#B85858] border border-[#EDD5D5]";
  if (v === "moderate" || v === "medium") return "bg-[#FEF9EE] text-[#9A7030] border border-[#EDD8A8]";
  if (v === "low") return "bg-[#F2FAF6] text-[#3D7A55] border border-[#BDDECE]";
  return "bg-slate-100 text-slate-500 border border-slate-200";
}

type OnboardingQuickRisk = "all" | "red" | "amber" | "green";

const ONBOARDING_QUICK_RISKS: Array<{
  value: OnboardingQuickRisk;
  label: string;
  activeClass: string;
}> = [
  { value: "all", label: "All reports", activeClass: "border-[#241453] bg-[#241453] text-white" },
  { value: "red", label: "Red", activeClass: "border-red-500 bg-red-500 text-white" },
  { value: "amber", label: "Amber", activeClass: "border-amber-500 bg-amber-500 text-white" },
  { value: "green", label: "Green", activeClass: "border-emerald-500 bg-emerald-500 text-white" },
];

function OnboardingRiskQuickFilter({
  value,
  onChange,
  counts,
}: {
  value?: OnboardingQuickRisk;
  onChange: (value: OnboardingQuickRisk) => void;
  counts?: Partial<Record<OnboardingQuickRisk, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ONBOARDING_QUICK_RISKS.map((item) => {
        const isActive = value === item.value;
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
            <span>{item.label}</span>
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

function priorityBadgeClass(p: string): string {
  const v = (p || "").toLowerCase();
  if (v === "high" || v === "urgent" || v === "very high") return "bg-[#FEF0F0] text-[#B85858]";
  if (v === "medium" || v === "moderate") return "bg-[#FEF9EE] text-[#9A7030]";
  return "bg-[#F2FAF6] text-[#3D7A55]";
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function scoreBar(score: number, max: number): number {
  if (!max) return 0;
  return Math.round((score / max) * 100);
}

function sectionIcon(iconName: string) {
  const cls = "h-5 w-5";
  switch (iconName) {
    case "Laptop": return <Laptop className={cls} />;
    case "Headphones": return <Headphones className={cls} />;
    case "PenLine": return <PenLine className={cls} />;
    case "Sparkles": return <Sparkles className={cls} />;
    case "Mic": return <Mic className={cls} />;
    case "HeartPulse": return <HeartPulse className={cls} />;
    default: return <FileText className={cls} />;
  }
}

function pdfSafe(text: string | null | undefined, fallback = "-"): string {
  if (!text) return fallback;
  return text
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function asRecord(value: any): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: any): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstPresent(...values: any[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function riskRank(level: string) {
  const v = normaliseRisk(level).toLowerCase();
  if (v === "very high") return 4;
  if (v === "high") return 3;
  if (v === "moderate") return 2;
  if (v === "low") return 1;
  return 0;
}

function riskFromPercentage(pct: number | null) {
  if (pct == null) return "";
  if (pct >= 75) return "Very High";
  if (pct >= 50) return "High";
  if (pct >= 25) return "Moderate";
  return "Low";
}

function supportKeyFromLabel(label: string) {
  const text = label.toLowerCase();
  if (/technology|digital/.test(text)) return "digitalSupport";
  if (/visual|hearing|accessibility|dyslexia|adhd/.test(text)) return "accessibilityAdjustments";
  if (/anxiety|mood|wellbeing/.test(text)) return "wellbeingSupport";
  if (/communication|social/.test(text)) return "communicationSupport";
  return "learningSupport";
}

function iconFromLabel(label: string) {
  const text = label.toLowerCase();
  if (/technology|digital/.test(text)) return "Laptop";
  if (/visual|hearing|accessibility/.test(text)) return "Headphones";
  if (/mood|wellbeing|anxiety/.test(text)) return "HeartPulse";
  if (/communication|social/.test(text)) return "Mic";
  if (/dyslexia|adhd|learning/.test(text)) return "BookOpen";
  return "FileText";
}

function sectionScore(section: any) {
  const data = asRecord(section.data);
  const score = asRecord(data.score);
  const ui = asRecord(data.ui);
  const rawAi = asRecord(asRecord(data.raw).aiOutput);
  const scoreDisplay = asString(firstPresent(ui.scoreDisplay, data.scoreDisplay, rawAi.scoreDisplay));
  const [displayScore, displayMax] = scoreDisplay.split("/").map((part) => asNumber(part?.trim()));
  const total = asNumber(firstPresent(
    score.total,
    score.score,
    score.overallScore,
    score.overall_score,
    data.total,
    data.score,
    data.overallScore,
    data.overall_score,
    rawAi.total,
    rawAi.score,
    rawAi.overallScore,
    rawAi.overall_score,
    displayScore,
  ));
  const max = asNumber(firstPresent(
    score.max,
    score.maxScore,
    score.max_score,
    score.overallMaxScore,
    score.overall_max_score,
    data.max,
    data.maxScore,
    data.max_score,
    data.overallMaxScore,
    data.overall_max_score,
    rawAi.max,
    rawAi.maxScore,
    rawAi.max_score,
    rawAi.overallMaxScore,
    rawAi.overall_max_score,
    displayMax,
  ));
  const pct = asNumber(firstPresent(
    score.adjustedPercentage,
    score.adjusted_percentage,
    score.rawPercentage,
    score.raw_percentage,
    score.percentage,
    data.adjustedPercentage,
    data.adjusted_percentage,
    data.rawPercentage,
    data.raw_percentage,
    data.percentage,
    rawAi.adjustedPercentage,
    rawAi.adjusted_percentage,
    rawAi.rawPercentage,
    rawAi.raw_percentage,
    rawAi.percentage,
  ));
  const riskLevel = normaliseRisk(
    asString(firstPresent(
      score.riskLevel,
      score.risk_level,
      score.overallRiskLevel,
      score.overall_risk_level,
      score.risk,
      data.riskLevel,
      data.risk_level,
      data.overallRiskLevel,
      data.overall_risk_level,
      data.risk,
      rawAi.riskLevel,
      rawAi.risk_level,
      rawAi.overallRiskLevel,
      rawAi.overall_risk_level,
      rawAi.risk,
      ui.badge,
      ui.riskBadge,
      ui.riskLevel,
      section.badge,
    )) || riskFromPercentage(pct)
  );

  return { total, max, pct, riskLevel };
}

function sectionSummaries(section: any) {
  const data = asRecord(section.data);
  const summaries = asRecord(data.summaries);
  const rawAi = asRecord(asRecord(data.raw).aiOutput);
  return {
    coach: asString(firstPresent(summaries.coach, rawAi.coachSummary, section.summary)),
    learner: asString(firstPresent(summaries.learner, rawAi.learnerFriendlySummary)),
  };
}

function sectionFindingData(section: any) {
  const data = asRecord(section.data);
  const findings = asRecord(data.findings);
  const rawAi = asRecord(asRecord(data.raw).aiOutput);
  return {
    mainIndicators: asArray(firstPresent(findings.mainIndicators, rawAi.mainIndicators)),
    recommendedActions: asArray(firstPresent(findings.recommendedActions, rawAi.recommendedActions)),
    recommendedAdjustments: asArray(firstPresent(findings.recommendedAdjustments, rawAi.recommendedAdjustments)),
  };
}

function normaliseReportContent(report: OnboardingReport) {
  const master = asRecord(report.master_report);
  const doneSections = asArray(report.section_progress).filter((section) => section?.done && section?.data);

  const fallbackRoadmap = doneSections.map((section) => {
    const score = sectionScore(section);
    const pct = score.pct ?? (score.max ? scoreBar(score.total ?? 0, score.max) : 0);
    return {
      label: section.label,
      sectionIcon: iconFromLabel(section.label),
      score: score.total,
      maxScore: score.max,
      rawPercentage: pct,
      adjustedPercentage: pct,
      riskLevel: score.riskLevel,
    };
  });

  const scoredSections = fallbackRoadmap.filter((item) => item.score != null && item.maxScore);
  const fallbackScore = scoredSections.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const fallbackMax = scoredSections.reduce((sum, item) => sum + Number(item.maxScore || 0), 0);
  const fallbackPct = fallbackMax ? scoreBar(fallbackScore, fallbackMax) : asNumber(report.percentage);
  const highestRisk = fallbackRoadmap.reduce((current, item) => (
    riskRank(item.riskLevel) > riskRank(current) ? item.riskLevel : current
  ), report.overall_risk_level || "");

  const fallbackKeyFindings = doneSections.flatMap((section) => {
    const score = sectionScore(section);
    const summaries = sectionSummaries(section);
    const findingData = sectionFindingData(section);
    const response = findingData.recommendedAdjustments[0]
      || findingData.recommendedActions[0]?.description
      || findingData.recommendedActions[0]?.action
      || summaries.coach;

    return findingData.mainIndicators.map((indicator) => ({
      area: section.label,
      riskLevel: score.riskLevel,
      finding: String(indicator || section.summary || summaries.coach || "").trim(),
      recommendedResponse: String(response || "Review this area with the learner and agree practical next steps.").trim(),
    })).filter((item) => item.finding);
  });

  const fallbackSupportPlan: Record<string, string[]> = {};
  doneSections.forEach((section) => {
    const findingData = sectionFindingData(section);
    const key = supportKeyFromLabel(section.label);
    const items = [
      ...findingData.recommendedAdjustments,
      ...findingData.recommendedActions.map((action) => action.description || action.action || action.title),
    ].map((item) => String(item || "").trim()).filter(Boolean);
    if (items.length) fallbackSupportPlan[key] = [...(fallbackSupportPlan[key] || []), ...items];
  });

  const fallbackActions = doneSections.flatMap((section) => {
    const score = sectionScore(section);
    const findingData = sectionFindingData(section);
    return findingData.recommendedActions.map((action) => ({
      priority: action.priority || score.riskLevel || "Medium",
      owner: action.recommendedOwner || action.owner || "Coach",
      due: action.timeline || action.due || "",
      action: action.description || action.action || action.title || `Review ${section.label} support needs.`,
    }));
  });

  const masterOverview = asRecord(master.overview);
  const masterHeader = asRecord(master.reportHeader);
  const overview: Record<string, any> = {
    ...masterOverview,
    overallRiskLevel: firstPresent(masterOverview.overallRiskLevel, report.overall_risk_level, highestRisk),
    overallScore: firstPresent(masterOverview.overallScore, report.overall_score, scoredSections.length ? fallbackScore : undefined),
    overallMaxScore: firstPresent(masterOverview.overallMaxScore, report.overall_max_score, scoredSections.length ? fallbackMax : undefined),
    rawPercentage: firstPresent(masterOverview.rawPercentage, masterOverview.adjustedPercentage, masterOverview.percentage, report.percentage, fallbackPct),
    adjustedPercentage: firstPresent(masterOverview.adjustedPercentage, masterOverview.rawPercentage, masterOverview.percentage, report.percentage, fallbackPct),
    percentage: firstPresent(masterOverview.percentage, masterOverview.rawPercentage, masterOverview.adjustedPercentage, report.percentage, fallbackPct),
    completedReportsCount: firstPresent(masterOverview.completedReportsCount, report.completed_reports, doneSections.length),
    expectedReportsCount: firstPresent(masterOverview.expectedReportsCount, report.expected_reports, 6),
  };

  const reportHeader: Record<string, any> = {
    ...masterHeader,
    learnerName: firstPresent(masterHeader.learnerName, report.learner_name),
    learnerEmail: firstPresent(masterHeader.learnerEmail, report.learner_email),
    programme: firstPresent(masterHeader.programme, report.programme),
    organisation: firstPresent(masterHeader.organisation, report.organization_name),
    generatedAt: firstPresent(masterHeader.generatedAt, report.created_at),
    overallRiskLevel: firstPresent(masterHeader.overallRiskLevel, overview.overallRiskLevel),
  };

  const executiveSummary = asString(master.executiveSummary)
    || doneSections.map((section) => sectionSummaries(section).coach || section.summary).filter(Boolean).slice(0, 3).join(" ");

  const managerBrief = { ...asRecord(master.managerBrief) };
  if (!managerBrief.oneLineStatus && executiveSummary) managerBrief.oneLineStatus = executiveSummary;
  if (!Array.isArray(managerBrief.whatNeedsAttention)) {
    managerBrief.whatNeedsAttention = fallbackKeyFindings.map((item) => item.finding).slice(0, 5);
  }
  if (!managerBrief.recommendedNextStep && fallbackActions[0]?.action) {
    managerBrief.recommendedNextStep = fallbackActions[0].action;
  }

  return {
    overview,
    reportHeader,
    riskRoadmap: asArray(master.riskRoadmap).length ? asArray(master.riskRoadmap) : fallbackRoadmap,
    keyFindings: asArray(master.keyFindings).length ? asArray(master.keyFindings) : fallbackKeyFindings,
    supportPlan: Object.keys(asRecord(master.supportPlan)).length ? asRecord(master.supportPlan) : fallbackSupportPlan,
    priorityActions: asArray(master.priorityActions).length ? asArray(master.priorityActions) : fallbackActions,
    reviewTimeline: asRecord(master.reviewTimeline),
    managerBrief,
    executiveSummary,
    professionalNote: asString(master.professionalNote),
  };
}

// ── PDF Generator ──────────────────────────────────────────────────────────

function cleanOnboardingRisk(value: any) {
  const risk = normaliseRisk(String(value || ""));
  return risk === "—" ? "" : risk;
}

function normaliseOnboardingReportRow(report: OnboardingReport): OnboardingReport {
  const { overview } = normaliseReportContent(report);
  const overallScore = asNumber(firstPresent(overview.overallScore, report.overall_score));
  const overallMaxScore = asNumber(firstPresent(overview.overallMaxScore, report.overall_max_score));
  const percentage = asNumber(firstPresent(overview.rawPercentage, overview.adjustedPercentage, overview.percentage, report.percentage));
  const completedReports = asNumber(firstPresent(overview.completedReportsCount, report.completed_reports));
  const expectedReports = asNumber(firstPresent(overview.expectedReportsCount, report.expected_reports));

  return {
    ...report,
    overall_risk_level: cleanOnboardingRisk(firstPresent(overview.overallRiskLevel, report.overall_risk_level)),
    overall_score: overallScore,
    overall_max_score: overallMaxScore,
    percentage,
    completed_reports: completedReports,
    expected_reports: expectedReports,
  };
}

async function downloadInclusivenessPDF(report: OnboardingReport) {
  const {
    overview,
    reportHeader,
    riskRoadmap,
    keyFindings,
    supportPlan,
    priorityActions,
    reviewTimeline,
    managerBrief,
    executiveSummary,
    professionalNote,
  } = normaliseReportContent(report);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mx = 14;
  const contentW = W - mx * 2;   // 182mm
  const pad = 5;
  const textW = contentW - pad * 2;  // safe text width inside cards
  const FOOTER_H = 10;
  const LH = 4.5;   // line height for 8pt text

  const C = {
    purple:      [36,  20,  83]  as [number,number,number],
    purpleLight: [98,  72,  190] as [number,number,number],
    purpleBg:    [248, 246, 252] as [number,number,number],
    purpleMid:   [123, 109, 155] as [number,number,number],
    border:      [220, 210, 240] as [number,number,number],
    cardBg:      [252, 251, 254] as [number,number,number],
    textBody:    [55,  45,  75]  as [number,number,number],
    textLight:   [110, 100, 130] as [number,number,number],
    white:       [255, 255, 255] as [number,number,number],
    vhRed:       [139, 32,  32]  as [number,number,number],
    vhRedBg:     [245, 237, 237] as [number,number,number],
    red:         [192, 80,  80]  as [number,number,number],
    redBg:       [254, 245, 245] as [number,number,number],
    amber:       [176, 128, 64]  as [number,number,number],
    amberBg:     [254, 251, 240] as [number,number,number],
    green:       [60,  130, 90]  as [number,number,number],
    greenBg:     [244, 252, 248] as [number,number,number],
  };

  const riskColor = (l: string): [number,number,number] => {
    const v = (l || "").toLowerCase();
    if (v === "very high") return C.vhRed;
    if (v === "high") return C.red;
    if (v === "moderate" || v === "medium") return C.amber;
    return C.green;
  };
  const riskBg = (l: string): [number,number,number] => {
    const v = (l || "").toLowerCase();
    if (v === "very high") return C.vhRedBg;
    if (v === "high") return C.redBg;
    if (v === "moderate" || v === "medium") return C.amberBg;
    return C.greenBg;
  };

  let curY = 0;

  function newPage() { doc.addPage(); curY = 15; }
  function space(n: number) { if (curY + n > H - FOOTER_H - 5) newPage(); }
  function split(text: string, w: number): string[] {
    return doc.splitTextToSize(pdfSafe(text), w) as string[];
  }

  function sectionHeader(title: string) {
    space(14);
    doc.setFillColor(...C.purple);
    doc.roundedRect(mx, curY, contentW, 9, 1.5, 1.5, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text(title.toUpperCase(), mx + pad, curY + 6.3);
    curY += 13;
  }

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.purple);
  doc.rect(0, 0, W, 28, "F");

  try {
    const img = new Image();
    img.src = kbcLogoSrc;
    await new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); setTimeout(r, 500); });
    doc.addImage(img, "PNG", mx, 5, 18, 18);
  } catch {}

  doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
  doc.text("Learner Inclusiveness Report", mx + 22, 14);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 160, 220);
  doc.text("Kent Business College — Confidential Assessment", mx + 22, 21);
  if (reportHeader.generatedAt) {
    doc.setFontSize(7.5);
    doc.text(`Generated: ${formatDate(reportHeader.generatedAt)}`, W - mx, 21, { align: "right" });
  }
  curY = 34;

  // ── LEARNER INFO CARD ─────────────────────────────────────────────────────
  const riskLvl = pdfSafe(overview.overallRiskLevel || reportHeader.overallRiskLevel || report.overall_risk_level);
  const BADGE_W = 38;
  const BADGE_X = W - mx - BADGE_W;

  doc.setFillColor(...riskBg(riskLvl));
  doc.setDrawColor(...C.border); doc.setLineWidth(0.3);
  doc.roundedRect(mx, curY, contentW, 34, 2.5, 2.5, "FD");

  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.purple);
  doc.text(split(reportHeader.learnerName || report.learner_name, contentW - BADGE_W - 14)[0] || "", mx + 6, curY + 10);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textBody);
  doc.text(`Email: ${pdfSafe(reportHeader.learnerEmail || report.learner_email)}`, mx + 6, curY + 17);
  doc.text(`Programme: ${pdfSafe(reportHeader.programme || report.programme)}`, mx + 6, curY + 23);
  doc.text(`Organisation: ${pdfSafe(reportHeader.organisation || report.organization_name)}`, mx + 6, curY + 29);

  // Risk badge — centered in badge box
  doc.setFillColor(...riskColor(riskLvl));
  doc.roundedRect(BADGE_X, curY + 7, BADGE_W, 12, 2.5, 2.5, "F");
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
  doc.text(`${riskLvl.toUpperCase()} RISK`, BADGE_X + BADGE_W / 2, curY + 14.5, { align: "center" });
  curY += 40;

  // ── OVERALL SCORE ─────────────────────────────────────────────────────────
  const score = overview.overallScore ?? report.overall_score;
  const maxScore = overview.overallMaxScore ?? report.overall_max_score ?? 600;
  const rawPct = overview.rawPercentage ?? overview.adjustedPercentage ?? overview.percentage ?? report.percentage;

  if (score != null) {
    doc.setFillColor(...C.purpleBg); doc.setDrawColor(...C.border); doc.setLineWidth(0.3);
    doc.roundedRect(mx, curY, contentW, 24, 2.5, 2.5, "FD");

    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.purpleMid);
    doc.text("OVERALL SCORE", mx + 6, curY + 7);

    // ← measure width BEFORE changing font size
    doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.purple);
    doc.text(`${score}`, mx + 6, curY + 19);
    const scoreW = doc.getTextWidth(`${score}`);

    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.purpleMid);
    doc.text(`/ ${maxScore}`, mx + 8 + scoreW, curY + 19);

    if (rawPct != null) {
      const barX = mx + 54; const barW = contentW - 60;
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textLight);
      doc.text(`${rawPct}% of total score`, barX, curY + 7);
      doc.setFillColor(215, 205, 235);
      doc.roundedRect(barX, curY + 12, barW, 4, 2, 2, "F");
      doc.setFillColor(...riskColor(riskLvl));
      doc.roundedRect(barX, curY + 12, Math.min(barW * (rawPct / 100), barW), 4, 2, 2, "F");
    }
    curY += 30;
  }

  // ── RISK ROADMAP ──────────────────────────────────────────────────────────
  if (riskRoadmap.length > 0) {
    sectionHeader("Risk Roadmap — Inclusiveness Screening Areas");
    const colW = (contentW - 5) / 2;
    const CARD_H = 36;
    const STRIPE = 4;
    const BDG_W = 30;
    const BDG_H = 7;

    for (let i = 0; i < riskRoadmap.length; i += 2) {
      const left = riskRoadmap[i];
      const right = riskRoadmap[i + 1];
      space(CARD_H + 4);

      for (let j = 0; j < 2; j++) {
        const item = j === 0 ? left : right;
        if (!item) continue;
        const x = mx + j * (colW + 5);
        const rl = pdfSafe(item.riskLevel || "");
        const rc = riskColor(rl);
        const rb = riskBg(rl);
        const secPct = item.adjustedPercentage ?? item.rawPercentage
          ?? (item.maxScore ? Math.round((item.score / item.maxScore) * 100) : 0);
        const labelLines = split(item.label, colW - STRIPE - BDG_W - 10);
        const TX = x + STRIPE + 4;

        // Card background
        doc.setFillColor(...rb);
        doc.setDrawColor(...rc);
        doc.setLineWidth(0.5);
        doc.roundedRect(x, curY, colW, CARD_H, 2, 2, "FD");

        // Colored left stripe
        doc.setFillColor(...rc);
        doc.roundedRect(x, curY, STRIPE, CARD_H, 1.5, 1.5, "F");
        doc.rect(x + 1.5, curY, STRIPE - 1.5, CARD_H, "F");

        // Risk badge (top right)
        const bdgX = x + colW - BDG_W - 3;
        const bdgY = curY + 3.5;
        doc.setFillColor(...rc);
        doc.roundedRect(bdgX, bdgY, BDG_W, BDG_H, 1.5, 1.5, "F");
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.white);
        doc.text(rl.toUpperCase(), bdgX + BDG_W / 2, bdgY + 5, { align: "center" });

        // Label
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.purple);
        doc.text(labelLines, TX, curY + 6);

        // Score (large) + /maxScore
        const scoreY = curY + CARD_H - 10;
        const scoreStr = `${item.score ?? "—"}`;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.purple);
        doc.text(scoreStr, TX, scoreY);
        if (item.maxScore) {
          const scoreW = doc.getTextWidth(scoreStr);
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textLight);
          doc.text(` / ${item.maxScore}`, TX + scoreW, scoreY);
        }

        // Progress bar
        const bx = TX;
        const bw = colW - STRIPE - 8;
        const by = curY + CARD_H - 4;
        doc.setFillColor(215, 205, 235);
        doc.roundedRect(bx, by, bw, 2.5, 1, 1, "F");
        doc.setFillColor(...rc);
        doc.roundedRect(bx, by, Math.max(1, Math.min(bw * (secPct / 100), bw)), 2.5, 1, 1, "F");

        // Percentage
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...rc);
        doc.text(`${secPct}%`, x + colW - 3, by + 2, { align: "right" });
      }
      curY += CARD_H + 4;
    }
  }

  // ── EXECUTIVE SUMMARY ─────────────────────────────────────────────────────
  if (executiveSummary) {
    sectionHeader("Executive Summary");
    const lines = split(executiveSummary, textW);
    const cardH = lines.length * LH + pad * 2;
    space(cardH);
    doc.setFillColor(...C.cardBg); doc.setDrawColor(...C.border); doc.setLineWidth(0.25);
    doc.roundedRect(mx, curY, contentW, cardH, 2, 2, "FD");
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textBody);
    doc.text(lines, mx + pad, curY + pad + LH * 0.75);
    curY += cardH + 5;
  }

  // ── KEY FINDINGS ──────────────────────────────────────────────────────────
  if (keyFindings.length > 0) {
    sectionHeader("Key Findings & Recommended Responses");
    const BAR = 3; const BDG = 30;

    for (const finding of keyFindings) {
      const rl = pdfSafe(finding.riskLevel || "");
      const areaW = textW - BAR - BDG - 4;
      const bodyW = textW - BAR - 2;

      const areaLines = split(finding.area, areaW);
      const findLines = split(`Finding: ${finding.finding}`, bodyW);
      const respLines = split(`Recommended Response: ${finding.recommendedResponse}`, bodyW);

      const cardH = areaLines.length * LH + findLines.length * LH + respLines.length * LH + pad * 3 + 6;
      space(cardH);

      doc.setFillColor(...riskBg(rl)); doc.setDrawColor(...C.border); doc.setLineWidth(0.25);
      doc.roundedRect(mx, curY, contentW, cardH, 2, 2, "FD");
      doc.setFillColor(...riskColor(rl));
      doc.rect(mx, curY, BAR, cardH, "F");

      // area title
      let ty = curY + pad;
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.purple);
      doc.text(areaLines, mx + BAR + 4, ty + LH * 0.75);

      // risk badge
      doc.setFillColor(...riskColor(rl));
      doc.roundedRect(mx + contentW - BDG - 2, curY + 4, BDG, 8, 2, 2, "F");
      doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
      doc.text(rl.toUpperCase(), mx + contentW - BDG / 2 - 2, curY + 9.3, { align: "center" });

      ty += areaLines.length * LH + 3;
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textBody);
      doc.text(findLines, mx + BAR + 4, ty + LH * 0.75);

      ty += findLines.length * LH + 3;
      doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...C.purpleLight);
      doc.text(respLines, mx + BAR + 4, ty + LH * 0.75);

      curY += cardH + 4;
    }
  }

  // ── SUPPORT PLAN ──────────────────────────────────────────────────────────
  const supportCategories: [string, string][] = [
    ["digitalSupport", "Digital Support"],
    ["learningSupport", "Learning Support"],
    ["wellbeingSupport", "Wellbeing Support"],
    ["assignmentSupport", "Assignment Support"],
    ["communicationSupport", "Communication Support"],
    ["accessibilityAdjustments", "Accessibility Adjustments"],
  ];

  if (supportCategories.some(([k]) => (supportPlan[k] || []).length > 0)) {
    sectionHeader("Support Plan");
    for (const [key, label] of supportCategories) {
      const items: string[] = supportPlan[key] || [];
      if (!items.length) continue;
      const bullets = items.map((it) => split(`-  ${it}`, textW - 4));
      const totalLH = bullets.reduce((s, ls) => s + ls.length * LH, 0);
      const cardH = totalLH + pad * 2 + LH + 3;
      space(cardH);
      doc.setFillColor(...C.purpleBg); doc.setDrawColor(...C.border); doc.setLineWidth(0.25);
      doc.roundedRect(mx, curY, contentW, cardH, 2, 2, "FD");
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.purple);
      doc.text(label.toUpperCase(), mx + pad, curY + pad + LH * 0.8);
      let ly = curY + pad + LH + 3;
      doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textBody);
      for (const lines of bullets) { doc.text(lines, mx + pad + 3, ly + LH * 0.75); ly += lines.length * LH; }
      curY += cardH + 4;
    }
  }

  // ── PRIORITY ACTIONS ──────────────────────────────────────────────────────
  if (priorityActions.length > 0) {
    sectionHeader("Priority Actions");
    space(30);
    autoTable(doc, {
      startY: curY,
      head: [["Priority", "Owner", "Action", "Due Date"]],
      body: priorityActions.map((a) => [pdfSafe(a.priority), pdfSafe(a.owner), pdfSafe(a.action), pdfSafe(a.due)]),
      theme: "plain",
      styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak", valign: "top", textColor: C.textBody, lineColor: C.border, lineWidth: 0.25 },
      headStyles: { fillColor: C.purpleBg, textColor: C.purpleMid, fontStyle: "bold", fontSize: 7.5 },
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 22 }, 2: { cellWidth: contentW - 18 - 22 - 26 }, 3: { cellWidth: 26 } },
      margin: { left: mx, right: mx },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const v = String(data.cell.raw || "").toLowerCase();
          data.cell.styles.fontStyle = "bold";
          if (v === "very high") data.cell.styles.textColor = C.vhRed;
          else if (v === "high" || v === "urgent") data.cell.styles.textColor = C.red;
          else if (v === "medium" || v === "moderate") data.cell.styles.textColor = C.amber;
          else data.cell.styles.textColor = C.green;
        }
      },
    });
    curY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── REVIEW TIMELINE ───────────────────────────────────────────────────────
  const timelineItems = [
    { label: "Initial Review",      value: reviewTimeline.initialReview,      color: C.red   },
    { label: "Follow-up Review",    value: reviewTimeline.followUpReview,      color: C.amber },
    { label: "Next Formal Review",  value: reviewTimeline.nextFormalReview,    color: C.green },
  ].filter((t) => t.value);

  if (timelineItems.length > 0) {
    sectionHeader("Review Timeline");
    const colW2 = (contentW - (timelineItems.length - 1) * 4) / timelineItems.length;
    let maxTH = 20;
    for (const t of timelineItems) {
      const h = split(t.value, colW2 - pad * 2).length * LH + 18;
      if (h > maxTH) maxTH = h;
    }
    space(maxTH + 4);
    for (let i = 0; i < timelineItems.length; i++) {
      const t = timelineItems[i];
      if (!t) continue;
      const x = mx + i * (colW2 + 4);
      const ls = split(t.value, colW2 - pad * 2);
      doc.setFillColor(...C.purpleBg); doc.setDrawColor(...C.border); doc.setLineWidth(0.25);
      doc.roundedRect(x, curY, colW2, maxTH, 2, 2, "FD");
      doc.setFillColor(...t.color);
      doc.roundedRect(x + pad, curY + 5, 12, 2, 1, 1, "F");
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.purpleMid);
      doc.text(t.label.toUpperCase(), x + pad, curY + 12);
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textBody);
      doc.text(ls, x + pad, curY + 17);
    }
    curY += maxTH + 5;
  }

  // ── MANAGER BRIEF ─────────────────────────────────────────────────────────
  if (managerBrief.oneLineStatus || managerBrief.recommendedNextStep
    || (managerBrief.whatNeedsAttention || []).length > 0
    || (managerBrief.whatIsAlreadyInPlace || []).length > 0) {
    sectionHeader("Manager Brief");

    if (managerBrief.oneLineStatus) {
      const ls = split(managerBrief.oneLineStatus, textW);
      const h = ls.length * LH + pad * 2;
      space(h);
      doc.setFillColor(...C.redBg); doc.setDrawColor(220, 190, 190); doc.setLineWidth(0.25);
      doc.roundedRect(mx, curY, contentW, h, 2, 2, "FD");
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.red);
      doc.text(ls, mx + pad, curY + pad + LH * 0.75);
      curY += h + 4;
    }

    if ((managerBrief.whatNeedsAttention || []).length > 0) {
      const bullets = (managerBrief.whatNeedsAttention as string[]).map((it) => split(`-  ${it}`, textW - 4));
      const totalLH = bullets.reduce((s, ls) => s + ls.length * LH, 0);
      const h = totalLH + pad * 2 + LH + 3;
      space(h);
      doc.setFillColor(...C.cardBg); doc.setDrawColor(...C.border); doc.setLineWidth(0.25);
      doc.roundedRect(mx, curY, contentW, h, 2, 2, "FD");
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.purple);
      doc.text("What Needs Attention:", mx + pad, curY + pad + LH * 0.8);
      let ly = curY + pad + LH + 3;
      doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textBody);
      for (const ls of bullets) { doc.text(ls, mx + pad + 3, ly + LH * 0.75); ly += ls.length * LH; }
      curY += h + 4;
    }

    if ((managerBrief.whatIsAlreadyInPlace || []).length > 0) {
      const bullets = (managerBrief.whatIsAlreadyInPlace as string[]).map((it) => split(`-  ${it}`, textW - 4));
      const totalLH = bullets.reduce((s, ls) => s + ls.length * LH, 0);
      const h = totalLH + pad * 2 + LH + 3;
      space(h);
      doc.setFillColor(...C.greenBg); doc.setDrawColor(185, 220, 200); doc.setLineWidth(0.25);
      doc.roundedRect(mx, curY, contentW, h, 2, 2, "FD");
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.green);
      doc.text("What Is Already in Place:", mx + pad, curY + pad + LH * 0.8);
      let ly = curY + pad + LH + 3;
      doc.setFont("helvetica", "normal"); doc.setTextColor(40, 100, 65);
      for (const ls of bullets) { doc.text(ls, mx + pad + 3, ly + LH * 0.75); ly += ls.length * LH; }
      curY += h + 4;
    }

    if (managerBrief.recommendedNextStep) {
      const ls = split(`Recommended Next Step: ${managerBrief.recommendedNextStep}`, textW);
      const h = ls.length * LH + pad * 2;
      space(h);
      doc.setFillColor(...C.greenBg); doc.setDrawColor(185, 220, 200); doc.setLineWidth(0.25);
      doc.roundedRect(mx, curY, contentW, h, 2, 2, "FD");
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.green);
      doc.text(ls, mx + pad, curY + pad + LH * 0.75);
      curY += h + 4;
    }
  }

  // ── PROFESSIONAL NOTE ─────────────────────────────────────────────────────
  if (professionalNote) {
    const ls = split(`Note: ${professionalNote}`, textW);
    const h = ls.length * 4 + 4;
    space(h);
    doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(...C.purpleMid);
    doc.text(ls, mx, curY + 4 * 0.75);
    curY += h + 6;
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const pageCount = (doc.internal as any).getNumberOfPages?.() ?? 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...C.purple);
    doc.rect(0, H - FOOTER_H, W, FOOTER_H, "F");
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.white);
    doc.text("Kent Business College — Learner Inclusiveness Report — Confidential", mx, H - 3.5);
    doc.text(`Page ${i} of ${pageCount}`, W - mx, H - 3.5, { align: "right" });
  }

  const slug = (report.learner_name || "learner").toLowerCase().replace(/\s+/g, "-");
  doc.save(`inclusiveness-report-${slug}-${new Date().toISOString().split("T")[0]}.pdf`);
}

// ── Filters Panel ──────────────────────────────────────────────────────────

function OnboardingFiltersPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: OnboardingFilters;
  onChange: (f: OnboardingFilters) => void;
  onReset: () => void;
}) {
  const activeCount =
    filters.risk.length +
    (filters.status !== DEFAULT_ONBOARDING_STATUS ? 1 : 0) +
    (filters.evidence !== "all" ? 1 : 0);
  function toggleRisk(r: string) {
    const cur = filters.risk;
    onChange({ ...filters, risk: cur.includes(r) ? cur.filter((v) => v !== r) : [...cur, r] });
  }
  function toggleStatus(s: OnboardingFilters["status"]) {
    onChange({ ...filters, status: s });
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-[#E6DDF8] bg-white p-4 shadow-[0_12px_30px_rgba(36,20,83,0.12)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#241453]">Filters</span>
        {activeCount > 0 && (
          <button type="button" onClick={onReset} className="text-xs font-medium text-[#7A5FD0] hover:text-[#6248BE]">
            Reset ({activeCount})
          </button>
        )}
      </div>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Risk Level</div>
          <div className="flex flex-wrap gap-1.5">
            {["Very High", "High", "Moderate", "Low"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRisk(r)}
                className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${
                  filters.risk.includes(r) ? riskBadgeClass(r) : "border border-[#E7E2F3] text-[#241453] hover:bg-[#F8F5FF]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Status</div>
          <div className="flex gap-1.5">
            {(["all", "open", "closed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`rounded-xl px-2.5 py-1 text-xs font-medium capitalize transition ${
                  filters.status === s
                    ? s === "all"
                      ? "border border-[#241453] bg-[#241453] text-white"
                      : s === "open"
                      ? "border border-emerald-500 bg-emerald-500 text-white"
                      : "border border-slate-500 bg-slate-500 text-white"
                    : "border border-[#E7E2F3] text-[#241453] hover:bg-[#F8F5FF]"
                }`}
              >
                {s === "all" ? "All" : s === "open" ? "Open" : "Closed"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Notes / Evidence</div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ["with", "Has"],
              ["missing", "Missing"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange({ ...filters, evidence: filters.evidence === value ? "all" : value })}
                className={`rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                  filters.evidence === value
                    ? "border border-[#241453] bg-[#241453] text-white"
                    : "border border-[#E7E2F3] text-[#241453] hover:bg-[#F8F5FF]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section Tab Button ─────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition ${
        active
          ? "bg-[#241453] text-white shadow-sm"
          : "text-[#7B6D9B] hover:bg-[#F0EBF9] hover:text-[#241453]"
      }`}
    >
      {children}
    </button>
  );
}

// ── Circular Score Ring ────────────────────────────────────────────────────

function ScoreRing({ score, maxScore, pct, riskLevel }: { score: number; maxScore: number; pct: number; riskLevel: string }) {
  const v = riskLevel.toLowerCase();
  const stroke = v === "very high" ? "#A84040" : v === "high" ? "#D97070" : v === "moderate" || v === "medium" ? "#D4A060" : "#5AAA7A";
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 132, height: 132 }}>
      <svg width={132} height={132} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={66} cy={66} r={r} fill="none" stroke="#E9E3F5" strokeWidth={10} />
        <circle
          cx={66} cy={66} r={r} fill="none"
          stroke={stroke} strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold text-[#241453]">{score}</span>
        <span className="text-xs text-[#7B6D9B]">/ {maxScore}</span>
        <span className="mt-0.5 text-sm font-semibold" style={{ color: stroke }}>{pct}%</span>
      </div>
    </div>
  );
}

// ── Section Report Modal ───────────────────────────────────────────────────

type SectionView = {
  label: string;
  badge: string | null;
  data: any;
  learnerName: string;
};

function SectionReportModal({ section, onClose }: { section: SectionView | null; onClose: () => void }) {
  const [secTab, setSecTab] = useState<"summary" | "findings" | "answers">("summary");

  useEffect(() => {
    setSecTab("summary");
  }, [section?.label]);

  useEffect(() => {
    if (!section) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [section]);

  if (!section) return null;

  const d = section.data || {};
  const badge = section.badge || d.ui?.badge || d.score?.riskLevel || "";
  const sectionTitle = d.section?.title || section.label;

  // Score
  const score = d.score || {};
  const scoreTotal = score.total ?? d.ui?.scoreDisplay?.split("/")?.[0];
  const scoreMax = score.max ?? null;
  const scorePct = score.adjustedPercentage ?? score.rawPercentage ?? null;

  // Summaries
  const summaries = d.summaries || {};
  const coachSummary: string = summaries.coach || d.raw?.aiOutput?.coachSummary || "";
  const learnerSummary: string = summaries.learner || d.raw?.aiOutput?.learnerFriendlySummary || "";
  const screeningNote: string = summaries.screeningOnlyNote || "";

  // Findings
  const findings = d.findings || {};
  const mainIndicators: string[] = Array.isArray(findings.mainIndicators)
    ? findings.mainIndicators
    : Array.isArray(d.raw?.aiOutput?.mainIndicators) ? d.raw.aiOutput.mainIndicators : [];
  const recommendedActions: any[] = Array.isArray(findings.recommendedActions)
    ? findings.recommendedActions
    : Array.isArray(d.raw?.aiOutput?.recommendedActions) ? d.raw.aiOutput.recommendedActions : [];
  const recommendedAdjustments: string[] = Array.isArray(findings.recommendedAdjustments)
    ? findings.recommendedAdjustments
    : Array.isArray(d.raw?.aiOutput?.recommendedAdjustments) ? d.raw.aiOutput.recommendedAdjustments : [];

  // Flags
  const flags = d.flags || {};
  const activeFlags = Object.entries(flags).filter(([, v]) => v === true).map(([k]) =>
    k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).replace("Required", "⚠").trim()
  );

  // Answers
  const answers: any[] = Array.isArray(d.answers) ? d.answers : [];

  const badgeCls: Record<string, string> = {
    Low: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Medium: "bg-amber-100 text-amber-700 border-amber-200",
    Moderate: "bg-amber-100 text-amber-700 border-amber-200",
    High: "bg-red-100 text-red-700 border-red-200",
    "Very High": "bg-red-200 text-red-800 border-red-300",
  };

  const priorityCls: Record<string, string> = {
    Low: "bg-emerald-50 text-emerald-700",
    Medium: "bg-amber-50 text-amber-700",
    High: "bg-red-50 text-red-700",
  };

  const modal = (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(2px)", background: "rgba(20,10,50,0.45)" }}>
      <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#7B6D9B] mb-0.5">{section.learnerName}</p>
            <h2 className="text-lg font-bold text-[#241453] leading-tight">{sectionTitle}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge && (
              <span className={`inline-flex items-center rounded-xl border px-3 py-1 text-xs font-bold uppercase tracking-wide ${badgeCls[badge] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                {badge}
              </span>
            )}
            {scoreTotal != null && scoreMax != null && (
              <span className="inline-flex items-center rounded-xl bg-[#F0EBF9] px-3 py-1 text-xs font-bold text-[#241453]">
                {scoreTotal}/{scoreMax}
                {scorePct != null && <span className="ml-1 text-[#7B6D9B]">({scorePct}%)</span>}
              </span>
            )}
            <button type="button" onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-slate-100">
          {(["summary", "findings", "answers"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setSecTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-xl transition ${
                secTab === t
                  ? "bg-[#241453] text-white"
                  : "text-[#7B6D9B] hover:bg-[#F0EBF9] hover:text-[#241453]"
              }`}>
              {t === "summary" ? "Summary" : t === "findings" ? `Findings (${mainIndicators.length})` : `Answers (${answers.length})`}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">

          {/* SUMMARY TAB */}
          {secTab === "summary" && (
            <>
              {activeFlags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeFlags.map((f) => (
                    <span key={f} className="rounded-xl bg-red-50 border border-red-200 px-3 py-1 text-xs font-semibold text-red-700">{f}</span>
                  ))}
                </div>
              )}

              {coachSummary && (
                <div className="rounded-2xl bg-[#F8F5FF] border border-[#E6DDF8] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B] mb-2">Coach Summary</p>
                  <p className="text-sm text-[#241453] leading-relaxed">{coachSummary}</p>
                </div>
              )}

              {learnerSummary && (
                <div className="rounded-2xl bg-[#F4FCF8] border border-[#C0E0D0] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4A9068] mb-2">Learner Summary</p>
                  <p className="text-sm text-[#241453] leading-relaxed">{learnerSummary}</p>
                </div>
              )}

              {screeningNote && (
                <p className="text-xs text-slate-400 italic">{screeningNote}</p>
              )}

              {!coachSummary && !learnerSummary && (
                <p className="text-sm text-slate-400 text-center py-6">No summary available.</p>
              )}
            </>
          )}

          {/* FINDINGS TAB */}
          {secTab === "findings" && (
            <>
              {mainIndicators.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B] mb-3">Main Indicators</p>
                  <ul className="space-y-2">
                    {mainIndicators.map((ind, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[#241453]">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7A5FD0]" />
                        {ind}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recommendedAdjustments.length > 0 && (
                <div className="rounded-2xl bg-[#F8F5FF] border border-[#E6DDF8] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B] mb-3">Recommended Adjustments</p>
                  <ul className="space-y-2">
                    {recommendedAdjustments.map((adj, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[#241453]">
                        <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        {adj}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recommendedActions.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B] mb-3">Recommended Actions</p>
                  <div className="space-y-2">
                    {recommendedActions.map((act, i) => (
                      <div key={i} className="rounded-xl border border-[#E7E2F3] bg-white p-3">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-semibold text-[#241453]">{act.owner}</span>
                          <div className="flex gap-1.5">
                            {act.priority && (
                              <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase ${priorityCls[act.priority] || "bg-slate-50 text-slate-500"}`}>
                                {act.priority}
                              </span>
                            )}
                            {act.due && (
                              <span className="rounded-lg bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">{act.due}</span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-[#241453]">{act.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mainIndicators.length === 0 && recommendedActions.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">No findings available.</p>
              )}
            </>
          )}

          {/* ANSWERS TAB */}
          {secTab === "answers" && (
            <>
              {answers.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No answers recorded.</p>
              ) : (
                <div className="space-y-2">
                  {answers.map((ans, i) => {
                    const val = ans.selectedValue ?? ans.selected_value;
                    const label = ans.selectedLabel ?? ans.selected_label ?? "";
                    const max = ans.scoreMax ?? ans.score_max ?? 10;
                    const pctW = max > 0 ? Math.round((val / max) * 100) : 0;
                    const barCol = val <= 2 ? "bg-emerald-400" : val <= 5 ? "bg-amber-400" : "bg-red-400";
                    return (
                      <div key={ans.questionId || i} className="rounded-xl border border-[#E7E2F3] p-3">
                        <p className="text-sm text-[#241453] mb-2">{ans.questionText ?? ans.question_text}</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${barCol}`} style={{ width: `${pctW}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-[#241453] shrink-0">{label} ({val}/{max})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Detail Modal (Report Viewer) ───────────────────────────────────────────

function OnboardingReportDetailPanel({
  report,
  onClose,
}: {
  report: OnboardingReport | null;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set());
  const [panelSection, setPanelSection] = useState<SectionView | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab("overview");
    setExpandedFindings(new Set());
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [report?.id]);

  useEffect(() => {
    if (!report) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [report]);

  if (!report) return null;

  const {
    overview,
    reportHeader,
    riskRoadmap,
    keyFindings,
    supportPlan,
    priorityActions,
    reviewTimeline,
    managerBrief,
    executiveSummary,
    professionalNote,
  } = normaliseReportContent(report);

  const riskLvl = normaliseRisk(
    overview.overallRiskLevel || reportHeader.overallRiskLevel || report.overall_risk_level || ""
  );
  const score = overview.overallScore ?? report.overall_score ?? 0;
  const maxScore = overview.overallMaxScore ?? report.overall_max_score ?? 600;
  const pct = overview.rawPercentage ?? overview.adjustedPercentage ?? overview.percentage ?? report.percentage ?? 0;

  const supportCategories: [string, string, React.ReactNode][] = [
    ["digitalSupport", "Digital Support", <Laptop className="h-4 w-4" />],
    ["learningSupport", "Learning Support", <BookOpen className="h-4 w-4" />],
    ["wellbeingSupport", "Wellbeing Support", <HeartPulse className="h-4 w-4" />],
    ["assignmentSupport", "Assignment Support", <PenLine className="h-4 w-4" />],
    ["communicationSupport", "Communication Support", <Mic className="h-4 w-4" />],
    ["accessibilityAdjustments", "Accessibility Adjustments", <Headphones className="h-4 w-4" />],
  ];

  const riskColorCls = (level: string) => {
    const v = (level || "").toLowerCase();
    if (v === "very high") return {
      bg: "bg-[#F5EDED]", border: "border-[#D9AAAA]", text: "text-[#8B2020]",
      barColor: "#A84040", badge: "bg-[#F5E8E8] text-[#8B2020] border-[#D9AAAA]",
    };
    if (v === "high") return {
      bg: "bg-[#FEF5F5]", border: "border-[#EDD5D5]", text: "text-[#C06060]",
      barColor: "#D97070", badge: "bg-[#FEF0F0] text-[#B85858] border-[#EDD5D5]",
    };
    if (v === "moderate" || v === "medium") return {
      bg: "bg-[#FEFBF0]", border: "border-[#EDDFC0]", text: "text-[#B08040]",
      barColor: "#D4A060", badge: "bg-[#FEF9EE] text-[#9A7030] border-[#EDD8A8]",
    };
    return {
      bg: "bg-[#F4FCF8]", border: "border-[#C0E0D0]", text: "text-[#4A9068]",
      barColor: "#5AAA7A", badge: "bg-[#F2FAF6] text-[#3D7A55] border-[#BDDECE]",
    };
  };

  const rc = riskColorCls(riskLvl);

  const supportFlags = [
    { key: "wellbeingReviewNeeded", label: "Wellbeing Review", icon: <HeartPulse className="h-3.5 w-3.5" /> },
    { key: "accessibilityAdjustmentsNeeded", label: "Accessibility", icon: <Headphones className="h-3.5 w-3.5" /> },
    { key: "specialistScreeningNeeded", label: "Specialist Screening", icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "communicationSupportNeeded", label: "Communication", icon: <Mic className="h-3.5 w-3.5" /> },
    { key: "assignmentSupportNeeded", label: "Assignment Support", icon: <PenLine className="h-3.5 w-3.5" /> },
  ].filter(({ key }) => overview[key]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "findings", label: `Findings (${keyFindings.length})` },
    { id: "support", label: "Support Plan" },
    { id: "actions", label: `Actions (${priorityActions.length})` },
    { id: "manager", label: "Manager Brief" },
  ];

  async function handleDownload() {
    if (!report) return;
    setDownloading(true);
    try { await downloadInclusivenessPDF(report); }
    finally { setDownloading(false); }
  }

  function toggleFinding(i: number) {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:p-6" style={{ fontFamily: "Roboto, sans-serif" }}>
      {/* Backdrop */}
      <button type="button" className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-[101] w-full max-w-5xl my-4 flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden" style={{ minHeight: 0 }}>

        {/* ── MODAL HEADER BAR ── */}
        <div className="shrink-0 bg-[#241453] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-white leading-tight">
                  {reportHeader.learnerName || report.learner_name || "Learner Inclusiveness Report"}
                </h1>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${rc.badge}`}>
                  {riskLvl} Risk
                </span>
              </div>
              <p className="mt-1 text-sm text-[#C4B5F4]">{reportHeader.learnerEmail || report.learner_email}</p>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#A89CD6]">
                {(reportHeader.programme || report.programme) && (
                  <span>{reportHeader.programme || report.programme}</span>
                )}
                {(reportHeader.organisation || report.organization_name) && (
                  <span>· {reportHeader.organisation || report.organization_name}</span>
                )}
                {reportHeader.generatedAt && (
                  <span>· Generated {formatDate(reportHeader.generatedAt)}</span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-medium text-white hover:bg-white/25 disabled:opacity-60 transition border border-white/20"
              >
                <FileDown className="h-4 w-4" />
                {downloading ? "Generating..." : "Download PDF"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white/70 hover:bg-white/15 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="shrink-0 border-b border-[#ECE7F7] bg-white px-6 py-3">
          <div className="flex items-center gap-1 overflow-x-auto custom-scroll pb-0.5">
            {tabs.map((t) => (
              <TabBtn key={t.id} active={activeTab === t.id} onClick={() => { setActiveTab(t.id); if (bodyRef.current) bodyRef.current.scrollTop = 0; }}>
                {t.label}
              </TabBtn>
            ))}
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div ref={bodyRef} className="custom-scroll flex-1 overflow-y-auto bg-[#F8F6FC]" style={{ maxHeight: "calc(100vh - 220px)" }}>

          {/* ════ OVERVIEW TAB ════ */}
          {activeTab === "overview" && (
            <div className="p-6 space-y-6">

              {/* Score + Info */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* Score ring */}
                <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-6 shadow-sm">
                  <ScoreRing score={score} maxScore={maxScore} pct={pct} riskLevel={riskLvl} />
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#7B6D9B]">Overall Score</p>
                  <p className="mt-1 text-sm font-bold text-[#241453]">{riskLvl} Risk Profile</p>
                </div>

                {/* Info grid */}
                <div className="lg:col-span-2 rounded-3xl bg-white p-6 shadow-sm">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {[
                      { label: "Programme", value: reportHeader.programme || report.programme },
                      { label: "Organisation", value: reportHeader.organisation || report.organization_name },
                      { label: "Coach", value: report.coach_name },
                      { label: "Manager", value: report.manager_name },
                      { label: "Sections Completed", value: overview.completedReportsCount != null ? `${overview.completedReportsCount} / ${overview.expectedReportsCount ?? 6}` : null },
                      { label: "Generated", value: formatDate(reportHeader.generatedAt || report.created_at) },
                    ].map(({ label, value }) => value ? (
                      <div key={label} className="rounded-2xl bg-[#F8F6FC] p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">{label}</div>
                        <div className="mt-1 text-sm font-medium text-[#241453] leading-tight">{value}</div>
                      </div>
                    ) : null)}
                  </div>

                  {/* Support flags */}
                  {supportFlags.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7B6D9B]">Support Required</p>
                      <div className="flex flex-wrap gap-2">
                        {supportFlags.map(({ key, label, icon }) => (
                          <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-[#241453] px-3 py-1.5 text-[11px] font-semibold text-white">
                            {icon} {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Risk Roadmap */}
              {riskRoadmap.length > 0 && (
                <div className="rounded-3xl bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-base font-semibold text-[#241453]">Risk Roadmap</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {riskRoadmap.map((section: any, i: number) => {
                      const secRc = riskColorCls(section.riskLevel || "");
                      const secPct = section.adjustedPercentage ?? section.rawPercentage ?? (section.maxScore ? Math.round((section.score / section.maxScore) * 100) : 0);
                      // Match riskRoadmap label to section_progress by first keyword
                      const keyword = (section.label || "").split(/[\s,]/)[0].toLowerCase();
                      const matched = (report.section_progress || []).find(
                        (sp) => sp.done && sp.label.toLowerCase().split(" ")[0] === keyword
                      );
                      const cardContent = (
                        <>
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 ${secRc.text}`}>
                              {sectionIcon(section.sectionIcon || "")}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#241453] leading-tight">{section.label}</p>
                              <p className={`text-[11px] font-bold mt-0.5 ${secRc.text}`}>{section.riskLevel}</p>
                            </div>
                            {matched && (
                              <span className="shrink-0 rounded-lg border border-[#DED5F3] bg-white/70 px-2 py-0.5 text-[9px] font-semibold text-[#644D93]">
                                View Report
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-lg font-bold text-[#241453]">{section.score}</span>
                            <span className="text-xs text-[#7B6D9B]">/ {section.maxScore}</span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-white/60 overflow-hidden">
                            <div className="h-2.5 rounded-full transition-all" style={{ width: `${secPct}%`, backgroundColor: secRc.barColor }} />
                          </div>
                          <p className={`mt-1.5 text-right text-[10px] font-semibold ${secRc.text}`}>{secPct}%</p>
                        </>
                      );
                      return matched ? (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPanelSection({ label: matched.label, badge: matched.badge, data: matched.data, learnerName: report.learner_name })}
                          className={`rounded-2xl border ${secRc.border} ${secRc.bg} p-4 text-left w-full transition hover:brightness-95 hover:shadow-md cursor-pointer`}
                        >
                          {cardContent}
                        </button>
                      ) : (
                        <div key={i} className={`rounded-2xl border ${secRc.border} ${secRc.bg} p-4`}>
                          {cardContent}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Executive Summary */}
              {executiveSummary && (
                <div className="rounded-3xl bg-white p-6 shadow-sm">
                  <h3 className="mb-3 text-base font-semibold text-[#241453]">Executive Summary</h3>
                  <p className="text-sm leading-7 text-[#3C3250]">{executiveSummary}</p>
                </div>
              )}

              {/* Review Timeline */}
              {(reviewTimeline.initialReview || reviewTimeline.followUpReview || reviewTimeline.nextFormalReview) && (
                <div className="rounded-3xl bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-base font-semibold text-[#241453]">Review Timeline</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {[
                      { label: "Initial Review", value: reviewTimeline.initialReview, color: "bg-[#D97070]" },
                      { label: "Follow-up Review", value: reviewTimeline.followUpReview, color: "bg-[#D4A060]" },
                      { label: "Next Formal Review", value: reviewTimeline.nextFormalReview, color: "bg-[#5AAA7A]" },
                    ].filter((m) => m.value).map((m, i) => (
                      <div key={i} className="rounded-2xl border border-[#ECE7F7] bg-[#F8F6FC] p-4">
                        <div className={`mb-2 h-1.5 w-10 rounded-full ${m.color}`} />
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">{m.label}</p>
                        <p className="mt-1 text-sm font-medium text-[#241453] leading-relaxed">{m.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Professional Note */}
              {professionalNote && (
                <div className="rounded-2xl border border-[#ECE7F7] bg-white/60 px-5 py-4">
                  <p className="text-xs italic text-[#7B6D9B] leading-relaxed">
                    <span className="font-semibold not-italic">Note: </span>{professionalNote}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ════ FINDINGS TAB ════ */}
          {activeTab === "findings" && (
            <div className="p-6 space-y-4">
              {keyFindings.length === 0 ? (
                <div className="rounded-3xl bg-white p-8 text-center text-sm text-[#7B6D9B] shadow-sm">No findings available</div>
              ) : keyFindings.map((finding: any, i: number) => {
                const fRc = riskColorCls(finding.riskLevel || "");
                const expanded = expandedFindings.has(i);
                return (
                  <div key={i} className="rounded-3xl bg-white shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleFinding(i)}
                      className="flex w-full items-center justify-between p-5 text-left hover:bg-[#F8F6FC] transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`shrink-0 rounded-xl border px-3 py-1 text-xs font-bold ${fRc.badge}`}>
                          {finding.riskLevel}
                        </span>
                        <span className="text-sm font-semibold text-[#241453]">{finding.area}</span>
                      </div>
                      <ChevronRight className={`h-5 w-5 shrink-0 text-[#7B6D9B] transition-transform ${expanded ? "rotate-90" : ""}`} />
                    </button>
                    {expanded && (
                      <div className="border-t border-[#F0EBF9] px-5 pb-5 pt-4 space-y-4">
                        <div className={`rounded-2xl border ${fRc.border} ${fRc.bg} p-4`}>
                          <p className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[#7B6D9B]">Finding</p>
                          <p className="text-sm text-[#241453] leading-relaxed">{finding.finding}</p>
                        </div>
                        <div className="rounded-2xl border border-[#DDD6F5] bg-[#F5F1FC] p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[#6248BE]">Recommended Response</p>
                          <p className="text-sm text-[#3C3250] leading-relaxed">{finding.recommendedResponse}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ════ SUPPORT PLAN TAB ════ */}
          {activeTab === "support" && (
            <div className="p-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {supportCategories.map(([key, label, icon]) => {
                  const items: string[] = supportPlan[key] || [];
                  if (!items.length) return null;
                  return (
                    <div key={key} className="rounded-3xl bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#241453]/10 text-[#241453]">
                          {icon}
                        </div>
                        <h4 className="text-sm font-semibold text-[#241453]">{label}</h4>
                      </div>
                      <ul className="space-y-3">
                        {items.map((item, j) => (
                          <li key={j} className="flex gap-3 text-sm text-[#3C3250] leading-relaxed">
                            <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6248BE]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════ ACTIONS TAB ════ */}
          {activeTab === "actions" && (
            <div className="p-6 space-y-3">
              {priorityActions.length === 0 ? (
                <div className="rounded-3xl bg-white p-8 text-center text-sm text-[#7B6D9B] shadow-sm">No priority actions</div>
              ) : priorityActions.map((action: any, i: number) => {
                const pRc = (() => {
                  const v = (action.priority || "").toLowerCase();
                  if (v === "high" || v === "urgent") return { badge: "bg-[#FEF0F0] text-[#B85858] border-[#EDD5D5]", dot: "bg-[#D97070]" };
                  if (v === "medium") return { badge: "bg-[#FEF9EE] text-[#9A7030] border-[#EDD8A8]", dot: "bg-[#D4A060]" };
                  return { badge: "bg-[#F2FAF6] text-[#3D7A55] border-[#BDDECE]", dot: "bg-[#5AAA7A]" };
                })();
                return (
                  <div key={i} className="rounded-3xl bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${pRc.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`rounded-xl border px-2.5 py-0.5 text-[11px] font-bold ${pRc.badge}`}>
                            {action.priority}
                          </span>
                          <span className="text-xs font-semibold text-[#6248BE]">{action.owner}</span>
                          {action.due && (
                            <span className="ml-auto flex items-center gap-1 text-[11px] text-[#7B6D9B]">
                              <Clock className="h-3 w-3" />{action.due}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[#241453] leading-relaxed">{action.action}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ════ MANAGER BRIEF TAB ════ */}
          {activeTab === "manager" && (
            <div className="p-6 space-y-5">
              {managerBrief.oneLineStatus && (
                <div className="rounded-3xl border border-[#EDD5D5] bg-[#FEF5F5] p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#D97070]" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#C06060] mb-1">Overall Status</p>
                      <p className="text-sm font-semibold text-[#A85050] leading-relaxed">{managerBrief.oneLineStatus}</p>
                    </div>
                  </div>
                </div>
              )}

              {(managerBrief.whatNeedsAttention || []).length > 0 && (
                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#241453]">
                    <Activity className="h-4 w-4 text-[#D4A060]" />
                    What Needs Attention
                  </h4>
                  <ul className="space-y-3">
                    {(managerBrief.whatNeedsAttention as string[]).map((item, i) => (
                      <li key={i} className="flex gap-3 rounded-2xl border border-[#EDD8A8] bg-[#FEFBF0] p-3 text-sm text-[#241453]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A060]" />
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(managerBrief.whatIsAlreadyInPlace || []).length > 0 && (
                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#241453]">
                    <CheckCircle className="h-4 w-4 text-[#5AAA7A]" />
                    What Is Already in Place
                  </h4>
                  <ul className="space-y-2">
                    {(managerBrief.whatIsAlreadyInPlace as string[]).map((item, i) => (
                      <li key={i} className="flex gap-3 text-sm text-[#241453] leading-relaxed">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#5AAA7A]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {managerBrief.recommendedNextStep && (
                <div className="rounded-3xl border border-[#C0E0D0] bg-[#F4FCF8] p-5 shadow-sm">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#4A9068]">Recommended Next Step</p>
                  <p className="text-sm font-medium text-[#3A6A4A] leading-relaxed">{managerBrief.recommendedNextStep}</p>
                </div>
              )}

              {professionalNote && (
                <div className="rounded-2xl border border-[#ECE7F7] bg-white/60 px-5 py-4">
                  <p className="text-xs italic text-[#7B6D9B] leading-relaxed">
                    <span className="font-semibold not-italic">Professional Note: </span>{professionalNote}
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {modal}
      <SectionReportModal section={panelSection} onClose={() => setPanelSection(null)} />
    </>,
    document.body
  );
}

// ── NotesEvidenceModal ────────────────────────────────────────────────────

type NoteItem = { id: string; note: string; created_by: string; created_at: string | null };
type EvidenceItem = { id: string; description: string; file_url: string; file_name: string; created_by: string; created_at: string | null; mime_type?: string; data_url?: string };

function onboardingFileLooksLikeImage(url: string, name = "") {
  return `${name} ${url}`.toLowerCase().match(/\.(png|jpe?g|gif|webp|bmp|svg)(?:$|\?)/);
}

function reportHasEvidence(report: OnboardingReport): boolean {
  return (report.evidence_count ?? 0) > 0 || (report.notes_count ?? 0) > 0;
}

function onboardingFileLooksLikePdf(url: string, name = "") {
  return `${name} ${url}`.toLowerCase().match(/\.pdf(?:$|\?)/);
}

function OnboardingEvidencePreviewModal({
  item,
  onClose,
}: {
  item: EvidenceItem;
  onClose: () => void;
}) {
  const url = item.data_url || resolveMediaUrl(item.file_url);
  const name = item.file_name || "Evidence file";
  const isImage = Boolean(item.mime_type?.startsWith("image/") || onboardingFileLooksLikeImage(url, name));
  const isPdf = Boolean(item.mime_type === "application/pdf" || onboardingFileLooksLikePdf(url, name));

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4">
      <button type="button" className="fixed inset-0 cursor-default" onClick={onClose} aria-label="Close evidence preview" />
      <div className="relative z-[161] flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#ECE7F7] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[#241453]">{name}</h3>
            {item.description && <p className="mt-1 text-sm text-[#7B6D9B]">{item.description}</p>}
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#9D8EC7]">
              {item.created_by && <span>{item.created_by}</span>}
              {item.created_at && <span>{formatDate(item.created_at)}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={url}
              download={name}
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
            <img src={url} alt={name} className="mx-auto max-h-[70vh] max-w-full rounded-2xl bg-white object-contain shadow-sm" />
          ) : isPdf ? (
            <iframe title={name} src={url} className="h-[70vh] w-full rounded-2xl border border-[#E7E2F3] bg-white" />
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

function NotesEvidenceModal({
  mode,
  reportId,
  learnerName,
  onClose,
}: {
  mode: "notes" | "evidence";
  reportId: string;
  learnerName: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewItem, setPreviewItem] = useState<EvidenceItem | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = mode === "notes"
          ? await getOnboardingReportNotes(reportId)
          : await getOnboardingReportEvidence(reportId);
        if (!mounted) return;
        setItems(mode === "notes" ? (res?.notes || []) : (res?.evidence || []));
      } catch { /* silent */ } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [reportId, mode]);

  const isNotes = mode === "notes";
  const title = isNotes ? "Case Notes" : "Evidence Files";
  const Icon = isNotes ? MessageSquare : Paperclip;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#241453] px-5 py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-white/70" />
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <span className="text-xs text-white/60">· {learnerName}</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/70 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="custom-scroll max-h-[60vh] overflow-y-auto p-5 space-y-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-[#7B6D9B]">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No {isNotes ? "notes" : "files"} yet.</p>
          ) : isNotes ? (
            (items as NoteItem[]).map((n) => (
              <div key={n.id} className="rounded-2xl border border-[#EEE8F8] bg-[#FDFCFF] p-4">
                <p className="text-sm text-[#241453] leading-relaxed whitespace-pre-wrap">{n.note}</p>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-[#9D8EC7]">
                  <span>{n.created_by || "—"}</span>
                  {n.created_at && <><span>·</span><span>{formatDate(n.created_at)}</span></>}
                </div>
              </div>
            ))
          ) : (
            (items as EvidenceItem[]).map((e) => (
              <div key={e.id} className="rounded-2xl border border-[#F0E8D8] bg-[#FEFBF5] p-4">
                {e.description && <p className="text-sm font-medium text-[#241453] mb-1">{e.description}</p>}
                {e.file_url ? (
                  <button
                    type="button"
                    onClick={() => setPreviewItem(e)}
                    className="inline-flex items-center gap-1.5 text-xs text-[#9D6912] hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Preview
                  </button>
                ) : e.file_name ? (
                  <p className="text-xs text-slate-500">{e.file_name}</p>
                ) : null}
                <div className="mt-2 flex items-center gap-2 text-[10px] text-[#9D8EC7]">
                  <span>{e.created_by || "—"}</span>
                  {e.created_at && <><span>·</span><span>{formatDate(e.created_at)}</span></>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {previewItem && (
        <OnboardingEvidencePreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>,
    document.body
  );
}

function ArchivedOnboardingReportsPanel({
  coachEmail,
  onClose,
  onRestored,
}: {
  coachEmail?: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<OnboardingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    getOnboardingReports((coachEmail || "").trim() || undefined, true)
      .then((data: any) => {
        if (mounted) setItems(Array.isArray(data?.reports) ? data.reports : []);
      })
      .catch(() => { if (mounted) setError("Failed to load archived onboarding tickets."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [coachEmail]);

  async function handleRestore(id: string) {
    setRestoringId(id);
    try {
      await restoreOnboardingReport(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      onRestored();
    } catch {
      setError("Failed to restore onboarding ticket.");
    } finally {
      setRestoringId(null);
    }
  }

  return createPortal(
    <>
      <button type="button" className="fixed inset-0 z-[85] cursor-default bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-[90] flex h-full w-full max-w-[640px] flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#ECE7F7] px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-[#241453]">
              <Archive className="h-4 w-4 text-[#7B6D9B]" />
              Archived Onboarding Tickets
            </div>
            <div className="mt-0.5 text-xs text-[#7B6D9B]">{items.length} ticket{items.length !== 1 ? "s" : ""} archived</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-[#E7E2F3] p-2 text-[#241453] hover:bg-[#F8F5FF]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="custom-scroll flex-1 overflow-y-auto p-6">
          {loading && <div className="py-12 text-center text-sm text-[#7B6D9B]">Loading archived onboarding tickets...</div>}
          {!loading && error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="rounded-xl border border-[#ECE7F7] bg-[#F8F6FC] p-8 text-center text-sm text-[#7B6D9B]">
              No archived onboarding tickets.
            </div>
          )}
          {!loading && !error && items.length > 0 && (
            <div className="space-y-3">
              {items.map((item) => {
                const risk = normaliseRisk(item.overall_risk_level);
                return (
                  <div key={item.id} className="rounded-2xl border border-[#ECE7F7] bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[#241453]">{item.learner_name || "-"}</div>
                        <div className="mt-0.5 text-xs text-[#7B6D9B]">{item.learner_email || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.programme || "-"} · {formatDate(item.created_at)}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${riskBadgeClass(risk)}`}>
                        {risk}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={restoringId === item.id}
                      onClick={() => handleRestore(item.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9CFF3] bg-white px-3 py-1.5 text-xs font-medium text-[#6248BE] transition hover:bg-[#F5F1FC] disabled:opacity-60"
                    >
                      <ArchiveRestore className="h-3 w-3" />
                      {restoringId === item.id ? "Restoring..." : "Restore"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

function OnboardingSkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[#EDE8F8] ${className}`} />;
}

function OnboardingPageLoader() {
  return (
    <div className="mb-5 overflow-hidden rounded-3xl border border-[#E7E2F3] bg-white shadow-sm">
      <div className="h-1.5 w-full overflow-hidden bg-[#F2ECFB]">
        <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-r-full bg-[#8B6BC8]" />
      </div>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#241453]">Loading onboarding tickets</p>
          <p className="mt-0.5 text-xs text-[#7B6D9B]">Fetching reports, filters, and table rows.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#DCCFF6] bg-white px-3 py-1.5 text-xs font-semibold text-[#5A3EA6] shadow-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8B6BC8] opacity-40" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#8B6BC8]" />
          </span>
          Loading...
        </div>
      </div>
    </div>
  );
}

function OnboardingTicketsSkeleton() {
  return (
    <div className="relative space-y-6">
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <OnboardingPageLoader />

        <div className="mb-6">
          <h2 className="text-[20px] font-semibold text-[#241453]">Onboarding Tickets</h2>
          <OnboardingSkeletonBlock className="mt-2 h-3.5 w-64 bg-[#F3EFFC]" />
        </div>

        <div className="rounded-3xl border border-[#E9E3F5] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <OnboardingSkeletonBlock className="h-12 w-full max-w-[680px] bg-[#F5F7FB]" />
            <div className="flex items-center gap-3">
              <OnboardingSkeletonBlock className="h-10 w-28 bg-[#F3EFFC]" />
              <OnboardingSkeletonBlock className="h-10 w-24 bg-[#F3EFFC]" />
              <OnboardingSkeletonBlock className="h-10 w-28 bg-[#F3EFFC]" />
            </div>
          </div>
          <div className="mt-4 border-t border-[#EEE8F8] pt-4">
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <OnboardingSkeletonBlock className="h-[74px] bg-emerald-50" />
                <OnboardingSkeletonBlock className="h-[74px] bg-[#F8F6FC]" />
              </div>
              <div className="rounded-2xl border border-[#E9E3F5] bg-[#FCFBFE] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <OnboardingSkeletonBlock className="h-3 w-36" />
                  <OnboardingSkeletonBlock className="h-6 w-20 bg-white" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3].map((item) => (
                    <OnboardingSkeletonBlock key={item} className="h-9 w-24 bg-white" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="rounded-3xl border border-[#ECE7F7] bg-[#F8F6FC] p-5">
              <div className="mb-3 flex items-center justify-between">
                <OnboardingSkeletonBlock className="h-3 w-24" />
                <OnboardingSkeletonBlock className="h-8 w-8 bg-[#F3EFFC]" />
              </div>
              <OnboardingSkeletonBlock className="h-8 w-14" />
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-[#E9E3F5]">
          <div className="grid grid-cols-8 gap-4 border-b border-[#EEE8F8] bg-[#FCFBFE] px-5 py-4">
            {[...Array(8)].map((_, i) => <OnboardingSkeletonBlock key={i} className="h-3 w-20" />)}
          </div>
          <div className="divide-y divide-[#F1EDF8]">
            {[...Array(7)].map((_, row) => (
              <div key={row} className="grid grid-cols-8 gap-4 px-5 py-4" style={{ opacity: 1 - row * 0.07 }}>
                {[...Array(8)].map((_, col) => (
                  <div key={col} className="space-y-2">
                    <OnboardingSkeletonBlock className="h-3.5 w-full max-w-[120px]" />
                    {col < 2 ? <OnboardingSkeletonBlock className="h-3 w-20 bg-[#F3EFFC]" /> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main OnboardingTicketsView ─────────────────────────────────────────────

export default function OnboardingTicketsView({ coachEmail }: { coachEmail?: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reports, setReports] = useState<OnboardingReport[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<OnboardingFilters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [viewReport, setViewReport] = useState<OnboardingReport | null>(null);
  const [viewSection, setViewSection] = useState<SectionView | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [reportStatuses, setReportStatuses] = useState<Map<string, string>>(new Map());
  type OnboardingSortKey = "learner" | "programme" | "organisation" | "coach" | "risk" | "score" | "reports" | "date" | "notes" | "evidence" | "status";
  const [sortConfig, setSortConfig] = useState<{ key: OnboardingSortKey; direction: SortDirection }>({
    key: "date",
    direction: "desc",
  });
  const [notesModal, setNotesModal] = useState<{ reportId: string; learnerName: string } | null>(null);
  const [evidenceModal, setEvidenceModal] = useState<{ reportId: string; learnerName: string } | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archivedPanelOpen, setArchivedPanelOpen] = useState(false);

  function applyReportRows(rows: OnboardingReport[]) {
    setReports(rows);
    const statusMap = new Map<string, string>();
    rows.forEach((r) => statusMap.set(r.id, r.status || "active"));
    setReportStatuses(statusMap);
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getOnboardingReports((coachEmail || "").trim() || undefined);
        if (!mounted) return;
        const rows: OnboardingReport[] = res?.reports || [];
        applyReportRows(rows);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Failed to load onboarding reports");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [coachEmail]);

  async function reloadReports() {
    setLoading(true);
    setError("");
    try {
      const res = await getOnboardingReports((coachEmail || "").trim() || undefined);
      applyReportRows(res?.reports || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load onboarding reports");
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveReport(reportId: string) {
    setArchivingId(reportId);
    try {
      await archiveOnboardingReport(reportId);
      setReports((prev) => prev.filter((report) => report.id !== reportId));
      setReportStatuses((prev) => {
        const next = new Map(prev);
        next.delete(reportId);
        return next;
      });
      setArchiveConfirmId(null);
    } catch (err: any) {
      setError(err?.message || "Failed to archive onboarding report");
    } finally {
      setArchivingId(null);
    }
  }

  async function fetchReportDetail(reportId: string) {
    setDetailLoadingId(reportId);
    try {
      const res = await getOnboardingReportDetail(reportId);
      const report = normaliseOnboardingReportRow(res?.report);
      setReports((prev) => prev.map((item) => item.id === reportId ? { ...item, ...report } : item));
      return report;
    } catch (err: any) {
      setError(err?.message || "Failed to load onboarding report details");
      return null;
    } finally {
      setDetailLoadingId(null);
    }
  }

  async function openReportDetail(report: OnboardingReport) {
    const fullReport = report.master_report && Object.keys(report.master_report || {}).length
      ? normaliseOnboardingReportRow(report)
      : await fetchReportDetail(report.id);
    if (fullReport) setViewReport(fullReport);
  }

  async function openSectionDetail(report: OnboardingReport, sectionLabel: string) {
    const fullReport = await fetchReportDetail(report.id);
    if (!fullReport) return;
    const section = fullReport?.section_progress?.find((item) => item.label === sectionLabel);
    if (section) {
      setViewSection({ label: section.label, badge: section.badge, data: section.data, learnerName: fullReport.learner_name });
    }
  }

  const searchedReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ce = (coachEmail || "").trim().toLowerCase();
    return reports.filter((r) => {
      if (ce && (r.coach_email || "").trim().toLowerCase() !== ce) return false;
      if (q) {
        const match =
          (r.learner_name || "").toLowerCase().includes(q) ||
          (r.learner_email || "").toLowerCase().includes(q) ||
          (r.programme || "").toLowerCase().includes(q) ||
          (r.organization_name || "").toLowerCase().includes(q) ||
          (r.coach_name || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [reports, search, coachEmail]);

  const statusFilteredReports = useMemo(() => {
    return searchedReports.filter((r) => {
      if (filters.status === "all") return true;
      const s = (reportStatuses.get(r.id) || r.status || "active").toLowerCase();
      const isClosed = s === "closed";
      return filters.status === "closed" ? isClosed : !isClosed;
    });
  }, [searchedReports, filters.status, reportStatuses]);

  const riskFilteredReports = useMemo(() => {
    return statusFilteredReports.filter((r) => {
      if (filters.risk.length === 0) return true;
      const nr = normaliseRisk(r.overall_risk_level);
      return filters.risk.includes(nr);
    });
  }, [statusFilteredReports, filters.risk]);

  const filtered = useMemo(() => {
    return riskFilteredReports.filter((r) => {
      if (filters.evidence === "with") return reportHasEvidence(r);
      if (filters.evidence === "missing") return !reportHasEvidence(r);
      return true;
    });
  }, [riskFilteredReports, filters.evidence]);

  function setSort(key: OnboardingSortKey) {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }

  const sorted = useMemo(() => {
    const valueFor = (report: OnboardingReport, key: OnboardingSortKey) => {
      if (key === "learner") return sortText(report.learner_name || report.learner_email);
      if (key === "programme") return sortText(report.programme);
      if (key === "organisation") return sortText(report.organization_name);
      if (key === "coach") return sortText(report.coach_name || report.coach_email);
      if (key === "risk") return sortText(normaliseRisk(report.overall_risk_level));
      if (key === "score") return sortNumber(report.overall_score);
      if (key === "reports") return sortNumber(report.completed_reports);
      if (key === "date") return sortDate(report.created_at);
      if (key === "notes") return sortNumber(report.notes_count ?? 0);
      if (key === "evidence") return sortNumber(report.evidence_count ?? 0);
      return sortText(reportStatuses.get(report.id) || report.status || "active");
    };
    return [...filtered].sort((a, b) => compareValues(valueFor(a, sortConfig.key), valueFor(b, sortConfig.key), sortConfig.direction));
  }, [filtered, reportStatuses, sortConfig]);

  const sortHeader = (key: OnboardingSortKey, label: string) => (
    <SortHeaderButton label={label} active={sortConfig.key === key} direction={sortConfig.direction} onClick={() => setSort(key)} />
  );

  const quickRiskValue = useMemo<OnboardingQuickRisk | undefined>(() => {
    const risk = [...filters.risk].sort();
    if (risk.length === 0) return "all";
    if (risk.length === 2 && risk.includes("High") && risk.includes("Very High")) return "red";
    if (risk.length === 1 && risk[0] === "Moderate") return "amber";
    if (risk.length === 1 && risk[0] === "Low") return "green";
    return undefined;
  }, [filters.risk]);

  const evidenceFilteredForRisk = useMemo(() => {
    return statusFilteredReports.filter((r) => {
      if (filters.evidence === "with") return reportHasEvidence(r);
      if (filters.evidence === "missing") return !reportHasEvidence(r);
      return true;
    });
  }, [statusFilteredReports, filters.evidence]);

  const quickRiskCounts = useMemo<Partial<Record<OnboardingQuickRisk, number>>>(() => ({
    all: evidenceFilteredForRisk.length,
    red: evidenceFilteredForRisk.filter((r) => {
      const nr = normaliseRisk(r.overall_risk_level);
      return nr === "Very High" || nr === "High";
    }).length,
    amber: evidenceFilteredForRisk.filter((r) => normaliseRisk(r.overall_risk_level) === "Moderate").length,
    green: evidenceFilteredForRisk.filter((r) => normaliseRisk(r.overall_risk_level) === "Low").length,
  }), [evidenceFilteredForRisk]);

  const evidenceCounts = useMemo(() => {
    const withEvidence = riskFilteredReports.filter(reportHasEvidence).length;
    return {
      all: riskFilteredReports.length,
      with: withEvidence,
      missing: riskFilteredReports.length - withEvidence,
    };
  }, [riskFilteredReports]);

  const statusCounts = useMemo(() => {
    const closed = searchedReports.filter((r) => (reportStatuses.get(r.id) || r.status || "active").toLowerCase() === "closed").length;
    return { all: searchedReports.length, open: searchedReports.length - closed, closed };
  }, [searchedReports, reportStatuses]);

  function setQuickRisk(value: OnboardingQuickRisk) {
    setSearch("");
    if (value === "all") setFilters((f) => ({ ...f, risk: [] }));
    if (value === "red") setFilters((f) => ({ ...f, risk: ["Very High", "High"] }));
    if (value === "amber") setFilters((f) => ({ ...f, risk: ["Moderate"] }));
    if (value === "green") setFilters((f) => ({ ...f, risk: ["Low"] }));
  }

  const stats = useMemo(() => ({
    total: filtered.length,
    veryHigh: filtered.filter((r) => normaliseRisk(r.overall_risk_level) === "Very High").length,
    high: filtered.filter((r) => normaliseRisk(r.overall_risk_level) === "High").length,
    moderate: filtered.filter((r) => normaliseRisk(r.overall_risk_level) === "Moderate").length,
    low: filtered.filter((r) => normaliseRisk(r.overall_risk_level) === "Low").length,
  }), [filtered]);

  const activeFilterCount =
    filters.risk.length +
    (filters.status !== DEFAULT_ONBOARDING_STATUS ? 1 : 0) +
    (filters.evidence !== "all" ? 1 : 0);

  function exportToExcel() {
    const rows = filtered.map((r) => ({
      "Learner": r.learner_name,
      "Email": r.learner_email,
      "Programme": r.programme,
      "Organisation": r.organization_name,
      "Coach": r.coach_name,
      "Risk Level": normaliseRisk(r.overall_risk_level),
      "Score": r.overall_score != null ? `${r.overall_score}/${r.overall_max_score}` : "—",
      "Percentage": r.percentage != null ? `${r.percentage}%` : "—",
      "Reports Completed": r.completed_reports != null ? `${r.completed_reports}/${r.expected_reports}` : "—",
      "Date": formatDate(r.created_at),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 22 }, { wch: 30 }, { wch: 35 }, { wch: 25 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Onboarding Reports");
    XLSX.writeFile(wb, `onboarding-reports-${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  async function exportToPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const mx = 12;

    // ── Color schema ──────────────────────────────────────────────────────
    const C = {
      purple:       [36,  20,  83]  as [number,number,number], // #241453
      purpleMid:    [68,  47,  115] as [number,number,number], // #442F73
      purpleAccent: [134, 108, 182] as [number,number,number], // #866cb6
      purpleLight:  [168, 140, 217] as [number,number,number], // #a88cd9
      purpleBg:     [249, 245, 255] as [number,number,number], // #f9f5ff
      purpleBorder: [200, 185, 235] as [number,number,number],
      white:        [255, 255, 255] as [number,number,number],
      textBody:     [50,  35,  75]  as [number,number,number],
    };

    const riskColor = (level: string): [number,number,number] => {
      const v = (level || "").toLowerCase();
      if (v === "very high") return [139, 32, 32];
      if (v === "high") return [192, 80, 80];
      if (v === "moderate" || v === "medium") return [178, 119, 21];
      if (v === "low") return [60, 130, 90];
      return [120, 120, 120];
    };

    // ── Header bar ────────────────────────────────────────────────────────
    doc.setFillColor(...C.purple);
    doc.rect(0, 0, W, 26, "F");

    // Thin accent strip under header
    doc.setFillColor(...C.purpleAccent);
    doc.rect(0, 26, W, 1.5, "F");

    // Logo
    try {
      const img = new Image();
      img.src = kbcLogoSrc;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        setTimeout(resolve, 500);
      });
      doc.addImage(img, "PNG", mx, 5, 16, 16);
    } catch { /* skip */ }

    // Title
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text("Onboarding Reports", mx + 21, 13);

    // Subtitle
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.purpleLight);
    doc.text(
      `Kent Business College  ·  ${formatDate(new Date().toISOString())}  ·  ${filtered.length} record${filtered.length !== 1 ? "s" : ""}`,
      mx + 21, 21
    );

    // ── Table ─────────────────────────────────────────────────────────────
    autoTable(doc, {
      startY: 33,
      head: [["Learner", "Email", "Programme", "Organisation", "Coach", "Risk", "Score", "%", "Reports", "Date"]],
      body: filtered.map((r) => [
        pdfSafe(r.learner_name),
        pdfSafe(r.learner_email),
        pdfSafe(r.programme),
        pdfSafe(r.organization_name),
        pdfSafe(r.coach_name),
        normaliseRisk(r.overall_risk_level) || "—",
        r.overall_score != null ? `${r.overall_score}/${r.overall_max_score ?? 180}` : "—",
        r.percentage != null ? `${r.percentage}%` : "—",
        r.completed_reports != null ? `${r.completed_reports}/${r.expected_reports ?? 6}` : "—",
        formatDate(r.created_at),
      ]),
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: 4,
        overflow: "linebreak",
        valign: "middle",
        textColor: C.textBody,
        lineColor: C.purpleBorder,
        lineWidth: 0.25,
      },
      headStyles: {
        fillColor: C.purple,
        textColor: C.white,
        fontStyle: "bold",
        fontSize: 8.5,
        lineColor: C.purple,
        cellPadding: 5,
      },
      alternateRowStyles: {
        fillColor: C.purpleBg,
      },
      columnStyles: {
        0: { fontStyle: "bold", textColor: C.purple },
      },
      margin: { left: mx, right: mx },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          data.cell.styles.textColor = riskColor(String(data.cell.raw || ""));
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    // ── Footer on every page ──────────────────────────────────────────────
    const pageCount = (doc.internal as any).getNumberOfPages?.() ?? 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      // Footer bar
      doc.setFillColor(...C.purple);
      doc.rect(0, H - 9, W, 9, "F");

      // Thin accent line above footer
      doc.setFillColor(...C.purpleAccent);
      doc.rect(0, H - 9, W, 1, "F");

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.white);
      doc.text("Kent Business College — Onboarding Reports — Confidential", mx, H - 3.5);
      doc.text(`Page ${i} of ${pageCount}`, W - mx, H - 3.5, { align: "right" });
    }

    doc.save(`onboarding-reports-${new Date().toISOString().split("T")[0]}.pdf`);
  }

  if (loading && reports.length === 0) {
    return <OnboardingTicketsSkeleton />;
  }

  return (
    <div className="relative space-y-6">
      {loading && reports.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-end rounded-3xl bg-white/45 p-4 backdrop-blur-[1px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7E2F3] bg-white px-3 py-1.5 text-xs font-semibold text-[#644D93] shadow-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#8B6BC8]" />
            Refreshing onboarding reports...
          </div>
        </div>
      ) : null}
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold text-[#241453]">Onboarding Tickets</h2>
            <p className="mt-1 text-sm text-[#7B6D9B]">Learner inclusiveness screening reports</p>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="rounded-3xl border border-[#E9E3F5] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex h-12 w-full items-center gap-2 rounded-2xl bg-[#F5F7FB] px-4 lg:max-w-[680px]">
              <Search className="h-4 w-4 shrink-0 text-[#8E82AA]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search learner, programme, organisation, coach..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setArchivedPanelOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E7E2F3] px-4 text-sm text-[#241453] hover:bg-[#F8F5FF]"
              >
                <Archive className="h-4 w-4" />
                Archived
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((p) => !p)}
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
                    <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setFiltersOpen(false)} />
                    <div className="z-50">
                      <OnboardingFiltersPanel filters={filters} onChange={setFilters} onReset={() => setFilters(emptyFilters)} />
                    </div>
                  </>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  disabled={loading || filtered.length === 0}
                  title={filtered.length === 0 ? "No onboarding reports available to export" : "Export current onboarding report data"}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E7E2F3] px-4 text-sm text-[#241453] hover:bg-[#F8F5FF] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileDown className="h-4 w-4" />
                  {loading ? "Loading..." : "Export"}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                {exportOpen && (
                  <>
                    <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setExportOpen(false)} />
                    <div className="absolute right-0 z-50 mt-2 w-48 rounded-2xl border border-[#E7E2F3] bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => { setExportOpen(false); exportToExcel(); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                      >
                        Excel (.xlsx)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setExportOpen(false); exportToPDF(); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                      >
                        PDF (.pdf)
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-[#EEE8F8] pt-4">
            <div className="grid gap-3">
              <div className="grid gap-3 lg:grid-cols-3">
                {(["all", "open", "closed"] as const).map((sv) => {
                  const isActive = filters.status === sv;
                  const count = statusCounts[sv];
                  const Icon = sv === "all" ? FileText : sv === "open" ? Clock : CheckCircle;
                  return (
                    <button
                      key={sv}
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, status: sv }))}
                      className={`flex min-h-[74px] items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? sv === "all"
                            ? "border-[#BFAFEA] bg-[#F8F5FF] text-[#241453] shadow-sm"
                            : sv === "open"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm"
                              : "border-slate-300 bg-slate-100 text-slate-800 shadow-sm"
                          : "border-[#E7E2F3] bg-white text-[#241453] hover:bg-[#F8F5FF]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isActive
                            ? sv === "all" ? "bg-white text-[#6248BE]" : sv === "open" ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600"
                            : "bg-[#F4F0FC] text-[#644D93]"
                        }`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {sv === "all" ? "All Reports" : sv === "open" ? "Open Tickets" : "Closed Tickets"}
                          </span>
                          <span className="mt-0.5 block text-xs text-[#7B6D9B]">
                            {sv === "all" ? "Every report" : sv === "open" ? "Active cases" : "Resolved cases"}
                          </span>
                        </span>
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isActive
                          ? sv === "all" ? "bg-white text-[#6248BE]" : sv === "open" ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600"
                          : "bg-[#F4F0FC] text-[#644D93]"
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-[#E9E3F5] bg-[#FCFBFE] p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#7B6D9B]">
                    {filters.status === "all" ? "All report RAG" : filters.status === "open" ? "Open ticket RAG" : "Closed ticket RAG"}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#644D93]">
                    {filtered.length} shown
                  </span>
                </div>
                <OnboardingRiskQuickFilter
                  value={quickRiskValue}
                  onChange={setQuickRisk}
                  counts={quickRiskCounts}
                />
                <div className="mt-3 border-t border-[#EEE8F8] pt-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7B6D9B]">Notes / Evidence</div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["all", "All"],
              ["with", "Has notes/evidence"],
              ["missing", "Missing notes/evidence"],
            ] as const).map(([value, label]) => {
                      const isActive = filters.evidence === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setSearch("");
                            setFilters((f) => ({ ...f, evidence: isActive ? "all" : value }));
                          }}
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

        {/* Stat Cards */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { title: "Total Reports",   value: loading && reports.length === 0 ? "…" : stats.total,    icon: <FileText className="h-4 w-4" />,       color: "text-[#0F9B8E]",    bg: "bg-[#E6F7F6]" },
            { title: "Critical Cases",  value: loading && reports.length === 0 ? "…" : stats.veryHigh, icon: <AlertTriangle className="h-4 w-4" />,  color: "text-[#8B2020]",    bg: "bg-[#F5E8E8]" },
            { title: "High Risk",       value: loading && reports.length === 0 ? "…" : stats.high,     icon: <AlertTriangle className="h-4 w-4" />,  color: "text-[#C06060]",    bg: "bg-[#FEF0F0]" },
            { title: "Moderate Risk",   value: loading && reports.length === 0 ? "…" : stats.moderate, icon: <Users className="h-4 w-4" />,          color: "text-[#B08040]",    bg: "bg-[#FEF9EE]" },
            { title: "Low Risk",        value: loading && reports.length === 0 ? "…" : stats.low,      icon: <CheckCircle className="h-4 w-4" />,    color: "text-[#4A9068]",    bg: "bg-[#F2FAF6]" },
          ].map((s) => (
            <div key={s.title} className="rounded-3xl border border-[#ECE7F7] bg-[#F8F6FC] p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#7B6D9B]">{s.title}</span>
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${s.bg} ${s.color}`}>{s.icon}</div>
              </div>
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="mt-6 overflow-hidden rounded-3xl border border-[#E9E3F5]">
          <div className="custom-scroll overflow-auto" style={{ maxHeight: "calc(100vh - 380px)" }}>
            <table className="w-full min-w-[980px] text-sm">
              <thead className="sticky top-0 z-10 bg-[#FCFBFE]">
                <tr className="border-b border-[#EEE8F8] text-left text-[#7B6D9B]">
                  <th className="px-5 py-4 font-medium">{sortHeader("learner", "Learner")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("programme", "Programme")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("organisation", "Organisation")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("coach", "Coach")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("risk", "Risk")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("score", "Score")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("reports", "Reports")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("date", "Date")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("notes", "Notes")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("evidence", "Evidence")}</th>
                  <th className="px-5 py-4 font-medium">{sortHeader("status", "Status")}</th>
                  <th className="px-5 py-4 font-medium">Archive</th>
                  <th className="px-5 py-4 font-medium">View Report</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={13} className="px-5 py-10 text-center text-slate-500">Loading reports...</td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={13} className="px-5 py-10 text-center text-red-500">{error}</td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-5 py-10 text-center text-slate-500">No reports found</td>
                  </tr>
                ) : (
                  sorted.map((r) => {
                    const nr = normaliseRisk(r.overall_risk_level);
                    const isClosed = (reportStatuses.get(r.id) || r.status || "active").toLowerCase() === "closed";
                    return (
                      <tr key={r.id} className={`border-b border-[#F1EDF8] last:border-0 transition ${isClosed ? "bg-slate-50 opacity-70 hover:opacity-100 hover:bg-[#F8F5FF]" : "hover:bg-[#FDFCFF]"}`}>
                        <td className="px-5 py-4">
                          <div className="font-medium text-[#241453]">{r.learner_name || "—"}</div>
                          <div className="text-xs text-slate-500">{r.learner_email || ""}</div>
                        </td>
                        <td className="px-5 py-4 text-[#241453]">{r.programme || "—"}</td>
                        <td className="px-5 py-4 text-[#241453]">{r.organization_name || "—"}</td>
                        <td className="px-5 py-4">
                          <div className="text-[#241453]">{r.coach_name || "—"}</div>
                          {r.coach_email && <div className="text-xs text-slate-500">{r.coach_email}</div>}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${riskBadgeClass(nr)}`}>
                            {nr}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {r.overall_score != null ? (
                            <div>
                              <div className="font-medium text-[#241453]">{r.overall_score}/{r.overall_max_score}</div>
                              {r.percentage != null && (
                                <div className="text-xs text-slate-500">{r.percentage}%</div>
                              )}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-4">
                          {(() => {
                            const done = r.completed_reports ?? 0;
                            const total = r.expected_reports ?? 6;
                            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                            const complete = done >= total && total > 0;
                            const sections = r.section_progress ?? [];
                            const badgeColor: Record<string, string> = {
                              Low: "bg-emerald-100 text-emerald-700",
                              Medium: "bg-amber-100 text-amber-700",
                              Moderate: "bg-amber-100 text-amber-700",
                              High: "bg-red-100 text-red-700",
                              "Very High": "bg-red-200 text-red-800",
                            };
                            return (
                              <div className="flex flex-col gap-1.5 min-w-[120px]">
                                {/* fraction + bar */}
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-sm font-semibold ${complete ? "text-emerald-600" : done > 0 ? "text-[#241453]" : "text-slate-400"}`}>
                                    {done}/{total}
                                  </span>
                                  {complete ? (
                                    <span className="text-[10px] font-bold text-emerald-600">✓ Done</span>
                                  ) : done > 0 ? (
                                    <span className="text-[10px] font-semibold text-amber-500">In progress</span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">Not started</span>
                                  )}
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${complete ? "bg-emerald-500" : done > 0 ? "bg-amber-400" : "bg-slate-200"}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                {/* section badges — only when partially done */}
                                {!complete && sections.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {sections.map((s) => (
                                      <span
                                        key={s.label}
                                        title={s.label}
                                        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-none border ${
                                          s.done
                                            ? `${badgeColor[s.badge ?? ""] || "bg-slate-100 text-slate-600"} border-transparent`
                                            : "bg-white border-slate-200 text-slate-300"
                                        }`}
                                      >
                                        {s.done ? "✓" : "○"} {s.label.split(" ")[0]}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">{formatDate(r.created_at)}</td>

                        {/* Notes */}
                        <td className="px-5 py-4">
                          {(r.notes_count ?? 0) > 0 ? (
                            <button
                              type="button"
                              onClick={() => setNotesModal({ reportId: r.id, learnerName: r.learner_name })}
                              className="inline-flex items-center gap-1 rounded-full bg-[#EEE8F8] px-2.5 py-1 text-xs font-semibold text-[#4B3B8C] hover:bg-[#DDD0F5] transition"
                            >
                              <MessageSquare className="h-3 w-3" />
                              {r.notes_count} note{(r.notes_count ?? 0) !== 1 ? "s" : ""}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        {/* Evidence */}
                        <td className="px-5 py-4">
                          {(r.evidence_count ?? 0) > 0 ? (
                            <button
                              type="button"
                              onClick={() => setEvidenceModal({ reportId: r.id, learnerName: r.learner_name })}
                              className="inline-flex items-center gap-1 rounded-full bg-[#F9F4EC] px-2.5 py-1 text-xs font-semibold text-[#9D6912] hover:bg-[#F0E5D0] transition"
                            >
                              <Paperclip className="h-3 w-3" />
                              {r.evidence_count} file{(r.evidence_count ?? 0) !== 1 ? "s" : ""}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        {/* Status + Actions */}
                        <td className="px-5 py-4">
                          <OnboardingActionsDropdown
                            reportId={r.id}
                            reportStatus={reportStatuses.get(r.id) || "active"}
                            learnerName={r.learner_name}
                            learnerEmail={r.learner_email}
                            onStatusChange={(rid: string, newStatus: string) => {
                              setReportStatuses((prev) => new Map(prev).set(rid, newStatus));
                            }}
                          />
                        </td>

                        <td className="px-5 py-4">
                          {archiveConfirmId === r.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleArchiveReport(r.id)}
                                disabled={archivingId === r.id}
                                className="rounded-lg bg-[#241453] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#362063] disabled:opacity-60"
                              >
                                {archivingId === r.id ? "..." : "Yes"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setArchiveConfirmId(null)}
                                disabled={archivingId === r.id}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setArchiveConfirmId(r.id)}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7B6D9B] hover:text-[#241453]"
                            >
                              <Archive className="h-4 w-4" />
                              Archive
                            </button>
                          )}
                        </td>

                        {/* View Report — last column */}
                        <td className="px-5 py-4">
                          {(() => {
                            const done = r.completed_reports ?? 0;
                            const total = r.expected_reports ?? 6;
                            const complete = done >= total && total > 0;
                            const sections = r.section_progress ?? [];

                            if (complete) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => openReportDetail(r)}
                                  disabled={detailLoadingId === r.id}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#241453] px-3 text-xs font-semibold text-white hover:bg-[#362063] transition whitespace-nowrap"
                                >
                                  {detailLoadingId === r.id ? "Loading..." : "View Report"}
                                </button>
                              );
                            }

                            const completedSections = sections.filter((s) => s.done);
                            if (completedSections.length === 0) {
                              return <span className="text-xs text-slate-400">No reports yet</span>;
                            }

                            return (
                              <div className="flex flex-wrap gap-1.5">
                                {completedSections.map((s) => (
                                  <button
                                    key={s.label}
                                    type="button"
                                    onClick={() => openSectionDetail(r, s.label)}
                                    disabled={detailLoadingId === r.id}
                                    className="inline-flex h-7 items-center gap-1 rounded-xl border border-[#DED5F3] bg-[#F4F0FC] px-2.5 text-[11px] font-semibold text-[#241453] transition hover:bg-[#EAE3F8] disabled:cursor-wait disabled:opacity-60"
                                    title={`View ${s.label} report`}
                                  >
                                    {s.badge && (
                                      <span className={`h-1.5 w-1.5 rounded-full ${
                                        s.badge === "Low" ? "bg-emerald-500" :
                                        s.badge === "High" || s.badge === "Very High" ? "bg-red-500" :
                                        "bg-amber-500"
                                      }`} />
                                    )}
                                    {s.label.split(" ")[0]}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Report Detail Panel */}
      <OnboardingReportDetailPanel report={viewReport} onClose={() => setViewReport(null)} />

      {/* Section Report Modal */}
      <SectionReportModal section={viewSection} onClose={() => setViewSection(null)} />

      {/* Notes Modal */}
      {notesModal && (
        <NotesEvidenceModal
          mode="notes"
          reportId={notesModal.reportId}
          learnerName={notesModal.learnerName}
          onClose={() => setNotesModal(null)}
        />
      )}

      {/* Evidence Modal */}
      {evidenceModal && (
        <NotesEvidenceModal
          mode="evidence"
          reportId={evidenceModal.reportId}
          learnerName={evidenceModal.learnerName}
          onClose={() => setEvidenceModal(null)}
        />
      )}

      {archivedPanelOpen && (
        <ArchivedOnboardingReportsPanel
          coachEmail={coachEmail}
          onClose={() => setArchivedPanelOpen(false)}
          onRestored={reloadReports}
        />
      )}
    </div>
  );
}
