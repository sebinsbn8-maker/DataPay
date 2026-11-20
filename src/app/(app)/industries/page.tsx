"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useSession } from "next-auth/react";
import { Badge, Button, DataTable, Field, Input, Modal, PageHeader, Select, Textarea, api } from "@/components/ui";
import { useApi, useLookups, type Industry } from "@/components/hooks";

type User = { id: string; name: string; role: string };
type Rate = { id: string; scope: string; projectId: string | null; industryId: string | null; hourlyRate: string; effectiveFrom: string };
const blank = { projectId: "", name: "", description: "", managerId: "", status: "ACTIVE" };

export default function IndustriesPage() {
  const isAdmin = useSession().data?.user?.role === "ADMIN";
  const { projects, industries, reload } = useLookups();
  const users = useApi<User[]>(isAdmin ? "/api/users" : null);
  const rates = useApi<Rate[]>(isAdmin ? "/api/rates" : null);
  const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null);
  const [rate, setRate] = useState<{ scope: "INDUSTRY" | "PROJECT"; industryId: string; projectId: string; hourlyRate: string; effectiveFrom: string } | null>(null);
  const [err, setErr] = useState("");
  const pname = (id: string) => projects.find((p) => p.id === id)?.name ?? "";
  const currentRate = (i: Industry) => {
    const t = new Date().toISOString().slice(0, 10);
    const hit = (rates.data ?? []).filter((r) => r.scope === "INDUSTRY" && r.industryId === i.id && r.effectiveFrom <= t).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
    return hit ? `₹${Number(hit.hourlyRate).toLocaleString("en-IN")}/h` : "—";
  };

  async function save() {
    if (!edit) return; setErr("");
    try { const { id, ...b } = edit; if (!b.projectId) b.projectId = projects[0]?.id ?? ""; await api(id ? `/api/industries/${id}` : "/api/industries", { method: id ? "PATCH" : "POST", json: b }); setEdit(null); reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function remove() {
    if (!edit?.id || !confirm(`Delete industry "${edit.name}"? This also removes its contributor assignments and rates. This cannot be undone.`)) return;
    setErr("");
    try { await api(`/api/industries/${edit.id}`, { method: "DELETE" }); setEdit(null); reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function saveRate() {
    if (!rate) return; setErr("");
    try {
      await api("/api/rates", { method: "POST", json: { scope: rate.scope, industryId: rate.scope === "INDUSTRY" ? rate.industryId : undefined, projectId: rate.scope === "PROJECT" ? rate.projectId : undefined, hourlyRate: Number(rate.hourlyRate), effectiveFrom: rate.effectiveFrom } });
      setRate(null); rates.reload();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div>
      <PageHeader title="Industries" subtitle="Industries belong to a project. Contributors are assigned to industries."
        actions={isAdmin && <><Button variant="outline" onClick={() => { setErr(""); setRate({ scope: "INDUSTRY", industryId: industries[0]?.id ?? "", projectId: projects[0]?.id ?? "", hourlyRate: "", effectiveFrom: new Date().toISOString().slice(0, 10) }); }}>Set hourly rate</Button>
          <Button onClick={() => { setErr(""); setEdit({ ...blank, projectId: projects[0]?.id ?? "" }); }}><Plus size={16} />New industry</Button></>} />
      <DataTable rows={industries} searchText={(i) => `${i.name} ${pname(i.projectId)}`}
        onRowClick={isAdmin ? (i) => { setErr(""); setEdit({ ...blank, ...i, description: i.description ?? "", managerId: i.managerId ?? "" }); } : undefined}
        cols={[
          { key: "name", header: "Industry", sortValue: (i) => i.name, render: (i) => <span className="font-medium">{i.name}</span> },
          { key: "project", header: "Project", sortValue: (i) => pname(i.projectId), render: (i) => pname(i.projectId) },
          ...(isAdmin ? [{ key: "rate", header: "Current rate", render: (i: Industry) => currentRate(i) }] : []),
          { key: "status", header: "Status", render: (i) => <Badge tone={i.status === "ACTIVE" ? "green" : "gray"}>{i.status.toLowerCase()}</Badge> },
        ]} />

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit industry" : "New industry"}>
        {edit && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Project"><Select required disabled={!!edit.id} value={edit.projectId || projects[0]?.id || ""} onChange={(e) => setEdit({ ...edit, projectId: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Industry name"><Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Manager"><Select value={edit.managerId} onChange={(e) => setEdit({ ...edit, managerId: e.target.value })}><option value="">— none —</option>{(users.data ?? []).filter((u) => u.role === "MANAGER").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            <Field label="Status"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></Select></Field>
            <Field label="Description"><Textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex items-center justify-between gap-2">
              {edit.id ? <Button type="button" variant="danger" onClick={remove}>Delete</Button> : <span />}
              <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button>Save</Button></div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!rate} onClose={() => setRate(null)} title="Set hourly rate">
        {rate && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveRate(); }}>
            <p className="text-sm text-muted">Rates take effect from the date you choose. Earlier dates and already-approved statements are never changed. Priority: contributor rate → industry rate → project rate.</p>
            <Field label="Applies to"><Select value={rate.scope} onChange={(e) => setRate({ ...rate, scope: e.target.value as "INDUSTRY" })}><option value="INDUSTRY">An industry</option><option value="PROJECT">Whole project (default)</option></Select></Field>
            {rate.scope === "INDUSTRY"
              ? <Field label="Industry"><Select value={rate.industryId} onChange={(e) => setRate({ ...rate, industryId: e.target.value })}>{industries.map((i) => <option key={i.id} value={i.id}>{pname(i.projectId)} · {i.name}</option>)}</Select></Field>
              : <Field label="Project"><Select value={rate.projectId} onChange={(e) => setRate({ ...rate, projectId: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hourly rate (₹)"><Input required type="number" min="0.01" step="0.01" value={rate.hourlyRate} onChange={(e) => setRate({ ...rate, hourlyRate: e.target.value })} /></Field>
              <Field label="Effective from"><Input required type="date" value={rate.effectiveFrom} onChange={(e) => setRate({ ...rate, effectiveFrom: e.target.value })} /></Field>
            </div>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRate(null)}>Cancel</Button><Button>Save rate</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
