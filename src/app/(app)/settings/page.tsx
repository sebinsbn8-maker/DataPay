"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Badge, Button, Card, DataTable, Field, Input, PageHeader, api } from "@/components/ui";
import { useApi } from "@/components/hooks";

type Log = { id: string; at: string; action: string; entity: string; user: string | null; note: string | null; before: unknown; after: unknown };

export default function SettingsPage() {
  const { data: session } = useSession();
  const logs = useApi<Log[]>("/api/audit?limit=200");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Your account and the financial audit trail." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Account</h2>
          <p className="text-sm">{session?.user?.name} · {session?.user?.email}</p>
          <p className="mt-1 text-sm text-muted">Role: {session?.user?.role}</p>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Change password</h2>
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setMsg(null); try { await api("/api/me/password", { method: "POST", json: pw }); setMsg({ ok: true, text: "Password updated." }); setPw({ current: "", next: "" }); } catch (err) { setMsg({ ok: false, text: (err as Error).message }); } }}>
            <Field label="Current password"><Input type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password" hint="At least 10 characters"><Input type="password" required minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            {msg && <p className={msg.ok ? "text-sm text-good" : "text-sm text-bad"}>{msg.text}</p>}
            <Button>Update password</Button>
          </form>
        </Card>
      </div>
      <section>
        <h2 className="mb-2 font-semibold">Audit log</h2>
        <p className="mb-3 text-sm text-muted">Every acceptance change, rate change, adjustment, approval and payment is recorded here with who did it and the before/after values.</p>
        <DataTable rows={logs.data ?? []} searchText={(l) => `${l.action} ${l.entity} ${l.user} ${l.note}`} pageSize={12} cols={[
          { key: "at", header: "When", sortValue: (l) => l.at, render: (l) => new Date(l.at).toLocaleString("en-IN") },
          { key: "user", header: "Who", render: (l) => l.user ?? "system" },
          { key: "action", header: "Action", render: (l) => <Badge tone={["APPROVE", "PAYMENT", "ADJUST", "RATE_CHANGE", "QC_CHANGE"].includes(l.action) ? "violet" : "gray"}>{l.action}</Badge> },
          { key: "entity", header: "Entity" },
          { key: "detail", header: "Detail", render: (l) => <span className="line-clamp-2 max-w-md break-words text-xs text-muted">{l.note ?? JSON.stringify(l.after)}</span> },
        ]} />
      </section>
    </div>
  );
}
