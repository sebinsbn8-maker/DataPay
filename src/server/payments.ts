import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { audit } from "./audit";
import { nextCode } from "./sequence";
import { HttpError, assertIndustryAccess, managerScope } from "./guard";
import { D, resolveRate, type RateRow } from "@/lib/calc";
import { aggregate, lineize } from "@/lib/aggregate";
import { loadFacts } from "./facts";
import { currentTdsPercent } from "@/lib/tds";
import type { Role } from "@/lib/permissions";

type U = { id: string; role: Role };
type StatementStatus = "NOT_READY" | "PENDING_APPROVAL" | "APPROVED" | "PARTIALLY_PAID" | "PAID" | "VOID";

type LineIn = ReturnType<typeof lineize>[number];
const serLine = (l: LineIn) => ({ ...l, submitted: l.submitted.toString(), accepted: l.accepted.toString(), rejected: l.rejected.toString(), amount: l.amount.toString(), tds: l.tds.toString(), net: l.net.toString() });

/** Preview what a statement would contain without saving anything. */
export async function previewStatement(u: U, industryId: string, from: string, to: string) {
  await assertIndustryAccess(u, industryId);
  const facts = await loadFacts(u, { industryId, from, to });
  const eligible = facts.filter((f) => f.pct !== null && !f.statementId);
  const pending = facts.filter((f) => f.pct === null);
  const noRate = [...new Set(eligible.filter((f) => !f.rate && D(f.accepted).gt(0)).map((f) => f.contributorName))];
  const lines = lineize(eligible);
  return {
    lines: lines.map(serLine),
    tdsPercent: currentTdsPercent(),
    totalTds: lines.reduce((t, l) => t.plus(l.tds), D(0)).toString(),
    totalNet: lines.reduce((t, l) => t.plus(l.net), D(0)).toString(),
    totalAccepted: lines.reduce((t, l) => t.plus(l.accepted), D(0)).toString(),
    totalAmount: lines.reduce((t, l) => t.plus(l.amount), D(0)).toString(),
    pendingHours: pending.reduce((t, f) => t.plus(f.pending), D(0)).toString(),
    alreadyBilledRecords: facts.filter((f) => f.statementId).length,
    recordsIncluded: eligible.length, contributorsWithoutRate: noRate,
  };
}

/**
 * Create a statement for reviewed (QC-received) hours in the period. Hours still pending client review are
 * NOT included. Included records are claimed atomically (statement_id) so they can never be billed twice.
 */
export async function createStatement(u: U, i: { industryId: string; from: string; to: string; remarks?: string }) {
  if (i.from > i.to) throw new HttpError(400, "Period start must be before period end");
  await assertIndustryAccess(u, i.industryId);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [ind] = await tx.select().from(s.industries).where(eq(s.industries.id, i.industryId));
    if (!ind) throw new HttpError(404, "Industry not found");
    const year = i.to.slice(0, 4);
    const code = await nextCode(tx as never, `payment-${year}`, `PAY-${year}`);
    const [stmt] = await tx.insert(s.industryPaymentStatements).values({
      code, projectId: ind.projectId, industryId: ind.id, periodStart: i.from, periodEnd: i.to, status: "PENDING_APPROVAL", remarks: i.remarks, createdBy: u.id, tdsPercent: String(currentTdsPercent()),
    }).returning();

    // atomic claim: only rows not yet in any statement, with a received client percentage
    const claimed = await tx.update(s.acceptanceRecords).set({ statementId: stmt.id, updatedAt: new Date() })
      .where(and(eq(s.acceptanceRecords.industryId, ind.id), gte(s.acceptanceRecords.submissionDate, i.from), lte(s.acceptanceRecords.submissionDate, i.to),
        isNull(s.acceptanceRecords.statementId), isNotNull(s.acceptanceRecords.acceptancePct)))
      .returning({ id: s.acceptanceRecords.id, dailyRecordId: s.acceptanceRecords.dailyRecordId, accepted: s.acceptanceRecords.acceptedHours });
    if (!claimed.length) throw new HttpError(400, "No client-reviewed hours are available for this industry and period (or they are already in another statement)");

    const rates = (await tx.select().from(s.paymentRates)) as unknown as RateRow[];
    const meta = await tx.select({ id: s.dailyWorkRecords.id, assignmentId: s.dailyWorkRecords.assignmentId, date: s.dailyWorkRecords.workDate })
      .from(s.dailyWorkRecords).where(inArray(s.dailyWorkRecords.id, claimed.map((c) => c.dailyRecordId)));
    const missing = new Set<string>();
    for (const c of claimed) {
      const m = meta.find((x) => x.id === c.dailyRecordId)!;
      const hit = resolveRate(rates, { projectId: ind.projectId, industryId: ind.id, assignmentId: m.assignmentId }, m.date);
      if (!hit && D(c.accepted).gt(0)) { missing.add(m.assignmentId); continue; }
      await tx.update(s.acceptanceRecords).set({ appliedRate: (hit?.rate ?? D(0)).toString(), payableAmount: D(c.accepted).mul(hit?.rate ?? 0).toString() }).where(eq(s.acceptanceRecords.id, c.id));
    }
    if (missing.size) throw new HttpError(400, "No hourly rate is configured for some contributors in this period. Add a rate effective on or before those dates, then retry.");

    const allFacts = await loadFacts(null, { industryId: ind.id, from: i.from, to: i.to }, tx as never);
    const facts = allFacts.filter((f) => f.statementId === stmt.id);
    const lines = lineize(facts);
    const t = aggregate(facts, () => ({ key: "x", name: "x" }))[0];
    const calculated = lines.reduce((sum, l) => sum.plus(l.amount), D(0));
    const tdsTotal = lines.reduce((sum, l) => sum.plus(l.tds), D(0));
    const pendingFacts = allFacts.filter((f) => f.pct === null);
    const [saved] = await tx.update(s.industryPaymentStatements).set({
      totalSubmittedHours: t.submitted.toString(), totalAcceptedHours: t.accepted.toString(), totalRejectedHours: t.rejected.toString(),
      totalPendingHours: pendingFacts.reduce((x, f) => x.plus(f.pending), D(0)).toString(),
      calculatedAmount: calculated.toString(), tdsAmount: tdsTotal.toString(),
      lines: lines.map(serLine) as never,
    }).where(eq(s.industryPaymentStatements.id, stmt.id)).returning();
    await audit(tx as never, { userId: u.id, action: "CREATE", entity: "payment_statement", entityId: saved.id, after: { code, period: [i.from, i.to], calculated: calculated.toString(), tds: tdsTotal.toString(), records: claimed.length } });
    return saved;
  });
}

