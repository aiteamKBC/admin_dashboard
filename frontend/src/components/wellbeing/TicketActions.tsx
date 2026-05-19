import React from "react";
import { createPortal } from "react-dom";
import {
  MoreHorizontal, Eye, UserCheck, FileText, MessageCircle,
  Phone, HelpCircle, Calendar, Paperclip, AlertTriangle,
  Shield, AlertOctagon, ExternalLink, ClipboardCheck, XCircle,
  RotateCcw, Upload, Image as ImageIcon, X, BookOpen,
} from "lucide-react";
import {
  createTicketNote,
  uploadEvidenceFile,
  createTicketEvidence,
  updateSupportTicket,
  createBookingAppointment,
  getBookingAvailability,
  getBookingStaff,
  createOnboardingReportNote,
  createOnboardingReportEvidence,
  updateOnboardingReport,
} from "@/services/coachWellbeing";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TicketStatus =
  | "open" | "new" | "under review" | "assigned" | "awaiting information"
  | "action in progress" | "follow-up scheduled" | "support plan active"
  | "escalated" | "external referral made" | "outcome recorded"
  | "closed" | "reopened";

export type ActionModalType =
  | "case_note" | "contact_learner" | "contact_coach" | "schedule_followup"
  | "add_evidence" | "change_risk" | "support_plan" | "escalate"
  | "external_referral" | "record_outcome" | "close_case" | null;

export type ActionItem = {
  id: string;
  label: string;
  newStatus?: string;
  requiresModal?: boolean;
  danger?: boolean;
  success?: boolean;
};

export type ActionGroup = {
  label: string;
  items: ActionItem[];
};

export type TicketNoteRow = {
  id: number | string;
  note: string;
  created_by: string;
  created_at: string | null;
};

export type TicketEvidenceRow = {
  id: number | string;
  description: string;
  file_url: string;
  file_name: string;
  created_by: string;
  created_at: string | null;
  uploaded_by?: string;
  url?: string;
  original_name?: string;
  mime_type?: string;
};

