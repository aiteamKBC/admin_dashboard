import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
function DashboardPage({ onOpenSidebar }) {
    return _jsx(AnalyticsMeetings, { onOpenSidebar: onOpenSidebar });
}
function AttendanceRoute({ onOpenSidebar }) {
    return _jsx(AttendancePage, { onOpenSidebar: onOpenSidebar });
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
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    return (_jsxs("div", { className: "min-h-screen bg-gray-100", children: [token && !isLoginPage && (_jsx(Sidebar, { collapsed: collapsed, setCollapsed: setCollapsed, mobileOpen: mobileOpen, setMobileOpen: setMobileOpen, isDesktop: isDesktop, onLogout: handleLogout })), _jsx("main", { className: `transition-all duration-300 ${token ? contentPad : ""}`, children: _jsx("div", { className: "p-3 sm:p-4 lg:p-6 overflow-y-auto min-h-screen", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsx(Route, { path: "/", element: _jsx(RequireRole, { allow: ["qa", "coach"], children: _jsx(DashboardPage, { onOpenSidebar: () => setMobileOpen(true) }) }) }), _jsx(Route, { path: "/dashboard", element: _jsx(RequireRole, { allow: ["qa", "coach"], children: _jsx(DashboardPage, { onOpenSidebar: () => setMobileOpen(true) }) }) }), _jsx(Route, { path: "/bookings-calendar", element: _jsx(RequireRole, { allow: ["qa", "coach"], children: _jsx(BookingsCalendarPage, {}) }) }), _jsx(Route, { path: "/attendance", element: _jsx(RequireRole, { allow: ["qa", "coach"], children: _jsx(AttendanceRoute, { onOpenSidebar: () => setMobileOpen(true) }) }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) })] }));
}
