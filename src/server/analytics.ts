import { and, eq, gte, lte, ne } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { aggregate, totals, type Fact } from "@/lib/aggregate";
import { loadFacts, type FactFilter } from "./facts";
import { industryOverview, listStatements } from "./payments";
import { D } from "@/lib/calc";
import { managerScope } from "./guard";
import type { Role } from "@/lib/permissions";

type U = { id: string; role: Role; contributorId?: string | null };
const n = (v: { toString(): string }) => Number(v.toString());
const r2 = (v: number) => Math.round(v * 100) / 100;

export async function dashboard(u: U, f: FactFilter) {
  const db = await getDb();
  const facts = await loadFacts(u, f);
  const t = totals(facts);
  const scope = await managerScope(u);
  const projects = (await db.select().from(s.projects).where(f.projectId ? eq(s.projects.id, f.projectId) : undefined)).filter((p) => !scope || scope.projectIds.has(p.id));
  const industries = (await db.select().from(s.industries).where(and(ne(s.industries.status, "ARCHIVED"), f.projectId ? eq(s.industries.projectId, f.projectId) : undefined, f.industryId ? eq(s.industries.id, f.industryId) : undefined)))
    .filter((i) => !scope || scope.industryIds.has(i.id) || scope.managedProjectIds.has(i.projectId));
  const cons = new Set((await db.select().from(s.projectContributors).where(eq(s.projectContributors.status, "ACTIVE"))).filter((a) => industries.some((i) => i.id === a.industryId)).map((a) => a.contributorId));
  const stmts = (await listStatements(u, { projectId: f.projectId, industryId: f.industryId })).filter((x) => x.status !== "VOID");
  const overview = (await industryOverview(u, { from: f.from, to: f.to, projectId: f.projectId })).filter((o) => !f.industryId || o.industryId === f.industryId);
  const payable = overview.reduce((x, o) => x.plus(o.payable), D(0));
  const paid = overview.reduce((x, o) => x.plus(o.paid), D(0));

  const byProject = aggregate(facts, (x) => ({ key: x.projectId, name: x.projectName })).map((a) => ({ name: a.name, submitted: r2(n(a.submitted)), accepted: r2(n(a.accepted)) }));
  const byIndustry = aggregate(facts, (x) => ({ key: x.industryId, name: x.industryName }));
  const daily = aggregate(facts, (x) => ({ key: x.date, name: x.date })).sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((a) => ({ date: a.key, submitted: r2(n(a.submitted)), accepted: r2(n(a.accepted)), acceptancePct: r2(n(a.acceptancePct)) }));
  const contributors = aggregate(facts, (x) => ({ key: x.contributorId, name: x.contributorName }))
    .map((a) => ({ name: a.name, submitted: r2(n(a.submitted)), accepted: r2(n(a.accepted)), productivity: r2(n(a.acceptedProductivity)) }))
    .sort((a, b) => b.productivity - a.productivity).slice(0, 10);
  const monthlyPay = new Map<string, number>();
  for (const x of stmts) for (const tx of (await db.select().from(s.paymentTransactions).where(eq(s.paymentTransactions.statementId, x.id)))) {
    const m = tx.paymentDate.slice(0, 7); monthlyPay.set(m, (monthlyPay.get(m) ?? 0) + Number(tx.amount));
  }
  return {
    cards: {
      activeProjects: projects.filter((p) => p.status === "ACTIVE" && !p.archivedAt).length, industries: industries.length, contributors: cons.size,
      targetHours: n(t.target), submittedHours: n(t.submitted), acceptedHours: n(t.accepted), pendingHours: n(t.pending),
      payable: n(payable.toDecimalPlaces(2)), paid: n(paid.toDecimalPlaces(2)),
    },
    projectHours: byProject,
    industryHours: byIndustry.map((a) => ({ name: a.name, hours: r2(n(a.submitted)) })),
    industryPayments: overview.map((o) => ({ name: o.industryName, payable: Number(o.payable) })),
    daily, contributors,
    pendingQc: byIndustry.map((a) => ({ name: a.name, pending: r2(n(a.pending)) })).filter((a) => a.pending > 0),
    monthlyPayments: [...monthlyPay.entries()].sort().map(([month, amount]) => ({ month, amount: r2(amount) })),
  };
}

export type Period = "day" | "week" | "month" | "custom";
export function periodRange(period: Period, anchor: string, from?: string, to?: string) {
  const d = new Date(anchor + "T00:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  if (period === "day") return { from: anchor, to: anchor };
  if (period === "week") { const dow = (d.getUTCDay() + 6) % 7; const a = new Date(d); a.setUTCDate(d.getUTCDate() - dow); const b = new Date(a); b.setUTCDate(a.getUTCDate() + 6); return { from: iso(a), to: iso(b) }; }
  if (period === "month") return { from: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), to: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) };
  return { from: from ?? anchor, to: to ?? anchor };
}

