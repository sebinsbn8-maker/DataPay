"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { Badge, Button, DataTable, Field, Input, Modal, PageHeader, Select, Textarea, api, deleteEntity } from "@/components/ui";
import { hrs, useApi, useLookups } from "@/components/hooks";

type Asg = { id: string; projectId: string; industryId: string; projectName: string; industryName: string; status: string; dailyTargetHours: string; weeklyTargetHours: string; monthlyTargetHours: string };
type Con = { id: string; code: string; fullName: string; email: string; phone: string | null; joiningDate: string | null; status: string; notes: string | null; assignments: Asg[] };
type Hist = { id: string; date: string; projectName: string; industryName: string; target: string; actual: string; submitted: string; accepted: string | null; pct: string | null; qc: string | null }[];

const blank = { fullName: "", email: "", phone: "", joiningDate: "", status: "ACTIVE", notes: "" };
const asgBlank = { projectId: "", industryId: "", dailyTargetHours: "8", weeklyTargetHours: "40", monthlyTargetHours: "160", hourlyRate: "" };

export default function ContributorsPage() {
  const isAdmin = useSession().data?.user?.role === "ADMIN";
  const { projects, industries } = useLookups();
  const { data, reload, error } = useApi<Con[]>("/api/contributors");
  const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null);
  const [sel, setSel] = useState<Con | null>(null);
  const [asg, setAsg] = useState<typeof asgBlank | null>(null);
  const [transfer, setTransfer] = useState<{ id: string; industryId: string } | null>(null);
  const [err, setErr] = useState("");
  const hist = useApi<Hist>(sel ? `/api/contributors/${sel.id}` : null);
  const inds = (pid: string) => industries.filter((i) => i.projectId === pid && i.status === "ACTIVE");

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setErr("");
    try { await fn(); after?.(); const fresh = await api<Con[]>("/api/contributors"); setSel((s) => (s ? fresh.find((c) => c.id === s.id) ?? null : s)); reload(); }
    catch (e) { setErr((e as Error).message); }
  };

  async function removeContributor(c: { id: string; fullName: string }) {
    if (await deleteEntity(`/api/contributors/${c.id}`, `Delete contributor "${c.fullName}"? Their assignments and rates are removed, and any login for them is switched off. This cannot be undone.`)) { setSel(null); reload(); }
  }

  return (
    <div>
      <PageHeader title="Contributors" subtitle="Add contributors, assign them to industries, and manage targets."
        actions={isAdmin && <Button onClick={() => { setErr(""); setEdit({ ...blank }); }}><Plus size={16} />New contributor</Button>} />
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <DataTable rows={data ?? []} searchText={(c) => `${c.fullName} ${c.code} ${c.email} ${c.assignments.map((a) => a.industryName).join(" ")}`}
        onRowClick={(c) => { setErr(""); setSel(c); }}
        cols={[
          { key: "code", header: "ID", sortValue: (c) => c.code, hideOnMobile: true },
          { key: "fullName", header: "Name", sortValue: (c) => c.fullName, render: (c) => <span className="font-medium">{c.fullName}</span> },
          { key: "assign", header: "Industries", render: (c) => c.assignments.filter((a) => a.status === "ACTIVE").map((a) => a.industryName).join(", ") || "—" },
          { key: "email", header: "Email", hideOnMobile: true },
          { key: "status", header: "Status", render: (c) => <Badge tone={c.status === "ACTIVE" ? "green" : "gray"}>{c.status.toLowerCase()}</Badge> },
          ...(isAdmin ? [{ key: "del", header: "", render: (c: Con) => <button type="button" aria-label={`Delete ${c.fullName}`} title="Delete" className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); removeContributor(c); }}><Trash2 size={16} /></button> }] : []),
        ]} />

      {/* detail */}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.fullName} · ${sel.code}` : ""} wide>
        {sel && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>{sel.email}{sel.phone ? ` · ${sel.phone}` : ""}{sel.joiningDate ? ` · joined ${sel.joiningDate}` : ""}</span>
              {isAdmin && <span className="flex gap-2"><Button variant="outline" onClick={() => setEdit({ ...blank, ...sel, phone: sel.phone ?? "", joiningDate: sel.joiningDate ?? "", notes: sel.notes ?? "" })}>Edit</Button>
                <Button variant="outline" onClick={() => run(() => api(`/api/contributors/${sel.id}`, { method: "PATCH", json: { status: sel.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } }))}>{sel.status === "ACTIVE" ? "Deactivate" : "Activate"}</Button>
                <Button variant="danger" onClick={() => removeContributor(sel)}>Delete</Button></span>}
            </div>
            <section>
              <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Assignments &amp; targets</h3>
                {isAdmin && <Button variant="outline" onClick={() => setAsg({ ...asgBlank, projectId: projects[0]?.id ?? "" })}><Plus size={14} />Assign</Button>}</div>
              <div className="space-y-2">
                {sel.assignments.map((a) => (
                  <div key={a.id} className="rounded-xl border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><b>{a.projectName}</b> · {a.industryName} <Badge tone={a.status === "ACTIVE" ? "green" : "gray"}>{a.status.toLowerCase()}</Badge></span>
                      {isAdmin && a.status === "ACTIVE" && <span className="flex gap-2">
                        <Button variant="ghost" onClick={() => setTransfer({ id: a.id, industryId: "" })}>Transfer</Button>
                        <Button variant="ghost" onClick={() => run(() => api(`/api/assignments/${a.id}`, { method: "PATCH", json: { status: "INACTIVE" } }))}>Unassign</Button></span>}
                    </div>
                    {isAdmin && a.status === "ACTIVE" ? (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {(["dailyTargetHours", "weeklyTargetHours", "monthlyTargetHours"] as const).map((k) => (
                          <Field key={k} label={k.replace("TargetHours", "")}>
                            <Input type="number" min="0" step="0.5" defaultValue={a[k]} onBlur={(e) => Number(e.target.value) !== Number(a[k]) && run(() => api(`/api/assignments/${a.id}`, { method: "PATCH", json: { [k]: Number(e.target.value) } }))} />
                          </Field>))}
                      </div>
                    ) : <p className="mt-1 text-muted">Targets (d/w/m): {hrs(a.dailyTargetHours)} / {hrs(a.weeklyTargetHours)} / {hrs(a.monthlyTargetHours)} h</p>}
                  </div>
                ))}
                {!sel.assignments.length && <p className="text-sm text-muted">Not assigned to any industry yet.</p>}
              </div>
              {isAdmin && <p className="mt-2 text-xs text-muted">Hourly rates are set per industry / project (Industries page) or per contributor when assigning. Target changes apply to future entries only.</p>}
            </section>
            <section>
              <h3 className="mb-2 font-semibold">Work history</h3>
              <DataTable rows={hist.loading ? [] : hist.data ?? []} pageSize={6} empty="No work recorded yet" cols={[
                { key: "date", header: "Date", sortValue: (r) => r.date },
                { key: "industryName", header: "Industry" },
                { key: "submitted", header: "Submitted h", align: "right", render: (r) => hrs(r.submitted) },
                { key: "pct", header: "Accepted %", align: "right", render: (r) => (r.pct === null ? <Badge tone="amber">pending</Badge> : `${Number(r.pct).toFixed(1)}%`) },
                { key: "accepted", header: "Accepted h", align: "right", render: (r) => (r.accepted ? hrs(r.accepted) : "—") },
              ]} />
            </section>
            {err && <p className="text-sm text-red-700">{err}</p>}
          </div>
        )}
      </Modal>

      {/* create / edit */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit contributor" : "New contributor"}>
        {edit && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const { id, ...b } = edit; run(() => api(id ? `/api/contributors/${id}` : "/api/contributors", { method: id ? "PATCH" : "POST", json: b }), () => setEdit(null)); }}>
            <Field label="Full name"><Input required value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email"><Input required type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
              <Field label="Phone"><Input type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            </div>
            <Field label="Joining date"><Input type="date" value={edit.joiningDate} onChange={(e) => setEdit({ ...edit, joiningDate: e.target.value })} /></Field>
            <Field label="Notes"><Textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button>Save</Button></div>
          </form>
        )}
      </Modal>

      {/* assign */}
      <Modal open={!!asg} onClose={() => setAsg(null)} title="Assign to industry">
        {asg && sel && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => api("/api/assignments", { method: "POST", json: { contributorId: sel.id, projectId: asg.projectId, industryId: asg.industryId, dailyTargetHours: Number(asg.dailyTargetHours), weeklyTargetHours: Number(asg.weeklyTargetHours), monthlyTargetHours: Number(asg.monthlyTargetHours), hourlyRate: asg.hourlyRate ? Number(asg.hourlyRate) : undefined } }), () => setAsg(null)); }}>
            <Field label="Project"><Select value={asg.projectId} onChange={(e) => setAsg({ ...asg, projectId: e.target.value, industryId: "" })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Industry"><Select required value={asg.industryId} onChange={(e) => setAsg({ ...asg, industryId: e.target.value })}><option value="">Select…</option>{inds(asg.projectId).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Daily h"><Input type="number" min="0" step="0.5" value={asg.dailyTargetHours} onChange={(e) => setAsg({ ...asg, dailyTargetHours: e.target.value })} /></Field>
              <Field label="Weekly h"><Input type="number" min="0" step="0.5" value={asg.weeklyTargetHours} onChange={(e) => setAsg({ ...asg, weeklyTargetHours: e.target.value })} /></Field>
              <Field label="Monthly h"><Input type="number" min="0" step="0.5" value={asg.monthlyTargetHours} onChange={(e) => setAsg({ ...asg, monthlyTargetHours: e.target.value })} /></Field>
            </div>
            <Field label="Contributor-specific hourly rate (₹, optional)" hint="Leave empty to use the industry or project rate."><Input type="number" min="0" step="0.01" value={asg.hourlyRate} onChange={(e) => setAsg({ ...asg, hourlyRate: e.target.value })} /></Field>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAsg(null)}>Cancel</Button><Button>Assign</Button></div>
          </form>
        )}
      </Modal>

      {/* transfer */}
      <Modal open={!!transfer} onClose={() => setTransfer(null)} title="Transfer to another industry">
        {transfer && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/assignments/${transfer.id}/transfer`, { method: "POST", json: { industryId: transfer.industryId } }), () => setTransfer(null)); }}>
            <p className="text-sm text-muted">Past hours, QC and payments stay with the old industry. Future entries go to the new one.</p>
            <Field label="New industry"><Select required value={transfer.industryId} onChange={(e) => setTransfer({ ...transfer, industryId: e.target.value })}><option value="">Select…</option>{industries.filter((i) => i.status === "ACTIVE").map((i) => <option key={i.id} value={i.id}>{projects.find((p) => p.id === i.projectId)?.name} · {i.name}</option>)}</Select></Field>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTransfer(null)}>Cancel</Button><Button>Transfer</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
