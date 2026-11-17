"use client";
import { useMemo, useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Input, PageHeader, Stat, api, cx } from "@/components/ui";
import { FilterBar, hrs, today, toQuery, useApi, useLookups, type FilterState } from "@/components/hooks";

type Row = {
  assignmentId: string; contributorName: string; contributorCode: string; projectName: string; industryName: string; dailyTarget: string;
  recordId: string | null; sessions: { hours: number }[]; actualHours: number; submittedHours: number; remarks: string; locked: boolean; qcStatus: string | null;
};
type Sheet = { rows: Row[]; totals: { records: number; target: string; actual: string; submitted: string } };
type Draft = { sessions: string[]; submitted: string; remarks: string; touched: boolean; submittedTouched: boolean };

export default function DailyHoursPage() {
  const { projects, industries } = useLookups();
  const [date, setDate] = useState(today());
  const [f, setF] = useState<FilterState>({ from: "", to: "", projectId: "", industryId: "" });
  const { data, reload, loading } = useApi<Sheet>(`/api/hours?${toQuery({ date, projectId: f.projectId, industryId: f.industryId })}`);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset drafts whenever a fresh sheet arrives (derived during render, not in an effect)
  const [seen, setSeen] = useState<Sheet | null>(null);
  if (data !== seen) {
    setSeen(data);
    const d: Record<string, Draft> = {};
    for (const r of data?.rows ?? []) d[r.assignmentId] = { sessions: r.sessions.length ? r.sessions.map((s) => String(s.hours)) : [""], submitted: r.recordId ? String(r.submittedHours) : "", remarks: r.remarks, touched: false, submittedTouched: !!r.recordId };
    setDrafts(d);
  }

  const actualOf = (d?: Draft) => (d?.sessions ?? []).reduce((t, x) => t + (Number(x) || 0), 0);
  const set = (id: string, patch: Partial<Draft>) => setDrafts((p) => ({ ...p, [id]: { ...p[id], ...patch, touched: true } }));
  const dirty = useMemo(() => Object.entries(drafts).filter(([, d]) => d.touched), [drafts]);

  async function save() {
    setMsg(null); setSaving(true);
    try {
      const entries = dirty.map(([assignmentId, d]) => {
        const actual = actualOf(d);
        return { assignmentId, sessions: d.sessions.filter((x) => Number(x) > 0).map((x) => ({ hours: Number(x) })), submittedHours: d.submitted === "" ? actual : Number(d.submitted), remarks: d.remarks || null };
      });
      await api("/api/hours", { method: "POST", json: { date, entries } });
      setMsg({ ok: true, text: `Saved ${entries.length} record${entries.length === 1 ? "" : "s"}.` });
      reload();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setSaving(false); }
  }

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of data?.rows ?? []) (m.get(`${r.projectName} · ${r.industryName}`) ?? m.set(`${r.projectName} · ${r.industryName}`, []).get(`${r.projectName} · ${r.industryName}`)!).push(r);
    return [...m.entries()];
  }, [data]);

  return (
    <div className="pb-24">
      <PageHeader title="Daily Hours" subtitle="Enter each contributor's working hours. Add more than one session if needed; submitted hours can't exceed actual hours." />
      <div className="mb-3 max-w-xs"><Field label="Date"><Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      <FilterBar value={f} onChange={setF} projects={projects} industries={industries} showDates={false} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Records today" value={data?.totals.records ?? 0} />
        <Stat label="Target h" value={hrs(data?.totals.target ?? 0)} />
        <Stat label="Actual h" value={hrs(data?.totals.actual ?? 0)} />
        <Stat label="Submitted h" value={hrs(data?.totals.submitted ?? 0)} />
      </div>

      {loading && !data && <p className="text-muted">Loading…</p>}
      {!loading && !groups.length && <Card className="text-center text-muted">No active contributors match these filters. Assign contributors to industries first.</Card>}

      <div className="space-y-6">
        {groups.map(([title, rows]) => (
          <section key={title}>
            <h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>
            <div className="space-y-3">
              {rows.map((r) => {
                const d = drafts[r.assignmentId]; if (!d) return null;
                const actual = actualOf(d);
                const sub = d.submitted === "" ? actual : Number(d.submitted);
                const over = sub > actual + 1e-9;
                return (
                  <Card key={r.assignmentId} className={cx("!p-4", d.touched && "ring-1 ring-violet/40", r.locked && "opacity-70")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><p className="font-medium">{r.contributorName} <span className="text-xs text-muted">{r.contributorCode}</span></p><p className="text-xs text-muted">Target {hrs(r.dailyTarget)} h</p></div>
                      <div className="flex items-center gap-2">
                        {r.locked && <Badge tone="gray"><Lock size={11} className="mr-1 inline" />billed</Badge>}
                        {r.recordId && !d.touched && <Badge tone="green">saved</Badge>}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Work sessions (hours)</span>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {d.sessions.map((s, i) => (
                            <span key={i} className="flex items-center gap-1">
                              <Input disabled={r.locked} className="w-24" type="number" inputMode="decimal" min="0" max="24" step="0.25" placeholder="0" value={s} onChange={(e) => set(r.assignmentId, { sessions: d.sessions.map((x, j) => (j === i ? e.target.value : x)) })} />
                              {d.sessions.length > 1 && !r.locked && <button aria-label="Remove session" className="rounded p-2 text-muted hover:bg-slate-100" onClick={() => set(r.assignmentId, { sessions: d.sessions.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                            </span>
                          ))}
                          {!r.locked && <button className="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-violet hover:bg-violet/10 sm:h-10" onClick={() => set(r.assignmentId, { sessions: [...d.sessions, ""] })}><Plus size={14} />session</button>}
                        </div>
                      </div>
                      <div className="text-sm"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Actual</span><p className="mt-2 text-lg font-semibold tabular-nums">{hrs(actual)} h</p></div>
                      <div>
                        <Field label="Submitted hours" hint={over ? undefined : "Defaults to actual hours"}>
                          <Input disabled={r.locked} type="number" inputMode="decimal" min="0" step="0.25" className={over ? "!border-red-500" : ""} placeholder={String(actual || 0)} value={d.submitted} onChange={(e) => set(r.assignmentId, { submitted: e.target.value, submittedTouched: true })} />
                        </Field>
                        {over && <p className="mt-1 text-xs text-red-600">Submitted exceeds actual hours</p>}
                      </div>
                    </div>
                    <div className="mt-3"><Input disabled={r.locked} placeholder="Remarks (optional)" value={d.remarks} onChange={(e) => set(r.assignmentId, { remarks: e.target.value })} /></div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* sticky save bar: thumb-friendly on phones */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 p-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
          <p className={cx("text-sm", msg?.ok === false ? "text-red-700" : "text-muted")} role="status">{msg?.text ?? (dirty.length ? `${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"}` : "No changes")}</p>
          <Button disabled={!dirty.length || saving} onClick={save}>{saving ? "Saving…" : "Save hours"}</Button>
        </div>
      </div>
    </div>
  );
}
