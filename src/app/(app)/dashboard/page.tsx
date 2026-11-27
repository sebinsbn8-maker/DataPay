"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, PageHeader, Stat } from "@/components/ui";
import { Loader } from "@/components/Fx";
import { FilterBar, type FilterState, hrs, inr, monthStart, today, toQuery, useApi, useLookups } from "@/components/hooks";

type Dash = {
  cards: Record<string, number>;
  projectHours: { name: string; submitted: number; accepted: number }[];
  industryHours: { name: string; hours: number }[];
  industryPayments: { name: string; payable: number }[];
  daily: { date: string; submitted: number; accepted: number; acceptancePct: number }[];
  contributors: { name: string; submitted: number; accepted: number; productivity: number }[];
  pendingQc: { name: string; pending: number }[];
  monthlyPayments: { month: string; amount: number }[];
};
const COLORS = ["#22d3ee", "#8b6cff", "#3b82f6", "#34d399", "#fbbf24", "#fb7185", "#2dd4bf"];
const CURSOR = { fill: "rgba(34,211,238,.07)" };
/** Shared gradient fills for the charts. */
const Defs = () => (
  <defs>
    <linearGradient id="gCyan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" /><stop offset="100%" stopColor="#3b82f6" stopOpacity=".75" /></linearGradient>
    <linearGradient id="gViolet" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity=".95" /><stop offset="100%" stopColor="#6d4df2" stopOpacity=".55" /></linearGradient>
    <linearGradient id="gAmber" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f97316" stopOpacity=".6" /></linearGradient>
    <linearGradient id="gCyanH" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#3b82f6" stopOpacity=".7" /><stop offset="100%" stopColor="#22d3ee" /></linearGradient>
  </defs>
);

function Chart({ title, children, h = 260 }: { title: string; children: React.ReactElement; h?: number }) {
  return <Card className="lift"><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-3.5 w-1 rounded-full bg-gradient-to-b from-cyan to-violet" />{title}</h3><div style={{ height: h }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div></Card>;
}