export type SupportTicketRow = {
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

// ── resolveMediaUrl ───────────────────────────────────────────────────────────

const MEDIA_BASE = (
  (import.meta as any).env?.VITE_MEDIA_URL ||
  (import.meta as any).env?.VITE_API_ORIGIN ||
  ""
).toString().trim();

export function resolveMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${MEDIA_BASE}${url}`;
}

// ── ACTION_ICONS ──────────────────────────────────────────────────────────────

export const ACTION_ICONS: Record<string, React.ElementType> = {
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

// ── ACTION_GROUPS ─────────────────────────────────────────────────────────────

export const ACTION_GROUPS: ActionGroup[] = [
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

// ── TicketActionsDropdown ─────────────────────────────────────────────────────

export function TicketActionsDropdown({
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

// ── ActionModal ───────────────────────────────────────────────────────────────

export function ActionModal({
  type,
  ticket,
  onClose,
  onConfirm,
  saveNote,
  saveEvidence,
}: {
  type: ActionModalType;
  ticket: SupportTicketRow;
  onClose: () => void;
  onConfirm: (newStatus?: string, extra?: { risk?: string; notesChanged?: boolean; evidenceChanged?: boolean }) => void;
  saveNote?: (note: string) => Promise<void>;
  saveEvidence?: (payload: { description: string; file_url?: string; file_name?: string }) => Promise<void>;
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
        if (note.trim()) {
          if (saveNote) await saveNote(note.trim());
          else await createTicketNote(ticket.id, note.trim());
        }
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
        const evidencePayload = { description: note.trim(), file_url: fileUrl, file_name: fileName };
        if (saveEvidence) await saveEvidence(evidencePayload);
        else await createTicketEvidence(ticket.id, evidencePayload);
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
        if (saveNote) await saveNote(noteText);
        else await createTicketNote(ticket.id, noteText);

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
        if (!saveNote) await updateSupportTicket(ticket.id, { urgency: newUrgency });
        const noteText = `🔴 Risk level changed to ${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}${note.trim() ? ` — ${note.trim()}` : ""}`;
        if (saveNote) await saveNote(noteText);
        else await createTicketNote(ticket.id, noteText);
        onConfirm(undefined, { risk: riskLevel, notesChanged: true });
        return;
      }

      if (type === "contact_learner" || type === "contact_coach") {
        const label = type === "contact_learner" ? "Learner" : "Coach";
        const noteText = `📞 Contacted ${label} via ${contactMethod}${note.trim() ? ` — ${note.trim()}` : ""}`;
        if (saveNote) await saveNote(noteText);
        else await createTicketNote(ticket.id, noteText);
        onConfirm(statusChanges[type], { notesChanged: true });
        return;
      }

      if (type === "support_plan") {
        const noteText = `📋 Support Plan: ${planDetails.trim()}${note.trim() ? `\nKey Actions: ${note.trim()}` : ""}`;
        if (saveNote) await saveNote(noteText);
        else await createTicketNote(ticket.id, noteText);
        onConfirm("support plan active", { notesChanged: true });
        return;
      }

      if (type === "escalate") {
        const noteText = `⚠️ Escalated to ${escalateTo} — ${escalateReason.trim()}`;
        if (saveNote) await saveNote(noteText);
        else await createTicketNote(ticket.id, noteText);
        onConfirm("escalated", { notesChanged: true });
        return;
      }

      if (type === "external_referral") {
        const noteText = `🔗 External Referral: ${referralOrg.trim()} (${referralType})${note.trim() ? ` — ${note.trim()}` : ""}`;
        if (saveNote) await saveNote(noteText);
        else await createTicketNote(ticket.id, noteText);
        onConfirm("external referral made", { notesChanged: true });
        return;
      }

      if (type === "record_outcome") {
        const noteText = `✅ Outcome: ${resolutionType} — ${outcomeDesc.trim()}`;
        if (saveNote) await saveNote(noteText);
        else await createTicketNote(ticket.id, noteText);
        onConfirm("outcome recorded", { notesChanged: true });
        return;
      }

      if (type === "close_case") {
        const closeNote = "🔒 Case closed. All checklist items confirmed.";
        if (saveNote) await saveNote(closeNote);
        else await createTicketNote(ticket.id, closeNote);
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

// ── OnboardingActionsDropdown ─────────────────────────────────────────────────

const ONBOARDING_ACTION_GROUPS: ActionGroup[] = [
  {
    label: "Notes & Files",
    items: [
      { id: "case_note", label: "Add Note", requiresModal: true },
      { id: "add_evidence", label: "Add Evidence / File", requiresModal: true },
    ],
  },
  {
    label: "Schedule",
    items: [
      { id: "schedule_followup", label: "Schedule Follow-up", requiresModal: true },
    ],
  },
  {
    label: "Status",
    items: [
      { id: "mark_reviewed", label: "Mark as Reviewed", newStatus: "reviewed" },
      { id: "mark_flagged", label: "Flag for Attention", newStatus: "flagged" },
      { id: "close_case", label: "Close / Archive", requiresModal: true, newStatus: "closed", danger: true },
      { id: "reopen_case", label: "Reopen / Set Active", newStatus: "active", success: true },
    ],
  },
];

const ONBOARDING_EXTRA_ICONS: Record<string, React.ElementType> = {
  mark_reviewed: ClipboardCheck,
  mark_flagged: AlertTriangle,
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:   { label: "Active",    cls: "bg-emerald-50 text-emerald-700" },
  reviewed: { label: "Reviewed",  cls: "bg-blue-50 text-blue-700" },
  flagged:  { label: "Flagged",   cls: "bg-amber-50 text-amber-700" },
  closed:   { label: "Closed",    cls: "bg-slate-100 text-slate-500" },
};

export function OnboardingActionsDropdown({
  reportId,
  reportStatus,
  learnerName,
  learnerEmail,
  onStatusChange,
}: {
  reportId: string;
  reportStatus: string;
  learnerName: string;
  learnerEmail: string;
  onStatusChange?: (reportId: string, newStatus: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0, maxH: 320 });
  const [activeModal, setActiveModal] = React.useState<ActionModalType>(null);
  const [updating, setUpdating] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  const MENU_W = 240;
  const currentStatus = (reportStatus || "active").toLowerCase();

  const calcPos = React.useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const HEADER_H = 44;
    let top: number;
    let maxH: number;
    if (spaceBelow >= spaceAbove || spaceBelow >= 180) {
      maxH = Math.min(380, Math.max(120, spaceBelow - 8));
      top = rect.bottom + 4;
    } else {
      maxH = Math.min(380, Math.max(120, spaceAbove - HEADER_H - 8));
      top = Math.max(8, rect.top - HEADER_H - maxH - 4);
    }
    let left = rect.right - MENU_W;
    if (left < 8) left = 8;
    if (left + MENU_W > window.innerWidth - 8) left = window.innerWidth - MENU_W - 8;
    setPos({ top, left, maxH });
  }, []);

  React.useEffect(() => {
    if (!open) return;
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

  async function handleAction(item: ActionItem) {
    setOpen(false);
    if (item.requiresModal) {
      setActiveModal(item.id as ActionModalType);
    } else if (item.newStatus) {
      setUpdating(true);
      try {
        await updateOnboardingReport(reportId, { status: item.newStatus });
        onStatusChange?.(reportId, item.newStatus);
      } finally {
        setUpdating(false);
      }
    }
  }

  const filteredGroups = ONBOARDING_ACTION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.id === "reopen_case") return currentStatus === "closed";
      if (item.id === "close_case") return currentStatus !== "closed";
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  const badge = STATUS_BADGE[currentStatus] ?? STATUS_BADGE.active;

  const fakeTicket: SupportTicketRow = {
    id: 0,
    ticketCode: `ONB-${reportId}`,
    learnerName,
    learnerEmail,
    type: "onboarding",
    risk: "amber",
    source: "onboarding",
    createdAt: null,
    status: currentStatus as TicketStatus,
    daysOpen: 0,
    subject: `Onboarding Report #${reportId}`,
    details: "",
    urgency: "medium",
    preferredContact: "email",
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
        <button
          ref={btnRef}
          type="button"
          onClick={handleToggle}
          disabled={updating}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#E7E2F3] text-[#241453] hover:bg-[#F8F5FF] disabled:opacity-50"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {open && createPortal(
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
            <div className="flex items-center gap-2 border-b border-[#F0EAFB] bg-[#FAF8FF] px-4 py-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#644D93]/10">
                <BookOpen className="h-3.5 w-3.5 text-[#644D93]" />
              </div>
              <p className="text-xs font-semibold text-[#3D2A73]">Onboarding Actions</p>
            </div>

            <div className="custom-scroll overflow-y-auto py-1.5" style={{ maxHeight: pos.maxH }}>
              {filteredGroups.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <div className="mx-3 my-1.5 border-t border-[#F0EAFB]" />}
                  <div className="px-4 pb-1 pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#B8AACC]">
                      {group.label}
                    </p>
                  </div>
                  {group.items.map((item) => {
                    const Icon = ONBOARDING_EXTRA_ICONS[item.id] || ACTION_ICONS[item.id];
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
        </>,
        document.body
      )}

      {activeModal !== null && (
        <ActionModal
          type={activeModal}
          ticket={fakeTicket}
          onClose={() => setActiveModal(null)}
          onConfirm={async (newStatus) => {
            if (newStatus) {
              try {
                await updateOnboardingReport(reportId, { status: newStatus });
                onStatusChange?.(reportId, newStatus);
              } catch { /* silent */ }
            }
            setActiveModal(null);
          }}
          saveNote={async (note) => { await createOnboardingReportNote(reportId, note); }}
          saveEvidence={async (payload) => { await createOnboardingReportEvidence(reportId, payload); }}
        />
      )}
    </>
  );
}
