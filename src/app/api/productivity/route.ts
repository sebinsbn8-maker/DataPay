import { handle, requireUser } from "@/server/guard";
import { productivity, type Period } from "@/server/analytics";
import { qs, today } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requireUser();
  const q = qs(req);
  return productivity(u, { period: (q.period as Period) ?? "day", date: q.date ?? today(), from: q.from, to: q.to,
    projectId: q.projectId || undefined, industryId: q.industryId || undefined, contributorId: u.role === "CONTRIBUTOR" ? u.contributorId! : q.contributorId || undefined });
});
