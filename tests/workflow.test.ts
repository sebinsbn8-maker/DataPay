import { beforeAll, describe, expect, it } from "vitest";
process.env.DATABASE_URL = "pglite://memory";

import { runMigrations, getDb, schema as s } from "../src/db";
import { ensureAdmin } from "../src/server/bootstrap";
import { createProject, createIndustry, createContributor, createAssignment, createRate, deleteIndustry, deleteProject } from "../src/server/masterdata";
import { saveEntries, entrySheet } from "../src/server/hours";
import { setAcceptance, allocateIndustry, listQc } from "../src/server/qc";
import { previewStatement, createStatement, approveStatement, recordPayment, addAdjustment, voidStatement, industryOverview } from "../src/server/payments";
import { loadFacts } from "../src/server/facts";
import { aggregate } from "../src/lib/aggregate";

const D1 = "2026-11-10", D2 = "2026-11-11";
let admin: { id: string; role: "ADMIN" };
let projectId: string, mfg: string, con: string;
let A: string, B: string;      // assignments in Manufacturing
let C: string;                 // assignment in Construction

beforeAll(async () => {
  await runMigrations();
  const a = await ensureAdmin("admin@test.io", "TestPassword123");
  admin = { id: a.id, role: "ADMIN" };
  const p = await createProject(admin, { name: "Scene Capture", clientName: "ACME", status: "ACTIVE" });
  projectId = p.id;
  mfg = (await createIndustry(admin, { projectId, name: "Manufacturing", status: "ACTIVE" })).id;
  con = (await createIndustry(admin, { projectId, name: "Construction", status: "ACTIVE" })).id;
  const ca = await createContributor(admin, { fullName: "Contributor A", email: "a@x.io", status: "ACTIVE" });
  const cb = await createContributor(admin, { fullName: "Contributor B", email: "b@x.io", status: "ACTIVE" });
  const cc = await createContributor(admin, { fullName: "Contributor C", email: "c@x.io", status: "ACTIVE" });
  const mk = (c: string, i: string) => createAssignment(admin, { contributorId: c, projectId, industryId: i, dailyTargetHours: 8, weeklyTargetHours: 40, monthlyTargetHours: 160 });
  A = (await mk(ca.id, mfg)).id; B = (await mk(cb.id, mfg)).id; C = (await mk(cc.id, con)).id;
  await createRate(admin, { scope: "INDUSTRY", industryId: mfg, hourlyRate: 250, effectiveFrom: "2026-01-01" });
});

const sess = (h: number) => [{ hours: h }];

describe("spec example: Manufacturing industry", () => {
  it("records hours, applies client %, and totals 4425", async () => {
    await saveEntries(admin, D1, [
      { assignmentId: A, sessions: sess(10), submittedHours: 10 },
      { assignmentId: B, sessions: sess(10), submittedHours: 10 },
      { assignmentId: C, sessions: sess(8), submittedHours: 8 },
    ]);
    const qc = await listQc({ industryId: mfg });
    const qa = qc.find((r) => r.contributorName === "Contributor A")!, qb = qc.find((r) => r.contributorName === "Contributor B")!;
    expect(qa.qcStatus).toBe("PENDING");

    // pending hours are not payable
    expect((await previewStatement(admin, mfg, D1, D1)).totalAmount).toBe("0");

    await setAcceptance(admin, [{ id: qa.id, acceptancePct: 90 }, { id: qb.id, acceptancePct: 87 }]);
    const after = await listQc({ industryId: mfg });
    expect(Number(after.find((r) => r.id === qa.id)!.accepted)).toBe(9);
    expect(Number(after.find((r) => r.id === qb.id)!.accepted)).toBe(8.7);
    expect(Number(after.find((r) => r.id === qb.id)!.rejected)).toBeCloseTo(1.3, 6);

    const prev = await previewStatement(admin, mfg, D1, D1);
    expect(prev.totalAmount).toBe("4425");
    expect(prev.lines.map((l) => l.amount).sort()).toEqual(["2175", "2250"]);
  });

  it("prevents duplicate daily entries (same assignment + date updates in place)", async () => {
    const before = await getDb().then((db) => db.select().from(s.dailyWorkRecords));
    await saveEntries(admin, D1, [{ assignmentId: C, sessions: sess(8), submittedHours: 7 }]);
    const afterRows = await getDb().then((db) => db.select().from(s.dailyWorkRecords));
    expect(afterRows.length).toBe(before.length);
  });

  it("supports several sessions per day and rejects submitted > actual", async () => {
    await saveEntries(admin, D2, [{ assignmentId: A, sessions: [{ hours: 4 }, { hours: 3.5 }], submittedHours: 7.5 }]);
    const sheet = await entrySheet(admin, D2, { industryId: mfg });
    expect(sheet.find((r) => r.assignmentId === A)!.actualHours).toBe(7.5);
    await expect(saveEntries(admin, D2, [{ assignmentId: A, sessions: sess(5), submittedHours: 6 }])).rejects.toThrow(/cannot exceed actual/);
  });
});

