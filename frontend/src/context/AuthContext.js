import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useState, useEffect } from "react";
export const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    //  load from localStorage once
    useEffect(() => {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("role");
        const username = localStorage.getItem("username");
        const coach_id = localStorage.getItem("coach_id");
        if (token && role && username) {
            setUser({ username, role, coach_id: coach_id || null });
        }
        else {
            setUser(null);
        }
    }, []);
    return (_jsx(AuthContext.Provider, { value: { user, setUser }, children: children }));
}
