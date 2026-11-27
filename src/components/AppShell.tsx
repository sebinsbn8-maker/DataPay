"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, FolderKanban, Factory, Users, Clock, BadgeCheck, TrendingUp, Wallet,
  FileBarChart, Shield, Settings, User, Menu, PanelLeftClose, PanelLeftOpen, Bell, LogOut, Search, X,
} from "lucide-react";
import { Logo, LogoMark } from "./Logo";
import { NAV, type Role } from "@/lib/permissions";
import { cx } from "./ui";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  "layout-dashboard": LayoutDashboard, "folder-kanban": FolderKanban, factory: Factory, users: Users, clock: Clock,
  "badge-check": BadgeCheck, "trending-up": TrendingUp, wallet: Wallet, "file-bar-chart": FileBarChart,
  shield: Shield, settings: Settings, user: User,
};

export function AppShell({ user, children }: { user: { name: string; email: string; role: Role }; children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false); // mobile drawer
  const items = NAV.filter((n) => (n.roles as readonly string[]).includes(user.role));
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const nav = (compact: boolean) => (
    <nav className={cx("flex flex-1 flex-col gap-1 p-3", !compact && "overflow-y-auto")} aria-label="Main">
      {items.map((n) => {
        const Icon = ICONS[n.icon];
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
            {...(compact ? { "data-tip": n.label, "data-tip-side": "right" } : {})}
            className={cx("group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-300 active:scale-[.97]",
              active ? "bg-gradient-to-r from-cyan/15 via-blue-500/10 to-transparent text-white" : "text-slate-400 hover:bg-white/[0.06] hover:text-white")}>
            <span aria-hidden className={cx("absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-cyan to-violet transition-all duration-300",
              active ? "h-6 opacity-100 shadow-[0_0_12px_2px_rgba(34,211,238,.7)]" : "h-0 opacity-0 group-hover:h-3 group-hover:opacity-60")} />
            <Icon size={18} className={cx("shrink-0 transition-all duration-300 group-hover:scale-110", active ? "text-cyan drop-shadow-[0_0_8px_rgba(34,211,238,.85)]" : "group-hover:text-cyan group-hover:drop-shadow-[0_0_6px_rgba(34,211,238,.6)]")} />
            <span className={cx("whitespace-nowrap transition-all duration-300", compact ? "w-0 -translate-x-2 opacity-0" : "w-auto translate-x-0 opacity-100")}>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-card-2 focus:px-3 focus:py-2">Skip to content</a>
      {/* desktop sidebar */}
      <aside className={cx("fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/[0.07] bg-navy/80 backdrop-blur-xl transition-[width] duration-300 ease-out lg:flex", collapsed ? "w-[72px]" : "w-64")}>
        <div className="flex h-16 items-center px-4"><div className="transition-transform duration-300">{collapsed ? <LogoMark size={34} /> : <Logo />}</div></div>
        <div className="hairline mx-4 opacity-70" />
        {nav(collapsed)}
        <div className="hairline mx-4 opacity-40" />
        <button onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar" aria-expanded={!collapsed}
          className="m-3 flex h-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/[0.06] hover:text-cyan">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="modal-overlay absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="page-enter absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-navy">
            <div className="flex h-16 items-center justify-between px-4">
              <Logo />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><X size={20} /></button>
            </div>
            {nav(false)}
          </aside>
        </div>
      )}

      <div className={cx("transition-all", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/[0.07] bg-navy/60 px-4 backdrop-blur-xl sm:px-6">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-white/10 lg:hidden"><Menu size={22} /></button>
          <form action="/search" className="relative hidden max-w-md flex-1 sm:block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" placeholder="Search projects, industries, contributors…" aria-label="Search"
              className="input h-10 w-full rounded-xl pl-9 pr-3 text-sm" />
          </form>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 text-sm text-muted md:flex"><span className="pulse-dot" aria-hidden /><span data-tip="System operational">{today}</span></span>
            <Link href="/notifications" aria-label="Notifications" data-tip="Notifications" className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-cyan"><Bell size={20} /></Link>
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-cyan via-blue-500 to-violet text-sm font-semibold text-white shadow-[0_0_14px_rgba(34,211,238,.45)]" aria-hidden>{user.name.charAt(0).toUpperCase()}</span>
            <button onClick={() => signOut({ callbackUrl: "/login" })} aria-label="Log out" data-tip="Log out" className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-bad"><LogOut size={20} /></button>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