export default function DashboardPage() {
  const { projects, industries } = useLookups();
  const [f, setF] = useState<FilterState>({ from: monthStart(), to: today(), projectId: "", industryId: "" });
  const { data, loading, error } = useApi<Dash>(`/api/dashboard?${toQuery({ ...f })}`);
  const c = data?.cards;

  return (
    <div>
      <PageHeader title="Operations Control Center" subtitle="Every hour counts. Every contribution matters."
        actions={<span className="glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-xs font-medium text-muted"><span className="pulse-dot" aria-hidden />Live · {loading ? "syncing" : "up to date"}</span>} />
      <FilterBar value={f} onChange={setF} projects={projects} industries={industries} />
      {error && <p className="mb-4 rounded-lg bg-bad/10 p-3 text-sm text-bad">{error}</p>}
      {loading && !data && <Loader label="Syncing data" />}
      <div className={`stagger grid grid-cols-2 gap-3 transition-opacity md:grid-cols-3 xl:grid-cols-5 ${loading ? "opacity-60" : ""}`}>
        <Stat label="Active projects" value={c?.activeProjects ?? "–"} />
        <Stat label="Industries" value={c?.industries ?? "–"} />
        <Stat label="Contributors" value={c?.contributors ?? "–"} />
        <Stat label="Target hours" value={c ? hrs(c.targetHours) : "–"} />
        <Stat label="Submitted hours" value={c ? hrs(c.submittedHours) : "–"} />
        <Stat label="Accepted hours" value={c ? hrs(c.acceptedHours) : "–"} tone="text-good" />
        <Stat label="Pending QC hours" value={c ? hrs(c.pendingHours) : "–"} tone="text-warn" />
        <Stat label="Net payable (after TDS)" value={c ? inr(c.payable) : "–"} /><Stat label="TDS deducted" value={c ? inr(c.tds) : "–"} tone="text-bad" />
        <Stat label="Total paid" value={c ? inr(c.paid) : "–"} tone="text-violet" />
      </div>

      {data && (
        <div className="stagger mt-5 grid gap-4 lg:grid-cols-2">
          <StatusPanel c={data.cards} /><ActivityFeed daily={data.daily} />
          <Chart title="Project-wise submitted vs accepted hours">
            <BarChart data={data.projectHours}><Defs /><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} /><Tooltip cursor={CURSOR} /><Legend />
              <Bar dataKey="submitted" fill="url(#gViolet)" radius={[6, 6, 0, 0]} /><Bar dataKey="accepted" fill="url(#gCyan)" radius={[6, 6, 0, 0]} /></BarChart>
          </Chart>
          <Chart title="Industry-wise hour distribution">
            <PieChart><Pie data={data.industryHours} dataKey="hours" nameKey="name" innerRadius={58} outerRadius={96} paddingAngle={3} stroke="rgba(6,10,28,.9)" strokeWidth={2}>{data.industryHours.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </Chart>
          <Chart title="Industry-wise payment distribution (₹ net payable)">
            <BarChart data={data.industryPayments} layout="vertical" margin={{ left: 40 }}><Defs /><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" fontSize={12} /><YAxis type="category" dataKey="name" fontSize={12} width={130} /><Tooltip cursor={CURSOR} formatter={(v) => inr(Number(v))} />
              <Bar dataKey="payable" radius={[0, 6, 6, 0]}>{data.industryPayments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart>
          </Chart>
          <Chart title="Daily submission trend">
            <LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" fontSize={11} tickFormatter={(d) => d.slice(5)} /><YAxis fontSize={12} /><Tooltip /><Legend />
              <Line type="monotone" dataKey="submitted" stroke="#a78bfa" strokeWidth={2} dot={false} animationDuration={900} /><Line type="monotone" dataKey="accepted" stroke="#22d3ee" strokeWidth={2.5} dot={false} animationDuration={900} /></LineChart>
          </Chart>
          <Chart title="Acceptance percentage trend">
            <LineChart data={data.daily.filter((d) => d.acceptancePct > 0)}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" fontSize={11} tickFormatter={(d) => d.slice(5)} /><YAxis fontSize={12} domain={[0, 100]} unit="%" /><Tooltip formatter={(v) => `${v}%`} />
              <Line type="monotone" dataKey="acceptancePct" stroke="#34d399" strokeWidth={2.5} dot={false} animationDuration={900} /></LineChart>
          </Chart>
          <Chart title="Contributor productivity ranking (accepted % of target)">
            <BarChart data={data.contributors} layout="vertical" margin={{ left: 40 }}><Defs /><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" fontSize={12} unit="%" /><YAxis type="category" dataKey="name" fontSize={11} width={110} /><Tooltip cursor={CURSOR} formatter={(v) => `${v}%`} />
              <Bar dataKey="productivity" fill="url(#gCyanH)" radius={[0, 6, 6, 0]} /></BarChart>
          </Chart>
          <Chart title="Pending QC hours by industry">
            <BarChart data={data.pendingQc}><Defs /><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={12} /><Tooltip cursor={CURSOR} />
              <Bar dataKey="pending" fill="url(#gAmber)" radius={[6, 6, 0, 0]} /></BarChart>
          </Chart>
          <Chart title="Monthly payments made (₹)">
            <BarChart data={data.monthlyPayments}><Defs /><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" fontSize={12} /><YAxis fontSize={12} /><Tooltip cursor={CURSOR} formatter={(v) => inr(Number(v))} />
              <Bar dataKey="amount" fill="url(#gCyan)" radius={[6, 6, 0, 0]} /></BarChart>
          </Chart>
        </div>
      )}
    </div>
  );
}

/** Operational status indicators derived from the figures already on the dashboard. */
function StatusPanel({ c }: { c: Dash["cards"] }) {
  const outstanding = Math.max(0, c.payable - c.paid);
  const rows: { label: string; value: string; tone: "good" | "warn" | "bad" }[] = [
    { label: "Client QC backlog", value: c.pendingHours > 0 ? `${hrs(c.pendingHours)} h awaiting review` : "Clear", tone: c.pendingHours > 0 ? "warn" : "good" },
    { label: "Payments outstanding", value: outstanding > 0 ? inr(outstanding) : "All settled", tone: outstanding > 0 ? "warn" : "good" },
    { label: "Accepted vs submitted", value: c.submittedHours > 0 ? `${((c.acceptedHours / c.submittedHours) * 100).toFixed(1)}%` : "–", tone: c.submittedHours > 0 && c.acceptedHours / c.submittedHours < 0.5 ? "bad" : "good" },
    { label: "Target coverage", value: c.targetHours > 0 ? `${((c.submittedHours / c.targetHours) * 100).toFixed(1)}%` : "–", tone: c.targetHours > 0 && c.submittedHours / c.targetHours < 0.5 ? "warn" : "good" },
  ];
  const dot = { good: "bg-good shadow-[0_0_10px_var(--good)]", warn: "bg-warn shadow-[0_0_10px_var(--warn)]", bad: "bg-bad shadow-[0_0_10px_var(--bad)]" };
  return (
    <Card className="lift">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-3.5 w-1 rounded-full bg-gradient-to-b from-cyan to-violet" />System status</h3>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="flex items-center gap-3"><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot[r.tone]}`} />{r.label}</span>
            <span className="tabular-nums text-muted">{r.value}</span>
          </li>))}
      </ul>
    </Card>
  );
}

function ActivityFeed({ daily }: { daily: Dash["daily"] }) {
  const recent = [...daily].filter((d) => d.submitted > 0).slice(-6).reverse();
  return (
    <Card className="lift">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-3.5 w-1 rounded-full bg-gradient-to-b from-cyan to-violet" />Recent activity</h3>
      {recent.length === 0 ? <p className="py-6 text-center text-sm text-muted">No hours recorded in this period.</p> : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {recent.map((d) => (
            <li key={d.date} className="relative text-sm">
              <span aria-hidden className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-cyan shadow-[0_0_8px_rgba(34,211,238,.9)]" />
              <p className="font-medium">{new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</p>
              <p className="text-muted">{hrs(d.submitted)} h submitted · {hrs(d.accepted)} h accepted{d.acceptancePct > 0 ? ` · ${d.acceptancePct}% acceptance` : ""}</p>
            </li>))}
        </ol>)}
    </Card>
  );
}
