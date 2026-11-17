import { handle, requirePermission } from "@/server/guard";
import { report, type ReportKind } from "@/server/analytics";
import { qs } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requirePermission("reports:read");
  const q = qs(req);
  const kind = (["contributor", "industry", "project"].includes(q.kind ?? "") ? q.kind : "contributor") as ReportKind;
  return report(u, kind, { from: q.from || undefined, to: q.to || undefined, projectId: q.projectId || undefined, industryId: q.industryId || undefined, contributorId: q.contributorId || undefined });
});
