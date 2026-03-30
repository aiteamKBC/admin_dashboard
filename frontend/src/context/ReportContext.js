import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo, useState } from "react";
const ReportContext = createContext(null);
export function ReportProvider({ children }) {
    const [rows, setRows] = useState([]);
    const value = useMemo(() => ({ rows, setRows }), [rows]);
    return _jsx(ReportContext.Provider, { value: value, children: children });
}
export function useReport() {
    const ctx = useContext(ReportContext);
    if (!ctx)
        throw new Error("useReport must be used within ReportProvider");
    return ctx;
}
