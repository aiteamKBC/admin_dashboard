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
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import kbcLogoSrc from "@/assets/logo-icon.png";
import { getOnboardingReports } from "@/services/coachWellbeing";

// ── Types ──────────────────────────────────────────────────────────────────

export type OnboardingRiskLevel = "High" | "Moderate" | "Low" | "medium" | "low" | "";

export type OnboardingReport = {
  id: number;
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
  master_report: any;
  created_at: string | null;
  updated_at: string | null;
};

type OnboardingFilters = {
  risk: string[];
};

const emptyFilters: OnboardingFilters = { risk: [] };

// ── Helpers ────────────────────────────────────────────────────────────────

function normaliseRisk(r: string): string {
  const v = (r || "").trim().toLowerCase();
  if (v === "high") return "High";
  if (v === "moderate" || v === "medium") return "Moderate";
  if (v === "low") return "Low";
  return r || "—";
}

function riskBadgeClass(level: string): string {
  const v = (level || "").toLowerCase();
  if (v === "high") return "bg-[#FEF0F0] text-[#B85858] border border-[#EDD5D5]";
  if (v === "moderate" || v === "medium") return "bg-[#FEF9EE] text-[#9A7030] border border-[#EDD8A8]";
  if (v === "low") return "bg-[#F2FAF6] text-[#3D7A55] border border-[#BDDECE]";
  return "bg-slate-100 text-slate-500 border border-slate-200";
}

