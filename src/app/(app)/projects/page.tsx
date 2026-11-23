"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, Select, Textarea, api, deleteEntity } from "@/components/ui";
import { useApi, type Project } from "@/components/hooks";

type User = { id: string; name: string; role: string };
const empty = { name: "", clientName: "", description: "", startDate: "", endDate: "", status: "ACTIVE", managerId: "", notes: "" };

export default function ProjectsPage() {
  const isAdmin = useSession().data?.user?.role === "ADMIN";
  const { data, reload, error } = useApi<Project[]>("/api/projects");
  const users = useApi<User[]>(isAdmin ? "/api/users" : null);
  const [edit, setEdit] = useState<(typeof empty & { id?: string }) | null>(null);
  const [err, setErr] = useState("");

  async function save() {
    if (!edit) return;
    setErr("");
    try {
      const { id, ...body } = edit;
      await api(id ? `/api/projects/${id}` : "/api/projects", { method: id ? "PATCH" : "POST", json: body });
      setEdit(null); reload();
    } catch (e) { setErr((e as Error).message); }
  }
  async function removeProject(p: { id: string; name: string }) {
    if (await deleteEntity(`/api/projects/${p.id}`, `Delete project "${p.name}"? Its industries, contributor assignments and rates are removed too. This cannot be undone.`)) { setEdit(null); reload(); }
  }
  const remove = () => edit?.id && removeProject({ id: edit.id, name: edit.name });
  const tone = (s: string) => (s === "ACTIVE" ? "green" : s === "PAUSED" ? "amber" : "gray") as "green";

  return (
    <div>
      <PageHeader title="Projects" subtitle="Each project can contain multiple industries."
        actions={isAdmin && <Button onClick={() => { setErr(""); setEdit({ ...empty }); }}><Plus size={16} />New project</Button>} />
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <DataTable rows={data ?? []} searchText={(p) => `${p.name} ${p.code} ${p.clientName}`}
        onRowClick={isAdmin ? (p) => { setErr(""); setEdit({ ...empty, ...p, description: p.description ?? "", startDate: p.startDate ?? "", endDate: p.endDate ?? "", managerId: p.managerId ?? "", notes: p.notes ?? "" }); } : undefined}
        cols={[
          { key: "code", header: "ID", sortValue: (p) => p.code, hideOnMobile: true },
          { key: "name", header: "Project", sortValue: (p) => p.name, render: (p) => <span className="font-medium">{p.name}</span> },
          { key: "clientName", header: "Client", sortValue: (p) => p.clientName },
          { key: "dates", header: "Dates", render: (p) => `${p.startDate ?? "—"} → ${p.endDate ?? "—"}` },
          { key: "status", header: "Status", render: (p) => <Badge tone={tone(p.status)}>{p.status.toLowerCase()}</Badge> },
          ...(isAdmin ? [{ key: "del", header: "", render: (p: Project) => <button type="button" aria-label={`Delete ${p.name}`} title="Delete" className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); removeProject(p); }}><Trash2 size={16} /></button> }] : []),
        ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit project" : "New project"}>
        {edit && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Project name"><Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Client name"><Input required value={edit.clientName} onChange={(e) => setEdit({ ...edit, clientName: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><Input type="date" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /></Field>
              <Field label="End date"><Input type="date" value={edit.endDate} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="COMPLETED">Completed</option></Select></Field>
              <Field label="Project manager"><Select value={edit.managerId} onChange={(e) => setEdit({ ...edit, managerId: e.target.value })}><option value="">— none —</option>{(users.data ?? []).filter((u) => u.role !== "CONTRIBUTOR").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            </div>
            <Field label="Description"><Textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Notes"><Textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex items-center justify-between gap-2">
              {edit.id ? <Button type="button" variant="danger" onClick={remove}>Delete</Button> : <span />}
              <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button>Save project</Button></div>
            </div>
          </form>
        )}
      </Modal>
      <Card className="mt-6 text-sm text-muted">Project IDs are generated automatically. A project can be deleted only if it has no recorded hours, QC or payments; otherwise set it to Completed to retire it.</Card>
    </div>
  );
}
