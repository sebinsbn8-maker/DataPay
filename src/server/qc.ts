import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { audit } from "./audit";
import { HttpError } from "./guard";
import { D, acceptedHours, rejectedHours, deriveQcStatus, validatePct, allocateIndustryAcceptance, type QcStatusValue } from "@/lib/calc";

type U = { id: string };
export type QcUpdate = { id: string; acceptancePct: number | null; qcStatus?: QcStatusValue; qcReference?: string | null };

export async function listQc(f: { from?: string; to?: string; projectId?: string; industryId?: string; contributorId?: string; status?: string }) {
  const db = await getDb();
  const rows = await db.select({
    id: s.acceptanceRecords.id, date: s.acceptanceRecords.submissionDate, projectId: s.projects.id, projectName: s.projects.name,
    industryId: s.industries.id, industryName: s.industries.name, contributorId: s.contributors.id, contributorName: s.contributors.fullName,
    submitted: s.acceptanceRecords.submittedHours, pct: s.acceptanceRecords.acceptancePct, accepted: s.acceptanceRecords.acceptedHours,
    rejected: s.acceptanceRecords.rejectedHours, qcStatus: s.acceptanceRecords.qcStatus, qcReference: s.acceptanceRecords.qcReference,
    source: s.acceptanceRecords.source, locked: s.acceptanceRecords.statementId, updatedAt: s.acceptanceRecords.updatedAt,
  }).from(s.acceptanceRecords)
    .innerJoin(s.projects, eq(s.projects.id, s.acceptanceRecords.projectId))
    .innerJoin(s.industries, eq(s.industries.id, s.acceptanceRecords.industryId))
    .innerJoin(s.contributors, eq(s.contributors.id, s.acceptanceRecords.contributorId))
    .where(and(
      f.from ? gte(s.acceptanceRecords.submissionDate, f.from) : undefined, f.to ? lte(s.acceptanceRecords.submissionDate, f.to) : undefined,
      f.projectId ? eq(s.acceptanceRecords.projectId, f.projectId) : undefined, f.industryId ? eq(s.acceptanceRecords.industryId, f.industryId) : undefined,
      f.contributorId ? eq(s.acceptanceRecords.contributorId, f.contributorId) : undefined,
      f.status ? eq(s.acceptanceRecords.qcStatus, f.status as QcStatusValue) : undefined))
    .orderBy(s.acceptanceRecords.submissionDate);
  return rows.map((r) => ({ ...r, locked: !!r.locked }));
}

/** Set / change the client acceptance % for one or many records (individual level). */
export async function setAcceptance(u: U, updates: QcUpdate[]) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const out = [];
    for (const up of updates) {
      const [rec] = await tx.select().from(s.acceptanceRecords).where(eq(s.acceptanceRecords.id, up.id)).for("update");
      if (!rec) throw new HttpError(404, "QC record not found");
      if (rec.statementId) throw new HttpError(409, "This record is locked in a payment statement. Void the statement before changing QC.");
      const pct = up.acceptancePct;
      if (pct !== null) validatePct(pct);
      const accepted = pct === null ? D(0) : acceptedHours(rec.submittedHours, pct);
      const rejected = pct === null ? D(0) : rejectedHours(rec.submittedHours, accepted);
      const status = up.qcStatus === "RESUBMITTED" ? "RESUBMITTED" : deriveQcStatus(pct);
      const [after] = await tx.update(s.acceptanceRecords).set({
        acceptancePct: pct === null ? null : String(pct), acceptedHours: accepted.toString(), rejectedHours: rejected.toString(),
        qcStatus: status, qcReference: up.qcReference ?? rec.qcReference, source: "INDIVIDUAL", allocationMethod: null, updatedBy: u.id, updatedAt: new Date(),
      }).where(eq(s.acceptanceRecords.id, up.id)).returning();
      await audit(tx as never, { userId: u.id, action: "QC_CHANGE", entity: "acceptance_record", entityId: rec.id,
        before: { pct: rec.acceptancePct, accepted: rec.acceptedHours, status: rec.qcStatus }, after: { pct: after.acceptancePct, accepted: after.acceptedHours, status: after.qcStatus }, note: up.qcReference ?? undefined });
      out.push(after);
    }
    return out;
  });
}

/**
 * Client gave ONE percentage for a whole industry. Accepted hours are allocated pro-rata to each
 * record's submitted hours (method PRO_RATA_BY_SUBMITTED). Records that already carry an individual
 * percentage are NOT overwritten unless `overwriteIndividual` is explicitly true.
 */
export async function allocateIndustry(u: U, i: { industryId: string; from: string; to: string; pct: number; reference?: string; overwriteIndividual?: boolean }) {
  validatePct(i.pct);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const recs = await tx.select().from(s.acceptanceRecords).where(and(
      eq(s.acceptanceRecords.industryId, i.industryId), gte(s.acceptanceRecords.submissionDate, i.from), lte(s.acceptanceRecords.submissionDate, i.to), isNull(s.acceptanceRecords.statementId)));
    const eligible = recs.filter((r) => D(r.submittedHours).gt(0) && (i.overwriteIndividual || r.acceptancePct === null || r.source === "INDUSTRY_ALLOCATION"));
    const skippedIndividual = recs.filter((r) => D(r.submittedHours).gt(0) && !eligible.includes(r)).length;
    if (!eligible.length) return { allocated: 0, skippedIndividual, totalAccepted: "0" };
    const alloc = allocateIndustryAcceptance(eligible.map((r) => ({ id: r.id, submitted: r.submittedHours })), i.pct);
    for (const a of alloc) {
      const rec = eligible.find((r) => r.id === a.id)!;
      await tx.update(s.acceptanceRecords).set({
        acceptancePct: a.pct.toDecimalPlaces(4).toString(), acceptedHours: a.accepted.toString(), rejectedHours: rejectedHours(a.submitted, a.accepted).toString(),
        qcStatus: deriveQcStatus(a.pct.toDecimalPlaces(4)), qcReference: i.reference ?? rec.qcReference, source: "INDUSTRY_ALLOCATION",
        allocationMethod: `PRO_RATA_BY_SUBMITTED @ ${i.pct}%`, updatedBy: u.id, updatedAt: new Date(),
      }).where(eq(s.acceptanceRecords.id, a.id));
    }
    const total = alloc.reduce((t, a) => t.plus(a.accepted), D(0));
    await audit(tx as never, { userId: u.id, action: "ALLOCATE", entity: "industry_qc", entityId: i.industryId,
      after: { from: i.from, to: i.to, pct: i.pct, method: "PRO_RATA_BY_SUBMITTED", records: alloc.length, skippedIndividual, totalAccepted: total.toString() }, note: i.reference });
    return { allocated: alloc.length, skippedIndividual, totalAccepted: total.toString() };
  });
}
void inArray;