function priorityBadgeClass(p: string): string {
  const v = (p || "").toLowerCase();
  if (v === "high" || v === "urgent") return "bg-[#FEF0F0] text-[#B85858]";
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

// ── PDF Generator ──────────────────────────────────────────────────────────

async function downloadInclusivenessPDF(report: OnboardingReport) {
  const master = report.master_report || {};
  const overview = master.overview || {};
  const reportHeader = master.reportHeader || {};
  const riskRoadmap: any[] = master.riskRoadmap || [];
  const keyFindings: any[] = master.keyFindings || [];
  const supportPlan: Record<string, string[]> = master.supportPlan || {};
  const priorityActions: any[] = master.priorityActions || [];
  const reviewTimeline = master.reviewTimeline || {};
  const managerBrief = master.managerBrief || {};
  const executiveSummary = master.executiveSummary || "";
  const professionalNote = master.professionalNote || "";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mx = 14;
  const contentW = W - mx * 2;

  const C = {
    purple: [36, 20, 83] as [number, number, number],
    purpleLight: [98, 72, 190] as [number, number, number],
    purpleBg: [248, 246, 252] as [number, number, number],
    purpleMid: [123, 109, 155] as [number, number, number],
    border: [230, 221, 248] as [number, number, number],
    cardBg: [252, 251, 254] as [number, number, number],
    textBody: [60, 50, 80] as [number, number, number],
    red: [220, 38, 38] as [number, number, number],
    redBg: [254, 242, 242] as [number, number, number],
    amber: [180, 100, 10] as [number, number, number],
    amberBg: [255, 251, 235] as [number, number, number],
    green: [4, 120, 87] as [number, number, number],
    greenBg: [240, 253, 244] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  };

  const riskColor = (level: string): [number, number, number] => {
    const v = (level || "").toLowerCase();
    if (v === "high") return C.red;
    if (v === "moderate" || v === "medium") return C.amber;
    return C.green;
  };
  const riskBgColor = (level: string): [number, number, number] => {
    const v = (level || "").toLowerCase();
    if (v === "high") return C.redBg;
    if (v === "moderate" || v === "medium") return C.amberBg;
    return C.greenBg;
  };

  let curY = 0;

  function addPage() {
    doc.addPage();
    curY = 15;
  }

  function checkSpace(needed: number) {
    if (curY + needed > H - 20) addPage();
  }

  function sectionHeader(title: string) {
    checkSpace(14);
    doc.setFillColor(...C.purple);
    doc.roundedRect(mx, curY, contentW, 9, 2, 2, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.white);
    doc.text(title.toUpperCase(), mx + 5, curY + 6);
    curY += 12;
  }

  // ── PAGE 1: Header ──────────────────────────────────────────────────────

  // Logo + header bar
  doc.setFillColor(...C.purple);
  doc.rect(0, 0, W, 28, "F");

  try {
    const img = new Image();
    img.src = kbcLogoSrc;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      setTimeout(resolve, 500);
    });
    doc.addImage(img, "PNG", mx, 5, 18, 18);
  } catch { /* skip logo if load fails */ }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.white);
  doc.text("Learner Inclusiveness Report", mx + 22, 13);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Kent Business College — Confidential Assessment", mx + 22, 20);

  // Generated date (top right)
  if (reportHeader.generatedAt) {
    doc.setFontSize(7.5);
    doc.text(`Generated: ${formatDate(reportHeader.generatedAt)}`, W - mx, 20, { align: "right" });
  }

  curY = 34;

  // ── Learner Info Card ──────────────────────────────────────────────────
  const riskLvl = pdfSafe(overview.overallRiskLevel || reportHeader.overallRiskLevel || report.overall_risk_level);
  doc.setFillColor(...riskBgColor(riskLvl));
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(mx, curY, contentW, 32, 3, 3, "FD");

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.purple);
  doc.text(pdfSafe(reportHeader.learnerName || report.learner_name), mx + 6, curY + 10);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textBody);
  doc.text(`Email: ${pdfSafe(reportHeader.learnerEmail || report.learner_email)}`, mx + 6, curY + 17);
  doc.text(`Programme: ${pdfSafe(reportHeader.programme || report.programme)}`, mx + 6, curY + 23);
  doc.text(`Organisation: ${pdfSafe(reportHeader.organisation || report.organization_name)}`, mx + 6, curY + 29);

  // Risk badge (top-right)
  const rbx = W - mx - 42;
  doc.setFillColor(...riskColor(riskLvl));
  doc.roundedRect(rbx, curY + 6, 38, 12, 3, 3, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.white);
  doc.text(`${riskLvl.toUpperCase()} RISK`, rbx + 19, curY + 14, { align: "center" });

  curY += 38;

  // ── Score Overview ─────────────────────────────────────────────────────
  const score = overview.overallScore ?? report.overall_score;
  const maxScore = overview.overallMaxScore ?? report.overall_max_score ?? 180;
  const pct = overview.percentage ?? report.percentage;

  if (score != null) {
    doc.setFillColor(...C.purpleBg);
    doc.setDrawColor(...C.border);
    doc.roundedRect(mx, curY, contentW, 22, 3, 3, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.purpleMid);
    doc.text("OVERALL SCORE", mx + 6, curY + 7);

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.purple);
    doc.text(`${score}`, mx + 6, curY + 18);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.purpleMid);
    doc.text(`/ ${maxScore}`, mx + 6 + doc.getTextWidth(`${score}`) + 2, curY + 18);

    if (pct != null) {
      doc.setFontSize(8);
      doc.setTextColor(...C.textBody);
      doc.text(`${pct}% complete`, mx + 50, curY + 7);

      // Progress bar
      const barX = mx + 50;
      const barW = contentW - 56;
      const barY = curY + 12;
      doc.setFillColor(220, 215, 240);
      doc.roundedRect(barX, barY, barW, 4, 2, 2, "F");
      doc.setFillColor(...riskColor(riskLvl));
      doc.roundedRect(barX, barY, barW * (pct / 100), 4, 2, 2, "F");
    }

    curY += 28;
  }

  // ── Risk Roadmap ───────────────────────────────────────────────────────
  if (riskRoadmap.length > 0) {
    sectionHeader("Risk Roadmap — Inclusiveness Screening Areas");

    const colW = (contentW - 4) / 2;
    for (let i = 0; i < riskRoadmap.length; i += 2) {
      checkSpace(24);
      const left = riskRoadmap[i];
      const right = riskRoadmap[i + 1];

      for (let j = 0; j < 2; j++) {
        const item = j === 0 ? left : right;
        if (!item) continue;
        const x = mx + j * (colW + 4);
        const rl = pdfSafe(item.riskLevel || "");
        doc.setFillColor(...riskBgColor(rl));
        doc.setDrawColor(...C.border);
        doc.roundedRect(x, curY, colW, 20, 2, 2, "FD");

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.purple);
        const labelLines = doc.splitTextToSize(pdfSafe(item.label), colW - 14) as string[];
        doc.text(labelLines[0] || "", x + 5, curY + 7);
        if (labelLines[1]) doc.text(labelLines[1], x + 5, curY + 11);

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...riskColor(rl));
        doc.text(`${rl}`, x + 5, curY + 16);

        if (item.score != null && item.maxScore) {
          doc.setTextColor(...C.purpleMid);
          doc.text(`${item.score}/${item.maxScore}`, x + colW - 5, curY + 7, { align: "right" });

          // Mini bar
          const bx = x + 5;
          const bw = colW - 10;
          const by = curY + 18;
          doc.setFillColor(220, 215, 240);
          doc.roundedRect(bx, by, bw, 2, 1, 1, "F");
          doc.setFillColor(...riskColor(rl));
          doc.roundedRect(bx, by, bw * (item.score / item.maxScore), 2, 1, 1, "F");
        }
      }
      curY += 24;
    }
  }

  // ── Executive Summary ─────────────────────────────────────────────────
  if (executiveSummary) {
    sectionHeader("Executive Summary");
    checkSpace(20);
    doc.setFillColor(...C.cardBg);
    doc.setDrawColor(...C.border);
    const summaryLines = doc.splitTextToSize(pdfSafe(executiveSummary), contentW - 10) as string[];
    const summaryH = summaryLines.length * 4.5 + 8;
    checkSpace(summaryH);
    doc.roundedRect(mx, curY, contentW, summaryH, 2, 2, "FD");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.textBody);
    doc.text(summaryLines, mx + 5, curY + 6);
    curY += summaryH + 4;
  }

  // ── Key Findings ──────────────────────────────────────────────────────
  if (keyFindings.length > 0) {
    sectionHeader("Key Findings & Recommended Responses");

    for (const finding of keyFindings) {
      const rl = pdfSafe(finding.riskLevel || "");
      const areaLines = doc.splitTextToSize(pdfSafe(finding.area), contentW - 10) as string[];
      const findingLines = doc.splitTextToSize(`Finding: ${pdfSafe(finding.finding)}`, contentW - 12) as string[];
      const respLines = doc.splitTextToSize(`Recommended Response: ${pdfSafe(finding.recommendedResponse)}`, contentW - 12) as string[];
      const totalH = areaLines.length * 4.5 + findingLines.length * 4 + respLines.length * 4 + 14;

      checkSpace(totalH);
      doc.setFillColor(...riskBgColor(rl));
      doc.setDrawColor(...C.border);
      doc.roundedRect(mx, curY, contentW, totalH, 2, 2, "FD");

      // Accent bar
      doc.setFillColor(...riskColor(rl));
      doc.rect(mx, curY, 3, totalH, "F");

      let fy = curY + 6;
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.purple);
      doc.text(areaLines, mx + 8, fy);
      fy += areaLines.length * 4.5 + 2;

      // Risk badge
      doc.setFillColor(...riskColor(rl));
      doc.roundedRect(mx + contentW - 28, curY + 4, 24, 7, 2, 2, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.white);
      doc.text(rl.toUpperCase(), mx + contentW - 16, curY + 9, { align: "center" });

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textBody);
      doc.text(findingLines, mx + 8, fy);
      fy += findingLines.length * 4 + 3;

      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...C.purpleLight);
      doc.text(respLines, mx + 8, fy);

      curY += totalH + 4;
    }
  }

  // ── Support Plan ──────────────────────────────────────────────────────
  const supportCategories: [string, string][] = [
    ["digitalSupport", "Digital Support"],
    ["learningSupport", "Learning Support"],
    ["wellbeingSupport", "Wellbeing Support"],
    ["assignmentSupport", "Assignment Support"],
    ["communicationSupport", "Communication Support"],
    ["accessibilityAdjustments", "Accessibility Adjustments"],
  ];

  const hasSupportPlan = supportCategories.some(([key]) => (supportPlan[key] || []).length > 0);
  if (hasSupportPlan) {
    sectionHeader("Support Plan");

    for (const [key, label] of supportCategories) {
      const items: string[] = supportPlan[key] || [];
      if (!items.length) continue;

      const bulletLines: string[][] = items.map((item) =>
        doc.splitTextToSize(`\xB7  ${pdfSafe(item)}`, contentW - 14) as string[]
      );
      const totalLines = bulletLines.reduce((s, l) => s + l.length, 0);
      const cardH = totalLines * 4 + 14;

      checkSpace(cardH);
      doc.setFillColor(...C.purpleBg);
      doc.setDrawColor(...C.border);
      doc.roundedRect(mx, curY, contentW, cardH, 2, 2, "FD");

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.purple);
      doc.text(label.toUpperCase(), mx + 5, curY + 7);

      let ly = curY + 12;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textBody);
      for (const lines of bulletLines) {
        doc.text(lines, mx + 8, ly);
        ly += lines.length * 4;
      }
      curY += cardH + 4;
    }
  }

  // ── Priority Actions ──────────────────────────────────────────────────
  if (priorityActions.length > 0) {
    sectionHeader("Priority Actions");
    checkSpace(40);

    autoTable(doc, {
      startY: curY,
      head: [["Priority", "Owner", "Action", "Due Date"]],
      body: priorityActions.map((a) => [
        pdfSafe(a.priority),
        pdfSafe(a.owner),
        pdfSafe(a.action),
        pdfSafe(a.due),
      ]),
      theme: "plain",
      styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak", valign: "top" },
      headStyles: {
        fillColor: C.purpleBg,
        textColor: C.purpleMid,
        fontStyle: "bold",
        fontSize: 7.5,
      },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 24 },
        2: { cellWidth: contentW - 18 - 24 - 28 },
        3: { cellWidth: 28 },
      },
      margin: { left: mx, right: mx },
      tableLineColor: C.border,
      tableLineWidth: 0.3,
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const v = String(data.cell.raw || "").toLowerCase();
          if (v === "high" || v === "urgent") data.cell.styles.textColor = C.red;
          else if (v === "medium") data.cell.styles.textColor = C.amber;
          else data.cell.styles.textColor = C.green;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    curY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Review Timeline ───────────────────────────────────────────────────
  if (reviewTimeline.initialReview || reviewTimeline.followUpReview || reviewTimeline.nextFormalReview) {
    sectionHeader("Review Timeline");
    checkSpace(30);

    const milestones = [
      { label: "Initial Review", value: reviewTimeline.initialReview },
      { label: "Follow-up Review", value: reviewTimeline.followUpReview },
      { label: "Next Formal Review", value: reviewTimeline.nextFormalReview },
    ].filter((m) => m.value);

    const mW = (contentW - (milestones.length - 1) * 4) / milestones.length;
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (!m) continue;
      const x = mx + i * (mW + 4);
      const textLines = doc.splitTextToSize(pdfSafe(m.value), mW - 8) as string[];
      const cardH = textLines.length * 4 + 16;
      checkSpace(cardH);
      doc.setFillColor(...C.purpleBg);
      doc.setDrawColor(...C.border);
      doc.roundedRect(x, curY, mW, cardH, 2, 2, "FD");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.purpleLight);
      doc.text(m.label.toUpperCase(), x + 5, curY + 7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textBody);
      doc.text(textLines, x + 5, curY + 13);
    }
    curY += 40;
  }

  // ── Manager Brief ─────────────────────────────────────────────────────
  if (managerBrief.oneLineStatus || managerBrief.recommendedNextStep) {
    sectionHeader("Manager Brief");
    checkSpace(20);

    if (managerBrief.oneLineStatus) {
      const statusLines = doc.splitTextToSize(pdfSafe(managerBrief.oneLineStatus), contentW - 10) as string[];
      const sh = statusLines.length * 4.5 + 8;
      checkSpace(sh);
      doc.setFillColor(...C.redBg);
      doc.setDrawColor(255, 200, 200);
      doc.roundedRect(mx, curY, contentW, sh, 2, 2, "FD");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.red);
      doc.text(statusLines, mx + 5, curY + 6);
      curY += sh + 4;
    }

    if ((managerBrief.whatNeedsAttention || []).length > 0) {
      const items: string[] = managerBrief.whatNeedsAttention;
      const bulletLines: string[][] = items.map((i) =>
        doc.splitTextToSize(`\xB7  ${pdfSafe(i)}`, contentW - 12) as string[]
      );
      const totalH = bulletLines.reduce((s, l) => s + l.length * 4, 0) + 14;
      checkSpace(totalH);
      doc.setFillColor(...C.cardBg);
      doc.setDrawColor(...C.border);
      doc.roundedRect(mx, curY, contentW, totalH, 2, 2, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.purple);
      doc.text("What Needs Attention:", mx + 5, curY + 7);
      let ly = curY + 12;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textBody);
      for (const lines of bulletLines) { doc.text(lines, mx + 8, ly); ly += lines.length * 4; }
      curY += totalH + 4;
    }

    if (managerBrief.recommendedNextStep) {
      const nsLines = doc.splitTextToSize(`Recommended Next Step: ${pdfSafe(managerBrief.recommendedNextStep)}`, contentW - 10) as string[];
      const nh = nsLines.length * 4.5 + 8;
      checkSpace(nh);
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(200, 240, 220);
      doc.roundedRect(mx, curY, contentW, nh, 2, 2, "FD");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.green);
      doc.text(nsLines, mx + 5, curY + 6);
      curY += nh + 4;
    }
  }

  // ── Professional Note ─────────────────────────────────────────────────
  if (professionalNote) {
    checkSpace(20);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...C.purpleMid);
    const noteLines = doc.splitTextToSize(`Note: ${pdfSafe(professionalNote)}`, contentW) as string[];
    doc.text(noteLines, mx, curY + 5);
    curY += noteLines.length * 4 + 10;
  }

  // ── Footer on all pages ───────────────────────────────────────────────
  const pageCount = (doc.internal as any).getNumberOfPages?.() ?? 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...C.purple);
    doc.rect(0, H - 8, W, 8, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.white);
    doc.text("Kent Business College — Learner Inclusiveness Report — Confidential", mx, H - 3);
    doc.text(`Page ${i} of ${pageCount}`, W - mx, H - 3, { align: "right" });
  }

  const learnerSlug = (report.learner_name || "learner").toLowerCase().replace(/\s+/g, "-");
  doc.save(`inclusiveness-report-${learnerSlug}-${new Date().toISOString().split("T")[0]}.pdf`);
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
  const activeCount = filters.risk.length;
  function toggleRisk(r: string) {
    const cur = filters.risk;
    onChange({ risk: cur.includes(r) ? cur.filter((v) => v !== r) : [...cur, r] });
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
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7B6D9B]">Risk Level</div>
        <div className="flex flex-wrap gap-1.5">
          {["High", "Moderate", "Low"].map((r) => (
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
  const stroke = v === "high" ? "#D97070" : v === "moderate" || v === "medium" ? "#D4A060" : "#5AAA7A";
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

  const master = report.master_report || {};
  const overview = master.overview || {};
  const reportHeader = master.reportHeader || {};
  const riskRoadmap: any[] = master.riskRoadmap || [];
  const keyFindings: any[] = master.keyFindings || [];
  const supportPlan: Record<string, string[]> = master.supportPlan || {};
  const priorityActions: any[] = master.priorityActions || [];
  const reviewTimeline = master.reviewTimeline || {};
  const managerBrief = master.managerBrief || {};
  const executiveSummary = master.executiveSummary || "";
  const professionalNote = master.professionalNote || "";

  const riskLvl = normaliseRisk(
    overview.overallRiskLevel || reportHeader.overallRiskLevel || report.overall_risk_level || ""
  );
  const score = overview.overallScore ?? report.overall_score ?? 0;
  const maxScore = overview.overallMaxScore ?? report.overall_max_score ?? 180;
  const pct = overview.percentage ?? report.percentage ?? 0;

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
                      const secPct = section.maxScore ? Math.round((section.score / section.maxScore) * 100) : 0;
                      return (
                        <div key={i} className={`rounded-2xl border ${secRc.border} ${secRc.bg} p-4`}>
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 ${secRc.text}`}>
                              {sectionIcon(section.sectionIcon || "")}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#241453] leading-tight">{section.label}</p>
                              <p className={`text-[11px] font-bold mt-0.5 ${secRc.text}`}>{section.riskLevel}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-lg font-bold text-[#241453]">{section.score}</span>
                            <span className="text-xs text-[#7B6D9B]">/ {section.maxScore}</span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-white/60 overflow-hidden">
                            <div className="h-2.5 rounded-full transition-all" style={{ width: `${secPct}%`, backgroundColor: secRc.barColor }} />
                          </div>
                          <p className={`mt-1.5 text-right text-[10px] font-semibold ${secRc.text}`}>{secPct}%</p>
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

  return createPortal(modal, document.body);
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

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getOnboardingReports();
        if (!mounted) return;
        setReports(res?.reports || []);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Failed to load onboarding reports");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
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
      if (filters.risk.length > 0) {
        const nr = normaliseRisk(r.overall_risk_level);
        if (!filters.risk.includes(nr)) return false;
      }
      return true;
    });
  }, [reports, search, filters, coachEmail]);

  const stats = useMemo(() => ({
    total: reports.length,
    high: reports.filter((r) => normaliseRisk(r.overall_risk_level) === "High").length,
    moderate: reports.filter((r) => normaliseRisk(r.overall_risk_level) === "Moderate").length,
    low: reports.filter((r) => normaliseRisk(r.overall_risk_level) === "Low").length,
  }), [reports]);

  const activeFilterCount = filters.risk.length;

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
      if (v === "high") return [192, 80, 80];
      if (v === "moderate" || v === "medium") return [178, 119, 21]; // gold #b27715
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

  return (
    <div className="space-y-6">
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
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E7E2F3] px-4 text-sm text-[#241453] hover:bg-[#F8F5FF]"
                >
                  <FileDown className="h-4 w-4" />
                  Export
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
        </div>

        {/* Stat Cards */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { title: "Total Reports", value: stats.total, icon: <FileText className="h-4 w-4" />, color: "text-[#0F9B8E]", bg: "bg-[#E6F7F6]" },
            { title: "High Risk", value: stats.high, icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-500", bg: "bg-red-50" },
            { title: "Moderate Risk", value: stats.moderate, icon: <Users className="h-4 w-4" />, color: "text-amber-500", bg: "bg-amber-50" },
            { title: "Low Risk", value: stats.low, icon: <CheckCircle className="h-4 w-4" />, color: "text-emerald-500", bg: "bg-emerald-50" },
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
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 bg-[#FCFBFE]">
                <tr className="border-b border-[#EEE8F8] text-left text-[#7B6D9B]">
                  <th className="px-5 py-4 font-medium">Learner</th>
                  <th className="px-5 py-4 font-medium">Programme</th>
                  <th className="px-5 py-4 font-medium">Organisation</th>
                  <th className="px-5 py-4 font-medium">Coach</th>
                  <th className="px-5 py-4 font-medium">Risk</th>
                  <th className="px-5 py-4 font-medium">Score</th>
                  <th className="px-5 py-4 font-medium">Reports</th>
                  <th className="px-5 py-4 font-medium">Date</th>
                  <th className="px-5 py-4 font-medium">View</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-slate-500">Loading reports...</td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-red-500">{error}</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-slate-500">No reports found</td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const nr = normaliseRisk(r.overall_risk_level);
                    return (
                      <tr key={r.id} className="border-b border-[#F1EDF8] last:border-0 hover:bg-[#FDFCFF] transition">
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
                        <td className="px-5 py-4 text-[#241453]">
                          {r.completed_reports != null ? `${r.completed_reports}/${r.expected_reports}` : "—"}
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">{formatDate(r.created_at)}</td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => setViewReport(r)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#241453] px-3 text-xs font-semibold text-white hover:bg-[#362063] transition"
                          >
                            View Report
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
      </div>

      {/* Report Detail Panel */}
      <OnboardingReportDetailPanel report={viewReport} onClose={() => setViewReport(null)} />
    </div>
  );
}
