import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, Paperclip, Plus, X } from "lucide-react";
import { createInclusionTicket, type CreateInclusionTicketPayload } from "@/services/coachWellbeing";
import type { OnboardingReport } from "./OnboardingTicketsView";

const ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
const CATEGORIES = ["General inclusion", "Technology", "Visual & Hearing", "Dyslexia", "ADHD", "Social Anxiety", "Mood & Learning", "Other"];
const inputClass = "mt-1.5 w-full rounded-xl border border-[#DED5F3] bg-white px-3 py-2.5 text-sm text-[#241453] outline-none focus:border-[#644D93] focus:ring-2 focus:ring-[#EEE8F8]";

function Attachment({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!/\.(jpe?g|png|gif|webp)$/i.test(file.name)) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-[#E7E2F3] bg-white p-2.5">
      {preview ? <img src={preview} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <FileText className="m-2 h-7 w-7 shrink-0 text-[#8E82AA]" />}
      <div className="min-w-0 flex-1"><p className="truncate text-sm text-[#241453]" title={file.name}>{file.name}</p><p className="text-xs text-[#7B6D9B]">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div>
      <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`} className="rounded-lg p-2 text-[#7B6D9B] hover:bg-[#F8F5FF]"><X className="h-4 w-4" /></button>
    </li>
  );
}

export default function CreateInclusionTicketModal({ reports, onClose, onCreated }: {
  reports: OnboardingReport[];
  onClose: () => void;
  onCreated: (report: OnboardingReport) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [learnerSearch, setLearnerSearch] = useState("");
  const [form, setForm] = useState<CreateInclusionTicketPayload>(() => ({
    ticket_id: crypto.randomUUID(), source_report_id: "", subject: "", details: "",
    category: "General inclusion", risk_level: "Moderate", preferred_contact: "email",
    incident_date: "", incident_time: "", evidence_description: "",
  }));
  const learners = useMemo(() => reports.filter((report) => !report.manual_ticket)
    .sort((a, b) => a.learner_name.localeCompare(b.learner_name)), [reports]);
  const selected = learners.find((report) => report.id === form.source_report_id);
  const options = learners.filter((report) => report.id === form.source_report_id ||
    `${report.learner_name} ${report.learner_email}`.toLowerCase().includes(learnerSearch.trim().toLowerCase()));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  function change<K extends keyof CreateInclusionTicketPayload>(key: K, value: CreateInclusionTicketPayload[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function addFiles(incoming: File[]) {
    setFileError("");
    const next = [...files];
    for (const file of incoming) {
      const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
      if (!ACCEPT.split(",").includes(extension)) { setFileError(`Unsupported file: ${file.name}. Choose an image, PDF, Office document, CSV or TXT.`); return; }
      if (!file.size || file.size > 10 * 1024 * 1024) { setFileError(`${file.name} must be non-empty and no larger than 10 MB.`); return; }
      if (!next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file);
    }
    if (next.length > 10 || next.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) {
      setFileError("Attach up to 10 files, with a total size of 25 MB."); return;
    }
    setFiles(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!selected || !form.subject.trim() || !form.details.trim()) { setError("Choose a learner and enter a subject and ticket details."); return; }
    if (form.incident_time && !form.incident_date) { setError("Choose a date for the incident time."); return; }
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await createInclusionTicket({ ...form, subject: form.subject.trim(), details: form.details.trim() }, files);
      onCreated(result.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the ticket. Please try again.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return createPortal(
    <dialog ref={dialog} aria-labelledby="inclusion-create-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-3xl bg-white p-0 text-[#241453] shadow-2xl backdrop:bg-black/45">
      <form onSubmit={submit}>
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#EEE8F8] bg-white px-6 py-5">
          <div><h2 id="inclusion-create-title" className="text-xl font-semibold">Create ticket</h2><p className="mt-1 text-sm text-[#7B6D9B]">Record an inclusion concern and attach supporting evidence.</p></div>
          <button type="button" disabled={saving} onClick={onClose} aria-label="Close create ticket" className="rounded-xl p-2 hover:bg-[#F8F5FF] disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>
        <fieldset disabled={saving} className="space-y-5 p-6 disabled:opacity-70">
          <div className="rounded-2xl bg-[#F8F6FC] p-4">
            <label htmlFor="inclusion-learner-search" className="text-sm font-medium">Find learner</label>
            <input id="inclusion-learner-search" value={learnerSearch} onChange={(event) => setLearnerSearch(event.target.value)} placeholder="Search name or email" className={inputClass} />
            <label htmlFor="inclusion-learner" className="mt-3 block text-sm font-medium">Learner <span className="text-red-500">*</span></label>
            <select id="inclusion-learner" required value={form.source_report_id} onChange={(event) => change("source_report_id", event.target.value)} className={inputClass}>
              <option value="">Select learner...</option>
              {options.map((report) => <option key={report.id} value={report.id}>{report.learner_name} — {report.learner_email}</option>)}
            </select>
            {!learners.length && <p className="mt-2 text-sm text-[#7B6D9B]">No learner reports are available in the current coach selection.</p>}
            {selected && <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">{[["Programme", selected.programme], ["Organisation", selected.organization_name], ["Coach", selected.coach_name], ["Learner email", selected.learner_email]].map(([label, value]) => <div key={label}><dt className="text-[#7B6D9B]">{label}</dt><dd className="mt-1 break-words font-medium">{value || "—"}</dd></div>)}</dl>}
          </div>
          <label className="block text-sm font-medium">Subject <span className="text-red-500">*</span><input required maxLength={200} value={form.subject} onChange={(event) => change("subject", event.target.value)} placeholder="Briefly describe the concern" className={inputClass} /></label>
          <label className="block text-sm font-medium">Ticket details <span className="text-red-500">*</span><textarea required maxLength={20000} rows={5} value={form.details} onChange={(event) => change("details", event.target.value)} placeholder="Describe what happened, the support needed, people involved and any action already taken." className={inputClass} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Category<select value={form.category} onChange={(event) => change("category", event.target.value)} className={inputClass}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="text-sm font-medium">Risk level<select value={form.risk_level} onChange={(event) => change("risk_level", event.target.value as CreateInclusionTicketPayload["risk_level"])} className={inputClass}><option value="Low">Low / Green</option><option value="Moderate">Moderate / Amber</option><option value="High">High / Red</option></select></label>
            <label className="text-sm font-medium">Ticket date<input type="date" value={form.incident_date} onChange={(event) => change("incident_date", event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-medium">Incident time<input type="time" value={form.incident_time} onChange={(event) => change("incident_time", event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-medium">Preferred contact<select value={form.preferred_contact} onChange={(event) => change("preferred_contact", event.target.value as "email" | "phone")} className={inputClass}><option value="email">Email</option><option value="phone">Phone</option></select></label>
          </div>
          <div className="rounded-2xl border border-dashed border-[#CBBBE8] bg-[#FCFBFE] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" />Evidence <span className="font-normal text-[#7B6D9B]">(optional)</span></p>
            <p id="inclusion-file-help" className="mt-1 text-xs leading-5 text-[#7B6D9B]">Images, PDF, Word, Excel, PowerPoint, CSV or TXT. Up to 10 files, 10 MB per file and 25 MB total.</p>
            <input type="file" multiple accept={ACCEPT} aria-label="Attach evidence" aria-describedby="inclusion-file-help" onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = ""; }} className="mt-3 block w-full text-sm text-[#7B6D9B] file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-[#EEE8F8] file:px-4 file:py-2 file:font-medium file:text-[#241453]" />
            {fileError && <p role="alert" className="mt-2 text-sm text-red-600">{fileError}</p>}
            {!!files.length && <><ul className="mt-3 space-y-2">{files.map((file, index) => <Attachment key={`${file.name}-${file.lastModified}-${file.size}`} file={file} onRemove={() => { setFiles((previous) => previous.filter((_, i) => i !== index)); setFileError(""); }} />)}</ul><label className="mt-3 block text-sm font-medium">Evidence description<textarea rows={2} maxLength={2000} value={form.evidence_description} onChange={(event) => change("evidence_description", event.target.value)} placeholder="What do these attachments show?" className={inputClass} /></label></>}
          </div>
          <p className="text-xs text-[#7B6D9B]">Your account and the creation date will be recorded automatically. The ticket starts in Open Tickets.</p>
        </fieldset>
        <div className="sticky bottom-0 border-t border-[#EEE8F8] bg-white px-6 py-4">
          {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3"><button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-[#DED5F3] px-5 py-2.5 text-sm font-medium disabled:opacity-50">Cancel</button><button type="submit" disabled={saving || !learners.length} className="inline-flex items-center gap-2 rounded-xl bg-[#241453] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#362063] disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? "Saving ticket & evidence..." : "Create ticket"}</button></div>
        </div>
      </form>
    </dialog>, document.body,
  );
}
