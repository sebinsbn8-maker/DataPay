"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Card, DataTable, PageHeader, cx, type Col } from "@/components/ui";
import { FilterBar, hrs, inr, monthStart, today, toQuery, useApi, useLookups, type FilterState } from "@/components/hooks";

type Kind = "contributor" | "industry" | "project";
type R = Record<string, string | number> & { id: string };
const h = (k: string, header: string, money = false): Col<R> => ({ key: k, header, align: "right", sortValue: (r) => Number(r[k]), render: (r) => (money ? inr(r[k]) : k.endsWith("Pct") ? `${Number(r[k]).toFixed(1)}%` : hrs(r[k])) });
const text = (k: string, header: string): Col<R> => ({ key: k, header, sortValue: (r) => String(r[k]), render: (r) => String(r[k] ?? "—") });
const COLS: Record<Kind, Col<R>[]> = {
  contributor: [text("contributor", "Contributor"), text("industry", "Industry"), h("target", "Target h"), h("submitted", "Submitted h"), h("accepted", "Accepted h"), h("rejected", "Rejected h"), h("acceptancePct", "Acceptance"), h("productivityPct", "Productivity"), h("rate", "Rate", true), h("gross", "Gross", true), h("tds", "TDS", true), h("payable", "Net payable", true), text("paymentStatus", "Status")],
  industry: [text("industry", "Industry"), text("project", "Project"), h("contributors", "Contrib."), h("target", "Target h"), h("submitted", "Submitted h"), h("accepted", "Accepted h"), h("rejected", "Rejected h"), h("acceptancePct", "Acceptance"), h("productivityPct", "Productivity"), h("gross", "Gross", true), h("tds", "TDS", true), h("payable", "Net payable", true), h("paid", "Paid", true), h("outstanding", "Outstanding", true)],
  project: [text("project", "Project"), h("industries", "Industries"), h("contributors", "Contrib."), h("submitted", "Submitted h"), h("accepted", "Accepted h"), h("rejected", "Rejected h"), h("acceptancePct", "Acceptance"), h("gross", "Gross", true), h("tds", "TDS", true), h("payable", "Net payment", true), h("paid", "Paid", true), h("remaining", "Remaining", true)],
};

export default function ReportsPage() {
  const { projects, industries } = useLookups();
  const [kind, setKind] = useState<Kind>("industry");
  const [f, setF] = useState<FilterState>({ from: monthStart(), to: today(), projectId: "", industryId: "" });
  const q = toQuery({ kind, ...f });
  const { data, loading, error } = useApi<R[]>(`/api/reports?${q}`);
  const rows = (data ?? []).map((r, i) => ({ ...r, id: String(r.id ?? i) }));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate contributor, industry and project reports for any period, then export."
        actions={(["xlsx", "csv", "pdf"] as const).map((fmt) => <a key={fmt} href={`/api/reports/export?${q}&format=${fmt}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:bg-slate-50 sm:h-10"><Download size={15} />{fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}</a>)} />
      <div className="mb-4 inline-flex rounded-lg border border-line bg-white p-1" role="tablist">
        {(["contributor", "industry", "project"] as Kind[]).map((k) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={cx("h-9 rounded-md px-4 text-sm font-medium capitalize", kind === k ? "bg-violet text-white" : "text-muted hover:bg-slate-50")}>{k}</button>)}
      </div>
      <FilterBar value={f} onChange={setF} projects={projects} industries={industries} />
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <div className={cx(loading && "opacity-60")}><DataTable rows={rows} cols={COLS[kind]} searchText={(r) => Object.values(r).join(" ")} pageSize={15} empty="No data for the selected filters" /></div>
      <Card className="mt-4 text-sm text-muted">Acceptance % = accepted ÷ client-reviewed submitted hours. Productivity % = submitted ÷ target hours. Gross uses the rate in force on each work date; TDS is withheld per contributor; Net payable = gross − TDS. Billed hours keep their approved amount.</Card>
    </div>
  );
}
