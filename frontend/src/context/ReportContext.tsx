import { createContext, useContext, useMemo, useState } from "react";

export type ReportRow = {
  Coach: string;
  Completed: number;
  Cancelled: number;
  Upcoming: number;
};

type ReportContextValue = {
  rows: ReportRow[];
  setRows: (rows: ReportRow[]) => void;
};

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<ReportRow[]>([]);

  const value = useMemo(() => ({ rows, setRows }), [rows]);

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReport() {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error("useReport must be used within ReportProvider");
  return ctx;
}