/** Admin approval. Row-locked and status-checked, so a statement can be approved exactly once. */
export async function approveStatement(u: U, id: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(s.industryPaymentStatements).where(eq(s.industryPaymentStatements.id, id)).for("update");
    if (!st) throw new HttpError(404, "Statement not found");
    if (st.status !== "PENDING_APPROVAL") throw new HttpError(409, `Statement is already ${st.status.replace("_", " ").toLowerCase()}`);
    const approved = D(st.calculatedAmount).plus(st.adjustmentsTotal).minus(st.tdsAmount); // net payable after TDS
    if (approved.lt(0)) throw new HttpError(400, "Approved amount cannot be negative");
    const [after] = await tx.update(s.industryPaymentStatements).set({ status: "APPROVED", approvedAmount: approved.toString(), approvedBy: u.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(s.industryPaymentStatements.id, id)).returning();
    await audit(tx as never, { userId: u.id, action: "APPROVE", entity: "payment_statement", entityId: id, before: { status: st.status }, after: { status: "APPROVED", approvedAmount: approved.toString() } });
    return after;
  });
}

/** Signed manual adjustment with mandatory reason. Allowed before payment completes; never below what is already paid. */
export async function addAdjustment(u: U, id: string, amount: number, reason: string) {
  if (!reason.trim()) throw new HttpError(400, "A reason is required for every adjustment");
  if (!amount) throw new HttpError(400, "Adjustment amount cannot be zero");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(s.industryPaymentStatements).where(eq(s.industryPaymentStatements.id, id)).for("update");
    if (!st) throw new HttpError(404, "Statement not found");
    if (st.status === "VOID" || st.status === "PAID") throw new HttpError(409, `Cannot adjust a ${st.status.toLowerCase()} statement`);
    const adj = D(st.adjustmentsTotal).plus(amount);
    const total = D(st.calculatedAmount).plus(adj).minus(st.tdsAmount);
    if (total.lt(0)) throw new HttpError(400, "Adjustment would make the statement total negative");
    const approved = st.status === "PENDING_APPROVAL" ? D(0) : total;
    if (st.status !== "PENDING_APPROVAL" && approved.lt(st.paidAmount)) throw new HttpError(400, "Adjustment would drop the approved amount below what has already been paid");
    await tx.insert(s.paymentAdjustments).values({ statementId: id, amount: String(amount), reason, createdBy: u.id });
    const paid = D(st.paidAmount);
    const status: StatementStatus = st.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : paid.gte(approved) && approved.gt(0) ? "PAID" : paid.gt(0) ? "PARTIALLY_PAID" : "APPROVED";
    const [after] = await tx.update(s.industryPaymentStatements).set({ adjustmentsTotal: adj.toString(), approvedAmount: approved.toString(), status, updatedAt: new Date() }).where(eq(s.industryPaymentStatements.id, id)).returning();
    await audit(tx as never, { userId: u.id, action: "ADJUST", entity: "payment_statement", entityId: id, before: { adjustments: st.adjustmentsTotal }, after: { adjustments: adj.toString() }, note: `${amount > 0 ? "+" : ""}${amount}: ${reason}` });
    return after;
  });
}

