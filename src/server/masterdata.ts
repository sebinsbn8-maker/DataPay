import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { audit } from "./audit";
import { nextCode } from "./sequence";
import { HttpError, managerScope } from "./guard";
import type { Role } from "@/lib/permissions";

type U = { id: string; role: Role };
const strip = <T extends object>(o: T) => JSON.parse(JSON.stringify(o));

/* ---------------- projects ---------------- */
export async function listProjects(u: U) {
  const db = await getDb();
  const scope = await managerScope(u);
  const rows = await db.select().from(s.projects).orderBy(desc(s.projects.createdAt));
  return scope ? rows.filter((p) => scope.projectIds.has(p.id)) : rows;
}
export async function createProject(u: U, input: Record<string, unknown>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const code = await nextCode(tx as never, "project", "PRJ");
    const [p] = await tx.insert(s.projects).values({ ...input, code } as never).returning();
    await audit(tx as never, { userId: u.id, action: "CREATE", entity: "project", entityId: p.id, after: strip(p) });
    return p;
  });
}
export async function updateProject(u: U, id: string, input: Record<string, unknown>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.projects).where(eq(s.projects.id, id));
    if (!before) throw new HttpError(404, "Project not found");
    const [after] = await tx.update(s.projects).set({ ...input, updatedAt: new Date() } as never).where(eq(s.projects.id, id)).returning();
    await audit(tx as never, { userId: u.id, action: "UPDATE", entity: "project", entityId: id, before: strip(before), after: strip(after) });
    return after;
  });
}

/* ---------------- industries ---------------- */
export async function listIndustries(u: U, projectId?: string | null) {
  const db = await getDb();
  const scope = await managerScope(u);
  let rows = await db.select().from(s.industries)
    .where(projectId ? eq(s.industries.projectId, projectId) : undefined).orderBy(s.industries.name);
  if (scope) rows = rows.filter((i) => scope.industryIds.has(i.id) || scope.managedProjectIds.has(i.projectId));
  return rows;
}
export async function createIndustry(u: U, input: Record<string, unknown>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [i] = await tx.insert(s.industries).values(input as never).returning();
    await audit(tx as never, { userId: u.id, action: "CREATE", entity: "industry", entityId: i.id, after: strip(i) });
    return i;
  });
}
export async function updateIndustry(u: U, id: string, input: Record<string, unknown>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.industries).where(eq(s.industries.id, id));
    if (!before) throw new HttpError(404, "Industry not found");
    const [after] = await tx.update(s.industries).set({ ...input, updatedAt: new Date() } as never).where(eq(s.industries.id, id)).returning();
    await audit(tx as never, { userId: u.id, action: input.status === "ARCHIVED" ? "ARCHIVE" : "UPDATE", entity: "industry", entityId: id, before: strip(before), after: strip(after) });
    return after;
  });
}

/* ---------------- delete (admin only; only when no money/hours history exists) ---------------- */
type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];
async function assertNoHistory(tx: Tx, col: "projectId" | "industryId", id: string, what: string) {
  const has = async (table: typeof s.dailyWorkRecords | typeof s.acceptanceRecords | typeof s.industryPaymentStatements) => {
    const [r] = await tx.select({ id: table.id }).from(table).where(eq(table[col], id)).limit(1);
    return !!r;
  };
  if ((await has(s.dailyWorkRecords)) || (await has(s.acceptanceRecords)) || (await has(s.industryPaymentStatements)))
    throw new HttpError(409, `This ${what} has recorded hours, QC or payments, so it can't be deleted. Set its status to ${what === "project" ? "Completed" : "Archived"} instead.`);
}
async function removeIndustries(tx: Tx, industryIds: string[]) {
  if (!industryIds.length) return;
  const asg = await tx.select({ id: s.projectContributors.id }).from(s.projectContributors).where(inArray(s.projectContributors.industryId, industryIds));
  const asgIds = asg.map((a) => a.id);
  await tx.delete(s.paymentRates).where(asgIds.length ? or(inArray(s.paymentRates.industryId, industryIds), inArray(s.paymentRates.assignmentId, asgIds)) : inArray(s.paymentRates.industryId, industryIds));
  await tx.delete(s.projectContributors).where(inArray(s.projectContributors.industryId, industryIds));
  await tx.delete(s.industries).where(inArray(s.industries.id, industryIds));
}
export async function deleteIndustry(u: U, id: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.industries).where(eq(s.industries.id, id));
    if (!before) throw new HttpError(404, "Industry not found");
    await assertNoHistory(tx, "industryId", id, "industry");
    await removeIndustries(tx, [id]);
    await audit(tx as never, { userId: u.id, action: "DELETE", entity: "industry", entityId: id, before: strip(before) });
    return { deleted: true };
  });
}
export async function deleteProject(u: U, id: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.projects).where(eq(s.projects.id, id));
    if (!before) throw new HttpError(404, "Project not found");
    await assertNoHistory(tx, "projectId", id, "project");
    const inds = await tx.select({ id: s.industries.id }).from(s.industries).where(eq(s.industries.projectId, id));
    await removeIndustries(tx, inds.map((i) => i.id));
    await tx.delete(s.paymentRates).where(eq(s.paymentRates.projectId, id));
    await tx.delete(s.projectContributors).where(eq(s.projectContributors.projectId, id));
    await tx.delete(s.projects).where(eq(s.projects.id, id));
    await audit(tx as never, { userId: u.id, action: "DELETE", entity: "project", entityId: id, before: strip(before), note: `${inds.length} industries removed` });
    return { deleted: true };
  });
}

