import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function StatsOverview({ stats }) {
    return (_jsxs("div", { className: "relative overflow-hidden rounded-xl p-5 w-full", children: [_jsx("div", { className: "absolute inset-0 opacity-[0.04]", style: {
                    backgroundImage: "url('data:image/svg+xml;utf8,\
<filter id=\"n\">\
<feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"4\"/>\
</filter>\
<rect width=\"100\" height=\"100\" filter=\"url(%23n)\" opacity=\"0.4\"/>\
</svg>')",
                } }), _jsx("div", { className: "absolute inset-0 bg-gradient-to-r from-[#866CB6] via-[#644D93] to-[#241453]" }), _jsxs("div", { className: "relative z-10 space-y-5", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold text-white", children: "Sessions Overview" }), _jsxs("p", { className: "text-sm text-indigo-100", children: ["Summary of your session activity ", _jsx("span", { className: "text-white", children: "(changed according to filter settings)" }), " "] })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsx(StatCard, { title: "Completed Sessions", icon: "fa-solid fa-circle-check", value: stats.completed }), _jsx(StatCard, { title: "Completed Hours", icon: "fa-solid fa-clock", value: stats.hours }), _jsx(StatCard, { title: "Cancelled Sessions", icon: "fa-solid fa-ban", value: stats.cancelled }), _jsx(StatCard, { title: "Overdue Marking", icon: "fa-solid fa-triangle-exclamation", value: stats.overdue })] })] })] }));
}
function StatCard({ title, value, icon, }) {
    const safeValue = typeof value === "number" ? value : 0;
    return (_jsxs("div", { className: "bg-white rounded-xl p-4 shadow-lg border border-white/40", children: [_jsxs("div", { className: "flex items-center gap-2 text-sm text-gray-500", children: [_jsx("span", { className: "inline-flex h-7 w-7 items-center justify-center rounded-lg ", children: _jsx("i", { className: `${icon} text-[#B27715] text-lg` }) }), _jsx("span", { className: "truncate", children: title })] }), _jsx("p", { className: "text-2xl font-bold text-[#644D93] mt-2", children: safeValue })] }));
}
