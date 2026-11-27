"use client";
import { useId, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Badge, Button, Card, DataTable, Field, Input, Modal, Select, Stat, Textarea, api, cx } from "@/components/ui";
import { toQuery, useApi } from "@/components/hooks";
import { Loader } from "@/components/Fx";

type Con = { id: string; code: string; fullName: string; email: string; phone: string | null; status: string; industries: string[]; today: number; month: number; total: number };
type Overview = {
  today: string; monthStart: string;
  totals: { contributors: number; activeContributors: number; today: number; month: number; all: number };
  contributors: Con[]; dailySummary: { date: string; hours: number }[]; monthlySummary: { month: string; hours: number }[];
};
type Log = { id: string; contributorId: string; contributorName: string; contributorCode: string; workDate: string; deviceName: string; hours: number; notes: string | null; dayTotal: number; monthTotal: number };
type Form = { contributorId: string; workDate: string; deviceName: string; hours: string; notes: string };

/** The user's own calendar date (the server may be in another time zone). */
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const h2 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const monthLabel = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const dayLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const CURSOR = { fill: "rgba(34,211,238,.07)" };

function MiniChart({ title, data, x, tick }: { title: string; data: { [k: string]: string | number }[]; x: string; tick: (v: string) => string }) {
  return (
    <Card className="lift">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-3.5 w-1 rounded-full bg-gradient-to-b from-cyan to-violet" />{title}</h3>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <defs><linearGradient id="gHl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" /><stop offset="100%" stopColor="#3b82f6" stopOpacity=".7" /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={x} fontSize={11} tickFormatter={tick} interval="preserveStartEnd" /><YAxis fontSize={11} width={34} />
            <Tooltip cursor={CURSOR} labelFormatter={(l) => tick(String(l))} formatter={(v) => [`${h2(Number(v))} h`, "Hours"]} />
            <Bar dataKey="hours" fill="url(#gHl)" radius={[5, 5, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function LogFields({ f, set, cons, devices, today }: { f: Form; set: (p: Partial<Form>) => void; cons: Con[]; devices: string[]; today: string }) {
  const listId = `dev-${useId().replace(/:/g, "")}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Contributor">
        <Select required value={f.contributorId} onChange={(e) => set({ contributorId: e.target.value })}>
          <option value="">Select a contributor…</option>
          {cons.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.code}){c.status !== "ACTIVE" ? " – inactive" : ""}</option>)}
        </Select>
      </Field>
      <Field label="Date"><Input required type="date" max={today} value={f.workDate} onChange={(e) => set({ workDate: e.target.value })} /></Field>
      <Field label="Device name" hint="e.g. Laptop-01, Samsung A54, Camera rig 2">
        <Input required maxLength={120} list={listId} placeholder="Device used" value={f.deviceName} onChange={(e) => set({ deviceName: e.target.value })} />
        <datalist id={listId}>{devices.map((d) => <option key={d} value={d} />)}</datalist>
      </Field>
      <Field label="Working hours"><Input required type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" placeholder="0" value={f.hours} onChange={(e) => set({ hours: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="Notes (optional)"><Textarea rows={2} maxLength={1000} placeholder="Anything worth remembering about this session" value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field></div>
    </div>
  );
}

export function HourLogModule() {
  const [today] = useState(localToday);
  const ov = useApi<Overview>(`/api/hour-logs/overview?today=${today}`);
  const [flt, setFlt] = useState({ contributorId: "", from: today.slice(0, 8) + "01", to: today });
  const logs = useApi<Log[]>(`/api/hour-logs?${toQuery(flt)}`);
  const [form, setForm] = useState<Form>({ contributorId: "", workDate: today, deviceName: "", hours: "", notes: "" });
  const [edit, setEdit] = useState<(Form & { id: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [err, setErr] = useState("");
  const entryRef = useRef<HTMLDivElement>(null);

  const cons = ov.data?.contributors ?? [];
  const sel = cons.find((c) => c.id === form.contributorId);
  const devicesFor = (id: string) => [...new Set((logs.data ?? []).filter((l) => l.contributorId === id).map((l) => l.deviceName))];
  const refresh = () => { ov.reload(); logs.reload(); };

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api("/api/hour-logs", { method: "POST", json: { ...form, hours: Number(form.hours), notes: form.notes || null, today } });
      setMsg({ ok: true, text: `Added ${h2(Number(form.hours))} h for ${sel?.fullName ?? "contributor"} on ${dayLabel(form.workDate)}.` });
      setForm((f) => ({ ...f, hours: "", notes: "" })); // keep contributor, date and device for quick repeat entry
      refresh();
    } catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
    setBusy(false);
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); if (!edit) return; setBusy(true); setErr("");
    try {
      await api(`/api/hour-logs/${edit.id}`, { method: "PATCH", json: { contributorId: edit.contributorId, workDate: edit.workDate, deviceName: edit.deviceName, hours: Number(edit.hours), notes: edit.notes || null, today } });
      setEdit(null); refresh();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  async function remove(l: Log) {
    if (!confirm(`Delete ${h2(l.hours)} h recorded for ${l.contributorName} on ${dayLabel(l.workDate)} (${l.deviceName})?`)) return;
    try { await api(`/api/hour-logs/${l.id}`, { method: "DELETE" }); refresh(); } catch (x) { alert((x as Error).message); }
  }
  const pick = (c: Con) => { setForm((f) => ({ ...f, contributorId: c.id })); setFlt((f) => ({ ...f, contributorId: c.id })); entryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const shownTotal = (logs.data ?? []).reduce((t, l) => t + l.hours, 0);
  const t = ov.data?.totals;

  return (
    <div className="space-y-6">
      {/* 1. overview */}
      <section aria-label="Overview" className="space-y-4">
        {ov.error && <p className="rounded-lg bg-bad/10 p-3 text-sm text-bad">{ov.error}</p>}
        {!ov.data && !ov.error && <Loader label="Loading overview" />}
        {ov.data && (
          <>
            <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Total contributors" value={t!.contributors} sub={`${t!.activeContributors} active`} />
              <Stat label="Hours today" value={h2(t!.today)} tone="text-cyan" sub={dayLabel(ov.data.today)} />
              <Stat label="Hours this month" value={h2(t!.month)} tone="text-violet" sub={monthLabel(ov.data.today.slice(0, 7))} />
              <Stat label="All-time hours" value={h2(t!.all)} />
            </div>
            <div className="stagger grid gap-4 lg:grid-cols-2">
              <MiniChart title="Daily summary · last 14 days" data={ov.data.dailySummary} x="date" tick={dayLabel} />
              <MiniChart title="Monthly summary · last 6 months" data={ov.data.monthlySummary} x="month" tick={monthLabel} />
            </div>
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-3.5 w-1 rounded-full bg-gradient-to-b from-cyan to-violet" />Individual contributor totals</h3>
                <span className="text-xs text-muted">Click a contributor to add hours or filter their records</span>
              </div>
              <DataTable rows={cons} pageSize={5} onRowClick={pick} searchText={(c) => `${c.fullName} ${c.code} ${c.email}`} empty="No contributors yet" cols={[
                { key: "n", header: "Contributor", sortValue: (c) => c.fullName, render: (c) => <div><p className="font-medium">{c.fullName}</p><p className="text-xs text-muted">{c.code}</p></div> },
                { key: "t", header: "Today", align: "right", sortValue: (c) => c.today, render: (c) => <span className={cx(c.today > 0 && "text-cyan")}>{h2(c.today)} h</span> },
                { key: "m", header: "This month", align: "right", sortValue: (c) => c.month, render: (c) => `${h2(c.month)} h` },
                { key: "a", header: "All time", align: "right", sortValue: (c) => c.total, render: (c) => `${h2(c.total)} h` },
              ]} />
            </Card>
          </>
        )}
      </section>

      {/* 2. entry */}
      <section ref={entryRef} aria-label="Add working hours" className="scroll-mt-24">
        <Card className="grad-border">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold"><Plus size={18} className="text-cyan" />Add daily working hours</h2>
          <p className="mb-4 text-sm text-muted">Record the hours a contributor worked on a device. A contributor can have several entries on the same day (for example, different devices).</p>
          <form onSubmit={add} className="space-y-4">
            <LogFields f={form} set={(p) => setForm((f) => ({ ...f, ...p }))} cons={cons} devices={devicesFor(form.contributorId)} today={today} />
            {sel && (
              <div className="fade-in flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-line bg-white/[0.03] px-4 py-3 text-sm">
                <span className="font-medium">{sel.fullName} <span className="text-muted">{sel.code}</span></span>
                <span className="text-muted">{sel.email}{sel.phone ? ` · ${sel.phone}` : ""}</span>
                <Badge tone={sel.status === "ACTIVE" ? "green" : "gray"}>{sel.status.toLowerCase()}</Badge>
                <span className="text-muted">{sel.industries.length ? sel.industries.join(", ") : "No industry assigned"}</span>
                <span className="ml-auto tabular-nums text-muted">Today <b className="text-ink">{h2(sel.today)} h</b> · Month <b className="text-ink">{h2(sel.month)} h</b></span>
              </div>)}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={cx("text-sm", msg?.ok === false ? "text-bad" : "text-good")} role="status">{msg?.text}</p>
              <Button disabled={busy}>{busy ? "Saving…" : "Save / Add hours"}</Button>
            </div>
          </form>
        </Card>
      </section>

      {/* 3. records */}
      <section aria-label="Daily records" className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">Daily records</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1"><Field label="Contributor"><Select value={flt.contributorId} onChange={(e) => setFlt({ ...flt, contributorId: e.target.value })}><option value="">All contributors</option>{cons.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.code})</option>)}</Select></Field></div>
          <Field label="From"><Input type="date" max={flt.to || today} value={flt.from} onChange={(e) => setFlt({ ...flt, from: e.target.value })} /></Field>
          <Field label="To"><Input type="date" max={today} min={flt.from} value={flt.to} onChange={(e) => setFlt({ ...flt, to: e.target.value })} /></Field>
          <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => setFlt({ contributorId: "", from: today.slice(0, 8) + "01", to: today })}>Reset filters</Button></div>
        </div>
        {logs.error && <p className="rounded-lg bg-bad/10 p-3 text-sm text-bad">{logs.error}</p>}
        <DataTable rows={logs.data ?? []} pageSize={12} empty="No hours recorded for these filters" searchText={(l) => `${l.contributorName} ${l.contributorCode} ${l.deviceName} ${l.notes ?? ""}`} cols={[
          { key: "c", header: "Contributor", sortValue: (l) => l.contributorName, render: (l) => <div><p className="font-medium">{l.contributorName}</p><p className="text-xs text-muted">{l.contributorCode}</p></div> },
          { key: "d", header: "Date", sortValue: (l) => l.workDate, render: (l) => l.workDate },
          { key: "dev", header: "Device", sortValue: (l) => l.deviceName, render: (l) => l.deviceName },
          { key: "h", header: "Hours", align: "right", sortValue: (l) => l.hours, render: (l) => <b>{h2(l.hours)} h</b> },
          { key: "dt", header: "Day total", align: "right", hideOnMobile: false, render: (l) => `${h2(l.dayTotal)} h` },
          { key: "mt", header: "Month total", align: "right", render: (l) => `${h2(l.monthTotal)} h` },
          { key: "n", header: "Notes", render: (l) => <span className="line-clamp-2 max-w-48 text-muted">{l.notes ?? "–"}</span> },
          { key: "a", header: "", render: (l) => (
            <span className="flex justify-end gap-1">
              <Button variant="ghost" aria-label="Edit record" data-tip="Edit" className="!px-2" onClick={() => { setErr(""); setEdit({ id: l.id, contributorId: l.contributorId, workDate: l.workDate, deviceName: l.deviceName, hours: String(l.hours), notes: l.notes ?? "" }); }}><Pencil size={15} /></Button>
              <Button variant="ghost" aria-label="Delete record" data-tip="Delete" className="!px-2 text-bad" onClick={() => remove(l)}><Trash2 size={15} /></Button>
            </span>) },
        ]} />
        <p className="text-right text-sm text-muted">Total for these filters: <b className="text-ink tabular-nums">{h2(shownTotal)} h</b> across {(logs.data ?? []).length} record{(logs.data ?? []).length === 1 ? "" : "s"}</p>
      </section>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit working hours">
        {edit && (
          <form onSubmit={saveEdit} className="space-y-4">
            <LogFields f={edit} set={(p) => setEdit({ ...edit, ...p })} cons={cons} devices={devicesFor(edit.contributorId)} today={today} />
            {err && <p className="text-sm text-bad">{err}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></div>
          </form>)}
      </Modal>
    </div>
  );
}