/* ---------------- contributors & assignments ---------------- */
export async function listContributors(u: U) {
  const db = await getDb();
  const scope = await managerScope(u);
  const cons = await db.select().from(s.contributors).orderBy(s.contributors.fullName);
  const asg = await db.select({
    id: s.projectContributors.id, contributorId: s.projectContributors.contributorId,
    projectId: s.projectContributors.projectId, industryId: s.projectContributors.industryId,
    projectName: s.projects.name, industryName: s.industries.name, status: s.projectContributors.status,
    dailyTargetHours: s.projectContributors.dailyTargetHours, weeklyTargetHours: s.projectContributors.weeklyTargetHours,
    monthlyTargetHours: s.projectContributors.monthlyTargetHours,
  }).from(s.projectContributors)
    .innerJoin(s.projects, eq(s.projects.id, s.projectContributors.projectId))
    .innerJoin(s.industries, eq(s.industries.id, s.projectContributors.industryId));
  const visibleAsg = scope ? asg.filter((a) => scope.industryIds.has(a.industryId) || scope.managedProjectIds.has(a.projectId)) : asg;
  const visibleCons = scope ? cons.filter((c) => visibleAsg.some((a) => a.contributorId === c.id)) : cons;
  return visibleCons.map((c) => ({ ...c, assignments: visibleAsg.filter((a) => a.contributorId === c.id) }));
}
export async function createContributor(u: U, input: Record<string, unknown>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const code = await nextCode(tx as never, "contributor", "CON");
    const [c] = await tx.insert(s.contributors).values({ ...input, code } as never).returning();
    await audit(tx as never, { userId: u.id, action: "CREATE", entity: "contributor", entityId: c.id, after: strip(c) });
    return c;
  });
}
export async function updateContributor(u: U, id: string, input: Record<string, unknown>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.contributors).where(eq(s.contributors.id, id));
    if (!before) throw new HttpError(404, "Contributor not found");
    const [after] = await tx.update(s.contributors).set({ ...input, updatedAt: new Date() } as never).where(eq(s.contributors.id, id)).returning();
    await audit(tx as never, { userId: u.id, action: "UPDATE", entity: "contributor", entityId: id, before: strip(before), after: strip(after) });
    return after;
  });
}
export async function contributorHistory(id: string) {
  const db = await getDb();
  const records = await db.select({
    id: s.dailyWorkRecords.id, date: s.dailyWorkRecords.workDate, projectName: s.projects.name, industryName: s.industries.name,
    target: s.dailyWorkRecords.targetHours, actual: s.dailyWorkRecords.actualHours, submitted: s.dailyWorkRecords.submittedHours,
    accepted: s.acceptanceRecords.acceptedHours, pct: s.acceptanceRecords.acceptancePct, qc: s.acceptanceRecords.qcStatus,
  }).from(s.dailyWorkRecords)
    .innerJoin(s.projects, eq(s.projects.id, s.dailyWorkRecords.projectId))
    .innerJoin(s.industries, eq(s.industries.id, s.dailyWorkRecords.industryId))
    .leftJoin(s.acceptanceRecords, eq(s.acceptanceRecords.dailyRecordId, s.dailyWorkRecords.id))
    .where(eq(s.dailyWorkRecords.contributorId, id)).orderBy(desc(s.dailyWorkRecords.workDate));
  return records;
}

