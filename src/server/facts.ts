import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, schema as s, type DB } from "@/db";
import { managerScope } from "./guard";
import { D, resolveRate, type RateRow } from "@/lib/calc";
import type { Fact } from "@/lib/aggregate";
import type { Role } from "@/lib/permissions";

export type FactFilter = { from?: string; to?: string; projectId?: string; industryId?: string; contributorId?: string };

/** One Fact per daily record, joined with QC and the rate that applied on that date. Single source for dashboard, reports, productivity. */
export async function loadFacts(u: { id: string; role: Role; contributorId?: string | null } | null, f: FactFilter, exec?: DB): Promise<Fact[]> {
  const db = exec ?? (await getDb());
  const rows = await db.select({
    recordId: s.dailyWorkRecords.id, date: s.dailyWorkRecords.workDate, assignmentId: s.dailyWorkRecords.assignmentId,
    projectId: s.projects.id, projectName: s.projects.name, industryId: s.industries.id, industryName: s.industries.name,
    contributorId: s.contributors.id, contributorName: s.contributors.fullName, contributorCode: s.contributors.code,
    target: s.dailyWorkRecords.targetHours, actual: s.dailyWorkRecords.actualHours, submitted: s.dailyWorkRecords.submittedHours,
    pct: s.acceptanceRecords.acceptancePct, accepted: s.acceptanceRecords.acceptedHours, rejected: s.acceptanceRecords.rejectedHours,
    qcStatus: s.acceptanceRecords.qcStatus, statementId: s.acceptanceRecords.statementId,
    appliedRate: s.acceptanceRecords.appliedRate, payableAmount: s.acceptanceRecords.payableAmount,
  }).from(s.dailyWorkRecords)
    .innerJoin(s.projects, eq(s.projects.id, s.dailyWorkRecords.projectId))
    .innerJoin(s.industries, eq(s.industries.id, s.dailyWorkRecords.industryId))
    .innerJoin(s.contributors, eq(s.contributors.id, s.dailyWorkRecords.contributorId))
    .leftJoin(s.acceptanceRecords, eq(s.acceptanceRecords.dailyRecordId, s.dailyWorkRecords.id))
    .where(and(
      f.from ? gte(s.dailyWorkRecords.workDate, f.from) : undefined, f.to ? lte(s.dailyWorkRecords.workDate, f.to) : undefined,
      f.projectId ? eq(s.dailyWorkRecords.projectId, f.projectId) : undefined, f.industryId ? eq(s.dailyWorkRecords.industryId, f.industryId) : undefined,
      f.contributorId ? eq(s.dailyWorkRecords.contributorId, f.contributorId) : undefined));

  const scope = u && u.role !== "CONTRIBUTOR" ? await managerScope(u) : null;
  const visible = rows.filter((r) => {
    if (u?.role === "CONTRIBUTOR") return r.contributorId === u.contributorId;
    return !scope || scope.industryIds.has(r.industryId) || scope.managedProjectIds.has(r.projectId);
  });
  const rates = (await db.select().from(s.paymentRates)) as unknown as RateRow[];

  return visible.map((r) => {
    const pct = r.pct ?? null;
    const sub = D(r.submitted);
    const acc = pct === null ? D(0) : D(r.accepted);
    let rate: string | null = null, amount = D(0);
    if (r.statementId && r.appliedRate) { rate = r.appliedRate; amount = D(r.payableAmount); }
    else {
      const hit = resolveRate(rates, { projectId: r.projectId, industryId: r.industryId, assignmentId: r.assignmentId }, r.date);
      if (hit) { rate = hit.rate.toString(); amount = acc.mul(hit.rate); }
    }
    return {
      recordId: r.recordId, date: r.date, assignmentId: r.assignmentId, projectId: r.projectId, projectName: r.projectName,
      industryId: r.industryId, industryName: r.industryName, contributorId: r.contributorId, contributorName: r.contributorName, contributorCode: r.contributorCode,
      target: r.target, actual: r.actual, submitted: r.submitted, pct, accepted: acc.toString(),
      rejected: pct === null ? "0" : D(r.rejected).toString(), pending: pct === null ? sub.toString() : "0",
      qcStatus: r.qcStatus ?? "PENDING", statementId: r.statementId ?? null, rate, amount: amount.toString(),
    };
  });
}
