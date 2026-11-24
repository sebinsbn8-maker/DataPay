"use client";
import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, api, cx } from "@/components/ui";
import { FilterBar, hrs, monthStart, today, toQuery, useApi, useLookups, type FilterState } from "@/components/hooks";

type Q = { id: string; date: string; projectName: string; industryId: string; industryName: string; contributorName: string; submitted: string; pct: string | null; accepted: string; rejected: string; qcStatus: string; qcReference: string | null; source: string; locked: boolean };
const LABEL: Record<string, string> = { PENDING: "Pending client review", PARTIALLY_ACCEPTED: "Partially accepted", FULLY_ACCEPTED: "Fully accepted", REJECTED: "Rejected", RESUBMITTED: "Revised / resubmitted" };
const TONE: Record<string, "amber" | "blue" | "green" | "red" | "violet"> = { PENDING: "amber", PARTIALLY_ACCEPTED: "blue", FULLY_ACCEPTED: "green", REJECTED: "red", RESUBMITTED: "violet" };

export default function QcPage() {
  const { projects, industries } = useLookups();
  const [f, setF] = useState<FilterState>({ from: monthStart(), to: today(), projectId: "", industryId: "" });
  const [status, setStatus] = useState("");
  const { data, reload } = useApi<Q[]>(`/api/qc?${toQuery({ ...f, status })}`);
  // one edit per row: which field the user typed in, and the text; the other two fields are derived from it
  type Field3 = "pct" | "acc" | "rej";
  const [edits, setEdits] = useState<Record<string, { field: Field3; text: string }>>({});
  const [bulk, setBulk] = useState("");
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [alloc, setAlloc] = useState<{ industryId: string; pct: string; reference: string; overwrite: boolean } | null>(null);

  // clear edits whenever fresh data arrives (derived during render, not in an effect)
  const [seen, setSeen] = useState<Q[] | null>(null);
  if (data !== seen) { setSeen(data); setEdits({}); setSel(new Set()); }
  const show = (n: number | null) => (n === null || !isFinite(n) ? "" : String(+n.toFixed(4)));
  /** Current (pct, accepted, rejected) for a row, derived from the saved values or the field being edited. */
  const calc = (r: Q): { pct: number | null; acc: number | null; rej: number | null; bad: boolean } => {
    const sub = Number(r.submitted), e = edits[r.id];
    if (!e) return r.pct === null ? { pct: null, acc: null, rej: null, bad: false } : { pct: Number(r.pct), acc: Number(r.accepted), rej: Number(r.rejected), bad: false };
    const v = e.text.trim() === "" ? null : Number(e.text);
    if (v === null) return { pct: null, acc: null, rej: null, bad: false };
    if (isNaN(v)) return { pct: null, acc: null, rej: null, bad: true };
    if (e.field === "pct") { const acc = (sub * v) / 100; return { pct: v, acc, rej: sub - acc, bad: v < 0 || v > 100 }; }
    const acc = e.field === "acc" ? v : sub - v;
    return { pct: sub ? (acc / sub) * 100 : 0, acc, rej: sub - acc, bad: v < 0 || v > sub + 1e-9 || acc < -1e-9 };
  };
  const valueFor = (r: Q, field: Field3) => { const e = edits[r.id]; if (e?.field === field) return e.text; const c = calc(r); return show(field === "pct" ? c.pct : field === "acc" ? c.acc : c.rej); };
  const setEdit = (id: string, field: Field3, text: string) => setEdits((o) => ({ ...o, [id]: { field, text } }));
  const changed = useMemo(() => (data ?? []).filter((r) => !r.locked && r.id in edits), [data, edits]); // eslint-disable-line react-hooks/exhaustive-deps
  const anyBad = changed.some((r) => calc(r).bad);

  async function save(updates: { id: string; acceptancePct?: number | null; acceptedHours?: number; rejectedHours?: number; qcReference?: string }[]) {
    setMsg(null);
    try { await api("/api/qc", { method: "POST", json: { updates } }); setMsg({ ok: true, text: `Updated ${updates.length} record${updates.length === 1 ? "" : "s"}.` }); reload(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  const applyBulk = () => { const p = Number(bulk); if (bulk === "" || isNaN(p) || p < 0 || p > 100) return setMsg({ ok: false, text: "Enter a percentage between 0 and 100." }); setEdits((o) => ({ ...o, ...Object.fromEntries([...sel].map((id) => [id, { field: "pct" as Field3, text: String(p) }])) })); };

  return (
    <div className="pb-24">
      <PageHeader title="Client Acceptance / QC" subtitle="Payment is calculated only on client-accepted hours. Enter the client %, or type the accepted / rejected hours directly."
        actions={<Button variant="outline" onClick={() => setAlloc({ industryId: f.industryId || industries[0]?.id || "", pct: "", reference: "", overwrite: false })}>Industry-level %</Button>} />
      <FilterBar value={f} onChange={setF} projects={projects} industries={industries} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56"><Field label="QC status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field></div>
        <div className="w-32"><Field label="Bulk %"><Input type="number" min="0" max="100" step="0.01" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="e.g. 90" /></Field></div>
        <Button variant="outline" disabled={!sel.size || bulk === ""} onClick={applyBulk}>Apply to {sel.size} selected</Button>
        <div className="w-56"><Field label="QC reference (optional)"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Client report ID" /></Field></div>
      </div>

      {/* desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted"><tr>
            <th className="px-3 py-3"><input type="checkbox" aria-label="Select all" onChange={(e) => setSel(e.target.checked ? new Set((data ?? []).filter((r) => !r.locked).map((r) => r.id)) : new Set())} /></th>
            {["Date", "Industry", "Contributor", "Submitted h", "Client %", "Accepted h", "Rejected h", "QC status"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {(data ?? []).map((r) => {
              const c = calc(r), ed = r.id in edits;
              const box = (field: Field3, max?: number) => r.locked ? null : <Input className={cx("!h-9 w-24", c.bad && ed && "!border-red-400")} type="number" min="0" max={max} step="any" value={valueFor(r, field)} onChange={(e) => setEdit(r.id, field, e.target.value)} />;
              return (
                <tr key={r.id} className={cx(ed && "bg-violet/5")}>
                  <td className="px-3 py-2"><input type="checkbox" disabled={r.locked} checked={sel.has(r.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} aria-label={`Select ${r.contributorName}`} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.date}</td><td className="px-3 py-2">{r.industryName}</td><td className="px-3 py-2">{r.contributorName}</td>
                  <td className="px-3 py-2 tabular-nums">{hrs(r.submitted)}</td>
                  <td className="px-3 py-2">{r.locked ? <span className="inline-flex items-center gap-1 text-muted"><Lock size={12} />{r.pct === null ? "—" : `${Number(r.pct)}%`}</span> : box("pct", 100)}</td>
                  <td className="px-3 py-2 tabular-nums">{r.locked ? (c.acc === null ? "—" : hrs(c.acc)) : box("acc", Number(r.submitted))}</td>
                  <td className="px-3 py-2 tabular-nums">{r.locked ? (c.rej === null ? "—" : hrs(c.rej)) : box("rej", Number(r.submitted))}</td>
                  <td className="px-3 py-2"><Badge tone={TONE[r.qcStatus]}>{LABEL[r.qcStatus]}</Badge>{r.source === "INDUSTRY_ALLOCATION" && <span className="ml-1 text-xs text-muted">(industry-level)</span>}</td>
                </tr>);
            })}
            {!data?.length && <tr><td colSpan={9} className="px-3 py-10 text-center text-muted">No records in this range.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* phone cards */}
      <div className="space-y-3 md:hidden">
        {(data ?? []).map((r) => { const c = calc(r), ed = r.id in edits; return (
          <Card key={r.id} className="!p-4">
            <div className="flex items-start justify-between"><div><p className="font-medium">{r.contributorName}</p><p className="text-xs text-muted">{r.date} · {r.industryName}</p></div><Badge tone={TONE[r.qcStatus]}>{LABEL[r.qcStatus]}</Badge></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><p className="text-xs text-muted">Submitted</p>{hrs(r.submitted)} h</div><div><p className="text-xs text-muted">Accepted</p>{c.acc === null ? "—" : `${hrs(c.acc)} h`}</div><div><p className="text-xs text-muted">Rejected</p>{c.rej === null ? "—" : `${hrs(c.rej)} h`}</div></div>
            <div className="mt-3">{r.locked ? <p className="text-sm text-muted"><Lock size={12} className="mr-1 inline" />Locked in a payment statement</p>
              : <div className="grid grid-cols-3 gap-2">
                  {(["pct", "acc", "rej"] as const).map((fld) => <Field key={fld} label={fld === "pct" ? "Client %" : fld === "acc" ? "Accepted h" : "Rejected h"}>
                    <Input className={cx(c.bad && ed && "!border-red-400")} type="number" inputMode="decimal" min="0" step="any" value={valueFor(r, fld)} onChange={(e) => setEdit(r.id, fld, e.target.value)} /></Field>)}
                </div>}</div>
          </Card>); })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 p-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
          <p className={cx("text-sm", msg?.ok === false ? "text-red-700" : "text-muted")} role="status">{msg?.text ?? (anyBad ? "Some values are out of range (accepted + rejected must equal submitted hours)." : changed.length ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "Edit the client %, accepted h or rejected h. Locked rows belong to a payment statement.")}</p>
          <Button disabled={!changed.length || anyBad} onClick={() => save(changed.map((r) => {
            const e = edits[r.id], q = ref || undefined;
            if (e.text.trim() === "") return { id: r.id, acceptancePct: null, qcReference: q };
            return e.field === "pct" ? { id: r.id, acceptancePct: Number(e.text), qcReference: q } : e.field === "acc" ? { id: r.id, acceptedHours: Number(e.text), qcReference: q } : { id: r.id, rejectedHours: Number(e.text), qcReference: q };
          }))}>Save acceptance</Button>
        </div>
      </div>

      <Modal open={!!alloc} onClose={() => setAlloc(null)} title="Industry-level acceptance">
        {alloc && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault(); setMsg(null);
            try { const r = await api<{ allocated: number; skippedIndividual: number; totalAccepted: string }>("/api/qc/allocate", { method: "POST", json: { industryId: alloc.industryId, from: f.from, to: f.to, pct: Number(alloc.pct), reference: alloc.reference || undefined, overwriteIndividual: alloc.overwrite } });
              setMsg({ ok: true, text: `Allocated to ${r.allocated} records (${hrs(r.totalAccepted)} accepted hours)${r.skippedIndividual ? `; ${r.skippedIndividual} individually-set record(s) kept unchanged` : ""}.` }); setAlloc(null); reload(); }
            catch (err) { setMsg({ ok: false, text: (err as Error).message }); setAlloc(null); }
          }}>
            <p className="text-sm text-muted">Use when the client reports one acceptance % for a whole industry. Accepted hours are shared across contributors in proportion to their submitted hours (pro-rata). Period: <b>{f.from}</b> to <b>{f.to}</b> (from the filters above).</p>
            <Field label="Industry"><Select value={alloc.industryId} onChange={(e) => setAlloc({ ...alloc, industryId: e.target.value })}>{industries.map((i) => <option key={i.id} value={i.id}>{projects.find((p) => p.id === i.projectId)?.name} · {i.name}</option>)}</Select></Field>
            <Field label="Client acceptance %"><Input required type="number" min="0" max="100" step="0.01" value={alloc.pct} onChange={(e) => setAlloc({ ...alloc, pct: e.target.value })} /></Field>
            <Field label="QC reference"><Input value={alloc.reference} onChange={(e) => setAlloc({ ...alloc, reference: e.target.value })} /></Field>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={alloc.overwrite} onChange={(e) => setAlloc({ ...alloc, overwrite: e.target.checked })} /><span>Also overwrite records that already have an individual percentage <span className="text-muted">(off by default, so individual QC is never silently replaced)</span></span></label>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAlloc(null)}>Cancel</Button><Button>Allocate</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
