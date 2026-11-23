import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { audit } from "./audit";
import { HttpError, assertIndustryAccess, managerScope } from "./guard";
import { D, acceptedHours, rejectedHours, deriveQcStatus } from "@/lib/calc";
import type { Role } from "@/lib/permissions";

/** Upper sanity limit per contributor per day. Contributors can be teams/units, so this is well above 24. */
export const MAX_DAILY_HOURS = 1000;

type U = { id: string; role: Role };

export type SessionInput = { startTime?: string | null; endTime?: string | null; hours: number; note?: string | null };
export type EntryInput = {
  assignmentId: string;
  sessions: SessionInput[];       // multiple work sessions per day; actual = sum
  submittedHours: number;         // cannot exceed actual
  remarks?: string | null;
};

/** Rows for the daily-entry screen: every ACTIVE assignment in scope, with any record already saved for that date. */
export async function entrySheet(u: U, date: string, f: { projectId?: string; industryId?: string; contributorId?: string }) {
  const db = await getDb();
  const scope = await managerScope(u);
  let rows = await db.select({
    assignmentId: s.projectContributors.id, contributorId: s.contributors.id, contributorName: s.contributors.fullName, contributorCode: s.contributors.code,
    projectId: s.projects.id, projectName: s.projects.name, industryId: s.industries.id, industryName: s.industries.name,
    dailyTarget: s.projectContributors.dailyTargetHours,
  }).from(s.projectContributors)
    .innerJoin(s.contributors, eq(s.contributors.id, s.projectContributors.contributorId))
    .innerJoin(s.projects, eq(s.projects.id, s.projectContributors.projectId))
    .innerJoin(s.industries, eq(s.industries.id, s.projectContributors.industryId))
    .where(and(eq(s.projectContributors.status, "ACTIVE"), eq(s.contributors.status, "ACTIVE"),
      f.projectId ? eq(s.projectContributors.projectId, f.projectId) : undefined,
      f.industryId ? eq(s.projectContributors.industryId, f.industryId) : undefined,
      f.contributorId ? eq(s.projectContributors.contributorId, f.contributorId) : undefined))
    .orderBy(s.projects.name, s.industries.name, s.contributors.fullName);
  if (scope) rows = rows.filter((r) => scope.industryIds.has(r.industryId) || scope.managedProjectIds.has(r.projectId));

  const recs = rows.length
    ? await db.select().from(s.dailyWorkRecords).where(and(eq(s.dailyWorkRecords.workDate, date), inArray(s.dailyWorkRecords.assignmentId, rows.map((r) => r.assignmentId))))
    : [];
  const sess = recs.length ? await db.select().from(s.workSessions).where(inArray(s.workSessions.dailyRecordId, recs.map((r) => r.id))) : [];
  const acc = recs.length ? await db.select().from(s.acceptanceRecords).where(inArray(s.acceptanceRecords.dailyRecordId, recs.map((r) => r.id))) : [];

  return rows.map((r) => {
    const rec = recs.find((x) => x.assignmentId === r.assignmentId);
    const a = rec && acc.find((x) => x.dailyRecordId === rec.id);
    return {
      ...r, recordId: rec?.id ?? null,
      sessions: rec ? sess.filter((x) => x.dailyRecordId === rec.id).map((x) => ({ startTime: x.startTime, endTime: x.endTime, hours: Number(x.hours), note: x.note })) : [],
      actualHours: rec ? Number(rec.actualHours) : 0, submittedHours: rec ? Number(rec.submittedHours) : 0, remarks: rec?.remarks ?? "",
      locked: !!a?.statementId, qcStatus: a?.qcStatus ?? null,
    };
  });
}

