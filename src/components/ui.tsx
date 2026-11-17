"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" };
export function Button({ variant = "primary", className, ...p }: BtnProps) {
  const v = {
    primary: "bg-violet text-white hover:bg-violet-dark",
    outline: "border border-line bg-white hover:bg-slate-50",
    ghost: "hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return <button {...p} className={cx("inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50 sm:h-10", v, className)} />;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
const inputCls = "h-11 w-full rounded-lg border border-line bg-field px-3 text-base outline-none focus:border-violet sm:h-10 sm:text-sm";
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, "h-auto py-2", p.className)} />;

const tones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700",
  blue: "bg-blue-50 text-blue-700", violet: "bg-violet/10 text-violet", gray: "bg-slate-100 text-slate-600",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Progress({ value, tone }: { value: number; tone?: "green" | "amber" | "red" | "violet" }) {
  const v = Math.max(0, Math.min(100, value));
  const c = tone ?? (value >= 90 ? "green" : value >= 60 ? "violet" : value >= 30 ? "amber" : "red");
  const bar = { green: "bg-emerald-500", violet: "bg-violet", amber: "bg-amber-500", red: "bg-red-500" }[c];
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx("h-full rounded-full", bar)} style={{ width: `${v}%` }} />
      </div>
      <span className="w-14 text-right text-xs tabular-nums text-muted">{value.toFixed(1)}%</span>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cx("max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl", tone)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

export type Col<T> = {
  key: string; header: string; render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number; align?: "right"; hideOnMobile?: boolean;
};

/** Search + sort + pagination table. On phones it falls back to stacked cards. */
export function DataTable<T extends { id: string }>({
  rows, cols, searchText, pageSize = 10, empty = "No records yet", onRowClick,
}: {
  rows: T[]; cols: Col<T>[]; searchText?: (r: T) => string; pageSize?: number; empty?: string; onRowClick?: (r: T) => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const view = useMemo(() => {
    let r = rows;
    if (q && searchText) r = r.filter((x) => searchText(x).toLowerCase().includes(q.toLowerCase()));
    if (sort) {
      const c = cols.find((c) => c.key === sort.key);
      if (c?.sortValue) r = [...r].sort((a, b) => {
        const x = c.sortValue!(a), y = c.sortValue!(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    return r;
  }, [rows, q, sort, cols, searchText]);

  const pages = Math.max(1, Math.ceil(view.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = view.slice(cur * pageSize, cur * pageSize + pageSize);

  return (
    <div>
      {searchText && (
        <div className="relative mb-3 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search…"
            className="h-11 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-base outline-none focus:border-violet sm:h-10 sm:text-sm" />
        </div>
      )}

      {/* desktop / tablet */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>{cols.map((c) => (
              <th key={c.key} className={cx("whitespace-nowrap px-4 py-3 font-semibold", c.align === "right" && "text-right")}>
                {c.sortValue ? (
                  <button className="inline-flex items-center gap-1" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>
                    {c.header}{sort?.key === c.key && (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </button>
                ) : c.header}
              </th>))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {slice.map((r) => (
              <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx(onRowClick && "cursor-pointer hover:bg-slate-50")}>
                {cols.map((c) => <td key={c.key} className={cx("px-4 py-3 align-middle", c.align === "right" && "text-right tabular-nums")}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}</td>)}
              </tr>
            ))}
            {!slice.length && <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-muted">{empty}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* phone: stacked cards */}
      <div className="space-y-3 md:hidden">
        {slice.map((r) => (
          <div key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className="rounded-xl border border-line bg-white p-4">
            {cols.filter((c) => !c.hideOnMobile).map((c, i) => (
              <div key={c.key} className={cx("flex items-start justify-between gap-3 py-1 text-sm", i === 0 && "text-base font-semibold")}>
                {i !== 0 && <span className="text-muted">{c.header}</span>}
                <span className={cx(i !== 0 && "text-right tabular-nums")}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}</span>
              </div>
            ))}
          </div>
        ))}
        {!slice.length && <p className="py-10 text-center text-muted">{empty}</p>}
      </div>

      {view.length > pageSize && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted">
          <span>{view.length} records</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Prev</Button>
            <span>{cur + 1} / {pages}</span>
            <Button variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tiny fetch helper used by all client pages. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}