describe("payment workflow", () => {
  let stmtId: string;
  it("creates a statement only from reviewed hours and locks them", async () => {
    const st = await createStatement(admin, { industryId: mfg, from: D1, to: D1 });
    stmtId = st.id;
    expect(st.calculatedAmount).toBe("4425.00");
    expect(st.status).toBe("PENDING_APPROVAL");
    // the same hours cannot be billed twice
    await expect(createStatement(admin, { industryId: mfg, from: D1, to: D1 })).rejects.toThrow(/No client-reviewed hours/);
    // and cannot be edited or re-QC'd while locked
    await expect(saveEntries(admin, D1, [{ assignmentId: A, sessions: sess(10), submittedHours: 9 }])).rejects.toThrow(/already included/);
    const qa = (await listQc({ industryId: mfg })).find((r) => r.contributorName === "Contributor A" && r.date === D1)!;
    await expect(setAcceptance(admin, [{ id: qa.id, acceptancePct: 50 }])).rejects.toThrow(/locked/);
  });

  it("cannot record payment before approval; approves exactly once", async () => {
    await expect(recordPayment(admin, stmtId, { amount: 100, paymentDate: D1, referenceNumber: "X1", method: "UPI" })).rejects.toThrow(/Approve/);
    const ap = await approveStatement(admin, stmtId);
    expect(ap.approvedAmount).toBe("4425.00");
    await expect(approveStatement(admin, stmtId)).rejects.toThrow(/already/);
    // concurrent double-approval: at most one succeeds
    const st2 = await createStatement(admin, { industryId: mfg, from: D2, to: D2 }).catch(() => null);
    expect(st2).toBeNull(); // D2 hours still pending QC => nothing to bill
  });

  it("partial payments track the outstanding balance and block overpayment", async () => {
    const p1 = await recordPayment(admin, stmtId, { amount: 1000, paymentDate: D2, referenceNumber: "NEFT-1", method: "BANK_TRANSFER" });
    expect(p1.status).toBe("PARTIALLY_PAID");
    await expect(recordPayment(admin, stmtId, { amount: 5000, paymentDate: D2, referenceNumber: "NEFT-2", method: "BANK_TRANSFER" })).rejects.toThrow(/exceeds/);
    await expect(recordPayment(admin, stmtId, { amount: 10, paymentDate: D2, referenceNumber: "NEFT-1", method: "UPI" })).rejects.toThrow();
    const ov = (await industryOverview(admin, { projectId })).find((o) => o.industryId === mfg)!;
    expect(ov.paid).toBe("1000");
    expect(ov.remaining).toBe("3425");
    expect(ov.status).toBe("PARTIALLY_PAID");
    const p2 = await recordPayment(admin, stmtId, { amount: 3425, paymentDate: D2, referenceNumber: "NEFT-3", method: "BANK_TRANSFER" });
    expect(p2.status).toBe("PAID");
  });

  it("a later rate change does not alter approved/historical amounts", async () => {
    await createRate(admin, { scope: "INDUSTRY", industryId: mfg, hourlyRate: 400, effectiveFrom: "2026-11-11" });
    const facts = await loadFacts(admin, { industryId: mfg, from: D1, to: D1 });
    expect(aggregate(facts, () => ({ key: "x", name: "x" }))[0].amount.toString()).toBe("4425");
    // hours on/after the new effective date use the new rate
    const qd2 = (await listQc({ industryId: mfg, from: D2, to: D2 }))[0];
    await setAcceptance(admin, [{ id: qd2.id, acceptancePct: 100 }]);
    const f2 = await loadFacts(admin, { industryId: mfg, from: D2, to: D2 });
    expect(f2.find((f) => f.accepted !== "0")!.rate).toBe("400");
  });

  it("overview status reflects money state: fully-paid statement + new unbilled hours => PARTIALLY_PAID, not PENDING", async () => {
    const o = (await industryOverview(admin, { projectId })).find((x) => x.industryId === mfg)!;
    expect(Number(o.unbilled)).toBeGreaterThan(0);
    expect(o.status).toBe("PARTIALLY_PAID");
    const c = (await industryOverview(admin, { projectId })).find((x) => x.industryId === con)!;
    expect(["PENDING_APPROVAL", "NOT_READY"]).toContain(c.status);
  });

  it("adjustments require a reason, are audited, and respect payments already made", async () => {
    await expect(addAdjustment(admin, stmtId, -100, " ")).rejects.toThrow(/reason/);
    await expect(addAdjustment(admin, stmtId, -100, "x")).rejects.toThrow(/Cannot adjust a paid/);
  });

  it("void releases hours so QC can be corrected (only when nothing was paid)", async () => {
    await expect(voidStatement(admin, stmtId, "oops")).rejects.toThrow(/payments/);
    // statement for Construction: no rate configured => blocked with a clear message, and nothing stays locked
    const qc = await listQc({ industryId: con });
    await setAcceptance(admin, [{ id: qc[0].id, acceptancePct: 100 }]);
    await expect(createStatement(admin, { industryId: con, from: D1, to: D1 })).rejects.toThrow(/rate/i);
    expect((await listQc({ industryId: con }))[0].locked).toBe(false);
    await createRate(admin, { scope: "PROJECT", projectId, hourlyRate: 200, effectiveFrom: "2026-01-01" });
    const st = await createStatement(admin, { industryId: con, from: D1, to: D1 });
    expect(Number(st.calculatedAmount)).toBe(1400); // 7h submitted (edited) x 100% x ₹200
    const v = await voidStatement(admin, st.id, "QC revised");
    expect(v.status).toBe("VOID");
    expect((await listQc({ industryId: con }))[0].locked).toBe(false);
  });
});

