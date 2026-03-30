import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
export default function StudentSearch({ students, onSelect, }) {
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const results = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term)
            return [];
        return students
            .filter((name) => name.toLowerCase().includes(term))
            .slice(0, 8);
    }, [q, students]);
    return (_jsxs("div", { className: "relative", children: [_jsx("input", { value: q, onChange: (e) => {
                    setQ(e.target.value);
                    setOpen(true);
                }, onFocus: () => setOpen(true), placeholder: "Search student...", className: "\r\n          h-9 w-44 sm:w-56 lg:w-64\r\n          rounded-lg border border-[#241453]/20\r\n          bg-white px-3 text-sm\r\n          focus:outline-none focus:ring-2 focus:ring-[#241453]/20\r\n        " }), open && results.length > 0 && (_jsx("div", { className: "absolute right-0 mt-2 w-full rounded-xl border bg-white shadow-lg overflow-hidden z-50", onMouseDown: (e) => e.preventDefault(), children: results.map((name) => (_jsx("button", { className: "w-full text-left px-3 py-2 text-sm hover:bg-gray-50", onClick: () => {
                        onSelect(name);
                        setQ(name);
                        setOpen(false);
                    }, children: _jsx("div", { className: "font-medium text-gray-900", children: name }) }, name))) }))] }));
}
