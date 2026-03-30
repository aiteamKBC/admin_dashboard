import { jsx as _jsx } from "react/jsx-runtime";
import CoachMetricsTable from "./CoachMetricsTable";
export default function CoachesOverview({ metrics }) {
    return (_jsx("section", { children: _jsx(CoachMetricsTable, { metrics: metrics }) }));
}
