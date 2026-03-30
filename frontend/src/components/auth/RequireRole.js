import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate, useLocation } from "react-router-dom";
export default function RequireRole({ allow, children, }) {
    const loc = useLocation();
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (!token || !role) {
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: loc.pathname } });
    }
    if (!allow.includes(role)) {
        return _jsx(Navigate, { to: "/", replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
