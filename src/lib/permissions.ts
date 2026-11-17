export type Role = "ADMIN" | "MANAGER" | "CONTRIBUTOR";

export type Permission =
  | "projects:write" | "industries:write" | "contributors:write" | "rates:write"
  | "hours:write" | "qc:write" | "payments:write" | "payments:approve"
  | "users:manage" | "reports:read" | "settings:write";

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: [
    "projects:write", "industries:write", "contributors:write", "rates:write",
    "hours:write", "qc:write", "payments:write", "payments:approve",
    "users:manage", "reports:read", "settings:write",
  ],
  // Managers: daily hours + payment summaries + reports for assigned scope. No finance config.
  MANAGER: ["hours:write", "payments:write", "reports:read"],
  CONTRIBUTOR: [],
};

export const can = (role: Role | undefined, p: Permission) => !!role && MATRIX[role].includes(p);

export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: "/dashboard",
  MANAGER: "/dashboard",
  CONTRIBUTOR: "/my",
};

/** Sidebar items visible per role. */
export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard", roles: ["ADMIN", "MANAGER"] },
  { href: "/projects", label: "Projects", icon: "folder-kanban", roles: ["ADMIN", "MANAGER"] },
  { href: "/industries", label: "Industries", icon: "factory", roles: ["ADMIN", "MANAGER"] },
  { href: "/contributors", label: "Contributors", icon: "users", roles: ["ADMIN", "MANAGER"] },
  { href: "/daily-hours", label: "Daily Hours", icon: "clock", roles: ["ADMIN", "MANAGER"] },
  { href: "/qc", label: "Client Acceptance / QC", icon: "badge-check", roles: ["ADMIN"] },
  { href: "/productivity", label: "Productivity", icon: "trending-up", roles: ["ADMIN", "MANAGER"] },
  { href: "/payments", label: "Payments", icon: "wallet", roles: ["ADMIN", "MANAGER"] },
  { href: "/reports", label: "Reports", icon: "file-bar-chart", roles: ["ADMIN", "MANAGER"] },
  { href: "/users", label: "User Management", icon: "shield", roles: ["ADMIN"] },
  { href: "/settings", label: "Settings", icon: "settings", roles: ["ADMIN"] },
  { href: "/my", label: "My Work", icon: "user", roles: ["CONTRIBUTOR"] },
] as const;
