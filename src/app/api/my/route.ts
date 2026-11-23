import { eq } from "drizzle-orm";
import { handle, requireUser, HttpError } from "@/server/guard";
import { loadFacts } from "@/server/facts";
import { getDb, schema as s } from "@/db";
import { qs } from "@/server/http";
import { totals } from "@/lib/aggregate";

export const dynamic = "force-dynamic";
// Contributors only ever receive their own records (loadFacts filters on the session's contributorId).
export const GET = (req: Request) => handle(async () => {
  const u = await requireUser(["CONTRIBUTOR"]);
  if (!u.contributorId) throw new HttpError(400, "Your login is not linked to a contributor record");
  const q = qs(req);
  const db = await getDb();
  const facts = await loadFacts(u, { from: q.from || undefined, to: q.to || undefined });
  const stmts = await db.select({ id: s.industryPaymentStatements.id, status: s.industryPaymentStatements.status }).from(s.industryPaymentStatements);
  const asg = await db.select({ id: s.projectContributors.id, project: s.projects.name, industry: s.industries.name, daily: s.projectContributors.dailyTargetHours, weekly: s.projectContributors.weeklyTargetHours, monthly: s.projectContributors.monthlyTargetHours, status: s.projectContributors.status })
    .from(s.projectContributors).innerJoin(s.projects, eq(s.projects.id, s.projectContributors.projectId)).innerJoin(s.industries, eq(s.industries.id, s.projectContributors.industryId))
    .where(eq(s.projectContributors.contributorId, u.contributorId));
  const t = totals(facts);
  return {
    assignments: asg,
    money: { gross: t.amount.toString(), tds: t.tds.toString(), net: t.net.toString(), tdsPercent: facts[0]?.tdsPercent ?? "0" },
    records: facts.sort((a, b) => (a.date < b.date ? 1 : -1)).map((f) => ({
      id: f.recordId, date: f.date, project: f.projectName, industry: f.industryName, target: f.target, actual: f.actual, submitted: f.submitted, pct: f.pct, accepted: f.accepted, rate: f.rate, amount: f.amount,
      paymentStatus: f.pct === null ? "PENDING_QC" : f.statementId ? stmts.find((x) => x.id === f.statementId)?.status ?? "PENDING_APPROVAL" : "NOT_BILLED",
    })),
  };
});
