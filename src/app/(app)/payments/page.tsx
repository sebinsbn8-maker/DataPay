"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, Select, Stat, Textarea, api, downloadFile } from "@/components/ui";
import { FilterBar, hrs, inr, monthStart, today, toQuery, useApi, useLookups, type FilterState } from "@/components/hooks";

type Ov = { industryId: string; industryName: string; projectName: string; submitted: string; accepted: string; rejected: string; pending: string; payable: string; tds: string; gross: string; unbilled: string; paid: string; remaining: string; status: string };
type Line = { contributorId: string; contributorName: string; contributorCode: string; rate: string; submitted: string; accepted: string; rejected: string; amount: string; tds: string; net: string };
type St = { id: string; code: string; projectName: string; industryName: string; periodStart: string; periodEnd: string; totalAcceptedHours: string; totalPendingHours: string; calculatedAmount: string; tdsPercent: string; tdsAmount: string; netAmount: string; adjustmentsTotal: string; approvedAmount: string; paidAmount: string; outstanding: string; status: string; lines: Line[]; remarks: string | null };
type Detail = St & { transactions: { id: string; amount: string; paymentDate: string; referenceNumber: string; method: string; remarks: string | null }[]; adjustments: { id: string; amount: string; reason: string; createdAt: string }[] };
type Preview = { lines: Line[]; totalAccepted: string; totalAmount: string; totalTds: string; totalNet: string; tdsPercent: number; pendingHours: string; recordsIncluded: number; contributorsWithoutRate: string[]; alreadyBilledRecords: number };

const LABEL: Record<string, string> = { NOT_READY: "Not ready", PENDING_APPROVAL: "Pending approval", APPROVED: "Approved", PARTIALLY_PAID: "Partially paid", PAID: "Paid", VOID: "Void" };
const TONE: Record<string, "gray" | "amber" | "blue" | "violet" | "green" | "red"> = { NOT_READY: "gray", PENDING_APPROVAL: "amber", APPROVED: "blue", PARTIALLY_PAID: "violet", PAID: "green", VOID: "red" };
const METHODS = ["BANK_TRANSFER", "UPI", "CHEQUE", "CASH", "OTHER"];

