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

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
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

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
      {items.map((n) => {
        const Icon = ICONS[n.icon];
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} title={n.label}
            className={cx("flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
              active ? "bg-violet text-white" : "text-indigo-200 hover:bg-white/10 hover:text-white")}>
            <Icon size={18} />
            <span className={cx(collapsed && "lg:hidden")}>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* desktop sidebar */}
      <aside className={cx("fixed inset-y-0 left-0 z-30 hidden flex-col bg-navy transition-all lg:flex", collapsed ? "w-[72px]" : "w-64")}>
        <div className="flex h-16 items-center justify-between px-4">
          {collapsed ? <LogoMark size={34} /> : <Logo />}
        </div>
        {nav}
        <button onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"
          className="m-3 flex h-10 items-center justify-center rounded-lg text-indigo-200 hover:bg-white/10">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy">
            <div className="flex h-16 items-center justify-between px-4">
              <Logo />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-indigo-200"><X size={20} /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className={cx("transition-all", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"><Menu size={22} /></button>
          <form action="/search" className="relative hidden max-w-md flex-1 sm:block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" placeholder="Search projects, industries, contributors…" aria-label="Search"
              className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-violet" />
          </form>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm text-muted md:block">{today}</span>
            <Link href="/notifications" aria-label="Notifications" className="rounded-lg p-2 hover:bg-slate-100"><Bell size={20} /></Link>
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-violet text-sm font-semibold text-white" aria-hidden>{user.name.charAt(0).toUpperCase()}</span>
            <button onClick={() => signOut({ callbackUrl: "/login" })} aria-label="Log out" className="rounded-lg p-2 hover:bg-slate-100"><LogOut size={20} /></button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
