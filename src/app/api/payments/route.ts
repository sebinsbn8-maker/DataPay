import { z } from "zod";
import { handle, requirePermission, requireUser } from "@/server/guard";
import { createStatement, industryOverview, listStatements } from "@/server/payments";
import { qs } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requireUser(["ADMIN", "MANAGER"]);
  const q = qs(req);
  const [overview, statements] = await Promise.all([
    industryOverview(u, { from: q.from || undefined, to: q.to || undefined, projectId: q.projectId || undefined }),
    listStatements(u, { projectId: q.projectId || undefined, industryId: q.industryId || undefined }),
  ]);
  return { overview, statements };
});
export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("payments:write");
  return createStatement(u, z.object({ industryId: z.string().uuid(), from: z.string(), to: z.string(), remarks: z.string().optional() }).parse(await req.json()));
});