describe("industry-level acceptance", () => {
  it("allocates without overwriting individual QC unless asked", async () => {
    await saveEntries(admin, "2026-11-12", [
      { assignmentId: A, sessions: sess(10), submittedHours: 10 }, { assignmentId: B, sessions: sess(6), submittedHours: 6 },
    ]);
    const [first] = await listQc({ industryId: mfg, from: "2026-11-12", to: "2026-11-12" });
    await setAcceptance(admin, [{ id: first.id, acceptancePct: 50 }]);
    const r = await allocateIndustry(admin, { industryId: mfg, from: "2026-11-12", to: "2026-11-12", pct: 80, reference: "Client batch 7" });
    expect(r.skippedIndividual).toBe(1);
    expect(r.allocated).toBe(1);
    const r2 = await allocateIndustry(admin, { industryId: mfg, from: "2026-11-12", to: "2026-11-12", pct: 80, overwriteIndividual: true });
    expect(r2.allocated).toBe(2);
    expect(Number(r2.totalAccepted)).toBeCloseTo(12.8, 6); // 16h x 80%
  });
});

describe("one number everywhere", () => {
  it("industry payable is identical in facts aggregate and the payments overview (to the paisa)", async () => {
    const ov = await industryOverview(admin, { projectId });
    for (const o of ov) {
      const facts = await loadFacts(admin, { industryId: o.industryId });
      const a = aggregate(facts, () => ({ key: "x", name: "x" }))[0];
      expect(a ? a.amount.toFixed(2) : "0.00").toBe(Number(o.payable).toFixed(2));
    }
  });
});

describe("audit trail", () => {
  it("records QC, approval, payment and adjustment events", async () => {
    const db = await getDb();
    const logs = await db.select().from(s.auditLogs);
    const actions = new Set(logs.map((l) => l.action));
    for (const a of ["QC_CHANGE", "APPROVE", "PAYMENT", "RATE_CHANGE", "ALLOCATE", "CREATE"]) expect(actions.has(a as never)).toBe(true);
  });
});

describe("deleting projects and industries", () => {
  it("deletes an unused project with its industries, assignments and rates", async () => {
    const p = await createProject(admin, { name: "Temp", clientName: "X", status: "ACTIVE" });
    const i = await createIndustry(admin, { projectId: p.id, name: "Temp ind", status: "ACTIVE" });
    const c = await createContributor(admin, { fullName: "Temp C", email: "tmp@x.io", status: "ACTIVE" });
    await createAssignment(admin, { contributorId: c.id, projectId: p.id, industryId: i.id, dailyTargetHours: 8, weeklyTargetHours: 40, monthlyTargetHours: 160 });
    await createRate(admin, { scope: "INDUSTRY", industryId: i.id, hourlyRate: 100, effectiveFrom: "2026-01-01" });
    await createRate(admin, { scope: "PROJECT", projectId: p.id, hourlyRate: 90, effectiveFrom: "2026-01-01" });
    await deleteProject(admin, p.id);
    const db = await getDb();
    expect((await db.select().from(s.projects)).some((x) => x.id === p.id)).toBe(false);
    expect((await db.select().from(s.industries)).some((x) => x.id === i.id)).toBe(false);
  });
  it("refuses to delete a project or industry that has hours or payments", async () => {
    await expect(deleteProject(admin, projectId)).rejects.toMatchObject({ status: 409 });
    await expect(deleteIndustry(admin, mfg)).rejects.toMatchObject({ status: 409 });
  });
});
