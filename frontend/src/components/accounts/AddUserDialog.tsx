import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { accountFetch } from "../../services/accountFetch";

type Props = { onClose: () => void; onCreated: (username: string) => void };

export default function AddUserDialog({ onClose, onCreated }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("coach");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrors({});
    try {
      const response = await accountFetch("/api/accounts/users/", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), email: email.trim(), role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const nextErrors: Record<string, string> = {};
        for (const key of ["username", "email", "role", "detail"]) {
          if (data[key]) nextErrors[key] = Array.isArray(data[key]) ? data[key].join(" ") : String(data[key]);
        }
        setErrors(Object.keys(nextErrors).length ? nextErrors : { detail: "Could not add the user. Please try again." });
        return;
      }
      onCreated(data.username);
    } catch {
      setErrors({ detail: "Could not connect to the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-[#DED5F3] bg-white px-3 py-2.5 text-[#241453] outline-none focus:border-[#866CB6] focus:ring-2 focus:ring-[#E7E2F3] disabled:bg-gray-50";
  return (
    <dialog ref={dialog} aria-labelledby="add-user-title"
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-[#E7E2F3] bg-white p-0 text-[#241453] shadow-xl backdrop:bg-[#241453]/40">
      <form onSubmit={submit} className="p-6 sm:p-7" aria-busy={saving}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="add-user-title" className="flex items-center gap-2 text-xl font-semibold"><UserPlus className="h-5 w-5" />Add user</h2>
            <p className="mt-2 text-sm text-[#6F6387]">Create a dashboard account.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
            className="rounded-lg p-1.5 hover:bg-[#F8F6FC] disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>
        {errors.detail && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors.detail}</p>}
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="new-user-name" className="text-sm font-medium">Username</label>
            <input id="new-user-name" autoFocus required maxLength={150} autoComplete="off" value={username}
              onChange={(event) => setUsername(event.target.value)} disabled={saving} className={inputClass}
              aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? "username-error" : undefined} />
            {errors.username && <p id="username-error" role="alert" className="mt-1 text-sm text-red-700">{errors.username}</p>}
          </div>
          <div>
            <label htmlFor="new-user-email" className="text-sm font-medium">Email</label>
            <input id="new-user-email" type="email" required maxLength={254} autoComplete="off" value={email}
              onChange={(event) => setEmail(event.target.value)} disabled={saving} className={inputClass}
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : "sign-in-help"} />
            {errors.email && <p id="email-error" role="alert" className="mt-1 text-sm text-red-700">{errors.email}</p>}
            <p id="sign-in-help" className="mt-2 text-xs text-[#6F6387]">The user signs in with Microsoft using this email.</p>
          </div>
          <div>
            <label htmlFor="new-user-role" className="text-sm font-medium">Role</label>
            <select id="new-user-role" value={role} onChange={(event) => setRole(event.target.value)} disabled={saving}
              className={inputClass} aria-describedby="role-help">
              <option value="coach">Coach</option><option value="qa">QA</option>
            </select>
            <p id="role-help" className="mt-2 text-xs text-[#6F6387]">{role === "qa" ? "Can view all learners and add users." : "Can access learners assigned to their email."}</p>
            {errors.role && <p role="alert" className="mt-1 text-sm text-red-700">{errors.role}</p>}
          </div>
        </div>
        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-[#DED5F3] px-4 py-2.5 text-sm font-medium disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#241453] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#442F73] disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Adding..." : "Add user"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
