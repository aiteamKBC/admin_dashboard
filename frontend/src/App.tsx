import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState, useContext } from "react";
import { AuthContext } from "./context/AuthContext";

import Sidebar from "./components/sidebar/sidebar";
import AnalyticsMeetings from "./components/analytics/AnalyticsMeetings";
import BookingsCalendarPage from "./components/calendar/BookingsCalendarPage";
import AttendancePage from "./components/attendance/AttendancePage";
import Login from "./login/Login";
import RequireRole from "./components/auth/RequireRole";

import useMediaQuery from "./helpers/useMediaQuery";

function DashboardPage({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return <AnalyticsMeetings onOpenSidebar={onOpenSidebar} />;
}

function AttendanceRoute({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return <AttendancePage onOpenSidebar={onOpenSidebar} />;
}

export default function App() {
  const isDesktop = useMediaQuery("(min-width: 1280px)"); // xl
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";


  // logout handler
  const auth = useContext(AuthContext);
  const handleLogout = () => {
    auth?.setUser?.(null);
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("coach_id");

    sessionStorage.clear();

    window.location.replace("/login");
  };

  useEffect(() => {
    if (!isDesktop) {
      setCollapsed(true);
      setMobileOpen(false);
    }
  }, [isDesktop]);

  const contentPad = isDesktop ? (collapsed ? "pl-20" : "pl-64") : "";

  const token = localStorage.getItem("token");

  if (!token && window.location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar appears after login */}
      {token && !isLoginPage && (
        <Sidebar
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          isDesktop={isDesktop}
          onLogout={handleLogout}
        />
      )}

      <main className={`transition-all duration-300 ${token ? contentPad : ""}`}>
        <div className="p-3 sm:p-4 lg:p-6 overflow-y-auto min-h-screen">
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* QA + Coach */}
            <Route
              path="/"
              element={
                <RequireRole allow={["qa", "coach"]}>
                  <DashboardPage onOpenSidebar={() => setMobileOpen(true)} />
                </RequireRole>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireRole allow={["qa", "coach"]}>
                  <DashboardPage onOpenSidebar={() => setMobileOpen(true)} />
                </RequireRole>
              }
            />
            <Route
              path="/bookings-calendar"
              element={
                <RequireRole allow={["qa", "coach"]}>
                  <BookingsCalendarPage />
                </RequireRole>
              }
            />

            {/* QA only */}
            <Route
              path="/attendance"
              element={
                <RequireRole allow={["qa", "coach"]}>
                  <AttendanceRoute onOpenSidebar={() => setMobileOpen(true)} />
                </RequireRole>
              }
            />

            {/* fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
