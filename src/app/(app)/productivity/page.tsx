"use client";
import { useState } from "react";
import { Card, DataTable, PageHeader, Progress, Field, Input, cx } from "@/components/ui";
import { FilterBar, hrs, today, toQuery, useApi, useLookups, type FilterState } from "@/components/hooks";

type Row = { id: string; contributorName: string; projectName: string; industryName: string; target: number; submitted: number; accepted: number; pending: number; remaining: number; submittedPct: number; acceptedPct: number };
type Roll = { name: string; target: number; submitted: number; accepted: number; submittedPct: number; acceptedPct: number };
type Res = { range: { from: string; to: string }; rows: Row[]; industries: Roll[]; projects: Roll[] };
const PERIODS = [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"], ["custom", "Custom"]] as const;

export default function ProductivityPage() {
  const { projects, industries } = useLookups();
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("day");
  const [date, setDate] = useState(today());
  const [f, setF] = useState<FilterState>({ from: today().slice(0, 8) + "01", to: today(), projectId: "", industryId: "" });
  const { data, loading } = useApi<Res>(`/api/productivity?${toQuery({ period, date, from: period === "custom" ? f.from : "", to: period === "custom" ? f.to : "", projectId: f.projectId, industryId: f.industryId })}`);

  const rollCols = (title: string) => [
    { key: "name", header: title, render: (r: Roll & { id: string }) => <span className="font-medium">{r.name}</span> },
    { key: "target", header: "Target h", align: "right" as const, render: (r: Roll) => hrs(r.target) },
    { key: "submitted", header: "Submitted h", align: "right" as const, render: (r: Roll) => hrs(r.submitted) },
    { key: "accepted", header: "Accepted h", align: "right" as const, render: (r: Roll) => hrs(r.accepted) },
    { key: "sp", header: "Submitted %", render: (r: Roll) => <Progress value={r.submittedPct} /> },
    { key: "ap", header: "Accepted %", render: (r: Roll) => <Progress value={r.acceptedPct} /> },
  ];

  return (
    <div>
      <PageHeader title="Productivity" subtitle="Submitted productivity = Submitted ÷ Target. Accepted productivity = Accepted ÷ Target. Hours pending client review never count as accepted." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg border border-line bg-white p-1" role="tablist">
          {PERIODS.map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)} className={cx("h-9 rounded-md px-4 text-sm font-medium", period === k ? "bg-violet text-white" : "text-muted hover:bg-slate-50")}>{l}</button>)}
        </div>
        {period !== "custom" && <div className="w-44"><Field label="Reference date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>}
        {data && <p className="pb-2 text-sm text-muted">{data.range.from} → {data.range.to}</p>}
      </div>
      <FilterBar value={f} onChange={setF} projects={projects} industries={industries} showDates={period === "custom"} />

      <div className={cx("space-y-6", loading && "opacity-60")}>
        <section>
          <h2 className="mb-2 font-semibold">By contributor</h2>
          <DataTable rows={data?.rows ?? []} searchText={(r) => `${r.contributorName} ${r.industryName}`} empty="No work recorded for this period"
            cols={[
              { key: "contributorName", header: "Contributor", sortValue: (r) => r.contributorName, render: (r) => <div><p className="font-medium">{r.contributorName}</p><p className="text-xs text-muted">{r.industryName}</p></div> },
              { key: "target", header: "Target h", align: "right", sortValue: (r) => r.target, render: (r) => hrs(r.target) },
              { key: "submitted", header: "Submitted h", align: "right", sortValue: (r) => r.submitted, render: (r) => hrs(r.submitted) },
              { key: "accepted", header: "Accepted h", align: "right", sortValue: (r) => r.accepted, render: (r) => hrs(r.accepted) },
              { key: "pending", header: "Pending QC h", align: "right", render: (r) => hrs(r.pending) },
              { key: "remaining", header: "Remaining h", align: "right", render: (r) => hrs(r.remaining) },
              { key: "sp", header: "Submitted %", sortValue: (r) => r.submittedPct, render: (r) => <Progress value={r.submittedPct} /> },
              { key: "ap", header: "Accepted %", sortValue: (r) => r.acceptedPct, render: (r) => <Progress value={r.acceptedPct} /> },
            ]} />
        </section>
        <section><h2 className="mb-2 font-semibold">By industry</h2><DataTable rows={(data?.industries ?? []).map((r) => ({ ...r, id: r.name }))} cols={rollCols("Industry")} /></section>
        <section><h2 className="mb-2 font-semibold">By project</h2><DataTable rows={(data?.projects ?? []).map((r) => ({ ...r, id: r.name }))} cols={rollCols("Project")} /></section>
        <Card className="text-sm text-muted">Targets come from each contributor&apos;s assignment (daily / weekly / monthly). For a custom range, the target is the sum of the daily targets on the days worked.</Card>
      </div>
    </div>
  );
}
