import { z } from "zod";
import { handle, requirePermission } from "@/server/guard";
import { listQc, setAcceptance } from "@/server/qc";
import { qs } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  await requirePermission("qc:write");
  const q = qs(req);
  return listQc({ from: q.from || undefined, to: q.to || undefined, projectId: q.projectId || undefined, industryId: q.industryId || undefined, contributorId: q.contributorId || undefined, status: q.status || undefined });
});
const update = z.object({ id: z.string().uuid(), acceptancePct: z.coerce.number().min(0).max(100).nullable(), qcStatus: z.enum(["PENDING", "PARTIALLY_ACCEPTED", "FULLY_ACCEPTED", "REJECTED", "RESUBMITTED"]).optional(), qcReference: z.string().nullable().optional() });
export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("qc:write");
  return setAcceptance(u, z.object({ updates: z.array(update).min(1).max(1000) }).parse(await req.json()).updates);
});
