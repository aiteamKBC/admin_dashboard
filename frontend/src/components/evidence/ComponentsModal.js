import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Components Modal - Shows list of student components and evidence
 * User can select a component/evidence to submit for marking
 */
import { useState, useEffect } from 'react';
export default function ComponentsModal({ isOpen, onClose, studentEmail, studentId, onSelect, }) {
    const [loading, setLoading] = useState(false);
    const [components, setComponents] = useState([]);
    const [group, setGroup] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (isOpen && (studentEmail || studentId)) {
            fetchComponents();
        }
    }, [isOpen, studentEmail, studentId]);
    const fetchComponents = async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (studentEmail)
                params.set('student_email', studentEmail);
            if (studentId)
                params.set('student_id', studentId);
            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/accounts/evidence/components/?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch components');
            }
            const data = await response.json();
            setComponents(data.components || []);
            setGroup(data.group || '');
        }
        catch (err) {
            console.error('Error fetching components:', err);
            setError(err instanceof Error ? err.message : 'Failed to load evidence');
        }
        finally {
            setLoading(false);
        }
    };
    const handleSelect = (component) => {
        onSelect(component, group);
        onClose();
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm", children: _jsxs("div", { className: "bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col", children: [_jsxs("div", { className: "flex items-center justify-between p-6 border-b border-gray-200", children: [_jsx("h2", { className: "text-lg font-semibold text-gray-900", children: "Student Components" }), _jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600 transition", children: _jsx("i", { className: "ri-close-line text-xl" }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6", children: loading ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-12", children: [_jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-b-2 border-[#7743DB] mb-4" }), _jsx("p", { className: "text-gray-600", children: "Loading components..." })] })) : error ? (_jsxs("div", { className: "text-center py-8", children: [_jsx("div", { className: "text-red-400 text-lg mb-2", children: "\u26A0\uFE0F" }), _jsx("div", { className: "text-gray-600 font-medium", children: "Error Loading Components" }), _jsx("div", { className: "text-gray-400 text-sm mt-1", children: error })] })) : components.length === 0 ? (_jsxs("div", { className: "text-center py-8", children: [_jsx("div", { className: "text-gray-400 text-lg mb-2", children: "\uD83D\uDCCB" }), _jsx("div", { className: "text-gray-600 font-medium", children: "No Evidence Available" }), _jsx("div", { className: "text-gray-400 text-sm mt-1", children: "This student has no pending evidence." })] })) : !components.some(c => c.hasEvidence) ? (_jsxs("div", { className: "text-center py-8", children: [_jsx("div", { className: "text-gray-400 text-lg mb-2", children: "\uD83D\uDCCB" }), _jsx("div", { className: "text-gray-600 font-medium", children: "No Evidence Uploaded" }), _jsx("div", { className: "text-gray-400 text-sm mt-1", children: "This student has components but no evidence has been uploaded yet." })] })) : (_jsx("div", { className: "space-y-3", children: components.map((comp, idx) => (_jsx("div", { className: "p-3 bg-white rounded-lg border border-gray-200 hover:border-[#7743DB] hover:shadow-md transition-all", children: _jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "text-sm font-medium text-gray-900 mb-1", children: [_jsx("span", { className: "inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded mr-2", children: "Component" }), comp.componentName] }), comp.hasEvidence ? (_jsxs("div", { className: "text-sm text-gray-700 mt-2", children: [_jsx("span", { className: "inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded mr-2", children: "Evidence" }), comp.evidenceName] })) : (_jsx("div", { className: "text-xs text-gray-400 mt-2 italic", children: "No evidence attached" }))] }), _jsx("button", { onClick: () => handleSelect(comp), className: "px-4 py-2 text-sm font-medium rounded-lg bg-[#7743DB] text-white hover:bg-[#6535c7] transition-colors flex-shrink-0", children: "Select" })] }) }, idx))) })) }), _jsx("div", { className: "flex justify-end p-6 border-t border-gray-200", children: _jsx("button", { onClick: onClose, className: "px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition", children: "Close" }) })] }) }));
}
