"use client";
import { Badge, Card, DataTable, PageHeader, Progress, Stat } from "@/components/ui";
import { hrs, inr, monthStart, today, useApi } from "@/components/hooks";

type Rec = { id: string; date: string; project: string; industry: string; target: string; actual: string; submitted: string; pct: string | null; accepted: string; rate: string | null; amount: string; paymentStatus: string };
type Res = { money: { gross: string; tds: string; net: string; tdsPercent: string }; assignments: { id: string; project: string; industry: string; daily: string; weekly: string; monthly: string; status: string }[]; records: Rec[] };
const LABEL: Record<string, string> = { PENDING_QC: "Awaiting client review", NOT_BILLED: "Reviewed", PENDING_APPROVAL: "Pending approval", APPROVED: "Approved", PARTIALLY_PAID: "Partially paid", PAID: "Paid", VOID: "Reviewed" };
const TONE: Record<string, "amber" | "gray" | "blue" | "violet" | "green"> = { PENDING_QC: "amber", NOT_BILLED: "gray", PENDING_APPROVAL: "amber", APPROVED: "blue", PARTIALLY_PAID: "violet", PAID: "green", VOID: "gray" };

export default function MyWorkPage() {
  const { data, error } = useApi<Res>(`/api/my?from=${monthStart()}&to=${today()}`);
  const r = data?.records ?? [];
  const sum = (k: "target" | "submitted" | "accepted" | "amount") => r.reduce((t, x) => t + Number(x[k]), 0);
  const pending = r.filter((x) => x.pct === null).reduce((t, x) => t + Number(x.submitted), 0);
  const tgt = sum("target");
  return (
    <div>
      <PageHeader title="My work" subtitle="This month · only your own records are shown." />
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Submitted h" value={hrs(sum("submitted"))} /><Stat label="Accepted h" value={hrs(sum("accepted"))} tone="text-emerald-600" />
        <Stat label="Pending review h" value={hrs(pending)} tone="text-amber-600" /><Stat label="Earned (gross)" value={inr(data?.money.gross ?? 0)} />
        <Stat label={`TDS ${Number(data?.money.tdsPercent ?? 0)}%`} value={inr(data?.money.tds ?? 0)} tone="text-red-600" /><Stat label="Net payable" value={inr(data?.money.net ?? 0)} tone="text-violet" />
      </div>
      <Card className="mt-4"><p className="mb-2 text-sm font-medium">Target vs actual (month to date)</p>
        <div className="space-y-2"><div><p className="text-xs text-muted">Submitted ÷ target ({hrs(sum("submitted"))} / {hrs(tgt)} h)</p><Progress value={tgt ? (sum("submitted") / tgt) * 100 : 0} /></div>
          <div><p className="text-xs text-muted">Accepted ÷ target ({hrs(sum("accepted"))} / {hrs(tgt)} h)</p><Progress value={tgt ? (sum("accepted") / tgt) * 100 : 0} /></div></div></Card>
      <h2 className="mb-2 mt-6 font-semibold">Daily records</h2>
      <DataTable rows={r} pageSize={10} empty="No hours recorded yet" cols={[
        { key: "date", header: "Date", sortValue: (x) => x.date }, { key: "industry", header: "Industry" },
        { key: "target", header: "Target h", align: "right", render: (x) => hrs(x.target) }, { key: "actual", header: "Actual h", align: "right", render: (x) => hrs(x.actual) },
        { key: "submitted", header: "Submitted h", align: "right", render: (x) => hrs(x.submitted) },
        { key: "pct", header: "Accepted %", align: "right", render: (x) => (x.pct === null ? "—" : `${Number(x.pct).toFixed(1)}%`) },
        { key: "accepted", header: "Accepted h", align: "right", render: (x) => hrs(x.accepted) },
        { key: "amount", header: "Gross", align: "right", render: (x) => (x.pct === null ? "—" : inr(x.amount)) },
        { key: "status", header: "Status", render: (x) => <Badge tone={TONE[x.paymentStatus]}>{LABEL[x.paymentStatus]}</Badge> },
      ]} />
    </div>
  );
}
