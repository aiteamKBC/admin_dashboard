import { Link } from "react-router-dom";
import { useState } from "react";
import AddUserDialog from "../components/accounts/AddUserDialog";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, ClipboardCheck, ClipboardList, Menu, ShieldAlert, UserPlus } from "lucide-react";

type Role = "qa" | "coach";

type TicketCardConfig = {
  title: string;
  description: string;
  to: string;
  roles: Role[];
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  headerBg: string;
  metric: string;
};

const ticketCards: TicketCardConfig[] = [
  {
    title: "Wellbeing & Safeguarding",
    description: "Monitor learner wellbeing, spot risks, and manage safeguarding support.",
    to: "/coach-wellbeing",
    roles: ["qa", "coach"],
    icon: ShieldAlert,
    accent: "bg-[#B42318]",
    iconBg: "bg-[#FEE4E2] text-[#B42318]",
    headerBg: "bg-[#FFF5F3]",
    metric: "Safeguarding overview",
  },
  {
    title: "Inclusion Dashboard",
    description: "Explore inclusion reports, record evidence, and follow up on learner needs.",
    to: "/coach-wellbeing?view=inclusion-dashboard",
    roles: ["qa", "coach"],
    icon: ClipboardList,
    accent: "bg-[#A56408]",
    iconBg: "bg-[#FEF0C7] text-[#A56408]",
    headerBg: "bg-[#FFFAED]",
    metric: "Learner inclusion",
  },
  {
    title: "Who I Am",
    description: "Understand your learners through their assessments, results, and reviews.",
    to: "/learner-result-tickets",
    roles: ["qa", "coach"],
    icon: ClipboardCheck,
    accent: "bg-[#0F766E]",
    iconBg: "bg-[#CCFBF1] text-[#0F766E]",
    headerBg: "bg-[#EFFBF8]",
    metric: "Assessment results",
  },
];

type TicketCardsPageProps = {
  onOpenSidebar?: () => void;
  isDesktop?: boolean;
};

export default function TicketCardsPage({ onOpenSidebar, isDesktop = true }: TicketCardsPageProps) {
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [createdUser, setCreatedUser] = useState("");
  const role = (localStorage.getItem("role") || "coach") as Role;
  const username = localStorage.getItem("username") || "User";

  const visibleCards = ticketCards.filter((card) => card.roles.includes(role));
  const cardGridLayout =
    visibleCards.length >= 3
      ? "md:grid-cols-2 xl:grid-cols-3"
      : visibleCards.length === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-1";

  return (
    <div className="min-h-screen bg-[#F8F6FC] px-4 py-5 sm:px-6 lg:px-8">
      <div className="relative flex min-h-[calc(100vh-2.5rem)] w-full items-center justify-center">
        {role === "qa" && (
          <div className="absolute right-0 top-0 z-10 flex max-w-[80%] flex-col items-end gap-3">
            <button type="button" onClick={() => { setCreatedUser(""); setAddUserOpen(true); }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#241453] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#442F73] focus:outline-none focus:ring-2 focus:ring-[#866CB6] focus:ring-offset-2">
              <UserPlus className="h-4 w-4" />Add user
            </button>
            {createdUser && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">User “{createdUser}” added successfully.</p>}
          </div>
        )}
        {!isDesktop && onOpenSidebar ? (
          <button
            type="button"
            onClick={onOpenSidebar}
            className="absolute left-0 top-0 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#DED5F3] bg-white text-[#241453] shadow-sm transition hover:bg-[#FBFAFE]"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}

        <main className="mx-auto flex w-full max-w-[1320px] flex-col items-center gap-10 pb-10 pt-28 sm:gap-12 sm:pt-20">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#866CB6]">
              Tickets workspace
            </p>
            <h1 className="mt-3 text-2xl font-semibold leading-tight text-[#241453] sm:text-3xl">
              Welcome, {username}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#6F6387] sm:text-lg">
              Everything you need to understand and support your learners.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#E7E2F3] bg-white px-3 py-2 text-sm font-medium text-[#442F73] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#12B76A]" />
              Role: {role.toUpperCase()}
            </div>
          </header>

          <section aria-label="Learner support areas" className={`grid w-full auto-rows-fr grid-cols-1 gap-5 lg:gap-6 ${cardGridLayout}`}>
            {visibleCards.map((card) => (
              <TicketCard key={card.title} card={card} />
            ))}
          </section>

          {visibleCards.length === 0 ? (
            <div className="rounded-lg border border-[#E7E2F3] bg-white p-5 text-sm text-[#6F6387] shadow-sm">
              No ticket areas are available for this role.
            </div>
          ) : null}
        </main>
      </div>
      {role === "qa" && addUserOpen && <AddUserDialog onClose={() => setAddUserOpen(false)} onCreated={(name) => { setCreatedUser(name); setAddUserOpen(false); }} />}
    </div>
  );
}

function TicketCard({ card }: { card: TicketCardConfig }) {
  const Icon = card.icon;

  return (
    <Link
      to={card.to}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-[#E7E2F3] bg-white shadow-[0_4px_20px_-12px_rgba(36,20,83,0.25)] transition-[transform,box-shadow,border-color] duration-200 hover:border-[#C9BCE6] hover:shadow-[0_16px_40px_-16px_rgba(36,20,83,0.25)] motion-safe:hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#866CB6] focus-visible:ring-offset-4 focus-visible:ring-offset-[#F8F6FC]"
    >
      <span aria-hidden="true" className={`absolute inset-x-7 top-0 h-[3px] rounded-b-full ${card.accent}`} />

      <div className={`flex items-center gap-4 border-b border-black/[0.03] px-6 py-7 lg:px-7 ${card.headerBg}`}>
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-4 ring-white/70 ${card.iconBg}`}>
          <Icon aria-hidden="true" className="h-7 w-7" strokeWidth={1.7} />
        </div>

        <span className="text-xs font-semibold uppercase leading-5 tracking-[0.1em] text-[#5C4B73]">
          {card.metric}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-6 pt-6 lg:px-7 lg:pb-7">
        <h2 className="text-[22px] font-semibold leading-8 tracking-[-0.02em] text-[#241453] xl:min-h-16">{card.title}</h2>
        <p className="mt-2 flex-1 text-sm leading-7 text-[#6F6387]">{card.description}</p>
        <span className="mt-7 inline-flex min-h-12 items-center justify-between gap-3 rounded-xl bg-[#F4F0FA] px-4 py-3 text-sm font-semibold text-[#442F73] transition-colors duration-200 group-hover:bg-[#241453] group-hover:text-white group-focus-visible:bg-[#241453] group-focus-visible:text-white">
          Open workspace
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}