export async function createAssignment(u: U, input: { contributorId: string; projectId: string; industryId: string; dailyTargetHours: number; weeklyTargetHours: number; monthlyTargetHours: number; hourlyRate?: number; assignedFrom?: string | null }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [ind] = await tx.select().from(s.industries).where(eq(s.industries.id, input.industryId));
    if (!ind || ind.projectId !== input.projectId) throw new HttpError(400, "That industry does not belong to the selected project");
    const { hourlyRate, ...rest } = input;
    const [a] = await tx.insert(s.projectContributors).values({
      ...rest, dailyTargetHours: String(rest.dailyTargetHours), weeklyTargetHours: String(rest.weeklyTargetHours), monthlyTargetHours: String(rest.monthlyTargetHours),
    }).returning();
    await audit(tx as never, { userId: u.id, action: "CREATE", entity: "assignment", entityId: a.id, after: strip(a) });
    if (hourlyRate !== undefined) {
      const [r] = await tx.insert(s.paymentRates).values({ scope: "CONTRIBUTOR", assignmentId: a.id, hourlyRate: String(hourlyRate), effectiveFrom: input.assignedFrom ?? new Date().toISOString().slice(0, 10), createdBy: u.id }).returning();
      await audit(tx as never, { userId: u.id, action: "RATE_CHANGE", entity: "payment_rate", entityId: r.id, after: strip(r) });
    }
    return a;
  });
}
export async function updateAssignment(u: U, id: string, input: Record<string, unknown>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.projectContributors).where(eq(s.projectContributors.id, id));
    if (!before) throw new HttpError(404, "Assignment not found");
    const allowed: Record<string, unknown> = {};
    for (const k of ["dailyTargetHours", "weeklyTargetHours", "monthlyTargetHours", "status"]) if (k in input) allowed[k] = k === "status" ? input[k] : String(input[k]);
    const [after] = await tx.update(s.projectContributors).set({ ...allowed, updatedAt: new Date() } as never).where(eq(s.projectContributors.id, id)).returning();
    await audit(tx as never, { userId: u.id, action: "UPDATE", entity: "assignment", entityId: id, before: strip(before), after: strip(after) });
    return after;
  });
}
/** Transfer = close the old assignment (history stays attached to it) and open a new one. */
export async function transferAssignment(u: U, id: string, toIndustryId: string, effective: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [old] = await tx.select().from(s.projectContributors).where(eq(s.projectContributors.id, id));
    if (!old) throw new HttpError(404, "Assignment not found");
    const [ind] = await tx.select().from(s.industries).where(eq(s.industries.id, toIndustryId));
    if (!ind) throw new HttpError(404, "Target industry not found");
    await tx.update(s.projectContributors).set({ status: "INACTIVE", assignedTo: effective, updatedAt: new Date() }).where(eq(s.projectContributors.id, id));
    const [existing] = await tx.select().from(s.projectContributors).where(and(eq(s.projectContributors.contributorId, old.contributorId), eq(s.projectContributors.industryId, toIndustryId)));
    const [neu] = existing
      ? await tx.update(s.projectContributors).set({ status: "ACTIVE", assignedTo: null, updatedAt: new Date() }).where(eq(s.projectContributors.id, existing.id)).returning()
      : await tx.insert(s.projectContributors).values({
          contributorId: old.contributorId, projectId: ind.projectId, industryId: toIndustryId,
          dailyTargetHours: old.dailyTargetHours, weeklyTargetHours: old.weeklyTargetHours, monthlyTargetHours: old.monthlyTargetHours, assignedFrom: effective,
        }).returning();
    await audit(tx as never, { userId: u.id, action: "UPDATE", entity: "assignment.transfer", entityId: neu.id, before: strip(old), after: strip(neu), note: `Transferred on ${effective}` });
    return neu;
  });
}

/* ---------------- rates ---------------- */
export async function listRates() {
  const db = await getDb();
  return db.select().from(s.paymentRates).orderBy(desc(s.paymentRates.effectiveFrom), desc(s.paymentRates.createdAt));
}
export async function createRate(u: U, input: Record<string, unknown>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(s.paymentRates).values({ ...input, hourlyRate: String(input.hourlyRate), createdBy: u.id } as never).returning();
    // Rates are append-only. A new row with a later effectiveFrom supersedes older ones for dates on/after it.
    await audit(tx as never, { userId: u.id, action: "RATE_CHANGE", entity: "payment_rate", entityId: r.id, after: strip(r) });
    return r;
  });
}
void inArray; void or;
