"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("glass rounded-2xl p-4 sm:p-5", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-gradient text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" };
export function Button({ variant = "primary", className, ...p }: BtnProps) {
  const v = {
    primary: "btn-primary",
    outline: "btn-outline",
    ghost: "btn-ghost",
    danger: "btn-danger",
  }[variant];
  return <button {...p} className={cx("inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:h-10", v, className)} />;
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
const inputCls = "input h-11 w-full rounded-lg px-3 text-base sm:h-10 sm:text-sm";
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, "h-auto py-2", p.className)} />;

const tones: Record<string, string> = {
  green: "bg-good/10 text-good ring-1 ring-good/25", amber: "bg-warn/10 text-warn ring-1 ring-warn/25", red: "bg-bad/10 text-bad ring-1 ring-bad/25",
  blue: "bg-info/10 text-info ring-1 ring-info/25", violet: "bg-violet/15 text-violet ring-1 ring-violet/30", gray: "bg-white/5 text-muted ring-1 ring-white/10",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Progress({ value, tone }: { value: number; tone?: "green" | "amber" | "red" | "violet" }) {
  const v = Math.max(0, Math.min(100, value));
  const c = tone ?? (value >= 90 ? "green" : value >= 60 ? "violet" : value >= 30 ? "amber" : "red");
  const bar = { green: "bg-gradient-to-r from-emerald-500 to-cyan-400", violet: "bg-gradient-to-r from-blue-500 to-violet", amber: "bg-gradient-to-r from-amber-500 to-orange-400", red: "bg-gradient-to-r from-rose-600 to-rose-400" }[c];
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx("h-full rounded-full transition-[width] duration-700 ease-out", bar)} style={{ width: `${v}%` }} />
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
    <div className="modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cx("modal-panel grad-border max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-[#0b1230]/95 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,.8),0_0_60px_-30px_rgba(34,211,238,.4)] backdrop-blur-xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Counts up to numeric values like "1,234.5", "₹12,345.00" or "42" (respects reduced motion). */
export function AnimatedValue({ value }: { value: React.ReactNode }) {
  const m = typeof value === "number" || typeof value === "string" ? /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(String(value)) : null;
  const target = m ? parseFloat(m[2].replace(/,/g, "")) : NaN;
  const dec = m ? (m[2].split(".")[1]?.length ?? 0) : 0;
  const [shown, setShown] = useState(target);
  const prev = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = prev.current, t0 = performance.now(), dur = reduced ? 1 : 800;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setShown(from + (target - from) * e);
      if (k < 1) raf = requestAnimationFrame(step); else prev.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (!m || !Number.isFinite(target)) return <>{value}</>;
  return <>{m[1]}{shown.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec })}{m[3]}</>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <Card className="lift group relative overflow-hidden !p-4">
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan/10 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={cx("mt-1 break-words font-display text-xl font-semibold tabular-nums sm:text-2xl", tone)}><AnimatedValue value={value} /></p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan/50 to-transparent opacity-60" />
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
            className="input h-11 w-full rounded-lg pl-9 pr-3 text-base sm:h-10 sm:text-sm" />
        </div>
      )}

      {/* desktop / tablet */}
      <div className="glass hidden overflow-x-auto rounded-xl md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-white/[0.03] text-left text-xs uppercase tracking-wider text-muted">
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
              <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx("table-row", onRowClick ? "clickable" : "hover:bg-white/[0.03]")}>
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
          <div key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className="glass press rounded-xl p-4">
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

/** Delete with confirmation. If the server says history exists, offers a typed-DELETE "delete everything" step. */
export async function deleteEntity(url: string, confirmText: string): Promise<boolean> {
  if (!confirm(confirmText)) return false;
  try { await api(url, { method: "DELETE" }); return true; }
  catch (e) {
    const m = (e as Error).message;
    if (!/recorded hours/i.test(m)) { alert(m); return false; }
    const typed = prompt(`${m}\n\nTo permanently delete it TOGETHER WITH all its recorded hours and QC entries, type DELETE below. This cannot be undone.`);
    if (typed?.trim() !== "DELETE") return false;
    try { await api(`${url}?force=1`, { method: "DELETE" }); return true; }
    catch (e2) { alert((e2 as Error).message); return false; }
  }
}

/** Download a file from an API URL; shows the server's message if it refuses. */
export async function downloadFile(url: string, fallbackName = "download") {
  try {
    const res = await fetch(url);
    if (!res.ok) { const j = await res.json().catch(() => null); alert(j?.error ?? "Could not download the file"); return; }
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob()); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch { alert("Could not download the file"); }
}