export default function PaymentsPage() {
  const isAdmin = useSession().data?.user?.role === "ADMIN";
  const { projects, industries } = useLookups();
  const [f, setF] = useState<FilterState>({ from: "", to: "", projectId: "", industryId: "" });
  const { data, reload } = useApi<{ overview: Ov[]; statements: St[] }>(`/api/payments?${toQuery({ projectId: f.projectId, industryId: f.industryId, from: f.from, to: f.to })}`);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useApi<Detail>(detailId ? `/api/payments/${detailId}` : null);
  const [create, setCreate] = useState<{ industryId: string; from: string; to: string; remarks: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pay, setPay] = useState<{ amount: string; paymentDate: string; referenceNumber: string; method: string; remarks: string } | null>(null);
  const [adj, setAdj] = useState<{ amount: string; reason: string } | null>(null);
  const [err, setErr] = useState("");
  const ov = data?.overview ?? [];
  const sum = (k: keyof Ov) => ov.reduce((t, o) => t + Number(o[k]), 0);

  const act = async (fn: () => Promise<unknown>, done?: () => void) => { setErr(""); try { await fn(); done?.(); reload(); detail.reload(); } catch (e) { setErr((e as Error).message); } };
  const doPreview = () => act(async () => { if (create) setPreview(await api<Preview>("/api/payments/preview", { method: "POST", json: { industryId: create.industryId, from: create.from, to: create.to } })); });
  const d = detail.data?.id === detailId ? detail.data : null; // never show the previous statement while loading

  return (
    <div>
      <PageHeader title="Payments" subtitle="Payments are calculated on client-accepted hours and settled per industry."
        actions={<Button onClick={() => { setErr(""); setPreview(null); setCreate({ industryId: f.industryId || industries[0]?.id || "", from: monthStart(), to: today(), remarks: "" }); }}>New payment statement</Button>} />
      <FilterBar value={f} onChange={setF} projects={projects} industries={industries} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Accepted hours" value={hrs(sum("accepted"))} /><Stat label="TDS deducted" value={inr(sum("tds"))} tone="text-red-600" /><Stat label="Net payable (after TDS)" value={inr(sum("payable"))} />
        <Stat label="Paid" value={inr(sum("paid"))} tone="text-violet" /><Stat label="Remaining" value={inr(sum("remaining"))} tone="text-amber-600" />
      </div>

      <h2 className="mb-2 font-semibold">Industry payment status</h2>
      <DataTable rows={ov.map((o) => ({ ...o, id: o.industryId }))} searchText={(o) => `${o.industryName} ${o.projectName}`}
        cols={[
          { key: "industryName", header: "Industry", sortValue: (o) => o.industryName, render: (o) => <div><p className="font-medium">{o.industryName}</p><p className="text-xs text-muted">{o.projectName}</p></div> },
          { key: "submitted", header: "Submitted h", align: "right", render: (o) => hrs(o.submitted) },
          { key: "accepted", header: "Accepted h", align: "right", render: (o) => hrs(o.accepted) },
          { key: "rejected", header: "Rejected h", align: "right", render: (o) => hrs(o.rejected) },
          { key: "pending", header: "Pending h", align: "right", render: (o) => hrs(o.pending) },
          { key: "tds", header: "TDS", align: "right", render: (o) => inr(o.tds) },
          { key: "payable", header: "Net payable", align: "right", sortValue: (o) => Number(o.payable), render: (o) => inr(o.payable) },
          { key: "paid", header: "Paid", align: "right", render: (o) => inr(o.paid) },
          { key: "remaining", header: "Remaining", align: "right", sortValue: (o) => Number(o.remaining), render: (o) => inr(o.remaining) },
          { key: "status", header: "Status", render: (o) => <div><Badge tone={TONE[o.status]}>{LABEL[o.status]}</Badge>{Number(o.unbilled) > 0 && <p className="mt-1 text-xs text-muted">{inr(o.unbilled)} not yet billed</p>}</div> },
        ]} />

      <h2 className="mb-2 mt-8 font-semibold">Statements</h2>
      <DataTable rows={data?.statements ?? []} searchText={(s) => `${s.code} ${s.industryName}`} onRowClick={(s) => { setErr(""); setDetailId(s.id); }} empty="No statements yet"
        cols={[
          { key: "code", header: "Payment ID", sortValue: (s) => s.code, render: (s) => <span className="font-medium">{s.code}</span> },
          { key: "industryName", header: "Industry", render: (s) => `${s.projectName} · ${s.industryName}` },
          { key: "period", header: "Period", render: (s) => `${s.periodStart} → ${s.periodEnd}` },
          { key: "calc", header: "Gross", align: "right", render: (s) => inr(s.calculatedAmount) },
          { key: "tds", header: "TDS", align: "right", render: (s) => inr(s.tdsAmount) },
          { key: "appr", header: "Net approved", align: "right", render: (s) => (s.status === "PENDING_APPROVAL" ? "—" : inr(s.approvedAmount)) },
          { key: "paid", header: "Paid", align: "right", render: (s) => inr(s.paidAmount) },
          { key: "status", header: "Status", render: (s) => <Badge tone={TONE[s.status]}>{LABEL[s.status]}</Badge> },
        ]} />

      {/* create statement */}
      <Modal open={!!create} onClose={() => setCreate(null)} title="New payment statement" wide>
        {create && (
          <div className="space-y-3">
            <p className="text-sm text-muted">Includes only hours the client has reviewed. Hours still pending review stay out and can be billed later. Included hours are locked so they can never be billed twice.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Industry"><Select value={create.industryId} onChange={(e) => { setPreview(null); setCreate({ ...create, industryId: e.target.value }); }}>{industries.map((i) => <option key={i.id} value={i.id}>{projects.find((p) => p.id === i.projectId)?.name} · {i.name}</option>)}</Select></Field>
              <Field label="Period start"><Input type="date" value={create.from} onChange={(e) => { setPreview(null); setCreate({ ...create, from: e.target.value }); }} /></Field>
              <Field label="Period end"><Input type="date" value={create.to} onChange={(e) => { setPreview(null); setCreate({ ...create, to: e.target.value }); }} /></Field>
            </div>
            <Button variant="outline" onClick={doPreview}>Preview</Button>
            {preview && (
              <div className="space-y-3 rounded-xl border border-line p-3">
                {preview.contributorsWithoutRate.length > 0 && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">No hourly rate for: {preview.contributorsWithoutRate.join(", ")}. Set a rate first (Industries → Set hourly rate).</p>}
                <DataTable rows={preview.lines.map((l) => ({ ...l, id: l.contributorId + l.rate }))} empty="No reviewed hours in this period" pageSize={8} cols={[
                  { key: "contributorName", header: "Contributor" }, { key: "accepted", header: "Accepted h", align: "right", render: (l) => hrs(l.accepted) },
                  { key: "rate", header: "Rate", align: "right", render: (l) => inr(l.rate) }, { key: "amount", header: "Gross", align: "right", render: (l) => inr(l.amount) },
                  { key: "tds", header: `TDS ${preview.tdsPercent}%`, align: "right", render: (l) => inr(l.tds) }, { key: "net", header: "Net", align: "right", render: (l) => inr(l.net) }]} />
                <div className="flex flex-wrap items-end justify-between gap-2 text-sm"><span>Accepted: <b>{hrs(preview.totalAccepted)} h</b> · Pending QC (excluded): <b>{hrs(preview.pendingHours)} h</b></span>
                  <span className="text-right">Gross {inr(preview.totalAmount)} − TDS {inr(preview.totalTds)}<br /><span className="text-lg font-semibold">Net {inr(preview.totalNet)}</span></span></div>
              </div>)}
            <Field label="Remarks"><Textarea rows={2} value={create.remarks} onChange={(e) => setCreate({ ...create, remarks: e.target.value })} /></Field>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreate(null)}>Cancel</Button>
              <Button disabled={!preview || !preview.lines.length || preview.contributorsWithoutRate.length > 0} onClick={() => act(() => api("/api/payments", { method: "POST", json: create }), () => setCreate(null))}>Create statement</Button></div>
          </div>)}
      </Modal>

      {/* statement detail */}
      <Modal open={!!detailId} onClose={() => { setDetailId(null); setPay(null); setAdj(null); }} title={d ? `${d.code} · ${d.industryName}` : "Statement"} wide>
        {d && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm text-muted">{d.projectName} · {d.periodStart} → {d.periodEnd}</div><Badge tone={TONE[d.status]}>{LABEL[d.status]}</Badge></div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <Stat label="Accepted h" value={hrs(d.totalAcceptedHours)} /><Stat label="Gross" value={inr(d.calculatedAmount)} /><Stat label={`TDS ${Number(d.tdsPercent)}%`} value={inr(d.tdsAmount)} tone="text-red-600" /><Stat label="Adjustments" value={inr(d.adjustmentsTotal)} />
              <Stat label="Net approved" value={d.status === "PENDING_APPROVAL" ? "—" : inr(d.approvedAmount)} /><Stat label="Outstanding" value={d.status === "PENDING_APPROVAL" || d.status === "VOID" ? "—" : inr(d.outstanding)} tone="text-amber-600" />
            </div>
            <section><h3 className="mb-2 text-sm font-semibold">Contributor breakdown</h3>
              <DataTable rows={(d.lines ?? []).map((l) => ({ ...l, id: l.contributorId + l.rate }))} pageSize={8} cols={[
                { key: "contributorName", header: "Contributor", render: (l) => `${l.contributorName} (${l.contributorCode})` }, { key: "submitted", header: "Submitted h", align: "right", render: (l) => hrs(l.submitted) },
                { key: "accepted", header: "Accepted h", align: "right", render: (l) => hrs(l.accepted) }, { key: "rate", header: "Rate", align: "right", render: (l) => inr(l.rate) }, { key: "amount", header: "Gross", align: "right", render: (l) => inr(l.amount) },
                { key: "tds", header: "TDS", align: "right", render: (l) => inr(l.tds ?? "0") }, { key: "net", header: "Net", align: "right", render: (l) => inr(l.net ?? l.amount) }]} /></section>
            {d.adjustments.length > 0 && <section><h3 className="mb-1 text-sm font-semibold">Adjustments</h3>{d.adjustments.map((a) => <p key={a.id} className="text-sm">{inr(a.amount)} — {a.reason}</p>)}</section>}
            {d.transactions.length > 0 && <section><h3 className="mb-1 text-sm font-semibold">Payments made</h3>{d.transactions.map((t) => <p key={t.id} className="text-sm">{t.paymentDate} · {inr(t.amount)} · {t.method.replace("_", " ")} · ref {t.referenceNumber}</p>)}</section>}
            {d.status === "PAID" ? <Slips id={d.id} /> : d.status !== "VOID" && <p className="text-xs text-muted">Payment acknowledgement slips become available once this statement is fully paid.</p>}
            {err && <p className="text-sm text-red-700">{err}</p>}
            {isAdmin && d.status !== "VOID" && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                {d.status === "PENDING_APPROVAL" && <Button onClick={() => act(() => api(`/api/payments/${d.id}/approve`, { method: "POST" }))}>Approve statement</Button>}
                {(d.status === "APPROVED" || d.status === "PARTIALLY_PAID") && <Button onClick={() => setPay({ amount: d.outstanding, paymentDate: today(), referenceNumber: "", method: "BANK_TRANSFER", remarks: "" })}>Record payment</Button>}
                {d.status !== "PAID" && <Button variant="outline" onClick={() => setAdj({ amount: "", reason: "" })}>Add adjustment</Button>}
                {Number(d.paidAmount) > 0 && <Button variant="danger" onClick={() => { if (window.prompt(`This permanently removes ${inr(d.paidAmount)} of recorded payments from ${d.code}, voids the statement and invalidates its slips. It is meant for test or mistaken data only. Type DELETE to continue:`) !== "DELETE") return; const reason = window.prompt("Reason (kept in the audit log):"); if (reason && reason.length >= 3) act(() => api(`/api/payments/${d.id}/void`, { method: "POST", json: { reason, force: true } })); }}>Void with payments</Button>}
                {Number(d.paidAmount) === 0 && <Button variant="danger" onClick={() => { const reason = window.prompt("Reason for voiding this statement (releases its hours for QC correction):"); if (reason) act(() => api(`/api/payments/${d.id}/void`, { method: "POST", json: { reason } })); }}>Void</Button>}
              </div>)}
            {!isAdmin && d.status === "PENDING_APPROVAL" && <p className="text-sm text-muted">Waiting for admin approval.</p>}
            {pay && (
              <form className="space-y-3 rounded-xl border border-line p-3" onSubmit={(e) => { e.preventDefault(); act(() => api(`/api/payments/${d.id}/pay`, { method: "POST", json: { ...pay, amount: Number(pay.amount) } }), () => setPay(null)); }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Amount (₹)" hint={`Outstanding ${inr(d.outstanding)}`}><Input required type="number" min="0.01" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
                  <Field label="Payment date"><Input required type="date" value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} /></Field>
                  <Field label="Reference number"><Input required value={pay.referenceNumber} onChange={(e) => setPay({ ...pay, referenceNumber: e.target.value })} /></Field>
                  <Field label="Method"><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}</Select></Field>
                </div>
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPay(null)}>Cancel</Button><Button>Save payment</Button></div>
              </form>)}
            {adj && (
              <form className="space-y-3 rounded-xl border border-line p-3" onSubmit={(e) => { e.preventDefault(); act(() => api(`/api/payments/${d.id}/adjust`, { method: "POST", json: { amount: Number(adj.amount), reason: adj.reason } }), () => setAdj(null)); }}>
                <Field label="Amount (₹, negative = deduction)"><Input required type="number" step="0.01" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></Field>
                <Field label="Reason (required)"><Input required minLength={3} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></Field>
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAdj(null)}>Cancel</Button><Button>Apply adjustment</Button></div>
              </form>)}
          </div>)}
      </Modal>
      <Card className="mt-6 text-sm text-muted">Gross = accepted hours × the rate in force on each work date. TDS is withheld from every contributor (rounded to the paisa per contributor line). Net approved = gross − TDS + adjustments, frozen at approval, and payments are made against it. Rate or TDS changes never alter existing statements.</Card>
    </div>
  );
}

type SlipRow = { contributorId: string; code: string; name: string; gross: string; tds: string; net: string; hasSignature: boolean };
function Slips({ id }: { id: string }) {
  const s = useApi<{ recipients: SlipRow[] }>(`/api/payments/${id}/slips`);
  const rows = s.data?.recipients ?? [];
  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Payment acknowledgement slips</h3>
        {rows.length > 1 && <Button variant="outline" onClick={() => downloadFile(`/api/payments/${id}/slip`)}>Download all (PDF)</Button>}
      </div>
      <div className="divide-y divide-line rounded-xl border border-line">
        {rows.map((r) => (
          <div key={r.contributorId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span><b>{r.name}</b> <span className="text-muted">{r.code} · Net {inr(r.net)}</span> {r.hasSignature ? <span className="text-emerald-700">✓ signed</span> : <span className="text-amber-700">no signature on file</span>}</span>
            <Button variant="outline" onClick={() => downloadFile(`/api/payments/${id}/slip?contributorId=${r.contributorId}`)}>Download slip</Button>
          </div>))}
        {rows.length === 0 && <p className="px-3 py-2 text-sm text-muted">{s.data ? "No recipients." : "Loading…"}</p>}
      </div>
    </section>
  );
}