/** Per-contributor productivity vs the configured daily / weekly / monthly target. Pending QC hours never count as accepted. */
export async function productivity(u: U, o: { period: Period; date: string; from?: string; to?: string; projectId?: string; industryId?: string; contributorId?: string }) {
  const db = await getDb();
  const range = periodRange(o.period, o.date, o.from, o.to);
  const facts = await loadFacts(u, { ...range, projectId: o.projectId, industryId: o.industryId, contributorId: o.contributorId });
  const asg = await db.select().from(s.projectContributors).where(eq(s.projectContributors.status, "ACTIVE"));
  const scope = u.role === "CONTRIBUTOR" ? null : await managerScope(u);
  const keyOf = (x: { contributorId: string; industryId: string }) => `${x.contributorId}|${x.industryId}`;
  const rowsBy = aggregate(facts, (x) => ({ key: keyOf(x), name: x.contributorName }));
  const rows = rowsBy.map((a) => {
    const [cid, iid] = a.key.split("|");
    const sample = facts.find((f) => f.contributorId === cid && f.industryId === iid) as Fact;
    const as = asg.find((x) => x.contributorId === cid && x.industryId === iid);
    const target = o.period === "custom" ? n(a.target) : o.period === "day" ? Number(as?.dailyTargetHours ?? n(a.target)) : Number(o.period === "week" ? as?.weeklyTargetHours : as?.monthlyTargetHours ?? n(a.target));
    const sub = n(a.submitted), acc = n(a.accepted);
    return { id: a.key, contributorName: a.name, projectName: sample.projectName, industryId: iid, industryName: sample.industryName, projectId: sample.projectId,
      target, submitted: r2(sub), accepted: r2(acc), pending: r2(n(a.pending)), remaining: r2(Math.max(target - sub, 0)),
      submittedPct: target ? r2((sub / target) * 100) : 0, acceptedPct: target ? r2((acc / target) * 100) : 0 };
  }).filter((r) => !scope || scope.industryIds.has(r.industryId) || scope.managedProjectIds.has(r.projectId));
  const roll = (key: "industryName" | "projectName") => {
    const m = new Map<string, { name: string; target: number; submitted: number; accepted: number }>();
    for (const r of rows) { const e = m.get(r[key]) ?? { name: r[key], target: 0, submitted: 0, accepted: 0 }; e.target += r.target; e.submitted += r.submitted; e.accepted += r.accepted; m.set(r[key], e); }
    return [...m.values()].map((e) => ({ ...e, submittedPct: e.target ? r2((e.submitted / e.target) * 100) : 0, acceptedPct: e.target ? r2((e.accepted / e.target) * 100) : 0 }));
  };
  return { range, rows, industries: roll("industryName"), projects: roll("projectName") };
}

/* ---------- reports ---------- */
export type ReportKind = "contributor" | "industry" | "project";
export async function report(u: U, kind: ReportKind, f: FactFilter) {
  const facts = await loadFacts(u, f);
  const stmts = (await listStatements(u, { projectId: f.projectId, industryId: f.industryId })).filter((x) => x.status !== "VOID");
  const paidByIndustry = new Map<string, number>(), paidByProject = new Map<string, number>(), billedByIndustry = new Map<string, number>(), billedByProject = new Map<string, number>();
  for (const x of stmts) {
    paidByIndustry.set(x.industryId, (paidByIndustry.get(x.industryId) ?? 0) + Number(x.paidAmount));
    paidByProject.set(x.projectId, (paidByProject.get(x.projectId) ?? 0) + Number(x.paidAmount));
  }
  void billedByIndustry; void billedByProject;
  const pc = (v: { toString(): string }) => r2(n(v));
  if (kind === "contributor") {
    const key = (x: Fact) => ({ key: `${x.contributorId}|${x.industryId}`, name: x.contributorName });
    return aggregate(facts, key).map((a) => {
      const sample = facts.find((x) => key(x).key === a.key)!;
      const statuses = new Set(facts.filter((x) => key(x).key === a.key).map((x) => (x.statementId ? stmts.find((st) => st.id === x.statementId)?.status ?? "PENDING_APPROVAL" : x.pct === null ? "NOT_READY" : "PENDING_APPROVAL")));
      return { id: a.key, contributor: a.name, project: sample.projectName, industry: sample.industryName, target: pc(a.target), submitted: pc(a.submitted), accepted: pc(a.accepted), rejected: pc(a.rejected),
        acceptancePct: pc(a.acceptancePct), productivityPct: pc(a.submittedProductivity), rate: sample.rate ? Number(sample.rate) : 0, payable: n(a.amount), paymentStatus: [...statuses].join(" / ") };
    });
  }
  if (kind === "industry") {
    return aggregate(facts, (x) => ({ key: x.industryId, name: x.industryName })).map((a) => {
      const sample = facts.find((x) => x.industryId === a.key)!;
      const paid = paidByIndustry.get(a.key) ?? 0;
      return { id: a.key, industry: a.name, project: sample.projectName, contributors: a.contributors, target: pc(a.target), submitted: pc(a.submitted), accepted: pc(a.accepted), rejected: pc(a.rejected),
        acceptancePct: pc(a.acceptancePct), productivityPct: pc(a.submittedProductivity), payable: n(a.amount), paid: r2(paid), outstanding: r2(n(a.amount) - paid) };
    });
  }
  const industriesByProject = new Map<string, Set<string>>();
  for (const x of facts) (industriesByProject.get(x.projectId) ?? industriesByProject.set(x.projectId, new Set()).get(x.projectId)!).add(x.industryId);
  return aggregate(facts, (x) => ({ key: x.projectId, name: x.projectName })).map((a) => {
    const paid = paidByProject.get(a.key) ?? 0;
    return { id: a.key, project: a.name, industries: industriesByProject.get(a.key)?.size ?? 0, contributors: a.contributors, submitted: pc(a.submitted), accepted: pc(a.accepted), rejected: pc(a.rejected),
      acceptancePct: pc(a.acceptancePct), payable: n(a.amount), paid: r2(paid), remaining: r2(n(a.amount) - paid) };
  });
}
void gte; void lte;
