import { handle, requireUser } from "@/server/guard";
import { dashboard } from "@/server/analytics";
import { qs } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requireUser(["ADMIN", "MANAGER"]);
  const q = qs(req);
  return dashboard(u, { from: q.from || undefined, to: q.to || undefined, projectId: q.projectId || undefined, industryId: q.industryId || undefined });
});
