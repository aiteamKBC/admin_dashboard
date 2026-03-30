import React from "react";
import { Navigate, useLocation } from "react-router-dom";

type Role = "qa" | "coach";

export default function RequireRole({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const loc = useLocation();

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role") as Role | null;

  if (!token || !role) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  if (!allow.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
