/* Demo data: "Scene Capture Project" with 7 industries, 21 contributors, 2 weeks of hours, QC and payments. */
import { runMigrations, getDb, schema as s } from "../src/db";
import { ensureAdmin, ensureRoles } from "../src/server/bootstrap";
import { createProject, createIndustry, createContributor, createAssignment, createRate } from "../src/server/masterdata";
import { saveEntries } from "../src/server/hours";
import { setAcceptance, allocateIndustry, listQc } from "../src/server/qc";
import { createStatement, approveStatement, recordPayment } from "../src/server/payments";
import { createUser } from "../src/server/users";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const round1 = (n: number) => Math.round(n * 10) / 10;

const INDUSTRIES: [string, number][] = [
  ["Manufacturing", 250], ["Construction", 275], ["Food & Hospitality", 230], ["Agriculture", 220],
  ["Retail & Shops", 240], ["Repair & Technical", 260], ["Craft & Production", 235],
];
const NAMES = ["Aarav Nair", "Meera Menon", "Rohan Das", "Ananya Iyer", "Karthik Pillai", "Divya Raj", "Sanjay Kumar", "Priya Varma", "Arjun Mohan", "Neha George", "Vishnu Prasad", "Lakshmi Devi", "Rahul Krishnan", "Anjali Suresh", "Midhun Raj", "Sreya Thomas", "Akhil Joseph", "Fathima Beevi", "Hari Narayan", "Nithya Menon", "Jithin Paul"];

function workdays(from: string, to: string) {
  const out: string[] = [];
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
  return out;
}

(async () => {
  await runMigrations();
  const db = await getDb();
  const existing = await db.select().from(s.projects).where(eq(s.projects.name, "Scene Capture Project"));
  if (existing.length) { console.log("Demo data already present."); process.exit(0); }

  // Demo data always uses fixed, publicly-documented demo logins. Never run this against a production database.
  const adminEmail = "admin@datapay.local";
  const adminPass = "DemoAdmin#2026";
  const { id } = await ensureAdmin(adminEmail, adminPass);
  const admin = { id, role: "ADMIN" as const };
  const roles = await ensureRoles();

  const project = await createProject(admin, { name: "Scene Capture Project", clientName: "Vision Labs Inc.", description: "Real-world scene video & image data collection across industries.", startDate: "2026-11-01", endDate: "2027-03-31", status: "ACTIVE" });
  await createRate(admin, { scope: "PROJECT", projectId: project.id, hourlyRate: 200, effectiveFrom: "2026-11-01" });

  const assignments: { id: string; industryId: string; industryName: string }[] = [];
  let ni = 0;
  for (const [name, rate] of INDUSTRIES) {
    const ind = await createIndustry(admin, { projectId: project.id, name, status: "ACTIVE" });
    await createRate(admin, { scope: "INDUSTRY", industryId: ind.id, hourlyRate: rate, effectiveFrom: "2026-11-01" });
    for (let k = 0; k < 3; k++) {
      const fullName = NAMES[ni++];
      const c = await createContributor(admin, { fullName, email: fullName.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com", phone: `+91 98${String(10000000 + ni * 137).slice(0, 8)}`, joiningDate: "2026-10-25", status: "ACTIVE" });
      const a = await createAssignment(admin, { contributorId: c.id, projectId: project.id, industryId: ind.id, dailyTargetHours: 8, weeklyTargetHours: 40, monthlyTargetHours: 160 });
      assignments.push({ id: a.id, industryId: ind.id, industryName: name });
    }
  }

  // logins: a manager for Manufacturing and one contributor
  const mfg = assignments.find((a) => a.industryName === "Manufacturing")!;
  const [mgr] = await createUser(admin.id, { name: "Manu Manager", email: "manager@datapay.local", role: "MANAGER", password: "DemoManager#2026", isActive: true }).then((u) => [u]);
  await db.update(s.industries).set({ managerId: mgr.id }).where(eq(s.industries.id, mfg.industryId));
  const firstCon = (await db.select().from(s.projectContributors).where(eq(s.projectContributors.id, mfg.id)))[0];
  await createUser(admin.id, { name: "Aarav Nair (login)", email: "contributor@datapay.local", role: "CONTRIBUTOR", password: "DemoContrib#2026", contributorId: firstCon.contributorId, isActive: true });
  void roles; void bcrypt;

  // two weeks of hours
  for (const day of workdays("2026-11-02", "2026-11-16")) {
    const entries = assignments.filter(() => rnd() > 0.06).map((a) => {
      const actual = round1(6 + rnd() * 3);               // 6.0 - 9.0
      const submitted = round1(actual - rnd() * 0.8);
      return { assignmentId: a.id, sessions: [{ hours: round1(actual / 2) }, { hours: round1(actual - round1(actual / 2)) }], submittedHours: Math.min(submitted, actual) };
    });
    await saveEntries(admin, day, entries);
  }

  // client QC: individual percentages up to 9 Nov; Retail gets an industry-level % for 10-12 Nov; the rest stays pending
  const all = await listQc({ to: "2026-11-09" });
  const retail = assignments.find((a) => a.industryName === "Retail & Shops")!.industryId;
  await setAcceptance(admin, all.filter((r) => r.industryId !== retail).map((r) => ({ id: r.id, acceptancePct: Math.round((82 + rnd() * 17) * 10) / 10, qcReference: "QC batch Nov-A" })));
  await allocateIndustry(admin, { industryId: retail, from: "2026-11-02", to: "2026-11-12", pct: 88.5, reference: "Client report #RS-114 (industry level)" });
  const recent = await listQc({ from: "2026-11-10", to: "2026-11-11" });
  await setAcceptance(admin, recent.filter((r) => r.industryId !== retail).slice(0, 20).map((r) => ({ id: r.id, acceptancePct: Math.round((80 + rnd() * 19) * 10) / 10, qcReference: "QC batch Nov-B" })));

  // payments: Manufacturing approved + partly paid; Construction pending approval; Food approved + paid in full
  const industries = await db.select().from(s.industries);
  const byName = (n: string) => industries.find((i) => i.name === n)!.id;
  const m = await createStatement(admin, { industryId: byName("Manufacturing"), from: "2026-11-02", to: "2026-11-09", remarks: "Week 1 + Monday of week 2" });
  await approveStatement(admin, m.id);
  await recordPayment(admin, m.id, { amount: 20000, paymentDate: "2026-11-14", referenceNumber: "NEFT-884201", method: "BANK_TRANSFER", remarks: "Advance" });
  await createStatement(admin, { industryId: byName("Construction"), from: "2026-11-02", to: "2026-11-09" });
  const f = await createStatement(admin, { industryId: byName("Food & Hospitality"), from: "2026-11-02", to: "2026-11-09" });
  const fa = await approveStatement(admin, f.id);
  await recordPayment(admin, f.id, { amount: Number(fa.approvedAmount), paymentDate: "2026-11-15", referenceNumber: "UPI-55120", method: "UPI" });

  console.log(`Demo data ready.\n  Admin:       ${adminEmail} / ${adminPass}\n  Manager:     manager@datapay.local / DemoManager#2026\n  Contributor: contributor@datapay.local / DemoContrib#2026`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