/** Record an actual payment (full or partial). */
export async function recordPayment(u: U, id: string, p: { amount: number; paymentDate: string; referenceNumber: string; method: string; remarks?: string }) {
  if (!(p.amount > 0)) throw new HttpError(400, "Payment amount must be greater than zero");
  if (!p.referenceNumber.trim()) throw new HttpError(400, "A payment reference number is required");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(s.industryPaymentStatements).where(eq(s.industryPaymentStatements.id, id)).for("update");
    if (!st) throw new HttpError(404, "Statement not found");
    if (st.status !== "APPROVED" && st.status !== "PARTIALLY_PAID") throw new HttpError(409, st.status === "PENDING_APPROVAL" ? "Approve the statement before recording payments" : `Statement is ${st.status.replace("_", " ").toLowerCase()}`);
    const outstanding = D(st.approvedAmount).minus(st.paidAmount);
    if (D(p.amount).gt(outstanding)) throw new HttpError(400, `Payment exceeds the outstanding balance of ${outstanding.toFixed(2)}`);
    await tx.insert(s.paymentTransactions).values({ statementId: id, amount: String(p.amount), paymentDate: p.paymentDate, referenceNumber: p.referenceNumber.trim(), method: p.method, remarks: p.remarks, recordedBy: u.id });
    const paid = D(st.paidAmount).plus(p.amount);
    const status: StatementStatus = paid.gte(st.approvedAmount) ? "PAID" : "PARTIALLY_PAID";
    const [after] = await tx.update(s.industryPaymentStatements).set({ paidAmount: paid.toString(), status, updatedAt: new Date() }).where(eq(s.industryPaymentStatements.id, id)).returning();
    await audit(tx as never, { userId: u.id, action: "PAYMENT", entity: "payment_statement", entityId: id, after: { amount: p.amount, reference: p.referenceNumber, paidTotal: paid.toString(), status } });
    return after;
  });
}

/** Void a statement that has no payments: releases its hours so QC can be corrected and billing redone. */
export async function voidStatement(u: U, id: string, reason: string, force = false) {
  if (!reason.trim()) throw new HttpError(400, "A reason is required to void a statement");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(s.industryPaymentStatements).where(eq(s.industryPaymentStatements.id, id)).for("update");
    if (!st) throw new HttpError(404, "Statement not found");
    if (st.status === "VOID") throw new HttpError(409, "Already void");
    const paid = D(st.paidAmount).gt(0);
    if (paid && !force) throw new HttpError(409, "A statement with recorded payments cannot be voided");
    if (paid) { // admin override: the payment records are removed (and the audit log keeps what they were)
      const txns = await tx.select().from(s.paymentTransactions).where(eq(s.paymentTransactions.statementId, id));
      await audit(tx as never, { userId: u.id, action: "DELETE", entity: "payment_transactions", entityId: id, before: { paid: st.paidAmount, transactions: txns.map((x) => ({ amount: x.amount, date: x.paymentDate, ref: x.referenceNumber, method: x.method })) }, note: `Force void: ${reason}` });
      await tx.delete(s.paymentTransactions).where(eq(s.paymentTransactions.statementId, id));
    }
    await tx.update(s.acceptanceRecords).set({ statementId: null, appliedRate: null, payableAmount: null, updatedAt: new Date() }).where(eq(s.acceptanceRecords.statementId, id));
    const [after] = await tx.update(s.industryPaymentStatements).set({ status: "VOID", approvedAmount: "0", paidAmount: "0", updatedAt: new Date(), remarks: `${st.remarks ?? ""}\nVOID: ${reason}`.trim() }).where(eq(s.industryPaymentStatements.id, id)).returning();
    await audit(tx as never, { userId: u.id, action: "UPDATE", entity: "payment_statement", entityId: id, before: { status: st.status }, after: { status: "VOID" }, note: reason });
    return after;
  });
}

