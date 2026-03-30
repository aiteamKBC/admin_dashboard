import { NavLink } from "react-router-dom";
import { useState } from "react";
import aptemIcon from "@/assets/aptem_logo.jpg";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

type SidebarProps = {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;

  isDesktop: boolean;
  onLogout?: () => void;
};

export default function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  isDesktop,
  onLogout,
}: SidebarProps) {
  const isDrawer = !isDesktop;
  const role = localStorage.getItem("role");

  return (
    <>
      {/* Overlay mobile/tablet*/}
      {isDrawer && mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        />
      )}

      <aside
        className={[
          "bg-gradient-to-b from-[#241453] to-[#442F73] text-gray-200",
          "flex flex-col justify-between transition-all duration-300",
          "z-50",
          isDesktop ? "fixed left-0 top-0 h-screen" : "fixed left-0 top-0 h-screen w-64",
          isDrawer ? (mobileOpen ? "translate-x-0" : "-translate-x-full") : "",
          isDesktop ? (collapsed ? "w-20" : "w-64") : "",
        ].join(" ")}
      >
        {/* Toggle collapse button (Desktop only) */}
        {isDesktop && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={[
              "absolute right-0 top-16 z-50",
              "translate-x-1/2",
              "w-9 h-9 rounded-full shadow-md",
              "bg-[#CEA869] text-[#644D93] border border-[#CEA869]",
              "flex items-center justify-center",
              "hover:scale-105 transition",
            ].join(" ")}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={`fa-solid ${collapsed ? "fa-chevron-right" : "fa-chevron-left"}`} />
          </button>
        )}

        {/* Top */}
        <div>
          <div className="p-6 text-2xl font-bold text-white flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10">
              <i className="fa-solid fa-graduation-cap" />
            </span>

            {(!collapsed || !isDesktop) && <span>Coaches</span>}

            {!isDesktop && (
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="ml-auto w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15 transition flex items-center justify-center"
                aria-label="Close menu"
              >
                ✕
              </button>
            )}
          </div>

          <nav className="px-3 space-y-2">
            <SidebarLink
              to="/dashboard"
              collapsed={collapsed && isDesktop}
              icon="fa-gauge"
              label="Dashboard"
              onClick={() => !isDesktop && setMobileOpen(false)}
            />

            <SidebarLink
              to="/attendance"
              collapsed={collapsed && isDesktop}
              icon="fa-clipboard-user"
              label="Attendance"
              onClick={() => !isDesktop && setMobileOpen(false)}
            />

            <SidebarLink
              to="/bookings-calendar"
              collapsed={collapsed && isDesktop}
              icon="fa-calendar-days"
              label="My Calendar"
              onClick={() => !isDesktop && setMobileOpen(false)}
            />

            <SidebarExternalLink
              href="https://kentbusinesscollege.org/psychological-dashboard/"
              collapsed={collapsed && isDesktop}
              icon="fa-user"
              label="Who I am"
              onClick={() => !isDesktop && setMobileOpen(false)}
            />

            <SidebarExternalLink
              href="https://kentbusinesscollege.org/user-account"
              collapsed={collapsed && isDesktop}
              icon="fa-book"
              label="LMS"
              onClick={() => !isDesktop && setMobileOpen(false)}
            />

            <SidebarExternalLink
              href="https://kentbusinesscollege.aptem.co.uk/pwa/auth/login?returnUrl=%2Fdashboard"
              collapsed={collapsed && isDesktop}
              iconImg={aptemIcon}
              label="Aptem"
              onClick={() => !isDesktop && setMobileOpen(false)}
            />

            {role === "qa" && (
              <SidebarExternalLink
                href="https://studentportal.kentbusinesscollege.net/"
                collapsed={collapsed && isDesktop}
                icon="fa-user-pen"
                label="Edit Students Attendance"
                onClick={() => !isDesktop && setMobileOpen(false)}
              />
            )}

          </nav>
          <div className="p-4 space-y-3">
  {/* Logout (Desktop + Mobile) */}
  {isDesktop ? (
    collapsed ? (
      <button
        type="button"
        title="Sign out"
        onClick={onLogout}
        className="h-11 w-11 mx-auto rounded-xl bg-white/15 hover:bg-white/20 text-white flex items-center justify-center transition"
      >
        <i className="fa-solid fa-right-from-bracket" />
      </button>
    ) : (
      <button
        type="button"
        onClick={onLogout}
        className="
          w-full
          h-11 rounded-xl
          bg-[#241453] text-white
          text-sm font-medium
          hover:bg-[#442F73]
          transition
          flex items-center justify-center gap-2
        "
      >
        <i className="fa-solid fa-right-from-bracket" />
        Sign out
      </button>
    )
  ) : (
    <button
      type="button"
      onClick={() => {
        onLogout?.();
        setMobileOpen(false);
      }}
      className="
        w-full
        h-11 rounded-xl
        bg-[#241453] text-white
        text-sm font-medium
        hover:bg-[#442F73]
        transition
        flex items-center justify-center gap-2
      "
    >
      <i className="fa-solid fa-right-from-bracket" />
      Sign out
    </button>
  )}

</div>
        </div>

        {/* Bottom CTA */}
        <div className="p-4">
          <DownloadReportCard collapsed={collapsed && isDesktop} />
        </div>
      </aside>
    </>
  );
}

function SidebarLink({
  to,
  icon,
  label,
  collapsed,
  onClick,
}: {
  to: string;
  icon: string;
  label: string;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={({ isActive }) => {
        if (collapsed) {
          return [
            "flex items-center justify-center",
            "h-11 w-11 mx-auto",
            "rounded-xl transition",
            isActive ? "bg-white/15" : "hover:bg-white/10",
          ].join(" ");
        }

        return [
          "group flex items-center gap-3 px-4 py-2 rounded-md transition",
          isActive
            ? "bg-gradient-to-b from-[#866CB6] to-[#A88CD9] text-white"
            : "hover:bg-[#442F73]",
        ].join(" ");
      }}
    >
      <i className={`fa-solid ${icon}`} />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function SidebarExternalLink({
  href,
  icon,
  iconImg,
  label,
  collapsed,
  onClick,
}: {
  href: string;
  icon?: string;
  iconImg?: string;
  label: string;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const base = collapsed
    ? "flex items-center justify-center h-11 w-11 mx-auto rounded-xl transition hover:bg-white/10"
    : "group flex items-center gap-3 px-4 py-2 rounded-md transition hover:bg-[#442F73]";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={collapsed ? label : undefined}
      className={base}
      onClick={onClick}
    >
      <span className={collapsed ? "" : "w-6 text-center"}>
        {iconImg ? (
          <img src={iconImg} alt="" className="w-5 h-5 object-contain inline-block" />
        ) : (
          <i className={`fa-solid ${icon ?? "fa-link"}`} />
        )}
      </span>

      {!collapsed && <span className="truncate">{label}</span>}
    </a>
  );
}

/* DownloadReportCard */
function DownloadReportCard({ collapsed }: { collapsed: boolean }) {
  const [loading, setLoading] = useState<"pdf" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function captureElement() {
    const el = document.getElementById("report-area");
    if (!el) throw new Error("Report area not found. Add id='report-area' to your main content.");

    return await html2canvas(el, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      scrollX: 0,
      scrollY: -window.scrollY,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
    });
  }

  async function downloadPDF() {
    try {
      setErr(null);
      setLoading("pdf");

      const canvas = await captureElement();
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const imgWpx = canvas.width;
      const imgHpx = canvas.height;
      const ratio = Math.min(pageW / imgWpx, pageH / imgHpx);

      const renderW = imgWpx * ratio;
      const renderH = imgHpx * ratio;

      const x = (pageW - renderW) / 2;
      const y = (pageH - renderH) / 2;

      pdf.addImage(imgData, "PNG", x, y, renderW, renderH, undefined, "FAST");
      pdf.save("report.pdf");
    } catch (e: any) {
      setErr(e?.message || "PDF export failed");
    } finally {
      setLoading(null);
    }
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          title="Export PDF"
          onClick={downloadPDF}
          disabled={!!loading}
          className="h-11 w-11 rounded-xl bg-white/15 hover:bg-white/20 text-white flex items-center justify-center transition disabled:opacity-60"
        >
          {loading === "pdf" ? "…" : "PDF"}
        </button>

        {err && <div className="mt-1 text-[10px] text-red-200 text-center leading-snug">{err}</div>}
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-b from-[#A88CD9] to-[#866CB6] rounded-2xl p-5 overflow-hidden shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <div className="absolute top-4 right-4 bg-[#F9F5FF] text-[#644D93] w-9 h-9 rounded-full flex items-center justify-center shadow-md">
        ↗
      </div>

      <h3 className="text-lg font-medium text-white">Download</h3>
      <p className="text-base font-semibold text-[#241453] mb-4">Report</p>

      <div className="flex gap-2">
        <button
          onClick={downloadPDF}
          disabled={!!loading}
          className="flex-1 bg-[#241453] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#442F73] transition disabled:opacity-60"
        >
          {loading === "pdf" ? "Exporting..." : "PDF"}
        </button>
      </div>

      {err && (
        <div className="mt-3 text-xs text-red-100 bg-white/10 border border-white/15 rounded-lg px-3 py-2">
          {err}
        </div>
      )}
    </div>
  );
}
