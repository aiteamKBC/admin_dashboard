import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Search,
  UserRoundX,
  Users,
  ChevronRight,
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

import { getCoachWellbeing, getCoachOptions } from "@/services/coachWellbeing";
import type {
  CoachLearnerRow,
  CoachWellbeingResponse,
  PriorityLevel,
  RiskLevel,
} from "@/types/coachWellbeing";

type CoachOption = {
  value: string;
  label: string;
};

function riskBadgeClass(risk: RiskLevel) {
  if (risk === "green") return "bg-emerald-500 text-white";
  if (risk === "amber") return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
}

function priorityBadgeClass(priority: PriorityLevel) {
  if (priority === "urgent") return "bg-red-500 text-white";
  if (priority === "high") return "bg-amber-500 text-white";
  if (priority === "medium") return "bg-cyan-100 text-cyan-700";
  return "bg-slate-100 text-slate-600";
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
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium uppercase tracking-wide text-[#7B6D9B]">
            {title}
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#241453]">{value}</div>
        </div>
        <div className="rounded-xl bg-[#F5F1FC] p-3 text-[#644D93]">{icon}</div>
      </div>
    </div>
  );
}

function LearnerTable({ rows }: { rows: CoachLearnerRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-[#ECE7F7] text-left text-[#7B6D9B]">
            <th className="pb-3 font-medium">Learner</th>
            <th className="pb-3 font-medium">Last Survey</th>
            <th className="pb-3 font-medium">Wellbeing</th>
            <th className="pb-3 font-medium">Engagement</th>
            <th className="pb-3 font-medium">Provider</th>
            <th className="pb-3 font-medium">Risk</th>
            <th className="pb-3 font-medium">Action</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CoachWellbeingPage() {
  const role = (localStorage.getItem("role") || "").toLowerCase();

  const [data, setData] = useState<CoachWellbeingResponse | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coachOptions, setCoachOptions] = useState<CoachOption[]>([]);
  const [selectedCoachEmail, setSelectedCoachEmail] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access") || localStorage.getItem("token");
    if (role !== "qa" || !token) return;

    let mounted = true;

    async function loadCoachOptions() {
      try {
        const res = await getCoachOptions();
        if (!mounted) return;

        const normalized = (res || []).map((item: any) => ({
          value: String(item.value ?? item.coach_email ?? "").trim(),
          label: String(item.label ?? item.coach_name ?? item.coach_email ?? "Coach").trim(),
        }));

        console.log("normalized coach options", normalized);
        setCoachOptions(normalized);

        setCoachOptions(normalized);

        if (!selectedCoachEmail && normalized.length > 0) {
          setSelectedCoachEmail(normalized[0].value);
        }
      } catch (err) {
        console.error("Failed to load coach options", err);
      }
    }

    loadCoachOptions();

    return () => {
      mounted = false;
    };
  }, [role, selectedCoachEmail]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        if (role === "qa" && !selectedCoachEmail) {
          setLoading(false);
          setData(null);
          return;
        }

        setLoading(true);
        setError("");

        const res =
          role === "qa"
            ? await getCoachWellbeing(selectedCoachEmail)
            : await getCoachWellbeing();

        if (!mounted) return;
        setData(res);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Failed to load wellbeing dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [role, selectedCoachEmail]);

  const filteredLearners = useMemo(() => {
    const learners = data?.learners || [];
    const q = search.trim().toLowerCase();

    if (!q) return learners;

    return learners.filter((item) => {
      const studentName = String(item.studentName || "").toLowerCase();
      const studentEmail = String(item.studentEmail || "").toLowerCase();
      const recommendedAction = String(item.recommendedAction || "").toLowerCase();
      const programme = String((item as any).programme || "").toLowerCase();

      return (
        studentName.includes(q) ||
        studentEmail.includes(q) ||
        recommendedAction.includes(q) ||
        programme.includes(q)
      );
    });
  }, [data, search]);

  const normalizedFollowUps = useMemo(() => {
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

  const normalizedActions = useMemo(() => {
    const items = (data?.suggestedActions || []).map((item: any, index: number) => ({
      id: item.id ?? `${item.title ?? "action"}-${index}`,
      priority: formatPriority(item.priority),
      title: item.title || "Suggested action",
      description: item.description || "",
      learnerName: item.learnerName || "",
      timeline: item.timeline || "",
    }));

    return uniqueBy(items, (item) => `${item.id}-${item.title}-${item.learnerName}`);
  }, [data]);

  const chartData = useMemo(() => {
    return (data?.trends || []).map((item: any) => ({
      month: item.month || "-",
      wellbeing: Number(item.wellbeing ?? 0),
      engagement: Number(item.engagement ?? 0),
      providerSupport: Number(item.providerSupport ?? 0),
    }));
  }, [data]);

  if (loading) {
    return (
      <div id="report-area" className="p-6">
        <div className="rounded-2xl bg-white p-8 shadow-sm">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div id="report-area" className="p-6">
        <div className="rounded-2xl bg-white p-8 shadow-sm text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div id="report-area" className="min-h-screen bg-[#F8F6FC] p-6">
      <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-[#241453]">Coach Dashboard</h1>
            <p className="mt-2 text-[#7B6D9B]">
              Monitor your caseload, wellbeing patterns, and support needs.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-center">
            {role === "qa" && (
              <select
                value={selectedCoachEmail}
                onChange={(e) => setSelectedCoachEmail(e.target.value)}
                className="h-12 min-w-[260px] rounded-2xl border border-[#E7E2F3] bg-[#FBFAFE] px-4 text-sm text-[#241453] outline-none"
              >
                <option value="">Select coach</option>
                {coachOptions.map((coach, index) => (
                  <option key={`${coach.value}-${index}`} value={coach.value}>
                    {coach.label}
                  </option>
                ))}
              </select>
            )}

            <div className="flex w-full max-w-md items-center gap-2 rounded-2xl border border-[#E7E2F3] bg-[#FBFAFE] px-4 py-3">
              <Search className="h-4 w-4 text-[#8E82AA]" />
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

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Caseload" value={data?.summary?.caseload ?? 0} icon={<Users className="h-5 w-5" />} />
        <StatCard title="At Risk" value={data?.summary?.atRisk ?? 0} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard
          title="Non-Responders"
          value={data?.summary?.nonResponders ?? 0}
          icon={<UserRoundX className="h-5 w-5" />}
        />
        <StatCard
          title="Open Tickets"
          value={data?.summary?.openTickets ?? 0}
          icon={<ClipboardList className="h-5 w-5" />}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-sm xl:col-span-2">
          <h2 className="mb-5 text-xl font-semibold text-[#241453]">Caseload Risk Overview</h2>
          <LearnerTable rows={filteredLearners} />
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold text-[#241453]">Caseload Trends</h2>

          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis domain={[0, 10]} />
                <Tooltip />
                <Line type="monotone" dataKey="wellbeing" stroke="#10B981" strokeWidth={2} />
                <Line type="monotone" dataKey="engagement" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="providerSupport" stroke="#F59E0B" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold text-[#241453]">Learners Needing Follow-up</h2>

          <div className="space-y-4">
            {normalizedFollowUps.map((item, index) => (
              <div
                key={`${item.id}-${item.learnerName}-${index}`}
                className="rounded-2xl border border-[#EEE8F8] bg-[#FBFAFE] p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex rounded-md px-3 py-1 text-xs font-semibold capitalize ${priorityBadgeClass(
                        item.priority
                      )}`}
                    >
                      {item.priority}
                    </span>
                    <div>
                      <div className="font-medium text-[#241453]">{item.title}</div>
                      <div className="text-sm text-[#7B6D9B]">
                        {item.learnerName} , Due: {item.dueDate}
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-[#6F5A96]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[#CDB8F2] bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold text-[#241453]">Suggested Coach Actions</h2>

          <div className="space-y-4">
            {normalizedActions.map((item, index) => (
              <div
                key={`${item.id}-${item.title}-${index}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[#EEE8F8] bg-[#FBFAFE] p-4"
              >
                <div>
                  <div className="mb-2 flex items-center gap-3">
                    <span
                      className={`inline-flex rounded-md px-3 py-1 text-xs font-semibold capitalize ${priorityBadgeClass(
                        item.priority
                      )}`}
                    >
                      {item.priority}
                    </span>
                    <div className="font-medium text-[#241453]">{item.title}</div>
                  </div>

                  <div className="text-sm text-[#7B6D9B]">{item.description || "-"}</div>
                  {item.learnerName ? (
                    <div className="mt-1 text-xs text-slate-500">
                      {item.learnerName}
                      {item.timeline ? ` , ${item.timeline}` : ""}
                    </div>
                  ) : null}
                </div>

                <button className="rounded-xl border border-[#D9D0EC] bg-white px-4 py-2 text-sm font-medium text-[#241453] hover:bg-[#F7F3FD]">
                  Convert to action
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}