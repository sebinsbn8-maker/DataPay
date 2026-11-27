import { beforeAll, describe, expect, it } from "vitest";
process.env.DATABASE_URL = "pglite://memory";
import { runMigrations } from "../src/db";
import { ensureAdmin } from "../src/server/bootstrap";
import { createProject, createIndustry, createContributor, createAssignment, deleteContributor } from "../src/server/masterdata";
import { createUser } from "../src/server/users";
import { createLog, updateLog, deleteLog, listLogs, overview } from "../src/server/hourlog";

const TODAY = "2026-11-27";
let admin: { id: string; role: "ADMIN" };
let mgr: { id: string; role: "MANAGER" };
let ca: string, cb: string, cOther: string;

beforeAll(async () => {
  await runMigrations();
  admin = { id: (await ensureAdmin("admin@test.io", "TestPassword123")).id, role: "ADMIN" };
  const m = await createUser(admin.id, { name: "Mgr", email: "m@x.io", role: "MANAGER", password: "LongPassword123", isActive: true });
  mgr = { id: m.id, role: "MANAGER" };
  const p = await createProject(admin, { name: "Mine", clientName: "ACME", status: "ACTIVE", managerId: mgr.id });
  const p2 = await createProject(admin, { name: "Theirs", clientName: "ACME", status: "ACTIVE" });
  const i1 = (await createIndustry(admin, { projectId: p.id, name: "I1", status: "ACTIVE" })).id;
  const i2 = (await createIndustry(admin, { projectId: p2.id, name: "I2", status: "ACTIVE" })).id;
  ca = (await createContributor(admin, { fullName: "Alice", email: "a@x.io", status: "ACTIVE" })).id;
  cb = (await createContributor(admin, { fullName: "Bob", email: "b@x.io", status: "ACTIVE" })).id;
  cOther = (await createContributor(admin, { fullName: "Outsider", email: "o@x.io", status: "ACTIVE" })).id;
  const mk = (c: string, pr: string, ind: string) => createAssignment(admin, { contributorId: c, projectId: pr, industryId: ind, dailyTargetHours: 8, weeklyTargetHours: 40, monthlyTargetHours: 160 });
  await mk(ca, p.id, i1); await mk(cb, p.id, i1); await mk(cOther, p2.id, i2);
});

describe("hour logs", () => {
  it("validates input", async () => {
    const base = { contributorId: ca, workDate: TODAY, deviceName: "Laptop", hours: 4 };
    await expect(createLog(admin, { ...base, workDate: "2026-12-01" }, TODAY)).rejects.toThrow(/future/);
    await expect(createLog(admin, { ...base, hours: 0 }, TODAY)).rejects.toThrow(/greater than 0/);
    await expect(createLog(admin, { ...base, hours: 5000 }, TODAY)).rejects.toThrow(/exceed/);
    await expect(createLog(admin, { ...base, deviceName: "  " }, TODAY)).rejects.toThrow(/device/i);
    await expect(createLog(admin, { ...base, workDate: "nope" }, TODAY)).rejects.toThrow(/date/i);
  });

  it("overview totals follow every add, edit and delete", async () => {
    const a1 = await createLog(admin, { contributorId: ca, workDate: TODAY, deviceName: "Laptop-1", hours: 4.5, notes: "morning" }, TODAY);
    await createLog(admin, { contributorId: ca, workDate: TODAY, deviceName: "Phone", hours: 2 }, TODAY);   // second device, same day
    await createLog(admin, { contributorId: ca, workDate: "2026-11-03", deviceName: "Laptop-1", hours: 8 }, TODAY);
    await createLog(admin, { contributorId: cb, workDate: TODAY, deviceName: "Tablet", hours: 3 }, TODAY);
    await createLog(admin, { contributorId: ca, workDate: "2026-10-30", deviceName: "Laptop-1", hours: 6 }, TODAY); // previous month

    let o = await overview(admin, TODAY);
    expect(o.totals).toMatchObject({ contributors: 3, today: 9.5, month: 17.5, all: 23.5 });
    const alice = o.contributors.find((c) => c.id === ca)!;
    expect(alice).toMatchObject({ today: 6.5, month: 14.5, total: 20.5 });
    expect(o.dailySummary.find((d) => d.date === TODAY)!.hours).toBe(9.5);
    expect(o.monthlySummary.find((m) => m.month === "2026-10")!.hours).toBe(6);
    expect(o.monthlySummary.find((m) => m.month === "2026-11")!.hours).toBe(17.5);

    await updateLog(admin, a1.id, { hours: 5, deviceName: "Laptop-2" }, TODAY);
    o = await overview(admin, TODAY);
    expect(o.totals.today).toBe(10); expect(o.totals.month).toBe(18);

    const rows = await listLogs(admin, { contributorId: ca, from: TODAY, to: TODAY });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.dayTotal === 7 && r.monthTotal === 15)).toBe(true); // 5+2 today; 5+2+8 this month
    expect(rows.find((r) => r.deviceName === "Laptop-2")).toBeTruthy();

    await deleteLog(admin, a1.id);
    o = await overview(admin, TODAY);
    expect(o.totals.today).toBe(5); expect(o.totals.month).toBe(13);
    expect((await listLogs(admin, {})).length).toBe(4);
  });

  it("limits managers to contributors in their own projects", async () => {
    const o = await overview(mgr, TODAY);
    expect(o.contributors.map((c) => c.id).sort()).toEqual([ca, cb].sort());
    await expect(createLog(mgr, { contributorId: cOther, workDate: TODAY, deviceName: "X", hours: 1 }, TODAY)).rejects.toThrow(/not assigned/);
    const mine = await createLog(mgr, { contributorId: cb, workDate: TODAY, deviceName: "Y", hours: 1 }, TODAY);
    const theirs = await createLog(admin, { contributorId: cOther, workDate: TODAY, deviceName: "Z", hours: 1 }, TODAY);
    await expect(deleteLog(mgr, theirs.id)).rejects.toThrow(/not assigned/);
    await deleteLog(mgr, mine.id);
    expect((await listLogs(mgr, {})).every((r) => r.contributorId !== cOther)).toBe(true);
  });

  it("a contributor with logged hours can't be deleted unless forced", async () => {
    await expect(deleteContributor(admin, ca, false)).rejects.toThrow(/recorded hours/);
    await expect(deleteContributor(admin, ca, true)).resolves.toBeDefined();
    expect((await listLogs(admin, {})).some((r) => r.contributorId === ca)).toBe(false);
  });
});