export async function listStatements(u: U, f: { industryId?: string; projectId?: string } = {}) {
  const db = await getDb();
  const scope = await managerScope(u);
  const rows = await db.select({
    st: s.industryPaymentStatements, projectName: s.projects.name, industryName: s.industries.name,
  }).from(s.industryPaymentStatements)
    .innerJoin(s.projects, eq(s.projects.id, s.industryPaymentStatements.projectId))
    .innerJoin(s.industries, eq(s.industries.id, s.industryPaymentStatements.industryId))
    .where(and(f.industryId ? eq(s.industryPaymentStatements.industryId, f.industryId) : undefined, f.projectId ? eq(s.industryPaymentStatements.projectId, f.projectId) : undefined))
    .orderBy(desc(s.industryPaymentStatements.createdAt));
  return rows.filter((r) => !scope || scope.industryIds.has(r.st.industryId) || scope.managedProjectIds.has(r.st.projectId))
    .map((r) => ({ ...r.st, projectName: r.projectName, industryName: r.industryName, outstanding: D(r.st.approvedAmount).minus(r.st.paidAmount).toString(),
      netAmount: D(r.st.calculatedAmount).plus(r.st.adjustmentsTotal).minus(r.st.tdsAmount).toString() }));
}

export async function statementDetail(u: U, id: string) {
  const db = await getDb();
  const [st] = (await listStatements(u)).filter((x) => x.id === id);
  if (!st) throw new HttpError(404, "Statement not found");
  const txns = await db.select().from(s.paymentTransactions).where(eq(s.paymentTransactions.statementId, id)).orderBy(s.paymentTransactions.paymentDate);
  const adjustments = await db.select().from(s.paymentAdjustments).where(eq(s.paymentAdjustments.statementId, id)).orderBy(s.paymentAdjustments.createdAt);
  return { ...st, transactions: txns, adjustments };
}

/** Industry-level payment overview: submitted/accepted/rejected/pending, payable, paid, remaining, status. */
export async function industryOverview(u: U, f: { from?: string; to?: string; projectId?: string }) {
  const db = await getDb();
  const facts = await loadFacts(u, { from: f.from, to: f.to, projectId: f.projectId });
  const stmts = (await listStatements(u, { projectId: f.projectId })).filter((x) => x.status !== "VOID"
    && (!f.from || x.periodEnd >= f.from) && (!f.to || x.periodStart <= f.to));
  const inds = await db.select().from(s.industries).where(and(f.projectId ? eq(s.industries.projectId, f.projectId) : undefined, ne(s.industries.status, "ARCHIVED")));
  const projects = await db.select().from(s.projects);
  const scope = await managerScope(u);

  return inds.filter((i) => !scope || scope.industryIds.has(i.id) || scope.managedProjectIds.has(i.projectId)).map((ind) => {
    const fs = facts.filter((x) => x.industryId === ind.id);
    const a = aggregate(fs, () => ({ key: "x", name: "x" }))[0];
    const mine = stmts.filter((x) => x.industryId === ind.id);
    const unbilledLines = lineize(fs.filter((x) => x.pct !== null && !x.statementId));
    const unbilled = unbilledLines.reduce((t, l) => t.plus(l.net), D(0));            // net, after TDS
    const unbilledTds = unbilledLines.reduce((t, l) => t.plus(l.tds), D(0));
    const billed = mine.reduce((t, x) => t.plus(x.calculatedAmount).plus(x.adjustmentsTotal).minus(x.tdsAmount), D(0)); // net, after TDS
    const tds = mine.reduce((t, x) => t.plus(x.tdsAmount), D(0)).plus(unbilledTds);
    const paid = mine.reduce((t, x) => t.plus(x.paidAmount), D(0));
    const payable = billed.plus(unbilled);
    // Status rules (documented in README):
    //  - nothing reviewed and nothing billed            -> NOT_READY
    //  - reviewed hours exist but no statement yet       -> PENDING_APPROVAL (ready to bill / approve)
    //  - any statement awaiting approval                 -> PENDING_APPROVAL
    //  - otherwise judged on money: nothing left to pay -> PAID, something paid -> PARTIALLY_PAID, else APPROVED
    let status: StatementStatus = "NOT_READY";
    if (!mine.length) status = unbilled.gt(0) ? "PENDING_APPROVAL" : "NOT_READY";
    else if (mine.some((x) => x.status === "PENDING_APPROVAL")) status = "PENDING_APPROVAL";
    else if (payable.minus(paid).lte(0)) status = "PAID";
    else if (paid.gt(0)) status = "PARTIALLY_PAID";
    else status = "APPROVED";
    return {
      industryId: ind.id, industryName: ind.name, projectId: ind.projectId, projectName: projects.find((p) => p.id === ind.projectId)?.name ?? "",
      submitted: (a?.submitted ?? D(0)).toString(), accepted: (a?.accepted ?? D(0)).toString(), rejected: (a?.rejected ?? D(0)).toString(), pending: (a?.pending ?? D(0)).toString(),
      payable: payable.toDecimalPlaces(2).toString(), tds: tds.toString(), gross: payable.plus(tds).toDecimalPlaces(2).toString(), unbilled: unbilled.toString(), paid: paid.toString(), remaining: payable.minus(paid).toDecimalPlaces(2).toString(), status,
    };
  });
}
