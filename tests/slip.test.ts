import { beforeAll, describe, expect, it } from "vitest";
process.env.DATABASE_URL = "pglite://memory";

import { runMigrations } from "../src/db";
import { ensureAdmin } from "../src/server/bootstrap";
import { createProject, createIndustry, createContributor, createAssignment, createRate, deleteContributor } from "../src/server/masterdata";
import { saveEntries } from "../src/server/hours";
import { setAcceptance, listQc } from "../src/server/qc";
import { createStatement, approveStatement, recordPayment } from "../src/server/payments";
import { setSignature, removeSignature, getSignature, parseSignatureDataUrl } from "../src/server/signatures";
import { generateSlips, slipRecipients, mySlips, inrWords } from "../src/server/slip";

// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const D = "2026-11-10";
let admin: { id: string; role: "ADMIN" };
let industryId: string, ca: string, cb: string, stmt: string;
const asContrib = (id: string) => ({ id: admin.id, role: "CONTRIBUTOR" as const, contributorId: id });

beforeAll(async () => {
  await runMigrations();
  const a = await ensureAdmin("admin@test.io", "TestPassword123");
  admin = { id: a.id, role: "ADMIN" };
  const p = await createProject(admin, { name: "P", clientName: "ACME", status: "ACTIVE" });
  industryId = (await createIndustry(admin, { projectId: p.id, name: "Mfg", status: "ACTIVE" })).id;
  ca = (await createContributor(admin, { fullName: "Alice", email: "a@x.io", status: "ACTIVE" })).id;
  cb = (await createContributor(admin, { fullName: "Bob", email: "b@x.io", status: "ACTIVE" })).id;
  const mk = (c: string) => createAssignment(admin, { contributorId: c, projectId: p.id, industryId, dailyTargetHours: 8, weeklyTargetHours: 40, monthlyTargetHours: 160 });
  const A = await mk(ca), B = await mk(cb);
  await createRate(admin, { scope: "INDUSTRY", industryId, hourlyRate: 250, effectiveFrom: "2026-01-01" });
  await saveEntries(admin, D, [{ assignmentId: A.id, sessions: [{ hours: 10 }], submittedHours: 10 }, { assignmentId: B.id, sessions: [{ hours: 10 }], submittedHours: 10 }]);
  await setAcceptance(admin, (await listQc({ industryId })).map((r) => ({ id: r.id, acceptancePct: 90 })));
  stmt = (await createStatement(admin, { industryId, from: D, to: D })).id;
});

describe("signatures", () => {
  it("rejects SVG, spoofed content and oversize images", () => {
    expect(() => parseSignatureDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toThrow(/PNG or JPEG/);
    expect(() => parseSignatureDataUrl("data:image/png;base64,AAAAAAAAAAAAAAAA")).toThrow(/does not match/);
    const big = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500 * 1024)]).toString("base64");
    expect(() => parseSignatureDataUrl(big)).toThrow(/too large/);
  });
  it("lets admin or the contributor themself edit, nobody else", async () => {
    await expect(setSignature(asContrib(cb), ca, PNG)).rejects.toThrow();
    await expect(setSignature({ id: "m", role: "MANAGER" } as never, ca, PNG)).rejects.toThrow();
    await setSignature(asContrib(ca), ca, PNG);
    expect((await getSignature(ca))?.mime).toBe("image/png");
    await removeSignature(admin, ca);
    expect(await getSignature(ca)).toBeNull();
  });
});

describe("acknowledgement slips", () => {
  it("are refused until the statement is fully paid", async () => {
    await expect(generateSlips(admin, stmt)).rejects.toThrow(/paid/i);
    await approveStatement(admin, stmt);
    await recordPayment(admin, stmt, { amount: 100, paymentDate: D, referenceNumber: "N1", method: "UPI" });
    await expect(generateSlips(admin, stmt)).rejects.toThrow(/paid/i);
  });
  it("generate PDFs once paid, with and without signature, and respect ownership", async () => {
    const rec = await slipRecipients(admin, stmt);
    const total = rec.recipients.reduce((t, r) => t + Number(r.net), 0);
    await recordPayment(admin, stmt, { amount: +(total - 100).toFixed(2), paymentDate: D, referenceNumber: "N2", method: "BANK_TRANSFER" });
    await setSignature(admin, ca, PNG);
    const all = await generateSlips(admin, stmt);
    expect(all.pdf.subarray(0, 4).toString()).toBe("%PDF");
    const one = await generateSlips(admin, stmt, cb); // Bob has no signature
    expect(one.pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(all.pdf.length).toBeGreaterThan(one.pdf.length);
    expect(one.filename).toContain("ACK-");
    // contributor sees only own slips
    expect((await mySlips(asContrib(ca))).length).toBe(1);
    const mine = await generateSlips(asContrib(ca), stmt);
    expect(mine.pdf.subarray(0, 4).toString()).toBe("%PDF");
    await expect(generateSlips(asContrib(ca), stmt, cb)).resolves.toBeTruthy(); // falls back to own only
  });
  it("deleting a contributor removes their signature", async () => {
    const x = (await createContributor(admin, { fullName: "Temp", email: "t@x.io", status: "ACTIVE" })).id;
    await setSignature(admin, x, PNG);
    await deleteContributor(admin, x, false);
    expect(await getSignature(x)).toBeNull();
  });
});

describe("amount in words", () => {
  it("uses Indian numbering", () => {
    expect(inrWords(0)).toMatch(/zero/i);
    expect(inrWords("3982.50")).toMatch(/Three Thousand Nine Hundred Eighty Two and Fifty Paise/i);
    expect(inrWords(125000)).toMatch(/One Lakh Twenty Five Thousand/i);
  });
});

describe("force void of a paid statement", () => {
  it("needs the override, then releases hours and clears payments", async () => {
    const { voidStatement } = await import("../src/server/payments");
    await expect(voidStatement(admin, stmt, "test data")).rejects.toThrow(/cannot be voided/);
    const r = await voidStatement(admin, stmt, "test data", true);
    expect(r.status).toBe("VOID");
    expect(r.paidAmount).toBe("0.00");
    await expect(deleteContributor(admin, ca, true)).resolves.toBeDefined();
  });
});
