import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, ClipboardCheck, ClipboardList, Menu, ShieldAlert } from "lucide-react";

type Role = "qa" | "coach";

type TicketCardConfig = {
  title: string;
  description: string;
  to: string;
  roles: Role[];
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  metric: string;
};

const ticketCards: TicketCardConfig[] = [
  {
    title: "Wellbeing & Safeguarding",
    description: "Open the safeguarding overview, caseload monitoring, risk insights, and safeguarding ticket access.",
    to: "/coach-wellbeing",
    roles: ["qa", "coach"],
    icon: ShieldAlert,
    accent: "bg-[#B42318]",
    iconBg: "bg-[#FEE4E2] text-[#B42318]",
    metric: "Safeguarding overview",
  },
  {
    title: "Inclusion Dashboard",
    description: "Track inclusion reports, notes, evidence, and learner support follow-up.",
    to: "/coach-wellbeing?view=inclusion-dashboard",
    roles: ["qa", "coach"],
    icon: ClipboardList,
    accent: "bg-[#A56408]",
    iconBg: "bg-[#FEF0C7] text-[#A56408]",
    metric: "Learner inclusion",
  },
  {
    title: "Who I'm Tickets",
    description: "Open learner assessment result tickets and review completion, risk, and actions.",
    to: "/learner-result-tickets",
    roles: ["qa", "coach"],
    icon: ClipboardCheck,
    accent: "bg-[#0F766E]",
    iconBg: "bg-[#CCFBF1] text-[#0F766E]",
    metric: "Assessment results",
  },
];

type TicketCardsPageProps = {
  onOpenSidebar?: () => void;
  isDesktop?: boolean;
};

export default function TicketCardsPage({ onOpenSidebar, isDesktop = true }: TicketCardsPageProps) {
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

        <main className="flex w-full -translate-y-6 flex-col items-center gap-9 sm:-translate-y-8">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#866CB6]">
              Tickets workspace
            </p>
            <h1 className="mt-3 text-2xl font-semibold leading-tight text-[#241453] sm:text-3xl">
              Welcome, {username}
            </h1>
            <p className="mx-auto mt-5 w-full max-w-none text-lg font-medium leading-8 text-[#4F416B] sm:text-xl md:whitespace-nowrap">
              Choose the ticket area you need. Your available cards are filtered by your account role.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#E7E2F3] bg-white px-3 py-2 text-sm font-medium text-[#442F73] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#12B76A]" />
              Role: {role.toUpperCase()}
            </div>
          </header>

          <section className={`grid w-full auto-rows-fr grid-cols-1 gap-4 ${cardGridLayout}`}>
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
    </div>
  );
}

function TicketCard({ card }: { card: TicketCardConfig }) {
  const Icon = card.icon;

  return (
    <Link
      to={card.to}
      className="group relative flex h-full min-h-[255px] w-full flex-col overflow-hidden rounded-lg border border-[#E7E2F3] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-[#C9BCE6] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#866CB6]"
    >
      <span className={`absolute left-0 top-0 h-full w-1 ${card.accent}`} />

      <div className="flex items-start justify-between gap-5">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
          <Icon className="h-7 w-7" />
        </div>

        <span className="max-w-[165px] rounded-lg border border-[#E7E2F3] bg-[#FBFAFE] px-3 py-1.5 text-right text-xs font-semibold leading-4 text-[#6F6387]">
          {card.metric}
        </span>
      </div>

      <div className="mt-7 flex flex-1 flex-col">
        <h2 className="text-2xl font-semibold leading-tight text-[#241453]">{card.title}</h2>
        <p className="mt-3 flex-1 text-sm leading-6 text-[#6F6387]">{card.description}</p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-[#EFEAF8] pt-4">
        <span className="text-sm font-semibold text-[#442F73]">Open tickets</span>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#241453] text-white transition group-hover:bg-[#442F73]">
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
