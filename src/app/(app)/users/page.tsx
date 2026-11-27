"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useSession } from "next-auth/react";
import { Badge, Button, DataTable, Field, Input, Modal, PageHeader, Select, api } from "@/components/ui";
import { useApi } from "@/components/hooks";

type U = { id: string; name: string; email: string; role: "ADMIN" | "MANAGER" | "CONTRIBUTOR"; isActive: boolean; contributorId: string | null; lastLoginAt: string | null };
type C = { id: string; fullName: string; code: string };
const blank = { name: "", email: "", role: "MANAGER", password: "", contributorId: "" };

export default function UsersPage() {
  const { data, reload } = useApi<U[]>("/api/users");
  const cons = useApi<C[]>("/api/contributors");
  const [form, setForm] = useState<typeof blank | null>(null);
  const me = useSession().data?.user?.id;
  const [edit, setEdit] = useState<{ id: string; name: string; email: string; role: string; isActive: boolean; contributorId: string; password: string } | null>(null);
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const act = async (fn: () => Promise<unknown>, done?: () => void) => { setErr(""); try { await fn(); done?.(); reload(); } catch (e) { setErr((e as Error).message); } };

  return (
    <div>
      <PageHeader title="User Management" subtitle="Admins have full access. Managers see only the projects/industries assigned to them. Contributors see only their own data."
        actions={<Button onClick={() => { setErr(""); setForm({ ...blank }); }}><Plus size={16} />New user</Button>} />
      {err && !form && <p className="mb-3 rounded-lg bg-bad/10 p-2 text-sm text-bad">{err}</p>}
      <DataTable rows={data ?? []} searchText={(u) => `${u.name} ${u.email} ${u.role}`} cols={[
        { key: "name", header: "Name", sortValue: (u) => u.name, render: (u) => <div><p className="font-medium">{u.name}</p><p className="text-xs text-muted">{u.email}</p></div> },
        { key: "role", header: "Role", render: (u) => <Badge tone={u.role === "ADMIN" ? "violet" : u.role === "MANAGER" ? "blue" : "gray"}>{u.role.toLowerCase()}</Badge> },
        { key: "last", header: "Last login", render: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("en-IN") : "never") },
        { key: "status", header: "Status", render: (u) => <Badge tone={u.isActive ? "green" : "gray"}>{u.isActive ? "active" : "disabled"}</Badge> },
        { key: "actions", header: "", render: (u) => (
          <span className="flex flex-wrap justify-end gap-1">
            <Button variant="ghost" onClick={() => { setErr(""); setEdit({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, contributorId: u.contributorId ?? "", password: "" }); }}>Edit</Button>
            <Button variant="ghost" onClick={() => act(() => api(`/api/users/${u.id}`, { method: "PATCH", json: { isActive: !u.isActive } }))}>{u.isActive ? "Disable" : "Enable"}</Button>
            <Button variant="ghost" onClick={() => act(async () => { const r = await api<{ link: string }>(`/api/users/${u.id}/reset-link`, { method: "POST" }); setLink(r.link); })}>Reset link</Button>
            {u.id !== me && <Button variant="ghost" className="text-bad" onClick={() => { if (confirm(`Delete the login for ${u.name} (${u.email})? This cannot be undone.`)) act(() => api(`/api/users/${u.id}`, { method: "DELETE" })); }}>Delete</Button>}
          </span>) },
      ]} />
      <Modal open={!!form} onClose={() => setForm(null)} title="New user">
        {form && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(() => api("/api/users", { method: "POST", json: { ...form, password: form.password || undefined, contributorId: form.role === "CONTRIBUTOR" ? form.contributorId : undefined, isActive: true } }), () => setForm(null)); }}>
            <Field label="Full name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Role"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="ADMIN">Admin</option><option value="MANAGER">Manager</option><option value="CONTRIBUTOR">Contributor</option></Select></Field>
            {form.role === "CONTRIBUTOR" && <Field label="Linked contributor"><Select required value={form.contributorId} onChange={(e) => setForm({ ...form, contributorId: e.target.value })}><option value="">Select…</option>{(cons.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.code})</option>)}</Select></Field>}
            <Field label="Initial password" hint="Min 10 characters. Leave empty for Google-only sign-in or to send a reset link."><Input type="password" minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            {err && <p className="text-sm text-bad">{err}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button>Create user</Button></div>
          </form>)}
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit user">
        {edit && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(() => api(`/api/users/${edit.id}`, { method: "PATCH", json: { name: edit.name, email: edit.email, role: edit.role, isActive: edit.isActive, contributorId: edit.role === "CONTRIBUTOR" ? edit.contributorId || null : null, password: edit.password || undefined } }), () => setEdit(null)); }}>
            <Field label="Full name"><Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Email"><Input required type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Role" hint={edit.id === me ? "You cannot change your own role." : undefined}><Select disabled={edit.id === me} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="ADMIN">Admin</option><option value="MANAGER">Manager</option><option value="CONTRIBUTOR">Contributor</option></Select></Field>
            {edit.role === "CONTRIBUTOR" && <Field label="Linked contributor"><Select required value={edit.contributorId} onChange={(e) => setEdit({ ...edit, contributorId: e.target.value })}><option value="">Select…</option>{(cons.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.code})</option>)}</Select></Field>}
            <Field label="Status"><Select disabled={edit.id === me} value={edit.isActive ? "1" : "0"} onChange={(e) => setEdit({ ...edit, isActive: e.target.value === "1" })}><option value="1">Active</option><option value="0">Disabled</option></Select></Field>
            <Field label="New password" hint="Optional. Min 10 characters. Leave empty to keep the current password."><Input type="password" minLength={10} autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
            {err && <p className="text-sm text-bad">{err}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button>Save changes</Button></div>
          </form>)}
      </Modal>
      <Modal open={!!link} onClose={() => setLink("")} title="Password reset link">
        <p className="text-sm text-muted">Share this one-time link with the user. It expires in 1 hour.</p>
        <Input readOnly className="mt-3" value={link} onFocus={(e) => e.currentTarget.select()} />
      </Modal>
    </div>
  );
}
