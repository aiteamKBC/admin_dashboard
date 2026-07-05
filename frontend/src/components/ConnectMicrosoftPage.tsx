import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function ConnectMicrosoftPage() {
  const storedCoachId = localStorage.getItem("coach_id") || "";
  const [coachId, setCoachId] = useState(storedCoachId);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<"success" | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("success") === "1") {
      setToast("success");
      setSearchParams({}, { replace: true });
      setTimeout(() => setToast(null), 5000);
      return;
    }

    const microsoftError = searchParams.get("error");
    if (microsoftError) {
      setError(microsoftError);
      setLoading(false);
      setSearchParams({}, { replace: true });
    }
  }, []);

  function handleConnect() {
    const id = coachId.trim();
    if (!id || Number(id) <= 0) {
      setError("Please enter a valid Coach ID.");
      return;
    }
    setError("");
    setLoading(true);
    window.location.href = `/tasks-api/microsoft/connect/?coach_id=${encodeURIComponent(id)}`;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-5">

      {toast === "success" && (
        <div className="fixed right-5 top-5 z-50 flex items-center gap-3 rounded-2xl bg-emerald-500 px-5 py-3.5 text-sm font-medium text-white shadow-lg">
          <i className="fa-solid fa-circle-check" />
          Microsoft account connected successfully!
        </div>
      )}

      <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl">

        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F4F0FC]">
            <i className="fa-brands fa-microsoft text-2xl text-[#644D93]" />
          </div>
          <h1 className="text-2xl font-bold text-[#241453]">Connect Your Microsoft Account</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Enter your Coach ID, then continue to Microsoft sign in and consent.
            After approval, your account will be connected for meeting, attendance, and transcript sync.
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-[#E7E2F3] bg-[#F8F5FF] p-5">
          <h2 className="mb-3 text-sm font-semibold text-[#241453]">Permissions you will be asked to approve</h2>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Please review the permissions below before continuing.
            The exact consent screen is provided by Microsoft.
          </p>
          <ul className="space-y-1.5 text-xs text-[#3D2A73]">
            {[
              "Read your basic profile information",
              "Read your calendar events and meetings",
              "Read Microsoft Teams online meeting details",
              "Read meeting transcripts metadata",
              "Maintain access so sync can continue automatically after initial approval",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5 text-[#644D93]">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[#241453]">
            Coach ID
          </label>
          <input
            type="number"
            value={coachId}
            onChange={(e) => { setCoachId(e.target.value); setError(""); }}
            placeholder="Example: 1"
            className="h-11 w-full rounded-xl border border-[#DED5F3] px-4 text-sm outline-none focus:border-[#644D93] focus:ring-2 focus:ring-[#644D93]/20"
          />
          {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
        </div>

        <button
          type="button"
          onClick={handleConnect}
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#241453] text-sm font-semibold text-white transition hover:bg-[#442F73] disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Redirecting to Microsoft...
            </>
          ) : (
            <>
              <i className="fa-brands fa-microsoft" />
              Connect Microsoft
            </>
          )}
        </button>

        <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
          You will be redirected to Microsoft, then returned automatically after approval.
        </p>
      </div>
    </div>
  );
}