/** Create or update daily records (one per assignment per day). Safe to call repeatedly: no duplicates are possible. */
export async function saveEntries(u: U, date: string, entries: EntryInput[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Invalid date");
  if (date > new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)) throw new HttpError(400, "Hours cannot be recorded for a future date");
  const db = await getDb();
  const results: { assignmentId: string; recordId: string; created: boolean }[] = [];

  // access checks happen before the transaction opens (they use their own connection)
  const asgRows = entries.length ? await db.select().from(s.projectContributors).where(inArray(s.projectContributors.id, [...new Set(entries.map((e) => e.assignmentId))])) : [];
  for (const iid of new Set(asgRows.map((a) => a.industryId))) await assertIndustryAccess(u, iid);

  await db.transaction(async (tx) => {
    for (const e of entries) {
      const [asg] = await tx.select().from(s.projectContributors).where(eq(s.projectContributors.id, e.assignmentId));
      if (!asg) throw new HttpError(404, "Assignment not found");
      if (asg.status !== "ACTIVE") throw new HttpError(400, "This contributor assignment is not active");

      const sessions = e.sessions.filter((x) => x.hours > 0);
      for (const x of sessions) if (x.hours > MAX_DAILY_HOURS) throw new HttpError(400, `A single session cannot exceed ${MAX_DAILY_HOURS} hours`);
      const actual = sessions.reduce((sum, x) => sum.plus(D(x.hours)), D(0));
      const submitted = D(e.submittedHours);
      if (actual.gt(MAX_DAILY_HOURS)) throw new HttpError(400, `Total hours for one day cannot exceed ${MAX_DAILY_HOURS}`);
      if (submitted.lt(0)) throw new HttpError(400, "Submitted hours cannot be negative");
      if (submitted.gt(actual)) throw new HttpError(400, `Submitted hours (${submitted}) cannot exceed actual working hours (${actual})`);

      const [existing] = await tx.select().from(s.dailyWorkRecords).where(and(eq(s.dailyWorkRecords.assignmentId, e.assignmentId), eq(s.dailyWorkRecords.workDate, date)));
      let acc = existing ? (await tx.select().from(s.acceptanceRecords).where(eq(s.acceptanceRecords.dailyRecordId, existing.id)))[0] : undefined;
      if (acc?.statementId) throw new HttpError(409, "These hours are already included in a payment statement and can no longer be edited");

      let recordId: string;
      if (existing) {
        recordId = existing.id;
        await tx.update(s.dailyWorkRecords).set({
          actualHours: actual.toString(), submittedHours: submitted.toString(), remarks: e.remarks ?? null, recordedBy: u.id, updatedAt: new Date(),
        }).where(eq(s.dailyWorkRecords.id, recordId));
        await tx.delete(s.workSessions).where(eq(s.workSessions.dailyRecordId, recordId));
      } else {
        const [r] = await tx.insert(s.dailyWorkRecords).values({
          assignmentId: asg.id, projectId: asg.projectId, industryId: asg.industryId, contributorId: asg.contributorId, workDate: date,
          targetHours: asg.dailyTargetHours, actualHours: actual.toString(), submittedHours: submitted.toString(), remarks: e.remarks ?? null, recordedBy: u.id,
        }).returning();
        recordId = r.id;
      }
      if (sessions.length)
        await tx.insert(s.workSessions).values(sessions.map((x) => ({ dailyRecordId: recordId, startTime: x.startTime ?? null, endTime: x.endTime ?? null, hours: String(x.hours), note: x.note ?? null })));

      // keep the QC row in step with submitted hours; an existing percentage is re-applied to the new hours
      if (!acc) {
        [acc] = await tx.insert(s.acceptanceRecords).values({
          dailyRecordId: recordId, projectId: asg.projectId, industryId: asg.industryId, contributorId: asg.contributorId,
          submissionDate: date, submittedHours: submitted.toString(), qcStatus: "PENDING",
        }).returning();
      } else {
        const pct = acc.acceptancePct;
        const accepted = pct === null ? D(0) : acceptedHours(submitted, pct);
        await tx.update(s.acceptanceRecords).set({
          submittedHours: submitted.toString(), acceptedHours: accepted.toString(), rejectedHours: pct === null ? "0" : rejectedHours(submitted, accepted).toString(),
          updatedAt: new Date(),
          qcStatus: pct === null ? "PENDING" : acc.qcStatus === "PENDING" ? deriveQcStatus(pct) : acc.qcStatus,
        }).where(eq(s.acceptanceRecords.id, acc.id));
        if (pct !== null && !D(acc.submittedHours).eq(submitted))
          await audit(tx as never, { userId: u.id, action: "QC_CHANGE", entity: "acceptance_record", entityId: acc.id, before: { submitted: acc.submittedHours, accepted: acc.acceptedHours }, after: { submitted: submitted.toString(), accepted: accepted.toString() }, note: "Submitted hours edited after QC; percentage re-applied" });
      }
      await audit(tx as never, { userId: u.id, action: existing ? "UPDATE" : "CREATE", entity: "daily_work_record", entityId: recordId,
        before: existing ? { actual: existing.actualHours, submitted: existing.submittedHours } : null, after: { date, actual: actual.toString(), submitted: submitted.toString() } });
      results.push({ assignmentId: e.assignmentId, recordId, created: !existing });
    }
  });
  return results;
}

/** Totals for the entry screen footer / filters. */
export async function hoursTotals(u: U, f: { from: string; to: string; projectId?: string; industryId?: string; contributorId?: string }) {
  const db = await getDb();
  const scope = await managerScope(u);
  let rows = await db.select().from(s.dailyWorkRecords).where(and(
    gte(s.dailyWorkRecords.workDate, f.from), lte(s.dailyWorkRecords.workDate, f.to),
    f.projectId ? eq(s.dailyWorkRecords.projectId, f.projectId) : undefined,
    f.industryId ? eq(s.dailyWorkRecords.industryId, f.industryId) : undefined,
    f.contributorId ? eq(s.dailyWorkRecords.contributorId, f.contributorId) : undefined));
  if (scope) rows = rows.filter((r) => scope.industryIds.has(r.industryId) || scope.managedProjectIds.has(r.projectId));
  const sum = (k: "targetHours" | "actualHours" | "submittedHours") => rows.reduce((t, r) => t.plus(D(r[k])), D(0)).toString();
  return { records: rows.length, target: sum("targetHours"), actual: sum("actualHours"), submitted: sum("submittedHours") };
}
