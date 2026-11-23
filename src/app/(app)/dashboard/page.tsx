"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, PageHeader, Stat } from "@/components/ui";
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
const COLORS = ["#5b3df5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

function Chart({ title, children, h = 260 }: { title: string; children: React.ReactElement; h?: number }) {
  return <Card><h3 className="mb-3 text-sm font-semibold">{title}</h3><div style={{ height: h }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div></Card>;
}

export default function DashboardPage() {
  const { projects, industries } = useLookups();
  const [f, setF] = useState<FilterState>({ from: monthStart(), to: today(), projectId: "", industryId: "" });
  const { data, loading, error } = useApi<Dash>(`/api/dashboard?${toQuery({ ...f })}`);
  const c = data?.cards;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Every hour counts. Every contribution matters." />
      <FilterBar value={f} onChange={setF} projects={projects} industries={industries} />
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 ${loading ? "opacity-60" : ""}`}>
        <Stat label="Active projects" value={c?.activeProjects ?? "–"} />
        <Stat label="Industries" value={c?.industries ?? "–"} />
        <Stat label="Contributors" value={c?.contributors ?? "–"} />
        <Stat label="Target hours" value={c ? hrs(c.targetHours) : "–"} />
        <Stat label="Submitted hours" value={c ? hrs(c.submittedHours) : "–"} />
        <Stat label="Accepted hours" value={c ? hrs(c.acceptedHours) : "–"} tone="text-emerald-600" />
        <Stat label="Pending QC hours" value={c ? hrs(c.pendingHours) : "–"} tone="text-amber-600" />
        <Stat label="Net payable (after TDS)" value={c ? inr(c.payable) : "–"} /><Stat label="TDS deducted" value={c ? inr(c.tds) : "–"} tone="text-red-600" />
        <Stat label="Total paid" value={c ? inr(c.paid) : "–"} tone="text-violet" />
      </div>

      {data && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Chart title="Project-wise submitted vs accepted hours">
            <BarChart data={data.projectHours}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
              <Bar dataKey="submitted" fill="#c4b5fd" radius={[4, 4, 0, 0]} /><Bar dataKey="accepted" fill="#5b3df5" radius={[4, 4, 0, 0]} /></BarChart>
          </Chart>
          <Chart title="Industry-wise hour distribution">
            <PieChart><Pie data={data.industryHours} dataKey="hours" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>{data.industryHours.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </Chart>
          <Chart title="Industry-wise payment distribution (₹ net payable)">
            <BarChart data={data.industryPayments} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" fontSize={12} /><YAxis type="category" dataKey="name" fontSize={12} width={130} /><Tooltip formatter={(v) => inr(Number(v))} />
              <Bar dataKey="payable" radius={[0, 4, 4, 0]}>{data.industryPayments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart>
          </Chart>
          <Chart title="Daily submission trend">
            <LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" fontSize={11} tickFormatter={(d) => d.slice(5)} /><YAxis fontSize={12} /><Tooltip /><Legend />
              <Line type="monotone" dataKey="submitted" stroke="#c4b5fd" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="accepted" stroke="#5b3df5" strokeWidth={2} dot={false} /></LineChart>
          </Chart>
          <Chart title="Acceptance percentage trend">
            <LineChart data={data.daily.filter((d) => d.acceptancePct > 0)}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" fontSize={11} tickFormatter={(d) => d.slice(5)} /><YAxis fontSize={12} domain={[0, 100]} unit="%" /><Tooltip formatter={(v) => `${v}%`} />
              <Line type="monotone" dataKey="acceptancePct" stroke="#10b981" strokeWidth={2} dot={false} /></LineChart>
          </Chart>
          <Chart title="Contributor productivity ranking (accepted % of target)">
            <BarChart data={data.contributors} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" fontSize={12} unit="%" /><YAxis type="category" dataKey="name" fontSize={11} width={110} /><Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="productivity" fill="#5b3df5" radius={[0, 4, 4, 0]} /></BarChart>
          </Chart>
          <Chart title="Pending QC hours by industry">
            <BarChart data={data.pendingQc}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={12} /><Tooltip />
              <Bar dataKey="pending" fill="#f59e0b" radius={[4, 4, 0, 0]} /></BarChart>
          </Chart>
          <Chart title="Monthly payments made (₹)">
            <BarChart data={data.monthlyPayments}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" fontSize={12} /><YAxis fontSize={12} /><Tooltip formatter={(v) => inr(Number(v))} />
              <Bar dataKey="amount" fill="#0ea5e9" radius={[4, 4, 0, 0]} /></BarChart>
          </Chart>
        </div>
      )}
    </div>
  );
}
