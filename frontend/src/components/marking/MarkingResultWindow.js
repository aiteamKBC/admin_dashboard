import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
export default function MarkingResultWindow() {
    const { evidenceId, group } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [pollCount, setPollCount] = useState(0);
    useEffect(() => {
        const pollForResult = async () => {
            try {
                const token = localStorage.getItem("token");
                if (!token) {
                    setError("Authentication token not found");
                    setLoading(false);
                    return;
                }
                const response = await fetch(`/api/accounts/poll-marking-result/?evidence_id=${evidenceId}&group=${group}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}`);
                }
                const data = await response.json();
                if (data.found) {
                    setResult(data);
                    setLoading(false);
                }
                else {
                    // Continue polling
                    setPollCount((prev) => prev + 1);
                }
            }
            catch (err) {
                setError(err.message || "Failed to fetch marking result");
                setLoading(false);
            }
        };
        // Poll every 3 seconds
        const interval = setInterval(() => {
            if (loading && pollCount < 40) {
                // Max 2 minutes (40 * 3s)
                pollForResult();
            }
            else if (pollCount >= 40) {
                setError("Marking timeout - please check the output sheet manually");
                setLoading(false);
            }
        }, 3000);
        // Initial poll
        pollForResult();
        return () => clearInterval(interval);
    }, [evidenceId, group, loading, pollCount]);
    return (_jsx("div", { className: "min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-8", children: _jsxs("div", { className: "max-w-4xl mx-auto", children: [_jsx("div", { className: "bg-white rounded-2xl shadow-lg p-6 mb-6", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-[#442F73]", children: "Evidence Marking Result" }), _jsxs("p", { className: "text-sm text-gray-600 mt-1", children: ["Evidence ID: ", evidenceId, " | Group: ", group] })] }), _jsx("button", { onClick: () => window.close(), className: "px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition", children: "Close Window" })] }) }), loading && (_jsx("div", { className: "bg-white rounded-2xl shadow-lg p-12", children: _jsxs("div", { className: "flex flex-col items-center justify-center", children: [_jsxs("div", { className: "relative mb-6", children: [_jsx("div", { className: "w-16 h-16 border-4 border-[#A880F7] border-t-transparent rounded-full animate-spin" }), _jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: _jsx("i", { className: "fa-solid fa-robot text-2xl text-[#442F73]" }) })] }), _jsx("h3", { className: "text-xl font-semibold text-[#442F73] mb-2", children: "AI is Marking Your Evidence" }), _jsx("p", { className: "text-gray-600 text-center mb-4", children: "Please wait while the AI analyzes and grades your submission..." }), _jsxs("div", { className: "text-sm text-gray-500", children: ["Poll ", pollCount, " of 40 \u2022 Checking every 3 seconds"] })] }) })), error && !loading && (_jsx("div", { className: "bg-white rounded-2xl shadow-lg p-8", children: _jsxs("div", { className: "flex items-start gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0", children: _jsx("i", { className: "fa-solid fa-exclamation-circle text-red-600 text-xl" }) }), _jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "text-lg font-semibold text-red-800 mb-2", children: "Error" }), _jsx("p", { className: "text-red-700", children: error }), _jsx("button", { onClick: () => window.location.reload(), className: "mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition", children: "Try Again" })] })] }) })), result && result.found && !loading && (_jsxs("div", { className: "bg-white rounded-2xl shadow-lg overflow-hidden", children: [_jsx("div", { className: "bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-12 h-12 rounded-full bg-white/20 flex items-center justify-center", children: _jsx("i", { className: "fa-solid fa-check-circle text-2xl" }) }), _jsxs("div", { children: [_jsx("h3", { className: "text-xl font-bold", children: "Marking Complete!" }), _jsx("p", { className: "text-green-50 text-sm", children: "Your evidence has been assessed by the AI" })] })] }) }), _jsxs("div", { className: "p-8", children: [_jsxs("h4", { className: "text-lg font-semibold text-[#442F73] mb-4 flex items-center gap-2", children: [_jsx("i", { className: "fa-solid fa-comment-dots" }), "AI Feedback"] }), _jsx("div", { className: "bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6 border-2 border-purple-200", children: _jsx("div", { className: "prose max-w-none", children: result.ai_feedback ? (_jsx("div", { className: "text-gray-800 whitespace-pre-wrap leading-relaxed", children: result.ai_feedback })) : (_jsx("p", { className: "text-gray-500 italic", children: "No AI feedback available for this evidence." })) }) }), result && Object.keys(result).length > 2 && (_jsxs("div", { className: "mt-6", children: [_jsx("h5", { className: "text-sm font-semibold text-gray-700 mb-3", children: "Additional Details" }), _jsx("div", { className: "bg-gray-50 rounded-lg p-4 space-y-2", children: Object.entries(result)
                                                .filter(([key]) => key !== "found" && key !== "ai_feedback")
                                                .map(([key, value]) => (_jsxs("div", { className: "flex items-start gap-3 text-sm", children: [_jsxs("span", { className: "font-medium text-gray-600 min-w-[150px]", children: [key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()), ":"] }), _jsx("span", { className: "text-gray-800 flex-1", children: typeof value === "object"
                                                            ? JSON.stringify(value)
                                                            : String(value) })] }, key))) })] })), _jsxs("div", { className: "mt-8 flex gap-3", children: [_jsxs("button", { onClick: () => window.print(), className: "px-4 py-2 bg-[#442F73] hover:bg-[#5a3f94] text-white rounded-lg text-sm font-medium transition flex items-center gap-2", children: [_jsx("i", { className: "fa-solid fa-print" }), "Print Feedback"] }), _jsx("button", { onClick: () => window.close(), className: "px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition", children: "Close Window" })] })] })] }))] }) }));
}
