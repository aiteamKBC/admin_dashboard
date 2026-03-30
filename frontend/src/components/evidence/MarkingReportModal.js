import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Marking Report Modal - Shows AI-generated marking report for submitted evidence
 * Polls the API until the report is ready (up to 2 minutes)
 */
import { useState, useEffect } from 'react';
export default function MarkingReportModal({ isOpen, onClose, evidenceId, group, componentName, evidenceName, studentId, }) {
    const [loading, setLoading] = useState(true);
    const [report, setReport] = useState('');
    const [error, setError] = useState('');
    const [attemptNumber, setAttemptNumber] = useState(1);
    const maxAttempts = 12;
    useEffect(() => {
        if (isOpen && evidenceId && group) {
            pollMarkingReport();
        }
    }, [isOpen, evidenceId, group]);
    const pollMarkingReport = async () => {
        setLoading(true);
        setError('');
        setAttemptNumber(1);
        const token = localStorage.getItem('token');
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                setAttemptNumber(attempt);
                const params = new URLSearchParams({
                    evidenceId: evidenceId,
                    group: group,
                    attemptNumber: attempt.toString(),
                });
                const response = await fetch(`${baseUrl}/api/accounts/evidence/marking-report/?${params}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch marking report');
                }
                const data = await response.json();
                if (data.status === 'ready' && data.markingReport) {
                    setReport(data.markingReport);
                    setLoading(false);
                    return;
                }
                // Still pending, wait 10 seconds before next attempt
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }
            catch (err) {
                console.error('Poll attempt failed:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch marking report');
                setLoading(false);
                return;
            }
        }
        // If we get here, we've exceeded max attempts
        setError('Marking report generation timed out. Please try again later.');
        setLoading(false);
    };
    const getAptemUrl = () => {
        if (!studentId || !componentName || !evidenceId)
            return '#';
        // Assuming componentId is the same as componentName or we'd need to pass it separately
        return `https://kentbusinesscollege.aptem.co.uk/pwa/learners/${studentId}/learning-plan/mark-evidence/${componentName}/evidence/${evidenceId}`;
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm", children: _jsxs("div", { className: "bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col", children: [_jsxs("div", { className: "flex items-center justify-between p-6 border-b border-gray-200", children: [_jsx("h2", { className: "text-lg font-semibold text-gray-900", children: "Marking Report" }), _jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600 transition", children: _jsx("i", { className: "ri-close-line text-xl" }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6", children: loading ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-12", children: [_jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-b-2 border-[#7743DB] mb-4" }), _jsx("p", { className: "text-gray-600 font-medium", children: "Generating marking report..." }), _jsx("p", { className: "text-gray-400 text-sm mt-2", children: "This may take up to 2 minutes" }), _jsxs("p", { className: "text-gray-400 text-xs mt-1", children: ["Attempt ", attemptNumber, " of ", maxAttempts, "..."] })] })) : error ? (_jsxs("div", { className: "text-center py-8", children: [_jsx("div", { className: "text-red-400 text-lg mb-2", children: "\u26A0\uFE0F" }), _jsx("div", { className: "text-gray-600 font-medium", children: "Error Loading Report" }), _jsx("div", { className: "text-gray-400 text-sm mt-1", children: error })] })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-4", children: [_jsx("h3", { className: "font-semibold text-blue-900 mb-2", children: "Evidence Details" }), _jsxs("p", { className: "text-sm text-blue-800", children: [_jsx("span", { className: "font-medium", children: "Component:" }), " ", componentName] }), _jsxs("p", { className: "text-sm text-blue-800", children: [_jsx("span", { className: "font-medium", children: "Evidence:" }), " ", evidenceName] }), _jsxs("p", { className: "text-sm text-blue-800", children: [_jsx("span", { className: "font-medium", children: "Group:" }), " ", group] })] }), _jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-4", children: [_jsx("h3", { className: "font-semibold text-gray-900 mb-3", children: "Marking Report" }), _jsx("div", { className: "prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap", children: report })] })] })) }), _jsxs("div", { className: "border-t border-gray-200 p-6", children: [_jsxs("p", { className: "text-sm text-gray-600 mb-3", children: [_jsx("span", { className: "inline-block w-2 h-2 bg-blue-500 rounded-full mr-2" }), _jsx("strong", { children: "Note:" }), " Copy the marking report above and paste it into Aptem when you click \"Submit in Aptem\"."] }), _jsxs("div", { className: "flex justify-between items-center gap-3", children: [_jsx("button", { onClick: onClose, className: "px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition", children: "Close" }), studentId && report && (_jsx("a", { href: getAptemUrl(), target: "_blank", rel: "noopener noreferrer", className: "px-4 py-2 text-sm font-medium rounded-lg bg-[#7743DB] text-white hover:bg-[#6535c7] transition-colors", children: "Submit in Aptem \u2192" }))] })] })] }) }));
}
